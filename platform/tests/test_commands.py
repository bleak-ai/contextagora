"""Smoke tests for the slash-command registry."""
from src.commands import list_commands


def test_add_verify_is_registered():
    """/add-verify should be in the static command list."""
    names = [c.name for c in list_commands()]
    assert "add-verify" in names


def test_add_verify_prompt_has_required_shape():
    """Prompt should load and reference save behavior + sidebar Run."""
    cmd = next(c for c in list_commands() if c.name == "add-verify")
    assert cmd.description  # non-empty
    assert "save" in cmd.prompt.lower()
    assert "Run" in cmd.prompt  # references the file-preview Run button
    # Conventions must have been injected (no unreplaced placeholder)
    assert "{conventions}" not in cmd.prompt


def test_list_commands_includes_static_set():
    """Existing static commands remain in the list."""
    names = {c.name for c in list_commands()}
    assert "download" in names
    assert "introduction" in names


def test_list_commands_excludes_non_workflow_modules(tmp_path, monkeypatch):
    from src.services.modules import git_repo
    from src import commands as cmd_module
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    (tmp_path / "linear").mkdir()
    (tmp_path / "linear" / "module.yaml").write_text("name: linear\nkind: integration\n")
    (tmp_path / "linear" / "info.md").write_text("# linear\n")

    names = {c.name for c in cmd_module.list_commands()}
    assert "linear" not in names


def test_conventions_block_contains_kind_specs():
    from src.commands import _CONVENTIONS
    # `## 5. Module Structure` wrapper is owned by _conventions.md;
    # `### \`integration\`` etc. are emitted by render_kind_specs_md.
    assert "## 5. Module Structure" in _CONVENTIONS
    assert "### `integration`" in _CONVENTIONS
    assert "{kind_specs}" not in _CONVENTIONS  # placeholder must be expanded


def test_slash_command_prompts_inherit_kind_specs():
    from src.commands import _STATIC_COMMANDS
    inject_targets = {"guide", "add-verify", "add-script", "cron-jobs"}
    for cmd in _STATIC_COMMANDS:
        if cmd.name in inject_targets:
            assert "### `integration`" in cmd.prompt, (
                f"slash command '{cmd.name}' is missing the kind_specs block"
            )
