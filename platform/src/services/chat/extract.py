"""Shared utilities for prompting Claude and parsing its output.

The retry-once contract is the same across the social-post, tweet, and
LinkedIn extractors: one CLI call, one retry on subprocess failure, one
retry on parse failure (optionally with a nudge appended to the prompt),
and ExtractionError on the second failure.
"""
from __future__ import annotations

import re
from collections.abc import Callable
from typing import TypeVar

from src.services.chat.claude import run_headless


class ExtractionError(Exception):
    """Raised when Claude fails to return usable output after one retry."""


_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*\n(.*)\n```\s*$", re.DOTALL)


def strip_fences(text: str) -> str:
    """Strip a single outer ```...``` (or ```json...```) markdown fence."""
    m = _FENCE_RE.match(text)
    return (m.group(1) if m else text).strip()


T = TypeVar("T")


def run_with_retry(
    prompt: str,
    parse: Callable[[str], T],
    *,
    timeout: int = 120,
    nudge: str = "",
) -> T:
    """Run claude headless and parse the output. Retry once on failure.

    `parse` should raise ExtractionError when the output is unusable. On
    the second attempt, `nudge` (if non-empty) is appended to the prompt
    so the model can correct course.
    """
    current_prompt = prompt
    for attempt in (1, 2):
        proc = run_headless(current_prompt, timeout=timeout, max_turns=1)
        if proc.returncode != 0:
            if attempt == 1:
                continue
            stderr_preview = (proc.stderr or "").strip()[:200]
            raise ExtractionError(
                f"claude CLI exited with code {proc.returncode}: {stderr_preview!r}"
            )
        try:
            return parse(proc.stdout or "")
        except ExtractionError:
            if attempt == 1:
                if nudge:
                    current_prompt = prompt + nudge
                continue
            raise
    raise ExtractionError("unreachable")
