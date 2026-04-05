"""In-memory session store for concurrent chat sessions."""

from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class Session:
    id: str
    name: str
    claude_session_id: str | None = None
    created_at: float = field(default_factory=time.time)


class SessionStore:
    """Thread-safe-ish in-memory session store.

    Good enough for a single-process uvicorn server.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def create(self, session_id: str, name: str) -> Session:
        session = Session(id=session_id, name=name)
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    def list_all(self) -> list[Session]:
        return sorted(self._sessions.values(), key=lambda s: s.created_at, reverse=True)

    def delete(self, session_id: str) -> bool:
        return self._sessions.pop(session_id, None) is not None

    def rename(self, session_id: str, name: str) -> Session | None:
        session = self._sessions.get(session_id)
        if session:
            session.name = name
        return session


# Singleton instance used by routes
store = SessionStore()
