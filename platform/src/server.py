import base64
import logging
import os
import shlex
import shutil
import subprocess
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

log = logging.getLogger(__name__)

# --- Paths ---
BASE_DIR = Path(__file__).resolve().parent
# Local modules directory (fallback when GH_OWNER/GH_REPO are not set)
MODULES_DIR = Path(os.environ.get("MODULES_DIR", BASE_DIR.parent.parent / "fixtures"))

# --- GitHub-based module loading ---
GH_OWNER = os.environ.get("GH_OWNER")  # e.g. "bleak-ai"
GH_REPO = os.environ.get("GH_REPO")  # e.g. "context-loader-module-demo"
GH_TOKEN = os.environ.get("GH_TOKEN")

# Cache for remote module list (avoids hitting GitHub API on every page load)
_modules_cache: list[str] = []
_modules_cache_ts: float = 0
_CACHE_TTL = 60  # seconds


def _gh_headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if GH_TOKEN:
        headers["Authorization"] = f"Bearer {GH_TOKEN}"
    return headers


def _gh_api(path: str) -> list | dict:
    """Call the GitHub API and return parsed JSON."""
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.get(url, headers=_gh_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def list_remote_modules(*, bypass_cache: bool = False) -> list[str]:
    """List module names (top-level directories) from the GitHub repo."""
    global _modules_cache, _modules_cache_ts
    if not GH_OWNER:
        return []
    if not bypass_cache and _modules_cache and (time.monotonic() - _modules_cache_ts) < _CACHE_TTL:
        return _modules_cache
    items = _gh_api("")
    _modules_cache = sorted(item["name"] for item in items if item["type"] == "dir")
    _modules_cache_ts = time.monotonic()
    return _modules_cache


_MAX_DOWNLOAD_DEPTH = 10


def download_module(name: str, dest: Path, *, _depth: int = 0) -> None:
    """Download a module directory from GitHub into dest."""
    if _depth > _MAX_DOWNLOAD_DEPTH:
        raise ValueError(f"Module directory too deeply nested (>{_MAX_DOWNLOAD_DEPTH} levels)")
    dest.mkdir(parents=True, exist_ok=True)
    items = _gh_api(name)
    for item in items:
        target = dest / item["name"]
        if item["type"] == "file":
            # Use the API content endpoint (not download_url) to avoid leaking tokens
            content_resp = _gh_api(f"{name}/{item['name']}")
            target.write_bytes(base64.b64decode(content_resp["content"]))
        elif item["type"] == "dir":
            download_module(f"{name}/{item['name']}", target, _depth=_depth + 1)

# Where selected modules get copied to (the agent's workspace)
CONTEXT_DIR = BASE_DIR / "context"
CONTEXT_DIR.mkdir(exist_ok=True)

# Files in context/ that should survive when modules are reloaded
PRESERVED_FILES = {"CLAUDE.md"}

# Infisical site URL (EU vs US)
INFISICAL_SITE_URL = os.environ.get("INFISICAL_SITE_URL", "https://app.infisical.com")

# Varlock Infisical plugin version
VARLOCK_INFISICAL_PLUGIN = "@varlock/infisical-plugin@0.0.6"


def augment_schema(schema_text: str, module_name: str) -> str:
    """Wrap a module's .env.schema with Infisical plugin config.

    Modules declare only what secrets they need. This function injects the
    platform-level Infisical connection so varlock can fetch the values.
    Only empty variable declarations (KEY=) are rewritten to use infisical();
    variables with existing values (KEY=value) are left as-is.
    """
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

    # If no separator found, treat all non-comment lines as body
    if not separator_seen:
        body_lines = header_lines
        header_lines = ["# ---"]

    # Rewrite empty variable declarations: KEY= → KEY=infisical()
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


# --- App setup ---
app = FastAPI()
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def list_modules(directory: Path) -> list[str]:
    """Return sorted names of subdirectories (each subdir = one module)."""
    return sorted(p.name for p in directory.iterdir() if p.is_dir())


INFISICAL_VARS = {"INFISICAL_PROJECT_ID", "INFISICAL_ENVIRONMENT", "INFISICAL_CLIENT_ID", "INFISICAL_CLIENT_SECRET"}


def get_secrets_status(directory: Path) -> dict[str, dict[str, str | None]]:
    """Return per-module secret availability with preview using varlock printenv."""
    status = {}
    for mod in list_modules(directory):
        schema_file = directory / mod / ".env.schema"
        if not schema_file.exists():
            continue
        # Parse schema for declared var names (exclude platform-level Infisical vars)
        var_names = []
        for line in schema_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                name = line.split("=")[0]
                if name not in INFISICAL_VARS:
                    var_names.append(name)
        # Check each var with varlock printenv
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
                status[mod][var] = value[:2] + "▒" * 5
            else:
                status[mod][var] = None
    return status


# --- Routes ---


def list_available_modules(*, bypass_cache: bool = False) -> list[str]:
    """List available modules from GitHub (if configured) or local directory."""
    if GH_OWNER:
        try:
            return list_remote_modules(bypass_cache=bypass_cache)
        except httpx.HTTPError as exc:
            log.error("Failed to list modules from GitHub: %s", exc)
            return _modules_cache if _modules_cache else []
    return list_modules(MODULES_DIR)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Render the module picker UI."""
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "modules": list_available_modules(),
            "loaded": list_modules(CONTEXT_DIR),
            "secrets": get_secrets_status(CONTEXT_DIR),
        },
    )


@app.post("/load")
async def load(modules: list[str] = Form(default=[])):
    """Clear context/, then copy selected modules from the registry into it."""
    # Remove previously loaded modules
    for p in CONTEXT_DIR.iterdir():
        if p.is_dir():
            shutil.rmtree(p)
        elif p.name not in PRESERVED_FILES:
            p.unlink()

    available = set(list_available_modules())
    for name in modules:
        if name not in available:
            continue
        try:
            if GH_OWNER:
                download_module(name, CONTEXT_DIR / name)
            else:
                shutil.copytree(MODULES_DIR / name, CONTEXT_DIR / name)
        except (httpx.HTTPError, ValueError) as exc:
            log.error("Failed to download module '%s': %s", name, exc)
            continue

        # Augment .env.schema with Infisical config if it exists
        schema_file = CONTEXT_DIR / name / ".env.schema"
        if schema_file.exists():
            original = schema_file.read_text()
            schema_file.write_text(augment_schema(original, name))

    # Validate secrets for each loaded module
    for name in modules:
        module_dir = CONTEXT_DIR / name
        if not (module_dir / ".env.schema").exists():
            continue
        result = subprocess.run(
            ["varlock", "load", "--format", "json", "--path", str(module_dir)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            log.warning("varlock: %s has missing secrets:\n%s\n%s", name, result.stderr, result.stdout)
        else:
            log.info("varlock: %s secrets validated", name)

    return RedirectResponse(url="/", status_code=303)


@app.get("/api/context")
async def api_context():
    """Return the list of currently loaded modules as JSON."""
    return {"loaded_modules": list_modules(CONTEXT_DIR)}


@app.post("/refresh-modules")
async def refresh_modules():
    """Force-refresh the module list from GitHub (bypasses cache)."""
    return {"status": "ok", "modules": list_available_modules(bypass_cache=True)}


@app.post("/run")
async def run(module: str = Form(), cmd: str = Form()):
    """Run a command with secrets injected via varlock."""
    module_dir = CONTEXT_DIR / module
    if not module_dir.is_dir() or module not in list_modules(CONTEXT_DIR):
        return JSONResponse({"error": f"module '{module}' not loaded"}, status_code=404)

    result = subprocess.run(
        ["varlock", "run", "--path", str(module_dir), "--", *shlex.split(cmd)],
        capture_output=True,
        text=True,
        cwd=str(module_dir),
        timeout=30,
    )
    return JSONResponse({
        "exit_code": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    })


# Serve context/ files so they can be browsed in the browser
app.mount("/files", StaticFiles(directory=str(CONTEXT_DIR)), name="files")


# --- Entry point ---


def main():
    import uvicorn

    uvicorn.run("src.server:app", host="0.0.0.0", port=8080, reload=True)


if __name__ == "__main__":
    main()
