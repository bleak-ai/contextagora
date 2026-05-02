"""Generate social-post payloads from session transcripts.

See docs/superpowers/specs/2026-04-24-social-post-from-session-design.md
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from src.models import SocialPostPayload, SocialPostStats
from src.services.chat.claude_sessions import load_session_messages
from src.services.chat.extract import (
    ExtractionError,
    run_with_retry,
    strip_fences,
)

# Re-export for callers that still import from this module.
__all__ = [
    "ExtractionError",
    "NoToolCallsError",
    "SessionNotFoundError",
    "build_transcript",
    "compute_stats",
    "extract_content",
    "generate_social_post",
]


def compute_stats(messages: list[dict]) -> SocialPostStats:
    """Deterministic stats for the social-post card.

    - elapsed_seconds: (last tool-call startedAt) - (first tool-call startedAt), in seconds.
      Zero if fewer than two tool calls.
    - prompt_count: number of user messages that contain any text part.
    """
    started_ts: list[int] = []
    prompt_count = 0

    for msg in messages:
        if msg.get("role") == "user" and any(
            p.get("type") == "text" and (p.get("text") or "").strip()
            for p in msg.get("parts", [])
        ):
            prompt_count += 1

        for part in msg.get("parts", []):
            if part.get("type") != "tool_call":
                continue
            ts = part.get("toolCall", {}).get("startedAt")
            if isinstance(ts, int) and ts > 0:
                started_ts.append(ts)

    if len(started_ts) >= 2:
        elapsed_seconds = (max(started_ts) - min(started_ts)) // 1000
    else:
        elapsed_seconds = 0

    return SocialPostStats(
        elapsed_seconds=elapsed_seconds,
        prompt_count=prompt_count,
    )


_TOOL_INPUT_CAP = 80


def _part_text(part: dict) -> str:
    if part.get("type") == "text":
        return (part.get("text") or "").strip()
    return ""


def build_transcript(messages: list[dict]) -> str:
    """Compact text-rendering of a session for Claude's extraction prompt.

    Tool outputs are dropped entirely — the card extraction needs to know
    WHICH services were touched and WHAT was asked, not the full result
    bodies. Outputs are the bulkiest part of any session and the smallest
    signal for the prompt's job.
    """
    if not messages:
        return ""

    lines: list[str] = []
    for msg in messages:
        role = msg.get("role", "")
        for part in msg.get("parts", []):
            ptype = part.get("type")
            if ptype == "text":
                text = _part_text(part)
                if text:
                    lines.append(f"[{role}] {text}")
            elif ptype == "tool_call":
                tc = part.get("toolCall", {})
                name = tc.get("name", "?")
                raw_input = tc.get("input", {}) or {}
                input_str = str(raw_input)[:_TOOL_INPUT_CAP]
                lines.append(f"[tool] {name} {input_str}")

    return "\n".join(lines)


_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "commands" / "social_post_extraction.md"


def _load_prompt() -> str:
    return _PROMPT_PATH.read_text()


def _format_prompt(transcript: str, elapsed_seconds: int = 0) -> str:
    return (
        _load_prompt()
        .replace("{{transcript}}", transcript)
        .replace("{{elapsed_seconds}}", str(elapsed_seconds))
    )


def _parse_json_payload(raw: str) -> dict:
    stripped = strip_fences(raw)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        raise ExtractionError(
            f"Claude returned non-JSON: {stripped[:200]!r}"
        )


def extract_content(transcript: str, *, elapsed_seconds: int = 0, timeout: int = 120) -> dict:
    """Call Claude to extract the social-post content blocks."""
    return run_with_retry(
        _format_prompt(transcript, elapsed_seconds),
        _parse_json_payload,
        timeout=timeout,
        nudge=(
            "\n\nYour previous response was not valid JSON. "
            "Return ONLY the JSON object, no prose, no fences."
        ),
    )


class SessionNotFoundError(Exception):
    """The session id has no messages in DB or JSONL."""


class NoToolCallsError(Exception):
    """The session exists but has no tool calls; can't render a 'how' panel."""


def _has_any_tool_call(messages: list[dict]) -> bool:
    for msg in messages:
        for part in msg.get("parts", []):
            if part.get("type") == "tool_call":
                return True
    return False


def _fallback_title(services_count: int, elapsed_seconds: int) -> str:
    return f"One prompt. {services_count} tools. {elapsed_seconds}s."


def generate_social_post(
    session_id: str,
    conn: sqlite3.Connection,
    project_dir: Path,
) -> SocialPostPayload:
    """Produce the full SocialPostPayload for a session."""
    messages = load_session_messages(session_id, conn, project_dir)
    if not messages:
        raise SessionNotFoundError(session_id)
    if not _has_any_tool_call(messages):
        raise NoToolCallsError(session_id)

    stats = compute_stats(messages)
    transcript = build_transcript(messages)
    content = extract_content(transcript, elapsed_seconds=stats.elapsed_seconds)

    required = ("services", "problem", "steps", "outcome")
    missing = [k for k in required if k not in content]
    if missing:
        raise ExtractionError(f"Claude response missing keys: {missing}")

    services = content["services"]
    title = content.get("title") or _fallback_title(len(services), stats.elapsed_seconds)
    return SocialPostPayload(
        title=title,
        meta_bits=content.get("meta_bits", []),
        problem=content["problem"],
        steps=content["steps"],
        outcome=content["outcome"],
        services=services,
        stats=stats,
    )
