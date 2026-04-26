from pathlib import Path

import pytest
import yaml


def _make_workflow(repo: Path, name: str, entry_step: str = "1-intake.md", steps: list[str] | None = None):
    """Helper: scaffold a workflow module under repo."""
    wdir = repo / name
    wdir.mkdir()
    (wdir / "module.yaml").write_text(
        yaml.dump({"name": name, "kind": "workflow", "entry_step": entry_step})
    )
    (wdir / "info.md").write_text(f"# {name}\n")
    (wdir / "llms.txt").write_text(f"# {name}\n> wf\n- [info.md](info.md)\n")
    sdir = wdir / "steps"
    sdir.mkdir()
    for s in (steps or [entry_step]):
        (sdir / s).write_text(f"# {s}\n")


def test_list_workflows_empty(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    assert workflows.list_workflows() == []


def test_list_workflows_returns_workflows_only(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    _make_workflow(tmp_path, "maat-support", steps=["1-intake.md", "2-plan.md"])
    (tmp_path / "linear").mkdir()
    (tmp_path / "linear" / "module.yaml").write_text("name: linear\nkind: integration\n")
    out = workflows.list_workflows()
    assert len(out) == 1
    assert out[0].name == "maat-support"
    assert out[0].entry_step == "1-intake.md"
    assert out[0].steps == ["1-intake.md", "2-plan.md"]
    assert out[0].in_flight_runs == 0


def test_list_workflows_counts_in_flight_runs(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    _make_workflow(tmp_path, "maat-support")
    (tmp_path / "maat-support-run-sup-42").mkdir()
    (tmp_path / "maat-support-run-sup-42" / "module.yaml").write_text(
        "name: maat-support-run-sup-42\nkind: task\nparent_workflow: maat-support\n"
    )
    (tmp_path / "maat-support-run-sup-1").mkdir()
    (tmp_path / "maat-support-run-sup-1" / "module.yaml").write_text(
        "name: maat-support-run-sup-1\nkind: task\nparent_workflow: maat-support\narchived: true\n"
    )
    out = workflows.list_workflows()
    assert out[0].in_flight_runs == 1


def test_start_run_creates_task_module(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    monkeypatch.setattr(workflows, "reload_workspace", lambda names: None)
    _make_workflow(tmp_path, "maat-support", steps=["1-intake.md", "2-plan.md"])

    info = workflows.start_run("maat-support", "SUP-42 refund subscription")
    assert info.run_task_name == "maat-support-run-sup-42-refund-subscription"
    run_dir = tmp_path / info.run_task_name
    assert run_dir.is_dir()

    manifest = yaml.safe_load((run_dir / "module.yaml").read_text())
    assert manifest["name"] == info.run_task_name
    assert manifest["kind"] == "task"
    assert manifest["parent_workflow"] == "maat-support"

    status = (run_dir / "status.md").read_text()
    assert "1-intake.md" in status or "intake" in status
    assert "2-plan.md" in status or "plan" in status

    info_md = (run_dir / "info.md").read_text()
    assert "SUP-42 refund subscription" in info_md


def test_start_run_collapses_variants_in_status(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    monkeypatch.setattr(workflows, "reload_workspace", lambda names: None)
    _make_workflow(
        tmp_path, "migration",
        entry_step="1-merge.md",
        steps=["1-merge.md", "2-transform.md", "4a-price-setup.md", "4b-price-match.md"],
    )
    info = workflows.start_run("migration", "acme-gym")
    status = (tmp_path / info.run_task_name / "status.md").read_text()
    lines_with_4 = [ln for ln in status.splitlines() if ln.strip().startswith("- [ ]") and ("4" in ln)]
    assert len(lines_with_4) == 1


def test_start_run_collision_appends_suffix(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    monkeypatch.setattr(workflows, "reload_workspace", lambda names: None)
    _make_workflow(tmp_path, "wf")
    info1 = workflows.start_run("wf", "X")
    info2 = workflows.start_run("wf", "X")
    assert info1.run_task_name == "wf-run-x"
    assert info2.run_task_name == "wf-run-x-2"


def test_start_run_unknown_workflow_raises(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    with pytest.raises(workflows.WorkflowNotFound):
        workflows.start_run("nope", "x")


def test_start_run_missing_entry_step_raises(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    monkeypatch.setattr(workflows, "reload_workspace", lambda names: None)
    wdir = tmp_path / "wf"
    wdir.mkdir()
    (wdir / "module.yaml").write_text("name: wf\nkind: workflow\nentry_step: 1-missing.md\n")
    (wdir / "info.md").write_text("# wf\n")
    (wdir / "steps").mkdir()
    with pytest.raises(workflows.WorkflowEntryStepMissing):
        workflows.start_run("wf", "x")
