"""Generate a single tweet from an already-extracted social post card.

The tweet generator no longer reads the session transcript. It takes
the structured SocialPostPayload that the card extraction produced and
rewrites it as a 270-char tweet. This is faster and cheaper than a
fresh transcript pass, and keeps the tweet aligned with what the card
actually shows the reader.
"""
from __future__ import annotations

from pathlib import Path

from src.models import SocialPostPayload
from src.services.chat.claude import run_headless
from src.services.social.social_post import ExtractionError, _strip_fences

__all__ = ["ExtractionError", "extract_tweet", "generate_tweet"]


_PROMPT_PATH = (
    Path(__file__).parent.parent.parent / "prompts" / "commands" / "tweet_extraction.md"
)


def _load_prompt() -> str:
    return _PROMPT_PATH.read_text()


def _format_card(card: SocialPostPayload) -> str:
    """Render the card payload as a compact text block for the prompt."""
    lines: list[str] = []
    lines.append(f"Title (outcome headline): {card.title}")
    if card.meta_bits:
        lines.append("Meta bits: " + " | ".join(card.meta_bits))

    lines.append("")
    lines.append("Problem:")
    lines.append(f"  Headline: {card.problem.headline}")
    if card.problem.meta:
        lines.append(f"  Source: {card.problem.meta}")

    lines.append("")
    lines.append(f"Services touched: {', '.join(card.services) if card.services else '(none)'}")

    lines.append("")
    lines.append("Steps:")
    for i, step in enumerate(card.steps, start=1):
        bits = [step.text]
        if step.hint:
            bits.append(f"({step.hint})")
        lines.append(f"  {i}. {' '.join(bits)}")

    lines.append("")
    lines.append("Outcome:")
    lines.append(f"  Title: {card.outcome.title}")
    if card.outcome.subtitle:
        lines.append(f"  Subtitle: {card.outcome.subtitle}")
    if card.outcome.file:
        lines.append(f"  File shipped: {card.outcome.file}")
    if card.outcome.punchline:
        lines.append(f"  Punchline: {card.outcome.punchline}")

    lines.append("")
    lines.append(
        f"Stats: {card.stats.elapsed_seconds}s elapsed, "
        f"{card.stats.prompt_count} prompt(s)"
    )

    return "\n".join(lines)


def _format_prompt(card: SocialPostPayload) -> str:
    return (
        _load_prompt()
        .replace("{{card}}", _format_card(card))
        .replace("{{elapsed_seconds}}", str(card.stats.elapsed_seconds))
    )


def extract_tweet(card: SocialPostPayload, *, timeout: int = 120) -> str:
    """Call Claude to produce the tweet text.

    Retries once on subprocess failure or empty output. Raises
    ExtractionError on the second failure.
    """
    prompt = _format_prompt(card)

    for attempt in (1, 2):
        proc = run_headless(prompt, timeout=timeout, max_turns=1)
        if proc.returncode != 0:
            if attempt == 1:
                continue
            stderr_preview = (proc.stderr or "").strip()[:200]
            raise ExtractionError(
                f"claude CLI exited with code {proc.returncode}: {stderr_preview!r}"
            )
        text = _strip_fences(proc.stdout or "").strip()
        if not text:
            if attempt == 1:
                continue
            raise ExtractionError("Claude returned empty tweet text")
        return text
    raise ExtractionError("unreachable")


def generate_tweet(card: SocialPostPayload) -> dict:
    """Produce a TweetPayload-shaped dict from a card payload."""
    return {"text": extract_tweet(card)}
