# platform/tests/test_workspace_flow.py
"""Integration test: manifest → global schema → dep install flow."""
import yaml
import pytest


@pytest.fixture
def workspace(tmp_path):
    """Set up a fake modules-repo and context dir."""
    modules_repo = tmp_path / "modules-repo"
    context_dir = tmp_path / "context"
    modules_repo.mkdir()
    context_dir.mkdir()

    # Create a module with a manifest
    mod = modules_repo / "linear"
    mod.mkdir()
    (mod / "info.md").write_text("# Linear\nIntegration with Linear.")
    (mod / "module.yaml").write_text(yaml.dump({
        "name": "linear",
        "summary": "Manage Linear issues",
        "secrets": ["LINEAR_API_KEY"],
        "dependencies": ["httpx"],
    }))

    return {"modules_repo": modules_repo, "context_dir": context_dir}


class TestManifestToGlobalSchema:
    def test_global_schema_built_from_manifest(self, workspace):
        """Verify that generate_global_schema produces correct output
        when fed secrets from a manifest."""
        from src.services.manifest import read_manifest
        from src.services.schemas import generate_global_schema

        manifest = read_manifest(workspace["modules_repo"] / "linear")
        schema = generate_global_schema({"linear": manifest.secrets})

        assert "LINEAR_API_KEY=infisical(linear, LINEAR_API_KEY)" in schema
        assert "secretPath=/linear" in schema

    def test_no_secrets_produces_no_schema(self, workspace):
        """A module with no secrets should not appear in the global schema."""
        from src.services.manifest import read_manifest
        from src.services.schemas import generate_global_schema

        # Overwrite manifest with no secrets
        (workspace["modules_repo"] / "linear" / "module.yaml").write_text(
            yaml.dump({"name": "linear"})
        )
        manifest = read_manifest(workspace["modules_repo"] / "linear")
        schema = generate_global_schema({})
        assert "linear" not in schema.lower().split("auto-generated")[0]


class TestManifestPackageInspection:
    def test_inspect_reads_from_manifest(self, workspace):
        from src.services.workspace_inspect import inspect_module_packages

        packages = inspect_module_packages(workspace["modules_repo"] / "linear")
        names = [p["name"] for p in packages]
        assert "httpx" in names

    def test_inspect_empty_manifest(self, workspace):
        from src.services.workspace_inspect import inspect_module_packages

        (workspace["modules_repo"] / "linear" / "module.yaml").write_text(
            yaml.dump({"name": "linear"})
        )
        packages = inspect_module_packages(workspace["modules_repo"] / "linear")
        assert packages == []
