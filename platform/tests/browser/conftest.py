"""E2E fixtures.

`app_url` defaults to the Vite dev server (5173). Override via
`CONTEXTAGORA_E2E_URL=http://localhost:9090` to hit the built SPA served
directly by FastAPI (CI / Docker shape).

Run with `make e2e` (all tests) or `make e2e-one T=test_chat` (single file).
Videos land in `<project-root>/e2e-videos/<test-id>/video.webm`.
"""
from __future__ import annotations

import os

import pytest


@pytest.fixture(scope="session")
def app_url() -> str:
    return os.environ.get("CONTEXTAGORA_E2E_URL", "http://localhost:5173")


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {**browser_context_args, "viewport": {"width": 1280, "height": 800}}
