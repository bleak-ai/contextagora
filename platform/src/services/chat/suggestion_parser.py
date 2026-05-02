"""Streaming parser that extracts <<TRY: ...>> markers from assistant text.

Used by routes/chat.py to convert in-message suggestion markers into
structured `suggestion` SSE events. The parser is fed text deltas as they
stream from Claude and returns (cleaned_text, [suggestion, ...]) tuples.

Design notes:
- Markers may be split across deltas, so a buffer is maintained.
- Only the well-formed pattern `<<TRY: ...>>` is recognized. Bare `<<`
  is passed through (so e.g. bit-shift expressions are unaffected).
- If the stream ends with an unterminated marker, the partial is dropped
  silently — leaking `<<TRY:` to the user is worse than dropping a rare
  edge case.
"""
import re

_MARKER_RE = re.compile(r"<<TRY:\s*(.*?)>>", re.DOTALL)
# Sentinel that signals "I might be looking at the start of a marker; hold."
_MARKER_OPEN = "<<TRY:"


class SuggestionBuffer:
    """Stateful buffer that extracts complete <<TRY: ...>> markers from a stream.

    Usage:
        buf = SuggestionBuffer()
        for delta in stream:
            visible_text, suggestions = buf.feed(delta)
            # forward visible_text to the user; emit a `suggestion` event for
            # each entry in suggestions.
        tail = buf.finalize()
        # forward `tail` as the very last visible text.
    """

    def __init__(self) -> None:
        self._pending = ""

    def feed(self, chunk: str) -> tuple[str, list[str]]:
        """Append `chunk` to the internal buffer, extract any complete markers,
        and return (text safe to forward now, list of extracted suggestions)."""
        self._pending += chunk
        suggestions: list[str] = []

        # Repeatedly pull complete markers off the front of the buffer.
        while True:
            match = _MARKER_RE.search(self._pending)
            if not match:
                break
            suggestions.append(match.group(1).strip())
            # Splice the match out of the buffer (keep text before and after).
            self._pending = (
                self._pending[: match.start()] + self._pending[match.end() :]
            )

        # If the buffer might still contain the *start* of a marker that
        # hasn't been closed yet, hold back the suspicious tail.
        safe_text, held = self._split_safe(self._pending)
        self._pending = held
        return safe_text, suggestions

    def finalize(self) -> str:
        """Flush whatever is left in the buffer at end-of-stream.

        If there's a pending unterminated marker, drop it silently.
        """
        # If the tail still looks like an in-progress marker, drop it.
        if self._partial_marker_index(self._pending) is not None:
            tail = self._pending[: self._partial_marker_index(self._pending)]
        else:
            tail = self._pending
        self._pending = ""
        return tail

    # helpers

    def _split_safe(self, text: str) -> tuple[str, str]:
        """Split `text` into (safe-to-forward-now, must-hold).

        We must hold any tail that could be the prefix of a marker.
        """
        idx = self._partial_marker_index(text)
        if idx is None:
            return text, ""
        return text[:idx], text[idx:]

    @staticmethod
    def _partial_marker_index(text: str) -> int | None:
        """Return the index of a tail that could be a partial `<<TRY:` open
        sequence (or a complete-but-unterminated marker), or None if the
        text is safe to flush in full.
        """
        # Case 1: a literal `<<TRY:` exists with no closing `>>` after it.
        try_idx = text.rfind(_MARKER_OPEN)
        if try_idx != -1 and ">>" not in text[try_idx:]:
            return try_idx
        # Case 2: the text ends with a strict prefix of `<<TRY:`
        # (e.g. ends with `<`, `<<`, `<<T`, ..., `<<TRY` — anything that could
        # become a marker once the next chunk arrives).
        for n in range(len(_MARKER_OPEN) - 1, 0, -1):
            if text.endswith(_MARKER_OPEN[:n]):
                return len(text) - n
        return None
