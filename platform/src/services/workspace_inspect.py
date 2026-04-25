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

    Includes top-level files (excluding managed ones), all `.md` files
    anywhere under `docs/`, and `.py` files one level deep under `scripts/`.
    Order: top-level alphabetical, then docs alphabetical, then scripts alphabetical.
    """
    if not module_dir.is_dir():
        raise FileNotFoundError(f"Module dir not found: {module_dir}")

    paths: list[str] = []
    for entry in sorted(module_dir.iterdir()):
        if entry.is_file() and entry.name not in managed_files:
            paths.append(entry.name)

    docs = module_dir / "docs"
    if docs.is_dir():
        for doc in sorted(docs.rglob("*.md")):
            if doc.is_file():
                paths.append(str(doc.relative_to(module_dir)))

    scripts = module_dir / "scripts"
    if scripts.is_dir():
        for script in sorted(scripts.iterdir()):
            if script.is_file() and script.name.endswith(".py"):
                paths.append(f"scripts/{script.name}")

    return paths


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
