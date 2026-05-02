"""Generate a single LinkedIn post from an already-extracted social post card.

Mirrors services/tweet.py — same card-as-input contract, different
prompt and length cap. Reuses the card-formatting helper from the
tweet service so both renderings stay in sync.
"""
from __future__ import annotations

from pathlib import Path

from src.models import LinkedinPayload, SocialPostPayload
from src.services.chat.extract import ExtractionError, run_with_retry, strip_fences
from src.services.social.tweet import _format_card

__all__ = ["ExtractionError", "extract_linkedin", "generate_linkedin"]


_PROMPT_PATH = (
    Path(__file__).parent.parent.parent / "prompts" / "commands" / "linkedin_extraction.md"
)


def _load_prompt() -> str:
    return _PROMPT_PATH.read_text()


def _format_prompt(card: SocialPostPayload) -> str:
    return (
        _load_prompt()
        .replace("{{card}}", _format_card(card))
        .replace("{{elapsed_seconds}}", str(card.stats.elapsed_seconds))
    )


def _parse_text(raw: str) -> str:
    text = strip_fences(raw).strip()
    if not text:
        raise ExtractionError("Claude returned empty LinkedIn post text")
    return text


def extract_linkedin(card: SocialPostPayload, *, timeout: int = 180) -> str:
    """Call Claude to produce the LinkedIn post text."""
    return run_with_retry(_format_prompt(card), _parse_text, timeout=timeout)


def generate_linkedin(card: SocialPostPayload) -> LinkedinPayload:
    """Produce a LinkedinPayload from a card payload."""
    return LinkedinPayload(text=extract_linkedin(card))
