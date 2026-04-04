import base64
import json
import logging
import os
import shutil
import subprocess
import time
from importlib.metadata import version as pkg_version
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles

log = logging.getLogger(__name__)

# --- Paths ---
BASE_DIR = Path(__file__).resolve().parent
# --- GitHub-based module loading ---
GH_OWNER = os.environ.get("GH_OWNER")  # e.g. "bleak-ai"
GH_REPO = os.environ.get("GH_REPO")  # e.g. "context-loader-module-demo"
GH_TOKEN = os.environ.get("GH_TOKEN")

# Cache for remote module list (avoids hitting GitHub API on every page load)
_modules_cache: list[str] = []
_modules_cache_ts: float = 0
_CACHE_TTL = 60  # seconds

# Cache for secrets status (only refreshed on /load or explicit refresh)
_secrets_cache: dict[str, dict[str, str | None]] = {}


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


def _gh_create_file(path: str, content: str, message: str) -> dict:
    """Create a file in the GitHub repo."""
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.put(url, headers=_gh_headers(), json={
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _gh_update_file(path: str, content: str, sha: str, message: str) -> dict:
    """Update an existing file in the GitHub repo."""
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.put(url, headers=_gh_headers(), json={
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
        "sha": sha,
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _gh_delete_file(path: str, sha: str, message: str) -> dict:
    """Delete a file from the GitHub repo."""
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.request("DELETE", url, headers=_gh_headers(), json={
        "message": message,
        "sha": sha,
    }, timeout=15)
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


def _generate_env_schema(var_names: list[str]) -> str:
    """Generate a .env.schema file from variable names."""
    lines = ["# ---"]
    for var in var_names:
        lines.append(f"# @required @sensitive @type=string")
        lines.append(f"{var}=")
    return "\n".join(lines) + "\n"


def _parse_env_schema(schema_text: str) -> list[str]:
    """Extract variable names from a .env.schema file."""
    return [
        line.split("=", 1)[0]
        for line in schema_text.splitlines()
        if line.strip() and not line.strip().startswith("#") and "=" in line
    ]


import re

_VALID_MODULE_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")


def _validate_module_name(name: str) -> str:
    """Sanitize and validate a module name. Raises ValueError if invalid."""
    name = name.strip()
    if not name or not _VALID_MODULE_NAME.match(name):
        raise ValueError(f"Invalid module name: '{name}'. Use only letters, numbers, hyphens, underscores.")
    return name


class FileContentRequest(BaseModel):
    content: str


class CreateModuleRequest(BaseModel):
    name: str
    content: str
    summary: str = ""
    secrets: list[str] = []


class UpdateModuleRequest(BaseModel):
    content: str
    summary: str = ""
    secrets: list[str] = []


class ModuleDetail(BaseModel):
    name: str
    content: str
    summary: str
    secrets: list[str]


class ChatRequest(BaseModel):
    prompt: str


class WorkspaceLoadRequest(BaseModel):
    modules: list[str]


_MANAGED_FILES = {"llms.txt", ".env.schema"}


def _validate_module_file_path(file_path: str) -> str:
    """Validate a file path within a module. Returns cleaned path or raises ValueError."""
    file_path = file_path.strip().strip("/")
    if not file_path:
        raise ValueError("File path cannot be empty")
    if ".." in file_path:
        raise ValueError("File path cannot contain '..'")
    if file_path in _MANAGED_FILES:
        raise ValueError(f"'{file_path}' is managed automatically and cannot be edited directly")
    if file_path == "info.md":
        return file_path
    if file_path.startswith("docs/") and file_path.endswith(".md"):
        return file_path
    raise ValueError("Only info.md and .md files under docs/ are allowed")


def _list_module_files(name: str) -> list[dict]:
    """List all content files in a module from GitHub (excludes managed files)."""
    result = []
    items = _gh_api(name)
    for item in items:
        if item["type"] == "file" and item["name"] not in _MANAGED_FILES:
            result.append({"name": item["name"], "path": item["name"]})
        elif item["type"] == "dir" and item["name"] == "docs":
            try:
                doc_items = _gh_api(f"{name}/docs")
                for doc in doc_items:
                    if doc["type"] == "file" and doc["name"].endswith(".md"):
                        result.append({"name": doc["name"], "path": f"docs/{doc['name']}"})
            except httpx.HTTPStatusError:
                pass
    return result


def _list_all_module_files(name: str) -> list[str]:
    """List all content file paths in a module (for llms.txt generation)."""
    return [f["path"] for f in _list_module_files(name)]


def _regenerate_module_llms_txt(name: str, summary: str | None = None) -> None:
    """Regenerate a module's llms.txt from its current files and summary."""
    if summary is None:
        try:
            llms_data = _gh_api(f"{name}/llms.txt")
            llms_text = base64.b64decode(llms_data["content"]).decode()
            summary = _extract_module_summary(llms_text)
        except httpx.HTTPStatusError:
            summary = ""

    files = _list_all_module_files(name)
    llms_txt = _generate_module_llms_txt(name, summary, files)

    try:
        llms_data = _gh_api(f"{name}/llms.txt")
        _gh_update_file(f"{name}/llms.txt", llms_txt, llms_data["sha"], f"Update llms.txt for {name}")
    except httpx.HTTPStatusError:
        _gh_create_file(f"{name}/llms.txt", llms_txt, f"Add llms.txt for {name}")


def _generate_module_llms_txt(name: str, summary: str, files: list[str]) -> str:
    """Generate a per-module llms.txt from the module name, summary, and file list."""
    lines = [f"# {name}"]
    if summary:
        lines.append(f"> {summary}")
    lines.append("")
    for f in files:
        lines.append(f"- [{f}]({f})")
    return "\n".join(lines) + "\n"


def _extract_module_summary(llms_txt_content: str) -> str:
    """Extract the > blockquote description from a module's llms.txt."""
    for line in llms_txt_content.splitlines():
        if line.startswith("> "):
            return line[2:].strip()
    return ""


def _generate_root_llms_txt(context_dir: Path) -> None:
    """Generate root llms.txt from loaded modules' llms.txt files."""
    entries = []
    for mod_dir in sorted(context_dir.iterdir()):
        if not mod_dir.is_dir():
            continue
        llms_file = mod_dir / "llms.txt"
        if llms_file.exists():
            summary = _extract_module_summary(llms_file.read_text())
        else:
            summary = "Context module"
        entries.append(f"- [{mod_dir.name}]({mod_dir.name}/llms.txt): {summary}")

    lines = ["# Loaded Context Modules", ""]
    lines.extend(entries)
    (context_dir / "llms.txt").write_text("\n".join(lines) + "\n")


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

APP_VERSION = pkg_version("context-loader-poc")


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
    """List available modules from GitHub."""
    if not GH_OWNER:
        return []
    try:
        return list_remote_modules(bypass_cache=bypass_cache)
    except httpx.HTTPError as exc:
        log.error("Failed to list modules from GitHub: %s", exc)
        return _modules_cache if _modules_cache else []


@app.get("/api/workspace")
async def api_workspace():
    """Return loaded modules and their secrets status."""
    return {
        "modules": list_modules(CONTEXT_DIR),
        "secrets": _secrets_cache,
    }


@app.post("/api/workspace/load")
async def api_workspace_load(body: WorkspaceLoadRequest):
    """Clear workspace, download selected modules, validate secrets."""
    for p in CONTEXT_DIR.iterdir():
        if p.is_dir():
            shutil.rmtree(p)
        elif p.name not in PRESERVED_FILES:
            p.unlink()

    available = set(list_available_modules())
    loaded = []
    errors = []
    for name in body.modules:
        if name not in available:
            errors.append(f"Module '{name}' not available")
            continue
        try:
            download_module(name, CONTEXT_DIR / name)
            loaded.append(name)
        except (httpx.HTTPError, ValueError) as exc:
            log.error("Failed to download module '%s': %s", name, exc)
            errors.append(f"Failed to download '{name}': {exc}")
            continue

        schema_file = CONTEXT_DIR / name / ".env.schema"
        if schema_file.exists():
            original = schema_file.read_text()
            schema_file.write_text(augment_schema(original, name))

    for name in loaded:
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

    _generate_root_llms_txt(CONTEXT_DIR)

    global _secrets_cache
    _secrets_cache = get_secrets_status(CONTEXT_DIR)

    response = {"modules": loaded, "secrets": _secrets_cache}
    if errors:
        response["errors"] = errors
    return response


@app.post("/api/workspace/secrets")
async def api_workspace_secrets():
    """Re-check secrets status from Infisical."""
    global _secrets_cache
    _secrets_cache = get_secrets_status(CONTEXT_DIR)
    return {"secrets": _secrets_cache}


@app.get("/api/health")
@app.get("/health")
async def health():
    """Health check endpoint for Docker and monitoring."""
    return {"status": "ok", "version": APP_VERSION}


@app.post("/api/modules/refresh")
async def api_refresh_modules():
    """Force-refresh the module list from GitHub (bypasses cache)."""
    return {"modules": list_available_modules(bypass_cache=True)}


@app.post("/api/chat")
async def api_chat(body: ChatRequest):
    """Run claude with stream-json output, converting NDJSON to SSE events."""

    def generate():
        env = {
            **os.environ,
            "DISABLE_AUTOUPDATER": "1",
            "CLAUDE_CODE_ENABLE_TELEMETRY": "0",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
            "CLAUDE_CODE_ATTRIBUTION_HEADER": "0",
        }
        proc = subprocess.Popen(
            [
                "claude", "-p", body.prompt,
                "--continue",
                "--verbose",
                "--output-format", "stream-json",
                "--allowedTools", "Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "Glob(*)", "Grep(*)",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(CONTEXT_DIR),
            env=env,
            text=True,
        )
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue

            event_type = event.get("type", "")

            if event_type == "assistant" and "message" in event:
                continue
            elif event_type == "content_block_start":
                block = event.get("content_block", {})
                if block.get("type") == "thinking":
                    yield f"event: thinking\ndata: {json.dumps({'text': block.get('thinking', '')})}\n\n"
                elif block.get("type") == "tool_use":
                    yield f"event: tool_use\ndata: {json.dumps({'tool': block.get('name', ''), 'input': block.get('input', {})})}\n\n"
            elif event_type == "content_block_delta":
                delta = event.get("delta", {})
                if delta.get("type") == "thinking_delta":
                    yield f"event: thinking\ndata: {json.dumps({'text': delta.get('thinking', '')})}\n\n"
                elif delta.get("type") == "text_delta":
                    yield f"event: text\ndata: {json.dumps({'text': delta.get('text', '')})}\n\n"
                elif delta.get("type") == "input_json_delta":
                    yield f"event: tool_input\ndata: {json.dumps({'partial_json': delta.get('partial_json', '')})}\n\n"
            elif event_type == "result":
                text = event.get("result", "")
                if text:
                    yield f"event: text\ndata: {json.dumps({'text': text})}\n\n"
                yield f"event: done\ndata: {{}}\n\n"

        proc.wait()
        if proc.returncode != 0:
            stderr = proc.stderr.read()
            if stderr:
                yield f"event: error\ndata: {json.dumps({'message': stderr.strip()})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# --- Modules JSON API (CRUD via GitHub API) ---


def _gh_delete_dir(path: str) -> None:
    """Recursively delete all files in a GitHub directory."""
    items = _gh_api(path)
    for item in items:
        if item["type"] == "file":
            _gh_delete_file(item["path"], item["sha"], f"Delete {item['path']}")
        elif item["type"] == "dir":
            _gh_delete_dir(item["path"])


@app.get("/api/modules")
async def api_list_modules():
    """List available modules from GitHub."""
    return {"modules": list_available_modules()}


@app.get("/api/modules/{name}")
async def api_get_module(name: str):
    """Get module detail: info.md content, summary, and secrets schema."""
    try:
        file_data = _gh_api(f"{name}/info.md")
        content = base64.b64decode(file_data["content"]).decode()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)
        raise

    summary = ""
    try:
        llms_data = _gh_api(f"{name}/llms.txt")
        llms_text = base64.b64decode(llms_data["content"]).decode()
        summary = _extract_module_summary(llms_text)
    except httpx.HTTPStatusError:
        pass

    secrets: list[str] = []
    try:
        schema_data = _gh_api(f"{name}/.env.schema")
        schema_text = base64.b64decode(schema_data["content"]).decode()
        secrets = _parse_env_schema(schema_text)
    except httpx.HTTPStatusError:
        pass

    return {"name": name, "content": content, "summary": summary, "secrets": secrets}


@app.post("/api/modules", status_code=201)
async def api_create_module(body: CreateModuleRequest):
    """Create a new module with info.md, llms.txt, and optional .env.schema."""
    name = _validate_module_name(body.name)
    try:
        _gh_create_file(f"{name}/info.md", body.content, f"Create module {name}")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 422:
            return JSONResponse({"error": f"Module '{name}' already exists"}, status_code=409)
        raise

    files = ["info.md"]

    if body.secrets:
        schema = _generate_env_schema(body.secrets)
        _gh_create_file(f"{name}/.env.schema", schema, f"Add secrets schema for {name}")
        files.append(".env.schema")

    llms_txt = _generate_module_llms_txt(name, body.summary, files)
    _gh_create_file(f"{name}/llms.txt", llms_txt, f"Add llms.txt for {name}")

    global _modules_cache_ts
    _modules_cache_ts = 0
    return {"name": name}


@app.put("/api/modules/{name}")
async def api_update_module(name: str, body: UpdateModuleRequest):
    """Update a module's info.md, llms.txt, and .env.schema. Fetches SHAs internally."""
    try:
        file_data = _gh_api(f"{name}/info.md")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)
        raise
    _gh_update_file(f"{name}/info.md", body.content, file_data["sha"], f"Update {name}/info.md")

    schema_sha = ""
    try:
        schema_data = _gh_api(f"{name}/.env.schema")
        schema_sha = schema_data["sha"]
    except httpx.HTTPStatusError:
        pass

    if body.secrets:
        schema = _generate_env_schema(body.secrets)
        if schema_sha:
            _gh_update_file(f"{name}/.env.schema", schema, schema_sha, f"Update secrets schema for {name}")
        else:
            _gh_create_file(f"{name}/.env.schema", schema, f"Add secrets schema for {name}")
    elif schema_sha:
        _gh_delete_file(f"{name}/.env.schema", schema_sha, f"Remove secrets schema for {name}")

    _regenerate_module_llms_txt(name, summary=body.summary)

    return {"name": name}


@app.delete("/api/modules/{name}")
async def api_delete_module(name: str):
    """Delete a module and all its files from GitHub."""
    try:
        _gh_delete_dir(name)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)
        raise
    global _modules_cache_ts
    _modules_cache_ts = 0
    return {"status": "ok"}


# --- Module file CRUD ---


@app.get("/api/modules/{name}/files")
async def api_list_module_files(name: str):
    """List content files in a module."""
    try:
        files = _list_module_files(name)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)
        raise
    return {"files": files}


@app.get("/api/modules/{name}/files/{file_path:path}")
async def api_get_module_file(name: str, file_path: str):
    """Get a file's content from a module."""
    try:
        _validate_module_file_path(file_path)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)

    try:
        data = _gh_api(f"{name}/{file_path}")
        content = base64.b64decode(data["content"]).decode()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"File '{file_path}' not found in module '{name}'"}, status_code=404)
        raise
    return {"path": file_path, "content": content}


@app.put("/api/modules/{name}/files/{file_path:path}")
async def api_save_module_file(name: str, file_path: str, body: FileContentRequest):
    """Create or update a file in a module. Regenerates llms.txt."""
    try:
        file_path = _validate_module_file_path(file_path)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)

    gh_path = f"{name}/{file_path}"
    try:
        existing = _gh_api(gh_path)
        _gh_update_file(gh_path, body.content, existing["sha"], f"Update {gh_path}")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            _gh_create_file(gh_path, body.content, f"Create {gh_path}")
        else:
            raise

    _regenerate_module_llms_txt(name)
    return {"path": file_path}


@app.delete("/api/modules/{name}/files/{file_path:path}")
async def api_delete_module_file(name: str, file_path: str):
    """Delete a file from a module. info.md cannot be deleted. Regenerates llms.txt."""
    try:
        file_path = _validate_module_file_path(file_path)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)

    if file_path == "info.md":
        return JSONResponse({"error": "info.md cannot be deleted"}, status_code=400)

    gh_path = f"{name}/{file_path}"
    try:
        data = _gh_api(gh_path)
        _gh_delete_file(gh_path, data["sha"], f"Delete {gh_path}")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"File '{file_path}' not found"}, status_code=404)
        raise

    _regenerate_module_llms_txt(name)
    return {"status": "ok"}


# --- SPA static file serving ---
STATIC_DIR = BASE_DIR / "static"

if STATIC_DIR.exists():
    from fastapi.responses import FileResponse

    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="static-assets")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        """Serve index.html for all non-API routes (SPA client-side routing)."""
        file_path = STATIC_DIR / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")


# --- Entry point ---


def main():
    import uvicorn

    uvicorn.run("src.server:app", host="0.0.0.0", port=8080, reload=True)


if __name__ == "__main__":
    main()
