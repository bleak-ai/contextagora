"""Page-driving primitives shared by pytest tests and agent-driven runs.

Each helper takes a Playwright Page and uses semantic locators only
(role, accessible name, placeholder, title) so the agent can also reach
the same elements from a snapshot, no data-testid required.
"""
from __future__ import annotations

from playwright.sync_api import Page, expect


def open_app(page: Page, base_url: str) -> None:
    page.goto(base_url, wait_until="domcontentloaded")
    expect(page.get_by_placeholder("Ask anything...")).to_be_visible()


def send_chat(page: Page, text: str, timeout_ms: int = 60_000) -> str:
    """Type into the composer, send, wait for the assistant turn to finish.

    Anchors the wait to a fresh assistant message appearing AND the Stop
    generating button being gone, so it can't return a stale message from
    the previous turn.
    """
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


def new_session(page: Page) -> None:
    page.get_by_role("button", name="New session").click()


def toggle_module(page: Page, module_name: str, on: bool) -> None:
    """Flip a module's ON/OFF switch. No-op if already in the desired state."""
    name_button = page.get_by_role("button", name=module_name)
    card = name_button.locator("xpath=ancestor::*[1]")
    target_title = "Turn on" if on else "Turn off"
    switch = card.get_by_title(target_title)
    if switch.count():
        switch.click()


def expect_module_visible(page: Page, module_name: str, timeout_ms: int = 10_000) -> None:
    """Assert the module's card is rendered in the sidebar."""
    expect(page.get_by_role("button", name=module_name)).to_be_visible(
        timeout=timeout_ms
    )


def expect_module_gone(page: Page, module_name: str, timeout_ms: int = 10_000) -> None:
    expect(page.get_by_role("button", name=module_name)).to_have_count(
        0, timeout=timeout_ms
    )


def delete_module(page: Page, module_name: str, timeout_ms: int = 15_000) -> None:
    """Delete a module via the sidebar overflow menu + confirm dialog."""
    name_button = page.get_by_role("button", name=module_name)
    card = name_button.locator("xpath=ancestor::*[2]")

    card.get_by_role("button", name="More actions").click()
    page.get_by_role("menuitem", name="Delete").click()

    dialog_delete = page.get_by_role("button", name="Delete", exact=True)
    expect(dialog_delete).to_be_visible(timeout=timeout_ms)
    dialog_delete.click()

    expect_module_gone(page, module_name, timeout_ms=timeout_ms)
