import logging

from fastapi import APIRouter

from src.models import WorkspaceLoadRequest
from src.config import settings
from src.services.modules.workspace_inspect import (
    count_md_checkboxes,
    inspect_module_packages,
    list_workspace_files,
)
from src.services.modules.deps import install_module_deps
from src.services.modules.secrets import get_secrets_status, prune_schema_for_resolved
from src.services.modules.workspace import list_loaded_modules, reload_workspace

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

_secrets_cache: dict[str, dict[str, str | None]] = {}


@router.get("")
async def api_workspace():
    """Return loaded modules with per-module files, secrets, and packages."""
    modules = []
    for name in list_loaded_modules(settings.CONTEXT_DIR):
        module_dir = settings.CONTEXT_DIR / name
        try:
            files = list_workspace_files(module_dir, settings.MANAGED_FILES)
        except FileNotFoundError:
            files = []
        checkboxes: dict[str, dict[str, int]] = {}
        for rel in files:
            if rel.endswith(".md"):
                counts = count_md_checkboxes(module_dir / rel)
                if counts is not None:
                    checkboxes[rel] = counts
        modules.append({
            "name": name,
            "files": files,
            "checkboxes": checkboxes,
            "secrets": _secrets_cache.get(name, {}),
            "packages": inspect_module_packages(module_dir),
        })
    return {"modules": modules}


@router.get("/files")
async def api_workspace_files():
    """Flat list of every file across all currently loaded modules.

    Used by the chat composer's @-mention picker. Each entry is a
    `<module>/<relative_path>` string the agent can resolve via Read.
    """
    out: list[dict[str, str]] = []
    for name in list_loaded_modules(settings.CONTEXT_DIR):
        module_dir = settings.CONTEXT_DIR / name
        try:
            for path in list_workspace_files(module_dir, settings.MANAGED_FILES):
                out.append({
                    "module": name,
                    "path": path,
                    "label": f"{name}/{path}",
                })
        except FileNotFoundError:
            continue
    return {"files": out}


@router.post("/load")
async def api_workspace_load(body: WorkspaceLoadRequest):
    """Clear workspace and (re)link selected modules into context/."""
    return reload_workspace(body.modules)


@router.post("/secrets")
async def api_workspace_secrets():
    """Re-check secrets status from Infisical."""
    global _secrets_cache
    log.info("Refreshing Infisical secrets for workspace: %s", settings.CONTEXT_DIR)
    _secrets_cache = await get_secrets_status(settings.CONTEXT_DIR, list_loaded_modules)
    resolved = 0
    missing_labels: list[str] = []
    for mod, vars in _secrets_cache.items():
        for var, val in vars.items():
            if val is None:
                missing_labels.append(f"{mod}/{var}")
            else:
                resolved += 1
    log.info(
        "Secrets refresh complete — resolved: %d, missing: %d%s",
        resolved,
        len(missing_labels),
        f" ({', '.join(missing_labels)})" if missing_labels else "",
    )

    prune_schema_for_resolved(_secrets_cache, settings.CONTEXT_DIR)

    return {"secrets": _secrets_cache}


@router.post("/{module_name}/install-deps")
async def api_install_module_deps(module_name: str):
    """Install Python dependencies for a single loaded module."""
    import importlib

    # Prevent directory traversal. We can't use resolve() here because
    # loaded modules are symlinks into modules-repo/, so resolve() would
    # point outside CONTEXT_DIR. Validate the name directly instead.
    if "/" in module_name or module_name in (".", ".."):
        return {"success": False, "error": "Invalid module name"}

    module_dir = settings.CONTEXT_DIR / module_name

    if not module_dir.is_dir():
        return {"success": False, "error": f"Module '{module_name}' is not loaded"}

    result = install_module_deps(module_dir)
    if result is None:
        return {"success": True, "error": None}  # no deps declared

    if result.returncode != 0:
        return {"success": False, "error": result.stderr.strip()}

    # Invalidate cached package metadata so inspect_module_packages
    # sees freshly installed packages without restarting the server.
    importlib.invalidate_caches()

    return {"success": True, "error": None}
