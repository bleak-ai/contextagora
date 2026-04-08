from __future__ import annotations

from .parser import ParsedSession


def render_markdown(
    *,
    task_id: str,
    timestamp: str,
    session_id: str,
    parsed: ParsedSession,
    judge_verdict: str,
    judge_reason: str,
    context_fingerprint: str,
    loaded_modules: list[str],
) -> str:
    lines: list[str] = []
    lines.append(f"# Benchmark run: {task_id}")
    lines.append("")
    lines.append(f"- **Timestamp:** {timestamp}")
    lines.append(f"- **Session id:** `{session_id}`")
    lines.append(f"- **Context fingerprint:** `{context_fingerprint}`")
    lines.append(f"- **Loaded modules:** {', '.join(loaded_modules) or '(none)'}")
    lines.append(f"- **Total wall time:** {parsed.total_wall_s:.2f}s")
    lines.append(f"- **Tokens:** in={parsed.total_in_tokens} out={parsed.total_out_tokens}")
    lines.append(f"- **Judge:** **{judge_verdict}** — {judge_reason}")
    lines.append("")
    lines.append("## Phase breakdown")
    lines.append("")
    lines.append("| Δ | Event | Detail | in | out |")
    lines.append("|---:|---|---|---:|---:|")
    for ev in parsed.events:
        in_s = str(ev.in_tokens) if ev.in_tokens else ""
        out_s = str(ev.out_tokens) if ev.out_tokens else ""
        detail = ev.detail.replace("|", "\\|")
        lines.append(f"| {ev.delta_s:.2f}s | {ev.event_type} | {detail} | {in_s} | {out_s} |")
    lines.append("")
    lines.append("## Final agent output")
    lines.append("")
    lines.append(parsed.final_text)
    return "\n".join(lines)
