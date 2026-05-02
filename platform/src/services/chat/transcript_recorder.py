"""Builds ChatMessage-shaped records from a stream of SSE events.

Mirrors platform/frontend/src/hooks/useChatStore.ts — text merging, thinking
accumulation, tool_use/tool_result pairing. Pure: no I/O, no DB. The caller
persists `recorder.messages` once `finalize()` returns.
"""
from __future__ import annotations

import time
import uuid


class TranscriptRecorder:
    """One instance per turn; do not reuse across turns.

    `messages` is safe to read at any time — returns whatever has been
    recorded so far, so callers can persist partial state from an error
    handler.
    """

    def __init__(self) -> None:
        self._session_id: str | None = None
        self._user_prompt: str = ""
        self._user_id: str = f"user-{uuid.uuid4()}"
        self._assistant_id: str = f"asst-{uuid.uuid4()}"
        self._thinking: str = ""
        self._parts: list[dict] = []
        self._open_tool_calls: dict[str, dict] = {}  # tool_id -> toolCall dict

    @property
    def session_id(self) -> str | None:
        return self._session_id

    def begin_turn(self, prompt: str) -> None:
        self._user_prompt = prompt

    def set_session_id(self, session_id: str) -> None:
        self._session_id = session_id

    def on_text(self, text: str) -> None:
        if self._parts and self._parts[-1].get("type") == "text":
            self._parts[-1]["text"] += text
        else:
            self._parts.append({"type": "text", "text": text})

    def on_thinking(self, text: str) -> None:
        self._thinking += text

    def on_tool_use(self, tool_id: str, name: str, input: dict) -> None:
        tc = {
            "id": tool_id,
            "name": name,
            "input": input or {},
            "startedAt": int(time.time() * 1000),
        }
        self._open_tool_calls[tool_id] = tc
        self._parts.append({"type": "tool_call", "toolCall": tc})

    def on_tool_result(self, tool_id: str, output: str) -> None:
        tc = self._open_tool_calls.get(tool_id)
        if tc is None:
            return
        tc["output"] = output
        tc["completedAt"] = int(time.time() * 1000)

    def finalize(self) -> None:
        # No explicit work needed — `messages` reads state on demand.
        pass

    @property
    def messages(self) -> list[dict]:
        if self._session_id is None:
            return []
        return [
            {
                "id": self._user_id,
                "role": "user",
                "thinking": "",
                "parts": [{"type": "text", "text": self._user_prompt}],
            },
            {
                "id": self._assistant_id,
                "role": "assistant",
                "thinking": self._thinking,
                "parts": self._parts,
            },
        ]
