import importlib
import logging
import subprocess
import sys
from pathlib import Path

log = logging.getLogger(__name__)


def install_module_deps(module_dir: Path) -> subprocess.CompletedProcess | None:
    """Install Python deps from a module's module.yaml into the platform venv.

    Reads the manifest to get the dependency list. Returns the
    CompletedProcess if there are deps to install, None otherwise.
    """
    from src.services.manifest import read_manifest

    manifest = read_manifest(module_dir)
    if not manifest.dependencies:
        return None

    return subprocess.run(
        ["uv", "pip", "install", "--python", sys.executable] + manifest.dependencies,
        capture_output=True,
        text=True,
        timeout=120,
    )


def install_all_module_deps() -> None:
    """Reinstall every module's declared deps into the platform venv.

    Called at server startup to restore the "packages are pre-installed"
    invariant: the container's writable layer is discarded on recreate,
    so runtime-installed packages vanish. Iterates every module in
    modules-repo/ (persistent via git clone), skipping ones with no deps.
    """
    from src.services import git_repo
    from src.services.manifest import read_manifest

    names = git_repo.list_modules()
    targets = [
        (n, read_manifest(git_repo.module_dir(n)).dependencies)
        for n in names
    ]
    targets = [(n, deps) for n, deps in targets if deps]

    if not targets:
        log.info("Boot-time dep install: no modules with dependencies")
        return

    log.info("Boot-time dep install: %d modules", len(targets))
    for name, deps in targets:
        result = install_module_deps(git_repo.module_dir(name))
        if result is None:
            continue
        if result.returncode != 0:
            log.warning(
                "Boot-time dep install failed for %s (%s): %s",
                name, ", ".join(deps), result.stderr.strip(),
            )
        else:
            log.info("Installed %s deps: %s", name, ", ".join(deps))

    importlib.invalidate_caches()
    log.info("Boot-time dep install complete")
