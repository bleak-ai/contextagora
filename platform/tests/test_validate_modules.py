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
