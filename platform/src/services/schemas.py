import os
import re
from pathlib import Path

INFISICAL_PLUGIN = "@varlock/infisical-plugin@0.0.6"
INFISICAL_SITE_URL = os.environ.get("INFISICAL_SITE_URL", "https://app.infisical.com")

INFISICAL_BOOTSTRAP_VARS = {
    "INFISICAL_PROJECT_ID",
    "INFISICAL_ENVIRONMENT",
    "INFISICAL_CLIENT_ID",
    "INFISICAL_CLIENT_SECRET",
}

_VALID_MODULE_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")


def validate_module_name(name: str) -> str:
    """Sanitize and validate a module name. Raises ValueError if invalid."""
    name = name.strip()
    if not name or not _VALID_MODULE_NAME.match(name):
        raise ValueError(f"Invalid module name: '{name}'. Use only letters, numbers, hyphens, underscores.")
    return name


def validate_module_file_path(file_path: str, managed_files: set[str]) -> str:
    """Validate a file path within a module. Returns cleaned path or raises ValueError."""
    file_path = file_path.strip().strip("/")
    if not file_path:
        raise ValueError("File path cannot be empty")
    if ".." in file_path:
        raise ValueError("File path cannot contain '..'")
    if file_path in managed_files:
        raise ValueError(f"'{file_path}' is managed automatically and cannot be edited directly")
    if file_path == "info.md":
        return file_path
    if file_path.startswith("docs/") and file_path.endswith(".md"):
        return file_path
    raise ValueError("Only info.md and .md files under docs/ are allowed")


def generate_env_schema(var_names: list[str]) -> str:
    """Generate a dumb .env.schema for a single module (stored in git)."""
    lines = ["# ---"]
    for var in var_names:
        lines.append("# @required @sensitive @type=string")
        lines.append(f"{var}=")
    return "\n".join(lines) + "\n"


def parse_env_schema(schema_text: str) -> list[str]:
    """Extract variable names from a .env.schema, filtering out bootstrap vars."""
    return [
        line.split("=", 1)[0]
        for line in schema_text.splitlines()
        if line.strip()
        and not line.strip().startswith("#")
        and "=" in line
        and line.split("=", 1)[0] not in INFISICAL_BOOTSTRAP_VARS
    ]


def _extract_module_vars(schema_text: str) -> list[str]:
    """Extract module-specific variable names from a dumb .env.schema."""
    return [
        line.split("=", 1)[0]
        for line in schema_text.splitlines()
        if line.strip()
        and not line.strip().startswith("#")
        and "=" in line
        and line.split("=", 1)[0] not in INFISICAL_BOOTSTRAP_VARS
    ]


def generate_global_schema(modules_with_schemas: dict[str, str]) -> str:
    """Generate a single .env.schema for the workspace root.

    Args:
        modules_with_schemas: {module_name: raw_schema_text} for each
            loaded module that has a .env.schema.

    Returns:
        Complete schema text with one @initInfisical block per module,
        shared bootstrap var declarations, and per-var infisical() resolvers.
    """
    lines = [f"# @plugin({INFISICAL_PLUGIN})"]

    # One @initInfisical block per module
    for module_name in sorted(modules_with_schemas):
        lines.extend([
            "# @initInfisical(",
            f"#   id={module_name},",
            "#   projectId=$INFISICAL_PROJECT_ID,",
            "#   environment=$INFISICAL_ENVIRONMENT,",
            "#   clientId=$INFISICAL_CLIENT_ID,",
            "#   clientSecret=$INFISICAL_CLIENT_SECRET,",
            f"#   secretPath=/{module_name},",
            f"#   siteUrl={INFISICAL_SITE_URL}",
            "# )",
        ])

    lines.append("# ---")

    # Bootstrap vars (shared across all modules)
    lines.extend([
        "# @type=string @required",
        "INFISICAL_PROJECT_ID=",
        "# @type=string @required",
        "INFISICAL_ENVIRONMENT=",
        "# @type=infisicalClientId @required",
        "INFISICAL_CLIENT_ID=",
        "# @type=infisicalClientSecret @sensitive @required",
        "INFISICAL_CLIENT_SECRET=",
    ])

    # Module-specific vars
    for module_name in sorted(modules_with_schemas):
        var_names = _extract_module_vars(modules_with_schemas[module_name])
        for var in var_names:
            lines.append("# @required @sensitive @type=string")
            lines.append(f"{var}=infisical({module_name}, {var})")

    return "\n".join(lines) + "\n"
