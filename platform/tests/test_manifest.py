import yaml
from src.services.modules.manifest import ModuleManifest, read_manifest, write_manifest


def test_manifest_defaults():
    m = ModuleManifest(name="test")
    assert m.kind == "integration"


def test_read_manifest_defaults_without_new_fields(tmp_path):
    (tmp_path / "module.yaml").write_text(yaml.dump({"name": "foo"}))
    m = read_manifest(tmp_path)
    assert m.kind == "integration"


def test_write_manifest_omits_defaults(tmp_path):
    m = ModuleManifest(name="foo")
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert "kind" not in raw
    assert "summary" not in raw


def test_write_manifest_includes_non_defaults(tmp_path):
    m = ModuleManifest(name="foo", kind="task")
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert raw["kind"] == "task"


import pytest
from src.services.modules.manifest import JobSpec, parse_every


def test_parse_every_seconds():
    assert parse_every("30s") == 30
    assert parse_every("90s") == 90


def test_parse_every_minutes():
    assert parse_every("5m") == 300
    assert parse_every("1m") == 60


def test_parse_every_hours():
    assert parse_every("1h") == 3600
    assert parse_every("24h") == 86400


def test_parse_every_rejects_garbage():
    for bad in ["", "5", "5x", "h1", "1.5h", "-5m", "0s", "30 s"]:
        with pytest.raises(ValueError):
            parse_every(bad)


def test_parse_every_rejects_below_tick():
    # Tick is 30s — anything smaller is meaningless.
    with pytest.raises(ValueError):
        parse_every("10s")
    with pytest.raises(ValueError):
        parse_every("29s")


def test_jobspec_validates_every():
    j = JobSpec(name="cleanup", script="scripts/cleanup.py", every="1h")
    assert j.every_seconds == 3600


def test_jobspec_rejects_bad_every():
    with pytest.raises(ValueError):
        JobSpec(name="cleanup", script="scripts/cleanup.py", every="banana")


def test_jobspec_rejects_absolute_script_path():
    with pytest.raises(ValueError):
        JobSpec(name="x", script="/etc/passwd", every="1h")


def test_jobspec_rejects_path_traversal():
    with pytest.raises(ValueError):
        JobSpec(name="x", script="../../etc/passwd", every="1h")


def test_manifest_jobs_roundtrip(tmp_path):
    raw = yaml.dump({
        "name": "linear",
        "jobs": [
            {"name": "cleanup", "script": "scripts/cleanup.py", "every": "1h"},
            {"name": "sync", "script": "scripts/sync.py", "every": "5m"},
        ],
    })
    (tmp_path / "module.yaml").write_text(raw)
    m = read_manifest(tmp_path)
    assert len(m.jobs) == 2
    assert m.jobs[0].name == "cleanup"
    assert m.jobs[1].every_seconds == 300


def test_manifest_jobs_default_empty(tmp_path):
    (tmp_path / "module.yaml").write_text(yaml.dump({"name": "foo"}))
    assert read_manifest(tmp_path).jobs == []


def test_write_manifest_omits_empty_jobs(tmp_path):
    m = ModuleManifest(name="foo")
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert "jobs" not in raw


def test_write_manifest_includes_jobs(tmp_path):
    m = ModuleManifest(
        name="foo",
        jobs=[JobSpec(name="cleanup", script="scripts/cleanup.py", every="1h")],
    )
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert raw["jobs"] == [
        {"name": "cleanup", "script": "scripts/cleanup.py", "every": "1h"}
    ]


# --- archived field ---


def test_archived_default_false(tmp_path):
    (tmp_path / "module.yaml").write_text(yaml.dump({"name": "foo"}))
    assert read_manifest(tmp_path).archived is False


def test_archived_round_trip(tmp_path):
    m = ModuleManifest(name="foo", kind="task", archived=True)
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert raw["archived"] is True
    assert read_manifest(tmp_path).archived is True


def test_write_manifest_omits_archived_when_false(tmp_path):
    m = ModuleManifest(name="foo", kind="task")
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert "archived" not in raw


# --- render_schema_md ---


from src.services.modules.manifest import render_schema_md


def test_render_schema_md_lists_all_fields():
    out = render_schema_md()
    for field_name in ModuleManifest.model_fields:
        assert f"`{field_name}`" in out, f"field {field_name} missing from schema"


def test_render_schema_md_includes_descriptions():
    for field_name, field in ModuleManifest.model_fields.items():
        assert field.description, f"field {field_name} has no description"


def test_render_schema_md_includes_jobspec_fields():
    out = render_schema_md()
    for sub_name in JobSpec.model_fields:
        assert f"`{sub_name}`" in out, f"jobspec field {sub_name} missing from schema"


def test_render_schema_md_marks_archived_default_false():
    out = render_schema_md()
    archived_line = next(line for line in out.splitlines() if "`archived`" in line)
    assert "default false" in archived_line


def test_render_schema_md_lists_empty_defaults():
    """Regression: default_factory=list must render as `default []`, not
    PydanticUndefined."""
    out = render_schema_md()
    assert "PydanticUndefined" not in out
    secrets_line = next(line for line in out.splitlines() if "`secrets`" in line)
    assert "default []" in secrets_line


