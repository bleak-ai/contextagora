import yaml
from src.services.manifest import ModuleManifest, read_manifest, write_manifest


def test_manifest_defaults():
    m = ModuleManifest(name="test")
    assert m.kind == "integration"
    assert m.archived is False


def test_read_manifest_with_kind_and_archived(tmp_path):
    (tmp_path / "module.yaml").write_text(
        yaml.dump({"name": "foo", "kind": "task", "archived": True})
    )
    m = read_manifest(tmp_path)
    assert m.kind == "task"
    assert m.archived is True


def test_read_manifest_defaults_without_new_fields(tmp_path):
    (tmp_path / "module.yaml").write_text(yaml.dump({"name": "foo"}))
    m = read_manifest(tmp_path)
    assert m.kind == "integration"
    assert m.archived is False


def test_write_manifest_omits_defaults(tmp_path):
    m = ModuleManifest(name="foo", summary="test")
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert "kind" not in raw
    assert "archived" not in raw


def test_write_manifest_includes_non_defaults(tmp_path):
    m = ModuleManifest(name="foo", kind="task", archived=True)
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert raw["kind"] == "task"
    assert raw["archived"] is True
