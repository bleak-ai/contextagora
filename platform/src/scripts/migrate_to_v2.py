"""One-shot, idempotent migration from the old module shape to the trimmed shape.

Run with:
    uv run python platform/src/scripts/migrate_to_v2.py --repo-dir <path> --archived-log <path>

Operations per module:
    - Copy `summary` from module.yaml into the `> ` line of llms.txt.
    - Strip `summary`, `archived`, `entry_step`, `parent_workflow` from module.yaml.
    - Record names of previously-archived modules into a JSON file for the
      one-time UI banner.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml


_DROPPED_FIELDS = {"summary", "archived", "entry_step", "parent_workflow"}


def _set_summary_line(llms_txt: str, summary: str) -> str:
    """Insert or replace the `> summary` line in llms.txt."""
    if not summary:
        return llms_txt
    lines = llms_txt.splitlines()
    out: list[str] = []
    found = False
    for line in lines:
        if line.startswith("> ") and not found:
            out.append(f"> {summary}")
            found = True
        else:
            out.append(line)
    if not found:
        # Insert right after the title line (first `# ` line).
        for i, line in enumerate(out):
            if line.startswith("# "):
                out.insert(i + 1, f"> {summary}")
                break
        else:
            out.insert(0, f"> {summary}")
    trailing = "\n" if llms_txt.endswith("\n") else ""
    return "\n".join(out) + trailing


def _scaffold_minimal_llms(name: str, summary: str) -> str:
    return f"# {name}\n> {summary}\n\n- [info.md](info.md)\n"


def migrate_module(module_dir: Path) -> tuple[bool, bool]:
    """Migrate one module. Returns (changed, was_archived)."""
    manifest_path = module_dir / "module.yaml"
    if not manifest_path.exists():
        return False, False
    raw = yaml.safe_load(manifest_path.read_text()) or {}
    summary = raw.get("summary", "") or ""
    was_archived = bool(raw.get("archived"))

    dropped = _DROPPED_FIELDS & raw.keys()
    if not dropped:
        return False, was_archived

    if summary:
        llms_path = module_dir / "llms.txt"
        existing = llms_path.read_text() if llms_path.exists() else ""
        new = _set_summary_line(existing, summary) if existing else _scaffold_minimal_llms(module_dir.name, summary)
        if new != existing:
            llms_path.write_text(new)

    new_raw = {k: v for k, v in raw.items() if k not in _DROPPED_FIELDS}
    manifest_path.write_text(yaml.dump(new_raw, default_flow_style=False, sort_keys=False))

    return True, was_archived


def migrate_repo(repo_dir: Path, archived_log_path: Path) -> dict:
    """Migrate every module in repo_dir. Idempotent. Records archived names to archived_log_path."""
    repo_dir = Path(repo_dir)
    archived: list[str] = []
    changed = 0
    seen = 0
    for child in sorted(repo_dir.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        seen += 1
        did_change, was_archived = migrate_module(child)
        if did_change:
            changed += 1
        if was_archived:
            archived.append(child.name)

    if archived:
        archived_log_path.parent.mkdir(parents=True, exist_ok=True)
        archived_log_path.write_text(json.dumps(sorted(set(archived))))

    return {"seen": seen, "changed": changed, "archived": archived}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-dir", type=Path, required=True)
    parser.add_argument("--archived-log", type=Path, required=True)
    args = parser.parse_args()
    result = migrate_repo(args.repo_dir, args.archived_log)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
