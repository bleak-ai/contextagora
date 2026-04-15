import re

from src.config import settings

INFISICAL_PLUGIN = "@varlock/infisical-plugin@0.0.6"

_VALID_MODULE_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")


def validate_module_name(name: str) -> str:
    """Sanitize and validate a module name. Raises ValueError if invalid."""
    name = name.strip()
    if not name or not _VALID_MODULE_NAME.match(name):
        raise ValueError(f"Invalid module name: '{name}'. Use only letters, numbers, hyphens, underscores.")
    return name


def validate_module_file_path(file_path: str, managed_files: frozenset[str]) -> str:
    """Validate a file path within a module. Returns cleaned path or raises ValueError."""
    file_path = file_path.strip().strip("/")
    if not file_path:
        raise ValueError("File path cannot be empty")
    if ".." in file_path:
        raise ValueError("File path cannot contain '..'")
    if file_path in managed_files:
        raise ValueError(f"'{file_path}' is managed automatically and cannot be edited directly")
    if file_path in ("info.md", "status.md"):
        return file_path
    if file_path.startswith("docs/") and file_path.endswith(".md"):
        return file_path
    raise ValueError("Only info.md and .md files under docs/ are allowed")


def generate_global_schema(modules_with_secrets: dict[str, list[str]]) -> str:
    """Generate a single .env.schema for the workspace root.

    Args:
        modules_with_secrets: {module_name: [secret_var_names]} for each
            loaded module that has secrets.

    Returns:
        Complete schema text with one @initInfisical block per module,
        shared bootstrap var declarations, and per-var infisical() resolvers.
    """
    lines = [
        "# AUTO-GENERATED — do not edit or read this file.",
        "# Varlock uses it to resolve module secrets at runtime.",
        "# All credentials are pre-configured. Just use: varlock run -- <command>",
        f"# @plugin({INFISICAL_PLUGIN})",
    ]

    for module_name in sorted(modules_with_secrets):
        lines.extend([
            "# @initInfisical(",
            f"#   id={module_name},",
            "#   projectId=$INFISICAL_PROJECT_ID,",
            "#   environment=$INFISICAL_ENVIRONMENT,",
            "#   clientId=$INFISICAL_CLIENT_ID,",
            "#   clientSecret=$INFISICAL_CLIENT_SECRET,",
            f"#   secretPath=/{module_name},",
            f"#   siteUrl={settings.INFISICAL_SITE_URL}",
            "# )",
        ])

    lines.append("# ---")

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

    for module_name in sorted(modules_with_secrets):
        for var in modules_with_secrets[module_name]:
            lines.append("# @required @sensitive @type=string")
            lines.append(f"{var}=infisical({module_name}, {var})")

    return "\n".join(lines) + "\n"
