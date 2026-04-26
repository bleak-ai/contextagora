import yaml
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    from src.services import git_repo, workflows as wf_module
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    monkeypatch.setattr(wf_module, "reload_workspace", lambda names: None)
    from src.server import app
    return TestClient(app), tmp_path


def _make_wf(repo, name, steps=("1-intake.md",)):
    d = repo / name
    d.mkdir()
    d.joinpath("module.yaml").write_text(
        yaml.dump({"name": name, "kind": "workflow", "entry_step": steps[0]})
    )
    d.joinpath("info.md").write_text(f"# {name}\n")
    d.joinpath("llms.txt").write_text(f"# {name}\n> wf\n")
    sdir = d / "steps"
    sdir.mkdir()
    for s in steps:
        (sdir / s).write_text(f"# {s}\n")


def test_list_workflows_endpoint(client):
    c, repo = client
    _make_wf(repo, "maat-support", steps=("1-intake.md", "2-plan.md"))
    resp = c.get("/api/workflows")
    assert resp.status_code == 200
    data = resp.json()
    assert "workflows" in data
    assert len(data["workflows"]) == 1
    wf = data["workflows"][0]
    assert wf["name"] == "maat-support"
    assert wf["entry_step"] == "1-intake.md"
    assert wf["steps"] == ["1-intake.md", "2-plan.md"]
    assert wf["in_flight_runs"] == 0


def test_start_run_endpoint(client):
    c, repo = client
    _make_wf(repo, "maat-support")
    resp = c.post("/api/workflows/maat-support/runs", json={"title": "SUP-42 refund"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["run_task_name"] == "maat-support-run-sup-42-refund"
    assert (repo / data["run_task_name"]).is_dir()


def test_start_run_unknown_workflow_returns_404(client):
    c, _ = client
    resp = c.post("/api/workflows/nope/runs", json={"title": "x"})
    assert resp.status_code == 404


def test_start_run_missing_entry_step_returns_400(client):
    c, repo = client
    d = repo / "wf"
    d.mkdir()
    d.joinpath("module.yaml").write_text(
        "name: wf\nkind: workflow\nentry_step: 1-missing.md\n"
    )
    d.joinpath("info.md").write_text("# wf\n")
    (d / "steps").mkdir()
    resp = c.post("/api/workflows/wf/runs", json={"title": "x"})
    assert resp.status_code == 400


def test_start_run_empty_title_returns_400(client):
    c, repo = client
    _make_wf(repo, "wf")
    resp = c.post("/api/workflows/wf/runs", json={"title": "   "})
    assert resp.status_code == 400
