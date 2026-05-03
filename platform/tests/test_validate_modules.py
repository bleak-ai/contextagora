from pathlib import Path

import pytest


def _write_min_module(d: Path, kind: str, **extras):
    """Write the bare-minimum files to satisfy the universal validator branch."""
    d.mkdir(parents=True, exist_ok=True)
    body = {"name": d.name, "kind": kind, **extras}
    import yaml
    (d / "module.yaml").write_text(yaml.dump(body))
    (d / "info.md").write_text(f"# {d.name}\n\nDescription.\n")
    (d / "llms.txt").write_text(f"# {d.name}\n> summary\n\n- [info.md](info.md)\n")


def _validate(module_dir):
    from src.scripts.validate_modules import validate_module
    return validate_module(module_dir)


def test_workflow_with_steps_passes(tmp_path):
    d = tmp_path / "wf"
    _write_min_module(d, "workflow", entry_step="1-intake.md")
    (d / "steps").mkdir()
    (d / "steps" / "1-intake.md").write_text("# intake\n")
    issues = _validate(d)
    errors = [i for i in issues if i[0] == "ERROR"]
    assert errors == []


def test_task_with_known_parent_workflow_passes(tmp_path):
    wf = tmp_path / "wf"
    _write_min_module(wf, "workflow", entry_step="1-intake.md")
    (wf / "steps").mkdir()
    (wf / "steps" / "1-intake.md").write_text("# intake\n")
    run = tmp_path / "wf-run-x"
    _write_min_module(run, "task", parent_workflow="wf")
    issues = _validate(run)
    errors = [i for i in issues if i[0] == "ERROR"]
    assert errors == []


def test_task_module_missing_status_md_is_warn(tmp_path):
    from src.scripts.validate_modules import validate_module
    (tmp_path / "module.yaml").write_text("name: foo\nkind: task\n")
    (tmp_path / "llms.txt").write_text("# foo\n> a task\n\n- [brief.md](brief.md)\n")
    (tmp_path / "brief.md").write_text("# brief")
    # status.md intentionally missing
    issues = validate_module(tmp_path)
    assert any(s == "WARN" and "status.md" in m for s, m in issues), (
        f"expected WARN mentioning status.md, got {issues}"
    )
    # And critically NOT an ERROR -- pre-existing modules must not break.
    assert not any(s == "ERROR" and "status.md" in m for s, m in issues)


def test_workflow_module_missing_steps_md_is_warn(tmp_path):
    from src.scripts.validate_modules import validate_module
    (tmp_path / "module.yaml").write_text("name: foo\nkind: workflow\n")
    (tmp_path / "llms.txt").write_text("# foo\n> a workflow\n")
    issues = validate_module(tmp_path)
    assert any(s == "WARN" and "steps.md" in m for s, m in issues)


def test_integration_module_with_all_required_files_emits_no_kind_warns(tmp_path):
    from src.scripts.validate_modules import validate_module
    (tmp_path / "module.yaml").write_text("name: foo\nkind: integration\n")
    (tmp_path / "llms.txt").write_text("# foo\n> an integration\n")
    (tmp_path / "info.md").write_text("# foo")
    issues = validate_module(tmp_path)
    # No WARN with the "should declare" phrasing introduced by this task.
    assert not any("should declare" in m for _, m in issues), (
        f"expected no per-kind WARN, got {issues}"
    )


def test_task_module_with_info_md_does_not_get_integration_warns(tmp_path):
    """A task module that happens to have info.md must not get
    'missing recommended section' warnings -- those checks are integration-shape."""
    from src.scripts.validate_modules import validate_module
    (tmp_path / "module.yaml").write_text("name: foo\nkind: task\n")
    (tmp_path / "llms.txt").write_text("# foo\n> a task\n")
    (tmp_path / "brief.md").write_text("# brief")
    (tmp_path / "status.md").write_text("# status")
    # Task module with an info.md (unusual but legal).
    (tmp_path / "info.md").write_text("# random notes")

    issues = validate_module(tmp_path)
    integration_shape_warns = [
        m for s, m in issues
        if s == "WARN" and "recommended section" in m
    ]
    assert integration_shape_warns == [], (
        f"task module should not get integration-shape WARNs, got {integration_shape_warns}"
    )


def test_integration_module_still_gets_recommended_section_warns(tmp_path):
    """Integration modules must keep the existing recommended-section checks."""
    from src.scripts.validate_modules import validate_module
    (tmp_path / "module.yaml").write_text("name: foo\nkind: integration\n")
    (tmp_path / "llms.txt").write_text("# foo\n> an integration\n")
    # info.md present but missing the recommended sections.
    (tmp_path / "info.md").write_text("# foo\n\nNo Purpose section here.\n")

    issues = validate_module(tmp_path)
    assert any(
        s == "WARN" and "recommended section: ## Purpose" in m
        for s, m in issues
    ), f"expected Purpose section WARN, got {issues}"


def test_unknown_kind_still_gets_integration_shape_checks_as_fallback(tmp_path):
    """Defensive: for a kind not in KIND_SPECS the validator falls through
    and runs the integration-shape checks (safer than silently skipping).
    Pins the deviation from the plan's literal code (which would early-return).
    """
    from src.scripts.validate_modules import validate_module
    (tmp_path / "module.yaml").write_text("name: foo\nkind: legacy-unknown\n")
    (tmp_path / "llms.txt").write_text("# foo\n> a legacy module\n")
    (tmp_path / "info.md").write_text("# foo\n\nNo Purpose section here.\n")
    issues = validate_module(tmp_path)
    assert any(
        s == "WARN" and "info.md missing recommended section" in m
        for s, m in issues
    ), f"unknown-kind fallback should still run integration checks, got {issues}"
