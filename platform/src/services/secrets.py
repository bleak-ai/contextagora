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
    re.compile(r'Secret "([A-Z_][A-Z0-9_]*)" at path '),
]

# Matches ANSI CSI escape sequences (color codes etc.) that varlock emits
# even in non-TTY mode. Stripped before regex matching so the var-name
# patterns above don't have to deal with `\x1b[31m` wrappers.
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


class SecretsValidationError(Exception):
    def __init__(self, module: str, missing: list[str], raw: str):
        self.module = module
        self.missing = missing
        self.raw = raw
        super().__init__(f"{module}: missing {missing or '<unknown>'}")


def parse_varlock_failure(stderr: str) -> list[str]:
    """Extract missing variable names from varlock's human-readable error output.

    Tries multiple patterns since varlock's output varies with TTY/non-TTY.
    Strips ANSI color codes first because varlock wraps var names in
    `\\x1b[31m...\\x1b[39m` which breaks `[A-Z_]+` matching.
    """
    cleaned = _ANSI_RE.sub("", stderr)
    found: list[str] = []
    for pat in _MISSING_VAR_PATTERNS:
        for m in pat.findall(cleaned):
            if m not in found:
                found.append(m)
    return found


def load_and_mask_secrets(workspace_dir: Path) -> dict[str, str | None]:
    """Run `varlock load --format json` at the workspace root.

    Returns {VAR: masked_preview} for all non-bootstrap vars.
    Raises SecretsValidationError on any varlock failure.
    """
    log.info("Fetching Infisical secrets via varlock for workspace: %s", workspace_dir)
    result = subprocess.run(
        ["varlock", "load", "--format", "json", "--path", str(workspace_dir)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        combined = (result.stderr or "") + "\n" + (result.stdout or "")
        missing = parse_varlock_failure(combined)
        log.error(
            "varlock failed for workspace %s (missing=%s): %s",
            workspace_dir,
            missing,
            combined.strip(),
        )
        raise SecretsValidationError("workspace", missing, combined.strip())

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        log.error("varlock returned invalid JSON for workspace %s: %s", workspace_dir, exc)
        raise SecretsValidationError(
            "workspace", [], f"varlock returned invalid JSON: {exc}\n{result.stdout}"
        ) from exc

    secret_keys = [k for k in data if k not in INFISICAL_VARS]
    log.info(
        "Successfully retrieved %d secret(s) from Infisical: %s",
        len(secret_keys),
        secret_keys,
    )
    return {
        k: ((v[:2] + "\u2592" * 5) if isinstance(v, str) and v else None)
        for k, v in data.items()
        if k not in INFISICAL_VARS
    }


async def get_secrets_status(
    directory: Path, list_modules_fn
) -> dict[str, dict[str, str | None]]:
    """Resolve secrets via the global schema and split results by module.

    The global schema at directory/.env.schema resolves all module secrets
    in one varlock call. Results are split back to per-module dicts by
    reading each module's manifest for its declared secret names.
    """
    if not (directory / ".env.schema").exists():
        return {}

    from src.services.manifest import read_manifest

    var_to_module: dict[str, str] = {}
    modules = list_modules_fn(directory)
    modules_with_secrets: list[str] = []
    for name in modules:
        manifest = read_manifest(directory / name)
        if manifest.secrets:
            modules_with_secrets.append(name)
            for var in manifest.secrets:
                var_to_module[var] = name

    try:
        previews = await asyncio.to_thread(load_and_mask_secrets, directory)
    except SecretsValidationError as e:
        log.warning("global varlock failed (missing=%s)\n%s", e.missing, e.raw)
        result: dict[str, dict[str, str | None]] = {m: {} for m in modules_with_secrets}
        for var, mod in var_to_module.items():
            result[mod][var] = None
        return result

    result = {m: {} for m in modules_with_secrets}
    for var, value in previews.items():
        mod = var_to_module.get(var)
        if mod and mod in result:
            result[mod][var] = value
    for var, mod in var_to_module.items():
        if var not in previews and mod in result:
            result[mod][var] = None
    return result
