"""Generate a single LinkedIn post from an already-extracted social post card.

Mirrors services/tweet.py — same card-as-input contract, different
prompt and length cap. Reuses the card-formatting helper from the
tweet service so both renderings stay in sync.
"""
from __future__ import annotations

from pathlib import Path

from src.models import SocialPostPayload
from src.services.claude import run_headless
from src.services.social_post import ExtractionError, _strip_fences
from src.services.tweet import _format_card

__all__ = ["ExtractionError", "extract_linkedin", "generate_linkedin"]


_PROMPT_PATH = (
    Path(__file__).parent.parent / "prompts" / "commands" / "linkedin_extraction.md"
)


def _load_prompt() -> str:
    return _PROMPT_PATH.read_text()


def _format_prompt(card: SocialPostPayload) -> str:
    return (
        _load_prompt()
        .replace("{{card}}", _format_card(card))
        .replace("{{elapsed_seconds}}", str(card.stats.elapsed_seconds))
    )


def extract_linkedin(card: SocialPostPayload, *, timeout: int = 180) -> str:
    """Call Claude to produce the LinkedIn post text.

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
            raise ExtractionError("Claude returned empty LinkedIn post text")
        return text
    raise ExtractionError("unreachable")


def generate_linkedin(card: SocialPostPayload) -> dict:
    """Produce a LinkedinPayload-shaped dict from a card payload."""
    return {"text": extract_linkedin(card)}
