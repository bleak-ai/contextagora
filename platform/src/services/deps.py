# platform/src/services/deps.py
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
