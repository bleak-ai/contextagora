"""Dev server entrypoint.

Wraps uvicorn so the reloader watches only application source and ignores
agent-writable content dirs. Without these excludes, every chat turn that
writes a module file (the product's normal operation) would trip the
reloader and tear down the in-flight SSE stream.

Production runs uvicorn directly without --reload; this module is
dev-only.
"""
from __future__ import annotations

import uvicorn

from src.config import settings


def _reload_excludes() -> list[str]:
    """Glob patterns for paths the reloader must ignore.

    Derived from settings so the dirs the chat route writes into are the
    same dirs excluded here.
    """
    agent_writable = (settings.MODULES_REPO_DIR, settings.CONTEXT_DIR)
    return [f"{path}/*" for path in agent_writable]


def main() -> None:
    uvicorn.run(
        "src.server:app",
        port=settings.PORT,
        reload=True,
        reload_dirs=[str(settings.BASE_DIR)],
        reload_excludes=_reload_excludes(),
    )


if __name__ == "__main__":
    main()
