"""Smoke tests for the /add-script slash command registration."""
from src.commands import COMMANDS


def test_add_script_is_registered():
    """/add-script should be in the static COMMANDS list."""
    names = [c.name for c in COMMANDS]
    assert "add-script" in names


def test_add_script_prompt_has_required_shape():
    """Prompt should load, reference save behavior + sidebar Run, and have
    conventions injected (both sections 8 and 9)."""
    cmd = next(c for c in COMMANDS if c.name == "add-script")
    assert cmd.description  # non-empty
    assert "save" in cmd.prompt.lower()
    assert "Run" in cmd.prompt  # references the file-preview Run button
    # Conventions must have been injected (no unreplaced placeholder).
    assert "{conventions}" not in cmd.prompt
    # The Script Contract section (§8) must be present after injection.
    assert "Script Contract" in cmd.prompt
    # The prompt routes read-only intents to /add-verify.
    assert "/add-verify" in cmd.prompt
