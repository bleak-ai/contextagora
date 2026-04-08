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
from src.services.schemas import augment_schema
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


@router.post("/load")
async def api_workspace_load(body: WorkspaceLoadRequest):
    """Clear workspace and download selected modules."""
    for p in CONTEXT_DIR.iterdir():
        if p.is_dir():
            shutil.rmtree(p)
        elif p.is_file() and p.name not in PRESERVED_FILES:
            p.unlink()

    # Copy preserved dirs (e.g. .claude) from the local clone if they exist
    for dirname in PRESERVED_DIRS:
        if git_repo.module_exists(dirname):
            try:
                git_repo.copy_module_to(dirname, CONTEXT_DIR / dirname)
            except (OSError, ValueError, FileNotFoundError) as exc:
                log.warning("Failed to copy preserved dir '%s': %s", dirname, exc)

    available = set(git_repo.list_modules()) | set(PRESERVED_DIRS)
    loaded: list[str] = []
    errors: list[dict] = []

    for name in body.modules:
        if name not in available:
            errors.append({"module": name, "reason": "not_available"})
            continue

        module_dir = CONTEXT_DIR / name

        # Defensive: never let a bad name escape CONTEXT_DIR
        try:
            module_dir.resolve().relative_to(CONTEXT_DIR.resolve())
        except ValueError:
            errors.append({"module": name, "reason": "invalid_path"})
            continue

        try:
            git_repo.copy_module_to(name, module_dir)

            schema_file = module_dir / ".env.schema"
            if schema_file.exists():
                schema_file.write_text(augment_schema(schema_file.read_text(), name))

            dep_result = install_module_deps(module_dir)
            if dep_result is not None and dep_result.returncode != 0:
                raise RuntimeError(
                    f"pip install failed: {dep_result.stderr.strip()}"
                )

            loaded.append(name)

        except (OSError, ValueError, FileNotFoundError, RuntimeError) as exc:
            log.error("Failed to load module '%s': %s", name, exc)
            shutil.rmtree(module_dir, ignore_errors=True)
            errors.append({
                "module": name,
                "reason": "load_failed",
                "details": str(exc),
            })

    generate_root_llms_txt(CONTEXT_DIR)

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
