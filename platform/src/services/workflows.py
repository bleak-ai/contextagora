"""Workflow listing and run-creation service.

A workflow is a `kind: workflow` module under modules-repo/. Each run is
a `kind: task` module with `parent_workflow` set, written as a sibling
directory at `modules-repo/<workflow>-run-<slug>/`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from src.services import git_repo
from src.services.manifest import (
    ModuleManifest,
    read_manifest,
    slugify_task_name,
    write_manifest,
)
from src.services.schemas import validate_module_name
from src.services.workspace import get_loaded_module_names, reload_workspace


# Errors

class WorkflowError(Exception):
    """Base error for workflow operations."""


class WorkflowNotFound(WorkflowError):
    """The requested workflow doesn't exist in modules-repo."""


class WorkflowEntryStepMissing(WorkflowError):
    """The workflow's entry_step file doesn't exist on disk."""


# Return shapes

@dataclass(frozen=True)
class WorkflowSummary:
    name: str
    summary: str
    entry_step: str | None
    steps: list[str]
    in_flight_runs: int


@dataclass(frozen=True)
class RunInfo:
    run_task_name: str
    path: Path


# Helpers

_NUMERIC_PREFIX_RE = re.compile(r"^(\d+)([a-z]?)[-_](.+)$")


def _step_files(workflow_dir: Path) -> list[str]:
    """Return step filenames sorted by numeric prefix, then variant letter."""
    sdir = workflow_dir / "steps"
    if not sdir.is_dir():
        return []
    files = [p.name for p in sdir.iterdir() if p.is_file() and p.suffix == ".md"]

    def sort_key(fn: str) -> tuple[int, str, str]:
        m = _NUMERIC_PREFIX_RE.match(fn)
        if not m:
            return (10_000, "", fn)
        return (int(m.group(1)), m.group(2), fn)

    return sorted(files, key=sort_key)


def _checklist_from_steps(step_files: list[str]) -> str:
    """Build a `status.md` checklist that collapses variant siblings (4a/4b)."""
    seen_groups: dict[str, list[str]] = {}
    order: list[str] = []
    for fn in step_files:
        m = _NUMERIC_PREFIX_RE.match(fn)
        group_key = m.group(1) if m else fn
        if group_key not in seen_groups:
            seen_groups[group_key] = []
            order.append(group_key)
        seen_groups[group_key].append(fn)

    lines = ["# Status", "", "## Steps", ""]
    for key in order:
        members = seen_groups[key]
        if len(members) == 1:
            lines.append(f"- [ ] {members[0]}")
        else:
            joined = " or ".join(m.split("-", 1)[1].rsplit(".", 1)[0] for m in members)
            lines.append(f"- [ ] Step {key} \u2014 choose {joined}")
    lines.append("")
    return "\n".join(lines)


def _unique_dir_name(repo: Path, base: str) -> str:
    """Return base, or base-2, base-3, ... that doesn't collide on disk."""
    if not (repo / base).exists():
        return base
    i = 2
    while (repo / f"{base}-{i}").exists():
        i += 1
    return f"{base}-{i}"


# Public API

def list_workflows() -> list[WorkflowSummary]:
    """Return all `kind: workflow` modules with metadata + in-flight run counts."""
    out: list[WorkflowSummary] = []
    runs_per_workflow: dict[str, int] = {}
    for name in git_repo.list_modules():
        try:
            manifest = read_manifest(git_repo.module_dir(name))
        except (OSError, ValueError):
            continue
        if (
            manifest.kind == "task"
            and manifest.parent_workflow
            and not manifest.archived
        ):
            runs_per_workflow[manifest.parent_workflow] = (
                runs_per_workflow.get(manifest.parent_workflow, 0) + 1
            )

    for name in git_repo.list_modules():
        try:
            manifest = read_manifest(git_repo.module_dir(name))
        except (OSError, ValueError):
            continue
        if manifest.kind != "workflow":
            continue
        out.append(WorkflowSummary(
            name=name,
            summary=manifest.summary,
            entry_step=manifest.entry_step,
            steps=_step_files(git_repo.module_dir(name)),
            in_flight_runs=runs_per_workflow.get(name, 0),
        ))
    return out


def start_run(workflow_name: str, title: str) -> RunInfo:
    """Create a new run task for the given workflow.

    Raises WorkflowNotFound if the workflow doesn't exist.
    Raises WorkflowEntryStepMissing if the workflow's entry_step file is absent.
    """
    workflow_dir = git_repo.module_dir(workflow_name)
    if not workflow_dir.is_dir():
        raise WorkflowNotFound(f"Workflow '{workflow_name}' does not exist")
    try:
        wf_manifest = read_manifest(workflow_dir)
    except (OSError, ValueError) as exc:
        raise WorkflowNotFound(f"Workflow '{workflow_name}' has invalid manifest: {exc}") from exc
    if wf_manifest.kind != "workflow":
        raise WorkflowNotFound(f"Module '{workflow_name}' is not a workflow")
    if not wf_manifest.entry_step:
        raise WorkflowEntryStepMissing(
            f"Workflow '{workflow_name}' has no entry_step set"
        )
    if not (workflow_dir / "steps" / wf_manifest.entry_step).is_file():
        raise WorkflowEntryStepMissing(
            f"Workflow '{workflow_name}' entry_step '{wf_manifest.entry_step}' not found in steps/"
        )

    title = title.strip()
    if not title:
        raise ValueError("title must not be empty")

    title_slug = slugify_task_name(title)
    if not title_slug:
        raise ValueError(f"title '{title}' did not yield a usable slug")

    base = f"{workflow_name}-run-{title_slug}"
    base = validate_module_name(base)

    repo_root = git_repo.module_dir(workflow_name).parent
    final = _unique_dir_name(repo_root, base)
    run_dir = repo_root / final
    run_dir.mkdir()

    step_files = _step_files(workflow_dir)
    (run_dir / "status.md").write_text(_checklist_from_steps(step_files))

    today = datetime.now(timezone.utc).date().isoformat()
    (run_dir / "info.md").write_text(f"# {title}\n\nCreated: {today}\n")

    write_manifest(run_dir, ModuleManifest(
        name=final,
        kind="task",
        summary=title,
        parent_workflow=workflow_name,
    ))

    (run_dir / "llms.txt").write_text(
        f"# {title}\n> Run of workflow '{workflow_name}'\n\n- [info.md](info.md)\n- [status.md](status.md)\n"
    )

    reload_workspace(get_loaded_module_names())

    return RunInfo(run_task_name=final, path=run_dir)
