import logging
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)

INFISICAL_VARS = {"INFISICAL_PROJECT_ID", "INFISICAL_ENVIRONMENT", "INFISICAL_CLIENT_ID", "INFISICAL_CLIENT_SECRET"}


def get_secrets_status(directory: Path, list_modules_fn) -> dict[str, dict[str, str | None]]:
    """Return per-module secret availability with preview using varlock printenv.

    list_modules_fn: callable that returns sorted module names from directory.
    """
    status = {}
    for mod in list_modules_fn(directory):
        schema_file = directory / mod / ".env.schema"
        if not schema_file.exists():
            continue
        var_names = []
        for line in schema_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                name = line.split("=")[0]
                if name not in INFISICAL_VARS:
                    var_names.append(name)
        mod_path = str(directory / mod)
        status[mod] = {}
        for var in var_names:
            result = subprocess.run(
                ["varlock", "printenv", "--path", mod_path, var],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0 and result.stdout.strip():
                value = result.stdout.strip()
                status[mod][var] = value[:2] + "\u2592" * 5
            else:
                status[mod][var] = None
    return status


def load_module_secrets(module_dir: Path) -> subprocess.CompletedProcess:
    """Run varlock load for a module directory. Returns the CompletedProcess."""
    return subprocess.run(
        ["varlock", "load", "--format", "json", "--path", str(module_dir)],
        capture_output=True,
        text=True,
    )
