"""Canonical agent-driven run: open the app, send one message, record video.

Run from platform/ with:
    uv run python -m e2e.sample_agent_run
The app must already be reachable at $CONTEXTAGORA_E2E_URL or http://localhost:5173.
"""
from __future__ import annotations

import os

from e2e import runner, scenarios


def main() -> None:
    url = os.environ.get("CONTEXTAGORA_E2E_URL", "http://localhost:5173")
    with runner.recording() as page:
        scenarios.open_app(page, url)
        reply = scenarios.send_chat(page, "list the loaded modules")
        print("ASSISTANT:", reply[:400])


if __name__ == "__main__":
    main()
