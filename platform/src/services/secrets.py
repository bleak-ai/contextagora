import asyncio
import json
import logging
import re
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)

INFISICAL_VARS = {
    "INFISICAL_PROJECT_ID",
    "INFISICAL_ENVIRONMENT",
    "INFISICAL_CLIENT_ID",
    "INFISICAL_CLIENT_SECRET",
}

_MISSING_VAR_PATTERNS = [
    re.compile(r"⛔\s+([A-Z_][A-Z0-9_]*)"),
    re.compile(r'Failed to fetch secret "([A-Z_][A-Z0-9_]*)"'),
    re.compile(r'secret "([A-Z_][A-Z0-9_]*)" has no value', re.IGNORECASE),
]


class SecretsValidationError(Exception):
    """Raised when `varlock load` fails for a module."""

    def __init__(self, module: str, missing: list[str], raw: str):
        self.module = module
        self.missing = missing
        self.raw = raw
        super().__init__(f"{module}: missing {missing or '<unknown>'}")


def load_module_secrets(module_dir: Path) -> subprocess.CompletedProcess:
    """Run `varlock load --format json` for a module dir."""
    return subprocess.run(
        ["varlock", "load", "--format", "json", "--path", str(module_dir)],
        capture_output=True,
        text=True,
    )


def parse_varlock_failure(stderr: str) -> list[str]:
    """Extract missing variable names from varlock's human-readable error output.

    Tries multiple patterns since varlock's output varies with TTY/non-TTY.
    """
    found: list[str] = []
    for pat in _MISSING_VAR_PATTERNS:
        for m in pat.findall(stderr):
            if m not in found:
                found.append(m)
    return found


def load_and_mask_module_secrets(module_dir: Path) -> dict[str, str | None]:
    """Run varlock once for a module and return {VAR: masked_preview}.

    Raises SecretsValidationError on any varlock failure. The caller is
    responsible for cleanup (e.g. removing the module dir).
    """
    result = load_module_secrets(module_dir)
    if result.returncode != 0:
        combined = (result.stderr or "") + "\n" + (result.stdout or "")
        missing = parse_varlock_failure(combined)
        raise SecretsValidationError(module_dir.name, missing, combined.strip())

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise SecretsValidationError(
            module_dir.name, [], f"varlock returned invalid JSON: {exc}\n{result.stdout}"
        ) from exc

    return {
        k: ((v[:2] + "\u2592" * 5) if isinstance(v, str) and v else None)
        for k, v in data.items()
        if k not in INFISICAL_VARS
    }


async def get_secrets_status(
    directory: Path, list_modules_fn
) -> dict[str, dict[str, str | None]]:
    """Refresh masked secret previews for every module currently on disk.

    Modules whose `varlock load` fails are reported with their missing keys
    set to None, but are NOT removed — that's the load endpoint's job.
    """
    modules = [
        m
        for m in list_modules_fn(directory)
        if (directory / m / ".env.schema").exists()
    ]

    async def safe(name: str) -> tuple[str, dict[str, str | None]]:
        try:
            previews = await asyncio.to_thread(
                load_and_mask_module_secrets, directory / name
            )
            return name, previews
        except SecretsValidationError as e:
            log.warning("refresh: %s still invalid (missing=%s)", name, e.missing)
            return name, {k: None for k in e.missing}

    results = await asyncio.gather(*(safe(m) for m in modules))
    return dict(results)
