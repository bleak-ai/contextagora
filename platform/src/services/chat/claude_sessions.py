"""Read Claude Code's on-disk session transcripts directly.

Claude Code stores every session as a JSONL file at:
    ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl

where <encoded-cwd> is the absolute cwd path with '/' replaced by '-'.
This module is the only place that knows about that layout — if Claude Code
ever changes it, fix it here.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path

from src.services.chat import sessions_store


def claude_project_dir(cwd: Path, home: Path | None = None) -> Path:
    """Return the ~/.claude/projects/<encoded-cwd> directory for a cwd."""
    home = home or Path.home()
    encoded = str(cwd).replace("/", "-")
    return home / ".claude" / "projects" / encoded


def first_user_message(jsonl_path: Path) -> str:
    """Return the first non-empty user message in a Claude session transcript.

    Returns an empty string if none is found.
    """
    try:
        with jsonl_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get("type") != "user":
                    continue
                content = event.get("message", {}).get("content")
                text = _extract_text(content)
                if text:
                    return text
    except OSError:
        return ""
    return ""


def _extract_text(content) -> str:
    """Normalize a Claude message `content` field to a plain string."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text = (block.get("text") or "").strip()
                if text:
                    return text
    return ""


NAME_LIMIT = 60


def list_sessions(cwd: Path, home: Path | None = None) -> list[dict]:
    """List all Claude sessions for `cwd`, newest first.

    Returns a list of dicts with keys: id, name, created_at.
    Returns an empty list if the project directory does not exist.
    """
    proj_dir = claude_project_dir(cwd, home=home)
    if not proj_dir.is_dir():
        return []

    sessions = []
    for f in proj_dir.glob("*.jsonl"):
        try:
            mtime = f.stat().st_mtime
        except OSError:
            continue
        name = first_user_message(f) or "New chat"
        if len(name) > NAME_LIMIT:
            name = name[: NAME_LIMIT - 1].rstrip() + "…"
        sessions.append({
            "id": f.stem,
            "name": name,
            "created_at": mtime,
        })

    sessions.sort(key=lambda s: s["created_at"], reverse=True)
    return sessions


def _ts_ms(raw: str | None) -> int:
    if not raw:
        return 0
    try:
        return int(datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        return 0


def read_transcript(jsonl_path: Path) -> list[dict]:
    """Parse a Claude session JSONL into the frontend ChatMessage shape.

    Each element is:
        {id, role, thinking, parts: [{type: "text", text} | {type: "tool_call", toolCall}]}

    User lines with a string `content` open a new turn (user msg + fresh assistant msg).
    Assistant lines append their single content block to the current assistant msg.
    User lines with `tool_result` blocks attach output to the matching tool_call.
    Sidechain events, queue operations, and attachment lines are skipped.
    """
    messages: list[dict] = []
    current_asst: dict | None = None

    try:
        fh = jsonl_path.open("r", encoding="utf-8")
    except OSError:
        return []

    with fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue

            if event.get("type") == "queue-operation":
                continue
            if event.get("isSidechain"):
                continue
            if "attachment" in event:
                continue

            etype = event.get("type")
            if etype == "user":
                before = len(messages)
                _consume_user(event, messages)
                if len(messages) > before:
                    current_asst = {
                        "id": f"asst-{event.get('uuid', '')}",
                        "role": "assistant",
                        "thinking": "",
                        "parts": [],
                    }
                    messages.append(current_asst)
                else:
                    _attach_tool_results(event, current_asst)
            elif etype == "assistant":
                if current_asst is None:
                    current_asst = {
                        "id": f"asst-{event.get('uuid', '')}",
                        "role": "assistant",
                        "thinking": "",
                        "parts": [],
                    }
                    messages.append(current_asst)
                _consume_assistant(event, current_asst)

    return messages


def _consume_user(event: dict, messages: list[dict]) -> None:
    content = event.get("message", {}).get("content")
    if not isinstance(content, str):
        return
    text = content.strip()
    if not text:
        return
    messages.append({
        "id": f"user-{event.get('uuid', '')}",
        "role": "user",
        "thinking": "",
        "parts": [{"type": "text", "text": content}],
    })


def _consume_assistant(event: dict, current: dict) -> None:
    ts = _ts_ms(event.get("timestamp"))
    blocks = event.get("message", {}).get("content") or []
    for block in blocks:
        btype = block.get("type")
        if btype == "thinking":
            current["thinking"] += block.get("thinking", "") or ""
        elif btype == "text":
            text = block.get("text", "") or ""
            parts = current["parts"]
            if parts and parts[-1].get("type") == "text":
                parts[-1]["text"] += text
            else:
                parts.append({"type": "text", "text": text})
        elif btype == "tool_use":
            current["parts"].append({
                "type": "tool_call",
                "toolCall": {
                    "id": block.get("id", ""),
                    "name": block.get("name", ""),
                    "input": block.get("input", {}) or {},
                    "startedAt": ts,
                },
            })


def _attach_tool_results(event: dict, current: dict | None) -> None:
    if current is None:
        return
    ts = _ts_ms(event.get("timestamp"))
    blocks = event.get("message", {}).get("content") or []
    for block in blocks:
        if block.get("type") != "tool_result":
            continue
        tool_id = block.get("tool_use_id", "")
        raw = block.get("content", "")
        if isinstance(raw, list):
            raw = "\n".join(
                b.get("text", "") for b in raw if isinstance(b, dict) and b.get("type") == "text"
            )
        for part in current["parts"]:
            if part.get("type") == "tool_call" and part["toolCall"].get("id") == tool_id:
                part["toolCall"]["output"] = raw
                part["toolCall"]["completedAt"] = ts
                break


def load_session_messages(
    session_id: str,
    conn: sqlite3.Connection,
    project_dir: Path,
) -> list[dict]:
    """Return a session's transcript, DB-first with JSONL fallback.

    Sessions streamed through this server have rich records in the DB.
    Sessions created by Claude CLI directly (or before this feature landed)
    only exist on disk as JSONL; we parse those via read_transcript.
    """
    db_msgs = sessions_store.list_messages(conn, session_id)
    if db_msgs:
        return db_msgs
    jsonl = project_dir / f"{session_id}.jsonl"
    if jsonl.is_file():
        return read_transcript(jsonl)
    return []
