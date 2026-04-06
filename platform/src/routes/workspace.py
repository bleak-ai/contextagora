import logging
import shutil

import httpx
from fastapi import APIRouter

from src.llms import generate_root_llms_txt
from src.models import WorkspaceLoadRequest
from src.server import CONTEXT_DIR, MANAGED_FILES, PRESERVED_DIRS, PRESERVED_FILES, list_modules
from src.services.deps import install_module_deps
from src.services.github import download_module, list_available_modules
from src.services.schemas import augment_schema
from src.services.secrets import get_secrets_status, load_module_secrets

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

# Cache for secrets status (only refreshed on /load or explicit refresh)
_secrets_cache: dict[str, dict[str, str | None]] = {}


@router.get("")
async def api_workspace():
    """Return loaded modules and their secrets status."""
    return {
        "modules": list_modules(CONTEXT_DIR),
        "secrets": _secrets_cache,
    }


@router.post("/load")
async def api_workspace_load(body: WorkspaceLoadRequest):
    """Clear workspace, download selected modules, validate secrets."""
    global _secrets_cache

    for p in CONTEXT_DIR.iterdir():
        if p.is_dir() and p.name not in PRESERVED_DIRS:
            shutil.rmtree(p)
        elif p.is_file() and p.name not in PRESERVED_FILES:
            p.unlink()

    available = set(list_available_modules())
    loaded = []
    errors = []
    for name in body.modules:
        if name not in available:
            errors.append(f"Module '{name}' not available")
            continue
        try:
            download_module(name, CONTEXT_DIR / name)
            loaded.append(name)
        except (httpx.HTTPError, ValueError) as exc:
            log.error("Failed to download module '%s': %s", name, exc)
            errors.append(f"Failed to download '{name}': {exc}")
            continue

        schema_file = CONTEXT_DIR / name / ".env.schema"
        if schema_file.exists():
            original = schema_file.read_text()
            schema_file.write_text(augment_schema(original, name))

    for name in loaded:
        module_dir = CONTEXT_DIR / name
        result = install_module_deps(module_dir)
        if result is not None and result.returncode != 0:
            log.warning("pip install failed for '%s':\n%s\n%s", name, result.stderr, result.stdout)
            errors.append(f"Failed to install deps for '{name}': {result.stderr.strip()}")

    for name in loaded:
        module_dir = CONTEXT_DIR / name
        if not (module_dir / ".env.schema").exists():
            continue
        result = load_module_secrets(module_dir)
        if result.returncode != 0:
            log.warning("varlock: %s has missing secrets:\n%s\n%s", name, result.stderr, result.stdout)

    generate_root_llms_txt(CONTEXT_DIR)

    _secrets_cache = get_secrets_status(CONTEXT_DIR, list_modules)

    response = {"modules": loaded, "secrets": _secrets_cache}
    if errors:
        response["errors"] = errors
    return response


@router.post("/secrets")
async def api_workspace_secrets():
    """Re-check secrets status from Infisical."""
    global _secrets_cache
    _secrets_cache = get_secrets_status(CONTEXT_DIR, list_modules)
    return {"secrets": _secrets_cache}
