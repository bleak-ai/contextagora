"""Module manifest (module.yaml) read/write service.

Each module can have a module.yaml declaring its name, summary, secrets,
and dependencies.  This replaces the previous per-module .env.schema and
requirements.txt files.
"""
import re
from pathlib import Path

import yaml
from pydantic import BaseModel, field_validator

KINDS = ("integration", "task", "workflow")


_EVERY_RE = re.compile(r"^(\d+)([smh])$")
_EVERY_UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600}

# Must match jobs.TICK_SECONDS — keep as a constant here to avoid
# importing jobs.py from manifest.py (circular).
_MIN_EVERY_SECONDS = 30


def parse_every(value: str) -> int:
    """Convert '30s' / '5m' / '1h' to a number of seconds.

    Raises ValueError on any malformed input or values below the
    scheduler tick (30 s) — sub-tick intervals would round up anyway
    and surprise the user.
    """
    if not isinstance(value, str):
        raise ValueError(f"every must be a string, got {type(value).__name__}")
    match = _EVERY_RE.fullmatch(value)
    if not match:
        raise ValueError(
            f"invalid every '{value}': expected <digits><s|m|h>, e.g. '30s', '5m', '1h'"
        )
    n = int(match.group(1))
    if n == 0:
        raise ValueError(f"invalid every '{value}': must be > 0")
    seconds = n * _EVERY_UNIT_SECONDS[match.group(2)]
    if seconds < _MIN_EVERY_SECONDS:
        raise ValueError(
            f"invalid every '{value}': minimum is {_MIN_EVERY_SECONDS}s"
        )
    return seconds


class JobSpec(BaseModel):
    name: str
    script: str
    every: str

    @field_validator("script")
    @classmethod
    def _no_absolute_or_traversal(cls, v: str) -> str:
        if v.startswith("/") or ".." in Path(v).parts:
            raise ValueError(f"invalid script path '{v}': must be relative inside the module")
        return v

    @field_validator("every")
    @classmethod
    def _validate_every(cls, v: str) -> str:
        parse_every(v)  # raises on bad values
        return v

    @property
    def every_seconds(self) -> int:
        return parse_every(self.every)


class ModuleManifest(BaseModel):
    name: str
    kind: str = "integration"   # "integration" | "task" | "workflow"
    secrets: list[str] = []
    dependencies: list[str] = []
    jobs: list[JobSpec] = []


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
    data: dict[str, str | bool | list[str]] = {"name": manifest.name}
    if manifest.kind != "integration":
        data["kind"] = manifest.kind
    if manifest.secrets:
        data["secrets"] = manifest.secrets
    if manifest.dependencies:
        data["dependencies"] = manifest.dependencies
    if manifest.jobs:
        data["jobs"] = [
            {"name": j.name, "script": j.script, "every": j.every}
            for j in manifest.jobs
        ]
    (module_dir / "module.yaml").write_text(
        yaml.dump(data, default_flow_style=False, sort_keys=False)
    )


_SLUG_NON_ALPHANUM = re.compile(r"[^a-z0-9-]")
_SLUG_DASH_RUN = re.compile(r"-+")


def slugify_task_name(name: str) -> str:
    """Convert a human task name to a folder-safe slug."""
    slug = name.strip().lower().replace("_", "-")
    slug = _SLUG_NON_ALPHANUM.sub("-", slug)
    slug = _SLUG_DASH_RUN.sub("-", slug)
    return slug.strip("-")
