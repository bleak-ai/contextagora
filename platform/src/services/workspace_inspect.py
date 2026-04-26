"""Inspect a loaded module inside the workspace (context/) directory.

These helpers operate on the workspace *copy* of a module — not the
local clone in modules-repo/. They are read by GET /api/workspace to
build the per-module response.
"""
from pathlib import Path
from importlib.metadata import PackageNotFoundError, version as _version


def list_workspace_files(
    module_dir: Path,
    managed_files: frozenset[str],
) -> list[str]:
    """Return relative paths of user-visible files inside a workspace module.

    Top level: any non-managed file. Nested (any depth): every file.
    Order: top-level alphabetical first, then nested alphabetical.
    """
    if not module_dir.is_dir():
        raise FileNotFoundError(f"Module dir not found: {module_dir}")

    top: list[str] = []
    nested: list[str] = []
    for entry in sorted(module_dir.rglob("*")):
        if not entry.is_file():
            continue
        rel = entry.relative_to(module_dir)
        if rel.parent == Path("."):
            if entry.name not in managed_files:
                top.append(str(rel))
        else:
            nested.append(str(rel))
    return top + nested


def inspect_module_packages(module_dir: Path) -> list[dict[str, str | bool | None]]:
    """Return [{name, version, installed}] for each package declared in
    the module's module.yaml. Empty list if no dependencies.

    Uses importlib.metadata to look up the currently-installed version
    of each package in the platform's shared venv.
    """
    from src.services.manifest import read_manifest

    manifest = read_manifest(module_dir)
    if not manifest.dependencies:
        return []

    out: list[dict[str, str | bool | None]] = []
    for name in manifest.dependencies:
        try:
            v = _version(name)
            out.append({"name": name, "version": v, "installed": True})
        except PackageNotFoundError:
            out.append({"name": name, "version": None, "installed": False})
    return out
