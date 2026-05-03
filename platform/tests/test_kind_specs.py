import typing

from src.services.modules.kind_specs import (
    KIND_SPECS,
    KindSpec,
    render_kind_specs_md,
)
from src.services.modules.manifest import ModuleKind


def test_kinds_cover_all_module_kinds_in_both_directions():
    # KIND_SPECS keys and manifest.ModuleKind Literal must agree exactly,
    # in BOTH directions, so adding a kind on one side fails fast on the other.
    assert set(KIND_SPECS.keys()) == set(typing.get_args(ModuleKind))


def test_each_spec_requires_module_yaml_and_llms_txt():
    for spec in KIND_SPECS.values():
        assert "module.yaml" in spec.required_files
        assert "llms.txt" in spec.required_files


def test_starter_file_is_in_required_files():
    for spec in KIND_SPECS.values():
        assert spec.starter_file in spec.required_files


def test_render_starts_with_per_kind_subheading_not_a_top_level_heading():
    # The renderer must NOT emit its own `## ...` wrapper heading - the
    # surrounding doc (chat/system.md, _conventions.md §5) owns that. The
    # renderer emits only `### <kind>` subheadings so it can be dropped
    # under any parent section without producing duplicate `##` lines.
    md = render_kind_specs_md()
    assert not md.lstrip().startswith("## "), (
        "renderer must not emit its own ## heading; let the host doc supply it"
    )
    for kind in KIND_SPECS:
        assert f"### `{kind}`" in md


def test_render_lists_required_files_per_kind():
    md = render_kind_specs_md()
    # Spot-check task: must mention status.md and brief.md.
    task_section = md.split("### `task`", 1)[1].split("### `workflow`", 1)[0]
    assert "status.md" in task_section
    assert "brief.md" in task_section


def test_render_lists_growth_areas_per_kind():
    md = render_kind_specs_md()
    workflow_section = md.split("### `workflow`", 1)[1]
    assert "runs" in workflow_section
    assert "lessons" in workflow_section


def test_kindspec_is_frozen():
    spec = next(iter(KIND_SPECS.values()))
    import dataclasses
    assert dataclasses.is_dataclass(spec)
    # Should be immutable.
    import pytest
    with pytest.raises(dataclasses.FrozenInstanceError):
        spec.kind = "other"  # type: ignore[misc]


def test_starter_files_are_pinned_per_kind():
    """Pin the starter_file values per kind. Multiple consumers (chat prompt,
    slash-command conventions, validator gated block, API routes) read this
    field; changing it requires conscious updates to every consumer.
    """
    assert KIND_SPECS["integration"].starter_file == "info.md"
    assert KIND_SPECS["task"].starter_file == "brief.md"
    assert KIND_SPECS["workflow"].starter_file == "steps.md"
