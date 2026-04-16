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

    Fallback only — used when json-full parsing fails entirely (e.g. varlock
    binary not found, catastrophic auth failure). The primary path extracts
    errors from the structured json-full ``errors.configItems`` dict.

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
    """Run `varlock load --format json-full --show-all` at the workspace root.

    Uses json-full + --show-all so varlock always emits complete JSON on stdout,
    even when some secrets fail to resolve. Resolved secrets get a masked preview;
    missing ones map to None.

    Raises SecretsValidationError only on total varlock failure (e.g. bad
    credentials, binary not found, unparseable output).
    """
    log.info("Fetching Infisical secrets via varlock for workspace: %s", workspace_dir)
    result = subprocess.run(
        [
            "varlock", "load",
            "--format", "json-full",
            "--show-all",
            "--path", str(workspace_dir),
        ],
        capture_output=True,
        text=True,
    )

    try:
        data = json.loads(result.stdout)
    except (json.JSONDecodeError, ValueError) as exc:
        combined = (result.stderr or "") + "\n" + (result.stdout or "")
        missing = parse_varlock_failure(combined)
        log.error("varlock produced no usable JSON for %s: %s", workspace_dir, combined.strip())
        raise SecretsValidationError(
            "workspace", missing, combined.strip()
        ) from exc

    config = data.get("config", {})
    errors = data.get("errors", {}).get("configItems", {})

    out: dict[str, str | None] = {}
    for key, item in config.items():
        if key in INFISICAL_VARS:
            continue
        value = item.get("value")
        if isinstance(value, str) and value:
            out[key] = value[:2] + "\u2592" * 5
        else:
            out[key] = None

    resolved = [k for k, v in out.items() if v is not None]
    missing = list(errors.keys())
    log.info(
        "Retrieved %d/%d secret(s) from Infisical (missing=%s): %s",
        len(resolved),
        len(out),
        missing,
        resolved,
    )
    return out


def prune_schema_for_resolved(
    secrets_status: dict[str, dict[str, str | None]],
    workspace_dir: Path,
) -> None:
    """Rewrite .env.schema excluding secrets that failed to resolve.

    This allows `varlock run` to execute even when some secrets are missing
    from Infisical. The UI still shows missing secrets correctly because the
    display is driven by module manifests, not the schema.
    """
    from src.services.schemas import generate_global_schema

    modules_with_resolved: dict[str, list[str]] = {}
    pruned: list[str] = []
    for mod, vars in secrets_status.items():
        resolved = [var for var, val in vars.items() if val is not None]
        missing = [var for var, val in vars.items() if val is None]
        if resolved:
            modules_with_resolved[mod] = resolved
        pruned.extend(missing)

    schema_path = workspace_dir / ".env.schema"
    if modules_with_resolved:
        schema_path.write_text(generate_global_schema(modules_with_resolved))
    elif schema_path.exists():
        schema_path.unlink()

    if pruned:
        log.info("Pruned .env.schema: removed %d unresolvable var(s): %s", len(pruned), pruned)


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
