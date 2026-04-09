import logging
import shutil

from fastapi import APIRouter

from src.llms import generate_root_llms_txt
from src.models import WorkspaceLoadRequest
from src.server import CONTEXT_DIR, MANAGED_FILES, PRESERVED_FILES, list_modules
from src.services.workspace_inspect import (
    inspect_module_packages,
    list_workspace_files,
)
from src.services import git_repo
from src.services.deps import install_module_deps
from src.services.schemas import generate_global_schema
from src.services.secrets import get_secrets_status

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

PRESERVED_DIRS = [".claude"]

# Cache for secrets status (only refreshed on /load or explicit refresh)
_secrets_cache: dict[str, dict[str, str | None]] = {}


@router.get("")
async def api_workspace():
    """Return loaded modules with per-module files, secrets, and packages."""
    modules = []
    for name in list_modules(CONTEXT_DIR):
        module_dir = CONTEXT_DIR / name
        try:
            files = list_workspace_files(module_dir, MANAGED_FILES)
        except FileNotFoundError:
            files = []
        modules.append({
            "name": name,
            "files": files,
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
    out: list[dict] = []
    for name in list_modules(CONTEXT_DIR):
        module_dir = CONTEXT_DIR / name
        try:
            for path in list_workspace_files(module_dir, MANAGED_FILES):
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
    """Clear workspace and (re)link selected modules into context/.

    Each loaded module becomes a symlink context/<name> -> modules-repo/<name>.
    A global context/.env.schema is generated with Infisical config for all
    modules so varlock resolves secrets directly from the workspace root.
    """
    # 1. Clear context/: unlink symlinks, delete real subdirs (legacy copies),
    #    delete loose files except PRESERVED_FILES.
    for p in CONTEXT_DIR.iterdir():
        if p.is_symlink():
            p.unlink()
        elif p.is_dir():
            shutil.rmtree(p)
        elif p.is_file() and p.name not in PRESERVED_FILES:
            p.unlink()

    # 2. Link preserved dirs (e.g. .claude) from the local clone if they exist.
    for dirname in PRESERVED_DIRS:
        if git_repo.module_exists(dirname):
            try:
                src = git_repo.MODULES_REPO_DIR / dirname
                (CONTEXT_DIR / dirname).symlink_to(src, target_is_directory=True)
            except (OSError, ValueError) as exc:
                log.warning("Failed to link preserved dir '%s': %s", dirname, exc)

    available = set(git_repo.list_modules()) | set(PRESERVED_DIRS)
    loaded: list[str] = []
    errors: list[dict] = []

    for name in body.modules:
        if name not in available:
            errors.append({"module": name, "reason": "not_available"})
            continue

        link_path = CONTEXT_DIR / name

        # Defensive: never let a bad name escape CONTEXT_DIR.
        try:
            link_path.resolve().relative_to(CONTEXT_DIR.resolve())
        except ValueError:
            errors.append({"module": name, "reason": "invalid_path"})
            continue

        try:
            target = git_repo.MODULES_REPO_DIR / name
            if not target.is_dir():
                raise FileNotFoundError(f"Module '{name}' not found in clone")

            link_path.symlink_to(target, target_is_directory=True)

            # install_module_deps reads requirements.txt via the symlink — fine.
            dep_result = install_module_deps(link_path)
            if dep_result is not None and dep_result.returncode != 0:
                raise RuntimeError(
                    f"pip install failed: {dep_result.stderr.strip()}"
                )

            loaded.append(name)

        except (OSError, ValueError, FileNotFoundError, RuntimeError) as exc:
            log.error("Failed to load module '%s': %s", name, exc)
            if link_path.is_symlink() or link_path.exists():
                try:
                    link_path.unlink()
                except OSError:
                    pass
            errors.append({
                "module": name,
                "reason": "load_failed",
                "details": str(exc),
            })

    generate_root_llms_txt(CONTEXT_DIR)

    # Generate global .env.schema for varlock at workspace root.
    modules_with_schemas: dict[str, str] = {}
    for name in loaded:
        schema_path = CONTEXT_DIR / name / ".env.schema"
        if schema_path.exists():
            modules_with_schemas[name] = schema_path.read_text()
    if modules_with_schemas:
        (CONTEXT_DIR / ".env.schema").write_text(
            generate_global_schema(modules_with_schemas)
        )
    else:
        schema_file = CONTEXT_DIR / ".env.schema"
        if schema_file.exists():
            schema_file.unlink()

    response: dict = {"modules": loaded}
    if errors:
        response["errors"] = errors
    return response


@router.post("/secrets")
async def api_workspace_secrets():
    """Re-check secrets status from Infisical."""
    global _secrets_cache
    _secrets_cache = await get_secrets_status(CONTEXT_DIR, list_modules)
    return {"secrets": _secrets_cache}
