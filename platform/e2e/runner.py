"""Two ways to obtain a Playwright Page for the shared scenarios.

- attached(): connects to a running Brave on :9222 (the ai-browsing pattern).
  Persistent profile, no video recording.
- recording(): launches a fresh Chromium that Playwright owns.
  Records WebM to disk on context close. Defaults to
  platform/test-results/agent-videos/ so artifacts stay in the project.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from playwright.sync_api import Page, sync_playwright

DEFAULT_RECORD_DIR = (
    Path(__file__).resolve().parent.parent / "test-results" / "agent-videos"
)


@contextmanager
def attached(cdp_url: str = "http://localhost:9222") -> Iterator[Page]:
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(cdp_url)
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = ctx.new_page()
        try:
            yield page
        finally:
            page.close()
            browser.close()


@contextmanager
def recording(
    out_dir: str | os.PathLike[str] | None = None,
) -> Iterator[Page]:
    out = Path(out_dir) if out_dir is not None else DEFAULT_RECORD_DIR
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context(
            record_video_dir=str(out),
            viewport={"width": 1280, "height": 800},
        )
        page = ctx.new_page()
        try:
            yield page
        finally:
            video = page.video.path() if page.video else None
            ctx.close()
            browser.close()
            if video:
                print(f"VIDEO: {video}")
