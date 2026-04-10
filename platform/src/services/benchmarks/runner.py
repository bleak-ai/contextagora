from __future__ import annotations

import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from src.config import settings
from src.services.claude_sessions import claude_project_dir

from .judge import judge
from .parser import ParsedSession, parse_session
from .report import render_markdown
from .storage import write_run
from .tasks import Task


def _fingerprint(root: Path) -> str:
    h = hashlib.sha256()
    for p in sorted(root.rglob("*")):
        if p.is_file():
            try:
                h.update(str(p.relative_to(root)).encode())
                h.update(p.read_bytes())
            except OSError:
                continue
    return h.hexdigest()[:12]


def _loaded_modules(root: Path) -> list[str]:
    return sorted(p.name for p in root.iterdir() if p.is_dir() and not p.name.startswith("."))


def _wait_for_jsonl(session_id: str, project_dir: Path, timeout_s: float = 5.0) -> Path | None:
    deadline = time.time() + timeout_s
    target = project_dir / f"{session_id}.jsonl"
    while time.time() < deadline:
        if target.is_file():
            return target
        time.sleep(0.1)
    return target if target.is_file() else None


def run_task_stream(task: Task, run_timeout_s: int = 1800):
    """Run a benchmark task end-to-end as a generator of progress events.

    Yields dicts: {type: started|progress|judging|done|error, ...}.
    The final event is always either `done` (with run_id) or `error`.
    The run file is written before `done` is yielded."""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    yield {"type": "started", "task_id": task.id, "timestamp": timestamp}

    cmd = [
        "claude", "-p", task.prompt,
        "--verbose",
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--allowedTools", "Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "Glob(*)", "Grep(*)",
    ]
    session_id = ""
    started_at = time.time()
    tool_count = 0
    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=str(settings.CONTEXT_DIR), text=True,
        )
    except FileNotFoundError:
        yield {"type": "error", "error": "claude CLI not found"}
        return

    try:
        for line in proc.stdout:
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            ev_type = ev.get("type", "")
            if not session_id and ev_type == "system":
                session_id = ev.get("session_id", "") or ""
                yield {"type": "progress", "phase": "session", "session_id": session_id,
                       "elapsed_s": round(time.time() - started_at, 1)}
            elif ev_type == "assistant":
                for block in ev.get("message", {}).get("content", []):
                    if block.get("type") == "tool_use":
                        tool_count += 1
                        yield {"type": "progress", "phase": "tool",
                               "tool": block.get("name", ""),
                               "tool_count": tool_count,
                               "elapsed_s": round(time.time() - started_at, 1)}
            elif ev_type == "result":
                yield {"type": "progress", "phase": "result",
                       "elapsed_s": round(time.time() - started_at, 1)}
        proc.wait(timeout=run_timeout_s)
    except subprocess.TimeoutExpired:
        proc.kill()
        yield {"type": "error", "error": "run timed out"}
        return

    if proc.returncode != 0:
        stderr = proc.stderr.read() if proc.stderr else ""
        yield {"type": "error", "error": stderr.strip() or f"claude exited {proc.returncode}"}
        return

    if not session_id:
        yield {"type": "error", "error": "no session id captured from claude stream"}
        return

    project_dir = claude_project_dir(settings.CONTEXT_DIR)
    jsonl = _wait_for_jsonl(session_id, project_dir)
    if jsonl is None:
        yield {"type": "error", "error": f"session jsonl not found: {project_dir}/{session_id}.jsonl"}
        return

    parsed: ParsedSession = parse_session(jsonl)
    yield {"type": "judging", "elapsed_s": round(time.time() - started_at, 1)}
    verdict, reason = judge(task.judge_prompt, parsed.final_text)

    md = render_markdown(
        task_id=task.id,
        timestamp=timestamp,
        session_id=session_id,
        parsed=parsed,
        judge_verdict=verdict,
        judge_reason=reason,
        context_fingerprint=_fingerprint(settings.CONTEXT_DIR),
        loaded_modules=_loaded_modules(settings.CONTEXT_DIR),
    )
    path = write_run(task.id, timestamp, md)
    yield {
        "type": "done",
        "task_id": task.id,
        "run_id": timestamp,
        "path": str(path),
        "verdict": verdict,
        "elapsed_s": round(time.time() - started_at, 1),
    }
