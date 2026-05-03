"""Per-kind module structure: required files, default growth folders, purpose.

Single source of truth for how an `integration`, `task`, or `workflow`
module is laid out on disk. Consumed by:

- `prompts/chat/system.md` (rendered into the always-on system prompt)
- `prompts/_conventions.md` (rendered into slash-command prompts)
- `scripts/validate_modules.py` (per-kind required-file enforcement)

Adding a new kind or changing a required file is a one-place edit here.
"""
from __future__ import annotations

from dataclasses import dataclass

from src.services.modules.growth_areas import GrowthArea


@dataclass(frozen=True)
class KindSpec:
    kind: str
    purpose: str
    required_files: list[str]
    starter_file: str
    starter_outline: str
    growth_areas: list[GrowthArea]


KIND_SPECS: dict[str, KindSpec] = {
    "integration": KindSpec(
        kind="integration",
        purpose="Reusable access to an external service, API, database, or local tool.",
        required_files=["module.yaml", "llms.txt", "info.md"],
        starter_file="info.md",
        starter_outline="Purpose, Access, Operations, Example usage.",
        growth_areas=[
            GrowthArea(name="notes", path="notes/<date-slug>.md", template="(none)"),
        ],
    ),
    "task": KindSpec(
        kind="task",
        purpose="A bounded outcome needing progress tracking, subtasks, findings.",
        required_files=["module.yaml", "llms.txt", "brief.md", "status.md"],
        starter_file="brief.md",
        starter_outline="Goal and initial request; status.md tracks subtasks.",
        growth_areas=[
            GrowthArea(name="progress", path="progress/<date-slug>.md", template="(none)"),
        ],
    ),
    "workflow": KindSpec(
        kind="workflow",
        purpose="A repeatable procedure or playbook that should improve across runs.",
        required_files=["module.yaml", "llms.txt", "steps.md"],
        starter_file="steps.md",
        starter_outline="The repeatable steps, numbered.",
        growth_areas=[
            GrowthArea(name="runs", path="runs/<date-slug>.md", template="(none)"),
            GrowthArea(name="lessons", path="lessons/<date-slug>.md", template="(none)"),
        ],
    ),
}


def render_kind_specs_md() -> str:
    """Render KIND_SPECS as a markdown block for prompt injection.

    Emits only `### <kind>` subheadings. The host document (chat/system.md
    or _conventions.md §5) supplies the parent `## ...` heading, so this
    block can be embedded under any section without producing duplicate
    `##` lines.

    Stable shape: any change here is visible to the chat agent on the
    next process restart, with no separate doc update required.
    """
    lines: list[str] = []
    for spec in KIND_SPECS.values():
        lines.append(f"### `{spec.kind}`")
        lines.append("")
        lines.append(spec.purpose)
        lines.append("")
        lines.append("**Files written at creation:**")
        for f in spec.required_files:
            note = f" - {spec.starter_outline}" if f == spec.starter_file else ""
            lines.append(f"- `{f}`{note}")
        if spec.growth_areas:
            lines.append("")
            lines.append(
                "**Default growth folders** (lazy: created on first entry; "
                "seed these into `llms.txt` `## Where to write` at module creation):"
            )
            for ga in spec.growth_areas:
                lines.append(f"- `{ga.name}` -> `{ga.path}`")
        lines.append("")
    return "\n".join(lines)
