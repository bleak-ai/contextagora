"""Generate social-post payloads from session transcripts.

See docs/superpowers/specs/2026-04-24-social-post-from-session-design.md
"""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

from src.models import SocialPostPayload, SocialPostStats
from src.services.chat.claude import run_headless
from src.services.chat.claude_sessions import load_session_messages


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


class ExtractionError(Exception):
    """Raised when Claude fails to return valid JSON after retry."""


_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "commands" / "social_post_extraction.md"
_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*\n(.*)\n```\s*$", re.DOTALL)


def _strip_fences(text: str) -> str:
    m = _FENCE_RE.match(text)
    return (m.group(1) if m else text).strip()


def _load_prompt() -> str:
    return _PROMPT_PATH.read_text()


def _format_prompt(transcript: str, elapsed_seconds: int = 0) -> str:
    return (
        _load_prompt()
        .replace("{{transcript}}", transcript)
        .replace("{{elapsed_seconds}}", str(elapsed_seconds))
    )


def extract_content(transcript: str, *, elapsed_seconds: int = 0, timeout: int = 120) -> dict:
    """Call Claude to extract the social-post content blocks.

    Retries once on bad JSON. Raises ExtractionError on second failure.
    """
    prompt = _format_prompt(transcript, elapsed_seconds)

    for attempt in (1, 2):
        proc = run_headless(prompt, timeout=timeout, max_turns=1)
        if proc.returncode != 0:
            # Claude CLI itself failed (auth, rate limit, crash). Retry once,
            # then surface a specific message.
            if attempt == 1:
                continue
            stderr_preview = (proc.stderr or "").strip()[:200]
            raise ExtractionError(
                f"claude CLI exited with code {proc.returncode}: {stderr_preview!r}"
            )
        raw = _strip_fences(proc.stdout or "")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            if attempt == 1:
                # nudge Claude; same transcript, firmer framing
                prompt = (
                    _format_prompt(transcript, elapsed_seconds)
                    + "\n\nYour previous response was not valid JSON. "
                      "Return ONLY the JSON object, no prose, no fences."
                )
                continue
            raise ExtractionError(
                f"Claude returned non-JSON after retry: {raw[:200]!r}"
            )
    # unreachable
    raise ExtractionError("unreachable")


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
