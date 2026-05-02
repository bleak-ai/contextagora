"""Parser/serializer for the `## Where to write` section in a module's llms.txt.

Format per line under the `## Where to write` heading:

    - <name> -> <path-with-naming-pattern> (template: <template-path>)

Naming-pattern tokens are mapped to deterministic regexes for advisory
validator checks. Agents see only the human-readable form in llms.txt.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class GrowthArea:
    name: str
    path: str
    template: str


_HEADING_RE = re.compile(r"^##\s+Where to write\s*$", re.MULTILINE)
_LINE_RE = re.compile(
    r"^-\s+(?P<name>[a-z0-9_-]+)\s*->\s*(?P<path>\S+)\s*\(template:\s*(?P<template>\S+)\s*\)\s*$"
)
_NEXT_HEADING_RE = re.compile(r"^##\s+", re.MULTILINE)


NAMING_REGEXES: dict[str, re.Pattern[str]] = {
    "<date-slug>": re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$"),
    "<seq>-<slug>": re.compile(r"^\d{3}-[a-z0-9-]+$"),
    "<timestamp-slug>": re.compile(r"^\d{8}T\d{6}Z-[a-z0-9-]+$"),
    "<slug>": re.compile(r"^[a-z0-9-]+$"),
}


def parse(llms_txt: str) -> list[GrowthArea]:
    m = _HEADING_RE.search(llms_txt)
    if not m:
        return []
    body_start = m.end()
    next_heading = _NEXT_HEADING_RE.search(llms_txt, pos=body_start)
    body_end = next_heading.start() if next_heading else len(llms_txt)
    body = llms_txt[body_start:body_end]

    out: list[GrowthArea] = []
    for line in body.splitlines():
        match = _LINE_RE.match(line.strip())
        if match:
            out.append(GrowthArea(
                name=match.group("name"),
                path=match.group("path"),
                template=match.group("template"),
            ))
    return out


def _format_section(areas: list[GrowthArea]) -> str:
    lines = ["## Where to write", ""]
    for a in areas:
        lines.append(f"- {a.name} -> {a.path} (template: {a.template})")
    lines.append("")
    return "\n".join(lines)


def replace_section(llms_txt: str, areas: list[GrowthArea]) -> str:
    """Replace the `## Where to write` section with one rendered from `areas`.

    Inserts the section before any other `##` heading if absent. Preserves
    everything else verbatim.
    """
    new_section = _format_section(areas)
    m = _HEADING_RE.search(llms_txt)
    if m:
        # Replace existing section.
        body_start = m.start()
        next_heading = _NEXT_HEADING_RE.search(llms_txt, pos=m.end())
        body_end = next_heading.start() if next_heading else len(llms_txt)
        return llms_txt[:body_start] + new_section + llms_txt[body_end:]
    # Insert before the next `##` heading or at end-of-file.
    next_heading = _NEXT_HEADING_RE.search(llms_txt)
    if next_heading:
        i = next_heading.start()
        return llms_txt[:i] + new_section + "\n" + llms_txt[i:]
    sep = "" if llms_txt.endswith("\n\n") else ("\n" if llms_txt.endswith("\n") else "\n\n")
    return llms_txt + sep + new_section
