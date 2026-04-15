"""Module manifest (module.yaml) read/write service.

Each module can have a module.yaml declaring its name, summary, secrets,
and dependencies.  This replaces the previous per-module .env.schema and
requirements.txt files.
"""
import re
from pathlib import Path

import yaml
from pydantic import BaseModel


class ModuleManifest(BaseModel):
    name: str
    kind: str = "integration"   # "integration" | "task"
    summary: str = ""
    secrets: list[str] = []
    dependencies: list[str] = []
    archived: bool = False


def _extract_section(content: str, heading: str) -> str:
    """Extract the text under a markdown heading (## or ###), stopping at the next heading."""
    pattern = rf"^#{{2,3}}\s+{re.escape(heading)}\s*$"
    match = re.search(pattern, content, re.MULTILINE | re.IGNORECASE)
    if not match:
        return ""
    start = match.end()
    next_heading = re.search(r"^#{1,3}\s+", content[start:], re.MULTILINE)
    end = start + next_heading.start() if next_heading else len(content)
    return content[start:end].strip()


def extract_secrets(content: str) -> list[str]:
    """Extract env var names from the 'Auth & access' section."""
    section = _extract_section(content, "Auth & access")
    if not section:
        return []
    return re.findall(r"`([A-Z][A-Z0-9_]+)`", section)


def extract_packages(content: str) -> list[str]:
    """Extract package names from the 'Python packages' section."""
    section = _extract_section(content, "Python packages")
    if not section:
        return []
    return [line.strip() for line in section.splitlines()
            if line.strip() and not line.strip().startswith("#")]


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
    if manifest.kind != "integration":
        data["kind"] = manifest.kind
    if manifest.summary:
        data["summary"] = manifest.summary
    if manifest.secrets:
        data["secrets"] = manifest.secrets
    if manifest.dependencies:
        data["dependencies"] = manifest.dependencies
    if manifest.archived:
        data["archived"] = manifest.archived
    (module_dir / "module.yaml").write_text(
        yaml.dump(data, default_flow_style=False, sort_keys=False)
    )
