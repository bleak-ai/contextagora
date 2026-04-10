"""Tests for the module manifest service."""
import yaml
import pytest
from pathlib import Path


@pytest.fixture
def module_dir(tmp_path):
    """A temporary module directory."""
    d = tmp_path / "linear"
    d.mkdir()
    return d


class TestReadManifest:
    def test_reads_valid_manifest(self, module_dir):
        from src.services.manifest import read_manifest

        (module_dir / "module.yaml").write_text(
            "name: linear\n"
            'summary: "Manage Linear issues"\n'
            "secrets:\n"
            "  - LINEAR_API_KEY\n"
            "dependencies:\n"
            "  - linear-sdk\n"
        )
        m = read_manifest(module_dir)
        assert m.name == "linear"
        assert m.summary == "Manage Linear issues"
        assert m.secrets == ["LINEAR_API_KEY"]
        assert m.dependencies == ["linear-sdk"]

    def test_missing_manifest_returns_defaults(self, module_dir):
        from src.services.manifest import read_manifest

        m = read_manifest(module_dir)
        assert m.name == "linear"  # inferred from directory name
        assert m.summary == ""
        assert m.secrets == []
        assert m.dependencies == []

    def test_minimal_manifest_fills_defaults(self, module_dir):
        from src.services.manifest import read_manifest

        (module_dir / "module.yaml").write_text("name: linear\n")
        m = read_manifest(module_dir)
        assert m.secrets == []
        assert m.dependencies == []
        assert m.summary == ""


class TestWriteManifest:
    def test_roundtrip(self, module_dir):
        from src.services.manifest import ModuleManifest, read_manifest, write_manifest

        original = ModuleManifest(
            name="linear",
            summary="Manage Linear issues",
            secrets=["LINEAR_API_KEY", "LINEAR_WEBHOOK_SECRET"],
            dependencies=["linear-sdk", "httpx"],
        )
        write_manifest(module_dir, original)
        loaded = read_manifest(module_dir)
        assert loaded == original

    def test_write_creates_valid_yaml(self, module_dir):
        from src.services.manifest import ModuleManifest, write_manifest

        m = ModuleManifest(name="stripe", secrets=["STRIPE_SECRET_KEY"])
        write_manifest(module_dir, m)
        raw = yaml.safe_load((module_dir / "module.yaml").read_text())
        assert raw["name"] == "stripe"
        assert raw["secrets"] == ["STRIPE_SECRET_KEY"]

    def test_write_omits_empty_lists(self, module_dir):
        from src.services.manifest import ModuleManifest, write_manifest

        m = ModuleManifest(name="simple")
        write_manifest(module_dir, m)
        raw = yaml.safe_load((module_dir / "module.yaml").read_text())
        assert "secrets" not in raw
        assert "dependencies" not in raw

    def test_write_omits_empty_summary(self, module_dir):
        from src.services.manifest import ModuleManifest, write_manifest

        m = ModuleManifest(name="simple")
        write_manifest(module_dir, m)
        raw = yaml.safe_load((module_dir / "module.yaml").read_text())
        assert "summary" not in raw
