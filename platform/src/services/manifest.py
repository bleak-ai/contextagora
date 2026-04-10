"""Module manifest (module.yaml) read/write service.

Each module can have a module.yaml declaring its name, summary, secrets,
and dependencies.  This replaces the previous per-module .env.schema and
requirements.txt files.
"""
from pathlib import Path

import yaml
from pydantic import BaseModel


class ModuleManifest(BaseModel):
    name: str
    summary: str = ""
    secrets: list[str] = []
    dependencies: list[str] = []


def read_manifest(module_dir: Path) -> ModuleManifest:
    """Read module.yaml from a module directory.

    Returns a manifest with defaults (name inferred from dir) if the
    file doesn't exist.
    """
    manifest_path = module_dir / "module.yaml"
    if not manifest_path.exists():
        return ModuleManifest(name=module_dir.name)
    raw = yaml.safe_load(manifest_path.read_text()) or {}
    raw.setdefault("name", module_dir.name)
    return ModuleManifest(**raw)


def write_manifest(module_dir: Path, manifest: ModuleManifest) -> None:
    """Write a ModuleManifest to module.yaml, omitting empty optional fields."""
    data: dict = {"name": manifest.name}
    if manifest.summary:
        data["summary"] = manifest.summary
    if manifest.secrets:
        data["secrets"] = manifest.secrets
    if manifest.dependencies:
        data["dependencies"] = manifest.dependencies
    (module_dir / "module.yaml").write_text(
        yaml.dump(data, default_flow_style=False, sort_keys=False)
    )
