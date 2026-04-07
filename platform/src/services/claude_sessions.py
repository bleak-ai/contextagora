"""Read Claude Code's on-disk session transcripts directly.

Claude Code stores every session as a JSONL file at:
    ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl

where <encoded-cwd> is the absolute cwd path with '/' replaced by '-'.
This module is the only place that knows about that layout — if Claude Code
ever changes it, fix it here.
"""

from __future__ import annotations

import json
from pathlib import Path


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
