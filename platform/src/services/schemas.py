import os
import re

INFISICAL_SITE_URL = os.environ.get("INFISICAL_SITE_URL", "https://app.infisical.com")
VARLOCK_INFISICAL_PLUGIN = "@varlock/infisical-plugin@0.0.6"

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
    """Generate a .env.schema file from variable names."""
    lines = ["# ---"]
    for var in var_names:
        lines.append("# @required @sensitive @type=string")
        lines.append(f"{var}=")
    return "\n".join(lines) + "\n"


def parse_env_schema(schema_text: str) -> list[str]:
    """Extract variable names from a .env.schema file."""
    return [
        line.split("=", 1)[0]
        for line in schema_text.splitlines()
        if line.strip() and not line.strip().startswith("#") and "=" in line
    ]


def augment_schema(schema_text: str, module_name: str) -> str:
    """Wrap a module's .env.schema with Infisical plugin config."""
    header_lines = []
    separator_seen = False
    body_lines = []

    for line in schema_text.splitlines():
        if not separator_seen:
            if line.strip() == "# ---":
                separator_seen = True
            header_lines.append(line)
        else:
            body_lines.append(line)

    if not separator_seen:
        body_lines = header_lines
        header_lines = ["# ---"]

    augmented_body = []
    for line in body_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key, value = stripped.split("=", 1)
            if not value:
                augmented_body.append(f"{key}=infisical()")
            else:
                augmented_body.append(line)
        else:
            augmented_body.append(line)

    infisical_header = f"""# @import(../../.env.schema)
# @plugin({VARLOCK_INFISICAL_PLUGIN})
# @initInfisical(
#   projectId=$INFISICAL_PROJECT_ID,
#   environment=$INFISICAL_ENVIRONMENT,
#   clientId=$INFISICAL_CLIENT_ID,
#   clientSecret=$INFISICAL_CLIENT_SECRET,
#   secretPath=/{module_name},
#   siteUrl={INFISICAL_SITE_URL}
# )"""

    parts = [infisical_header]
    parts.extend(header_lines)
    parts.extend(augmented_body)
    return "\n".join(parts) + "\n"
