"""Tests for the POST /api/modules/{name}/archive endpoint."""
import yaml
from fastapi.testclient import TestClient

from src.routes import modules as modules_route
from src.server import app
from src.services.modules.manifest import read_manifest, write_manifest, ModuleManifest


def _make_module(repo: "Path", name: str, kind: str = "task", archived: bool = False) -> "Path":
    mod_dir = repo / name
    mod_dir.mkdir()
    write_manifest(mod_dir, ModuleManifest(name=name, kind=kind, archived=archived))
    return mod_dir


def test_archive_sets_archived_true_on_manifest(patch_modules_repo, monkeypatch):
    _make_module(patch_modules_repo, "cleanup-prod-data")
    monkeypatch.setattr(modules_route, "get_loaded_module_names", lambda: [])
    captured = []
    monkeypatch.setattr(modules_route, "reload_workspace", lambda names: captured.append(names) or {"modules": names})

    client = TestClient(app)
    r = client.post("/api/modules/cleanup-prod-data/archive")

    assert r.status_code == 200
    assert r.json() == {"name": "cleanup-prod-data", "archived": True}
    on_disk = read_manifest(patch_modules_repo / "cleanup-prod-data")
    assert on_disk.archived is True
    assert captured == []  # not loaded → nothing to reload


def test_archive_unloads_when_currently_loaded(patch_modules_repo, monkeypatch):
    _make_module(patch_modules_repo, "cleanup-prod-data")
    _make_module(patch_modules_repo, "other-task")
    monkeypatch.setattr(
        modules_route,
        "get_loaded_module_names",
        lambda: ["cleanup-prod-data", "other-task"],
    )
    captured = []
    monkeypatch.setattr(
        modules_route,
        "reload_workspace",
        lambda names: captured.append(names) or {"modules": names},
    )

    client = TestClient(app)
    r = client.post("/api/modules/cleanup-prod-data/archive")

    assert r.status_code == 200
    assert captured == [["other-task"]]  # archived module dropped from loaded set


def test_unarchive_does_not_reload(patch_modules_repo, monkeypatch):
    _make_module(patch_modules_repo, "old-task", archived=True)
    monkeypatch.setattr(modules_route, "get_loaded_module_names", lambda: [])
    captured = []
    monkeypatch.setattr(
        modules_route,
        "reload_workspace",
        lambda names: captured.append(names) or {"modules": names},
    )

    client = TestClient(app)
    r = client.post("/api/modules/old-task/archive?archived=false")

    assert r.status_code == 200
    assert r.json() == {"name": "old-task", "archived": False}
    on_disk = read_manifest(patch_modules_repo / "old-task")
    assert on_disk.archived is False
    assert captured == []  # unarchive never triggers reload


def test_archive_missing_module_returns_404(patch_modules_repo):
    client = TestClient(app)
    r = client.post("/api/modules/does-not-exist/archive")
    assert r.status_code == 404


def test_listing_includes_archived_field(patch_modules_repo):
    _make_module(patch_modules_repo, "active-one", archived=False)
    _make_module(patch_modules_repo, "archived-one", archived=True)

    client = TestClient(app)
    r = client.get("/api/modules")
    assert r.status_code == 200
    by_name = {m["name"]: m for m in r.json()["modules"]}
    assert by_name["active-one"]["archived"] is False
    assert by_name["archived-one"]["archived"] is True
