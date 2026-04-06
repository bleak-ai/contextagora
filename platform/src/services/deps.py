import logging
import subprocess
import sys
from pathlib import Path

log = logging.getLogger(__name__)


def install_module_deps(module_dir: Path) -> subprocess.CompletedProcess | None:
    """Install Python deps from a module's requirements.txt into the platform venv.

    Returns the CompletedProcess if requirements.txt exists, None otherwise.
    """
    req_file = module_dir / "requirements.txt"
    if not req_file.exists():
        return None

    return subprocess.run(
        ["uv", "pip", "install", "--python", sys.executable, "-r", str(req_file)],
        capture_output=True,
        text=True,
        timeout=120,
    )
