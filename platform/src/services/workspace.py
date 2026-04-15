"""Workspace management: loading/unloading modules into the context directory."""

import logging
import shutil
from pathlib import Path

from src.config import settings
from src.llms import generate_root_llms_txt
from src.services import git_repo
from src.services.manifest import read_manifest
from src.services.schemas import generate_global_schema

log = logging.getLogger(__name__)

PRESERVED_DIRS = [".claude"]


def list_loaded_modules(directory: Path) -> list[str]:
    """Return sorted names of subdirectories (each subdir = one module)."""
    return sorted(
        p.name for p in directory.iterdir()
        if p.is_dir() and not p.name.startswith(".")
    )


def get_loaded_module_names() -> list[str]:
    """Return names of currently loaded modules in context/."""
    return list_loaded_modules(settings.CONTEXT_DIR)


def reload_workspace(module_names: list[str]) -> dict[str, list[str] | list[dict[str, str]]]:
    """Clear workspace and (re)link selected modules into context/.

    Each loaded module becomes a symlink context/<name> -> modules-repo/<name>.
    A global context/.env.schema is generated with Infisical config for all
    modules so varlock resolves secrets directly from the workspace root.

    Returns a dict with 'modules' (loaded names) and optionally 'errors'.
    """
    # 1. Clear context/: unlink symlinks, delete real subdirs (legacy copies),
    #    delete loose files except settings.PRESERVED_FILES.
    for p in settings.CONTEXT_DIR.iterdir():
        if p.is_symlink():
            p.unlink()
        elif p.is_dir():
            shutil.rmtree(p)
        elif p.is_file() and p.name not in settings.PRESERVED_FILES:
            p.unlink()

    # 2. Link preserved dirs (e.g. .claude) from the local clone if they exist.
    for dirname in PRESERVED_DIRS:
        if git_repo.module_exists(dirname):
            try:
                src = settings.MODULES_REPO_DIR / dirname
                (settings.CONTEXT_DIR / dirname).symlink_to(src, target_is_directory=True)
            except (OSError, ValueError) as exc:
                log.warning("Failed to link preserved dir '%s': %s", dirname, exc)

    available = set(git_repo.list_modules()) | set(PRESERVED_DIRS)
    loaded: list[str] = []
    errors: list[dict[str, str]] = []

    for name in module_names:
        if name not in available:
            errors.append({"module": name, "reason": "not_available"})
            continue

        link_path = settings.CONTEXT_DIR / name

        # Defensive: never let a bad name escape settings.CONTEXT_DIR.
        try:
            link_path.resolve().relative_to(settings.CONTEXT_DIR.resolve())
        except ValueError:
            errors.append({"module": name, "reason": "invalid_path"})
            continue

        try:
            target = settings.MODULES_REPO_DIR / name
            if not target.is_dir():
                raise FileNotFoundError(f"Module '{name}' not found in clone")

            link_path.symlink_to(target, target_is_directory=True)

            loaded.append(name)

        except (OSError, ValueError, FileNotFoundError) as exc:
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

    generate_root_llms_txt(settings.CONTEXT_DIR)

    modules_with_secrets: dict[str, list[str]] = {}
    for name in loaded:
        manifest = read_manifest(settings.CONTEXT_DIR / name)
        if manifest.secrets:
            modules_with_secrets[name] = manifest.secrets
    if modules_with_secrets:
        (settings.CONTEXT_DIR / ".env.schema").write_text(
            generate_global_schema(modules_with_secrets)
        )
    else:
        schema_file = settings.CONTEXT_DIR / ".env.schema"
        if schema_file.exists():
            schema_file.unlink()

    response: dict[str, list[str] | list[dict[str, str]]] = {"modules": loaded}
    if errors:
        response["errors"] = errors
    return response
