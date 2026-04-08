"""Inspect a loaded module inside the workspace (context/) directory.

These helpers operate on the workspace *copy* of a module — not the
local clone in modules-repo/. They are read by GET /api/workspace to
build the per-module response.
"""
from pathlib import Path
from importlib.metadata import PackageNotFoundError, version as _version


def list_workspace_files(
    module_dir: Path,
    managed_files: set[str],
) -> list[str]:
    """Return relative paths of user-visible files inside a workspace module.

    Includes top-level files (excluding managed ones) and any `.md` files
    one level deep under `docs/`. Order: top-level alphabetical, then
    docs alphabetical.
    """
    if not module_dir.is_dir():
        raise FileNotFoundError(f"Module dir not found: {module_dir}")

    paths: list[str] = []
    for entry in sorted(module_dir.iterdir()):
        if entry.is_file() and entry.name not in managed_files:
            paths.append(entry.name)

    docs = module_dir / "docs"
    if docs.is_dir():
        for doc in sorted(docs.iterdir()):
            if doc.is_file() and doc.name.endswith(".md"):
                paths.append(f"docs/{doc.name}")

    return paths


def _parse_requirement(line: str) -> str | None:
    """Extract just the package name from a requirements.txt line.

    Strips inline comments, version specifiers, and extras. Returns None
    for blank/comment-only lines.
    """
    line = line.split("#", 1)[0].strip()
    if not line:
        return None
    # Cut off version specifiers and extras: `pkg[extra]>=1.0` -> `pkg`
    for sep in ("[", "=", ">", "<", "~", "!", ";", " "):
        idx = line.find(sep)
        if idx != -1:
            line = line[:idx]
    return line.strip() or None


def inspect_module_packages(module_dir: Path) -> list[dict]:
    """Return [{name, version, installed}] for each package declared in
    the module's requirements.txt. Empty list if no requirements.txt.

    Uses importlib.metadata to look up the currently-installed version
    of each package in the platform's shared venv.
    """
    req = module_dir / "requirements.txt"
    if not req.exists():
        return []

    out: list[dict] = []
    for raw in req.read_text().splitlines():
        name = _parse_requirement(raw)
        if name is None:
            continue
        try:
            v = _version(name)
            out.append({"name": name, "version": v, "installed": True})
        except PackageNotFoundError:
            out.append({"name": name, "version": None, "installed": False})
    return out
