"""Shared Playwright helpers for browser tests.

Semantic locators only (role, accessible name, placeholder, title) so
selectors stay close to user intent.
"""
from __future__ import annotations

import re

from playwright.sync_api import Page, expect


def open_app(page: Page, base_url: str) -> None:
    page.goto(base_url, wait_until="domcontentloaded")
    expect(page.get_by_placeholder("Ask anything...")).to_be_visible()


def send_chat(page: Page, text: str, timeout_ms: int = 60_000) -> str:
    """Type into the composer, send, wait for the assistant turn to finish."""
    composer = page.get_by_placeholder("Ask anything...")
    asst = page.locator('[data-message-id^="asst-"]')
    initial_count = asst.count()

    composer.fill(text)
    page.get_by_role("button", name="Send message").click()

    expect(asst).to_have_count(initial_count + 1, timeout=timeout_ms)
    expect(page.get_by_role("button", name="Stop generating")).to_be_hidden(
        timeout=timeout_ms
    )
    return asst.last.inner_text()


def expect_module_visible(page: Page, module_name: str, timeout_ms: int = 10_000) -> None:
    expect(page.get_by_text(module_name, exact=True).first).to_be_visible(
        timeout=timeout_ms
    )


def expect_module_gone(page: Page, module_name: str, timeout_ms: int = 10_000) -> None:
    expect(page.get_by_text(module_name, exact=True)).to_have_count(
        0, timeout=timeout_ms
    )


def _sidebar_card_with_menu(page: Page, module_name: str):
    return page.locator("div.rounded-md").filter(has_text=module_name).filter(
        has=page.locator('button[aria-label="More actions"]')
    )


def _ensure_module_card_visible(page: Page, module_name: str, timeout_ms: int) -> None:
    card = _sidebar_card_with_menu(page, module_name)
    try:
        expect(card.first).to_be_visible(timeout=2_000)
        return
    except Exception:
        pass
    page.get_by_role("button").filter(
        has_text=re.compile(r"^Integrations\s*\d+\s*$")
    ).first.click()
    expect(card.first).to_be_visible(timeout=timeout_ms)


def delete_module(page: Page, module_name: str, timeout_ms: int = 15_000) -> None:
    """Delete a module via the sidebar overflow menu + confirm dialog."""
    _ensure_module_card_visible(page, module_name, timeout_ms)

    card = _sidebar_card_with_menu(page, module_name).first
    card.get_by_role("button", name="More actions").click()
    page.get_by_role("menuitem", name="Delete").click()

    dialog_delete = page.get_by_role("button", name="Delete", exact=True)
    expect(dialog_delete).to_be_visible(timeout=timeout_ms)
    dialog_delete.click()

    expect_module_gone(page, module_name, timeout_ms=timeout_ms)
