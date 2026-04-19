"""Smoke tests for the static slash-command registry."""
from src.commands import COMMANDS


def test_add_verify_is_registered():
    """/add-verify should be in the static COMMANDS list."""
    names = [c.name for c in COMMANDS]
    assert "add-verify" in names


def test_add_verify_prompt_has_required_shape():
    """Prompt should load and reference save behavior + sidebar Run."""
    cmd = next(c for c in COMMANDS if c.name == "add-verify")
    assert cmd.description  # non-empty
    assert "save" in cmd.prompt.lower()
    assert "Run" in cmd.prompt  # references the file-preview Run button
    # Conventions must have been injected (no unreplaced placeholder)
    assert "{conventions}" not in cmd.prompt
