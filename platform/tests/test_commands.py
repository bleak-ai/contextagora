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


def test_load_prompt_raises_when_inject_true_but_placeholder_missing(tmp_path, monkeypatch):
    """If inject_conventions=True but the prompt has no {conventions} token,
    that's a silent no-op today. Make it loud."""
    from src import commands

    fake_prompt = tmp_path / "fake_no_placeholder.md"
    fake_prompt.write_text("# fake prompt without conventions placeholder\n")
    monkeypatch.setattr(commands, "_PROMPTS_DIR", tmp_path)

    import pytest
    with pytest.raises(ValueError, match=r"inject_conventions.*placeholder"):
        commands._load_prompt("fake_no_placeholder.md", inject_conventions=True)


def test_load_prompt_raises_when_inject_false_but_placeholder_present(tmp_path, monkeypatch):
    """If the prompt contains {conventions} but inject_conventions=False, the
    literal token would leak into the agent prompt. Make it loud."""
    from src import commands

    fake_prompt = tmp_path / "fake_with_placeholder.md"
    fake_prompt.write_text("# fake\n\n{conventions}\n")
    monkeypatch.setattr(commands, "_PROMPTS_DIR", tmp_path)

    import pytest
    with pytest.raises(ValueError, match=r"inject_conventions.*placeholder"):
        commands._load_prompt("fake_with_placeholder.md", inject_conventions=False)


def test_load_prompt_succeeds_when_both_agree(tmp_path, monkeypatch):
    """Sanity check: matched inject + placeholder still works."""
    from src import commands

    yes_prompt = tmp_path / "yes.md"
    yes_prompt.write_text("# yes\n\n{conventions}\n")
    no_prompt = tmp_path / "no.md"
    no_prompt.write_text("# no\n")
    monkeypatch.setattr(commands, "_PROMPTS_DIR", tmp_path)

    out_yes = commands._load_prompt("yes.md", inject_conventions=True)
    assert "{conventions}" not in out_yes
    assert "## 5. Module Structure" in out_yes  # conventions block expanded

    out_no = commands._load_prompt("no.md", inject_conventions=False)
    assert out_no.startswith("# no")
