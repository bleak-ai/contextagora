"""Module manifest (module.yaml) read/write service.

Each module can have a module.yaml declaring its name, summary, secrets,
and dependencies.  This replaces the previous per-module .env.schema and
requirements.txt files.
"""
import re
from enum import Enum
from pathlib import Path

import yaml
from pydantic import BaseModel, field_validator

from src.llms import generate_module_llms_txt
from src.models import CreateModuleRequest
from src.services import git_repo


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
    summary: str = ""
    secrets: list[str] = []
    dependencies: list[str] = []
    archived: bool = False
    jobs: list[JobSpec] = []
    entry_step: str | None = None       # workflow only — filename in steps/
    parent_workflow: str | None = None  # task only — workflow this run came from


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
    if manifest.summary:
        data["summary"] = manifest.summary
    if manifest.secrets:
        data["secrets"] = manifest.secrets
    if manifest.dependencies:
        data["dependencies"] = manifest.dependencies
    if manifest.archived:
        data["archived"] = manifest.archived
    if manifest.entry_step is not None:
        data["entry_step"] = manifest.entry_step
    if manifest.parent_workflow is not None:
        data["parent_workflow"] = manifest.parent_workflow
    if manifest.jobs:
        data["jobs"] = [
            {"name": j.name, "script": j.script, "every": j.every}
            for j in manifest.jobs
        ]
    (module_dir / "module.yaml").write_text(
        yaml.dump(data, default_flow_style=False, sort_keys=False)
    )


class ModuleKind(str, Enum):
    """The three kinds of modules the system knows about.

    `INTEGRATION` — a context package describing a tool/service. Never
    auto-loaded — users toggle them manually.
    `TASK` — a time-bound piece of work; always loaded into the workspace
    while unarchived.
    `WORKFLOW` — a multi-step orchestrated process authored on disk; always
    loaded into the workspace while unarchived. Workflows are not created
    via the modal — they must be authored manually on disk.
    """

    INTEGRATION = "integration"
    TASK = "task"
    WORKFLOW = "workflow"

    @property
    def auto_load(self) -> bool:
        # Tasks and workflows are always present in the workspace.
        return self is ModuleKind.TASK or self is ModuleKind.WORKFLOW

    @property
    def label(self) -> str:
        return self.value.capitalize()

    def scaffold(self, slug: str, body: CreateModuleRequest) -> None:
        """Write kind-specific starter files into the module directory."""
        if self is ModuleKind.INTEGRATION:
            _scaffold_integration(slug, body)
        elif self is ModuleKind.TASK:
            _scaffold_task(slug, body)
        elif self is ModuleKind.WORKFLOW:
            # Workflows are authored manually on disk — there is no
            # opinionated scaffold for them in v1.
            raise NotImplementedError(
                "Workflow modules must be authored on disk, not created via the modal"
            )
        else:
            raise AssertionError(f"Unhandled ModuleKind: {self!r}")


_SLUG_NON_ALPHANUM = re.compile(r"[^a-z0-9-]")
_SLUG_DASH_RUN = re.compile(r"-+")


def slugify_task_name(name: str) -> str:
    """Convert a human task name to a folder-safe slug."""
    slug = name.strip().lower().replace("_", "-")
    slug = _SLUG_NON_ALPHANUM.sub("-", slug)
    slug = _SLUG_DASH_RUN.sub("-", slug)
    return slug.strip("-")


def set_archived(name: str, archived: bool) -> None:
    """Flip the archived flag on a module's manifest."""
    module_dir = git_repo.module_dir(name)
    manifest = read_manifest(module_dir)
    manifest = manifest.model_copy(update={"archived": archived})
    write_manifest(module_dir, manifest)


def _scaffold_integration(slug: str, body: CreateModuleRequest) -> None:
    """Scaffold files for an integration module."""
    git_repo.write_file(slug, "info.md", body.content)
    llms_txt = generate_module_llms_txt(slug, body.summary, ["info.md"])
    git_repo.write_file(slug, "llms.txt", llms_txt)


def _scaffold_task(slug: str, body: CreateModuleRequest) -> None:
    """Scaffold files for a task module."""
    title = body.name.strip()
    description = body.description.strip() if body.description else ""
    summary = description or title

    info_lines = [f"# {title}", ""]
    if description:
        info_lines.append(description)
    git_repo.write_file(slug, "info.md", "\n".join(info_lines) + "\n")

    llms_lines = [
        f"# {title}",
        f"> {summary}",
        "",
        "- [info.md](info.md) — Task description",
    ]
    git_repo.write_file(slug, "llms.txt", "\n".join(llms_lines) + "\n")
