from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass(frozen=True)
class PhaseEvent:
    delta_s: float
    event_type: str
    detail: str
    in_tokens: int | None
    out_tokens: int | None


@dataclass(frozen=True)
class ParsedSession:
    events: list[PhaseEvent]
    total_wall_s: float
    total_in_tokens: int
    total_out_tokens: int
    tool_sequence: list[str]
    final_text: str


def _detail_for(msg: dict) -> tuple[str, str]:
    """Return (event_detail, tool_name_or_empty)."""
    content = (msg or {}).get("content")
    if not isinstance(content, list) or not content:
        return "", ""
    first = content[0]
    if not isinstance(first, dict):
        return "", ""
    if first.get("type") == "tool_use":
        name = first.get("name", "")
        tin = first.get("input") or {}
        snippet = tin.get("command") or tin.get("file_path") or tin.get("pattern") or ""
        # Collapse all whitespace (incl. newlines from heredocs) so the full
        # command fits in a single markdown table cell without breaking it.
        snippet = " ".join(str(snippet).split())
        return (f"{name}: {snippet}" if snippet else name), name
    if first.get("type") == "tool_result":
        return "tool_result", ""
    return first.get("type", ""), ""


def _final_text(msg: dict) -> str:
    content = (msg or {}).get("content")
    if not isinstance(content, list):
        return ""
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            return block.get("text") or ""
    return ""


def parse_session(jsonl_path: Path) -> ParsedSession:
    events: list[PhaseEvent] = []
    tool_sequence: list[str] = []
    final_text = ""
    total_in = 0
    total_out = 0
    prev_ts: datetime | None = None
    first_ts: datetime | None = None
    last_ts: datetime | None = None

    with jsonl_path.open("r", encoding="utf-8") as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            try:
                ev = json.loads(raw)
            except json.JSONDecodeError:
                continue
            ts_str = ev.get("timestamp")
            if not ts_str:
                continue
            try:
                t = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except ValueError:
                continue

            delta = (t - prev_ts).total_seconds() if prev_ts else 0.0
            prev_ts = t
            first_ts = first_ts or t
            last_ts = t

            ev_type = ev.get("type", "")
            msg = ev.get("message") or {}
            detail, tool_name = _detail_for(msg)
            if tool_name:
                tool_sequence.append(tool_name)

            usage = msg.get("usage") or {}
            in_tok = usage.get("input_tokens")
            out_tok = usage.get("output_tokens")
            if in_tok:
                total_in += in_tok
            if out_tok:
                total_out += out_tok

            text = _final_text(msg)
            if text:
                final_text = text  # keep overwriting; last one wins

            events.append(PhaseEvent(
                delta_s=delta,
                event_type=ev_type,
                detail=detail,
                in_tokens=in_tok,
                out_tokens=out_tok,
            ))

    total_wall = (last_ts - first_ts).total_seconds() if first_ts and last_ts else 0.0
    return ParsedSession(
        events=events,
        total_wall_s=total_wall,
        total_in_tokens=total_in,
        total_out_tokens=total_out,
        tool_sequence=tool_sequence,
        final_text=final_text,
    )
