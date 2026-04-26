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
    assert "add-integration" in names


def test_list_commands_auto_registers_workflows(tmp_path, monkeypatch):
    from src.services import git_repo
    from src import commands as cmd_module
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    (tmp_path / "maat-support").mkdir()
    (tmp_path / "maat-support" / "module.yaml").write_text(
        "name: maat-support\nkind: workflow\nentry_step: 1-intake.md\n"
    )
    (tmp_path / "maat-support" / "info.md").write_text("# maat-support\n")

    names = {c.name for c in cmd_module.list_commands()}
    assert "maat-support" in names

    cmd = next(c for c in cmd_module.list_commands() if c.name == "maat-support")
    assert "maat-support" in cmd.prompt
    assert "1-intake.md" in cmd.prompt


def test_list_commands_excludes_non_workflow_modules(tmp_path, monkeypatch):
    from src.services import git_repo
    from src import commands as cmd_module
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    (tmp_path / "linear").mkdir()
    (tmp_path / "linear" / "module.yaml").write_text("name: linear\nkind: integration\n")
    (tmp_path / "linear" / "info.md").write_text("# linear\n")

    names = {c.name for c in cmd_module.list_commands()}
    assert "linear" not in names


def test_chat_expands_workflow_slash_command(tmp_path, monkeypatch):
    """The chat interceptor must recognize auto-registered workflow commands."""
    from src.services import git_repo
    from src.routes.chat import _expand_slash_command
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    (tmp_path / "maat-support").mkdir()
    (tmp_path / "maat-support" / "module.yaml").write_text(
        "name: maat-support\nkind: workflow\nentry_step: 1-intake.md\n"
    )

    expanded = _expand_slash_command("/maat-support")
    assert expanded != "/maat-support"
    assert "1-intake.md" in expanded
    assert "maat-support" in expanded
