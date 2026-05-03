from __future__ import annotations

from playwright.sync_api import Page

from e2e import scenarios


def test_chat_round_trip(page: Page, app_url: str) -> None:
    scenarios.open_app(page, app_url)
    reply = scenarios.send_chat(page, "say hello in one word")
    assert reply.strip(), "assistant produced no text"
