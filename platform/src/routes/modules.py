import base64
import os
import subprocess

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.llms import (
    extract_module_summary,
    generate_module_llms_txt,
    regenerate_module_llms_txt,
)
from src.models import CreateModuleRequest, FileContentRequest, GenerateModuleRequest, GenerateModuleResponse, UpdateModuleRequest
from src.server import MANAGED_FILES
from src.services.github import (
    gh_api,
    gh_create_file,
    gh_delete_dir,
    gh_delete_file,
    gh_update_file,
    invalidate_module_cache,
    list_available_modules,
    list_module_files,
)
from src.services.schemas import (
    generate_env_schema,
    parse_env_schema,
    validate_module_file_path,
    validate_module_name,
)

router = APIRouter(prefix="/api/modules", tags=["modules"])


@router.get("")
async def api_list_modules():
    """List available modules from GitHub."""
    return {"modules": list_available_modules()}


@router.get("/{name}")
async def api_get_module(name: str):
    """Get module detail: info.md content, summary, and secrets schema."""
    try:
        file_data = gh_api(f"{name}/info.md")
        content = base64.b64decode(file_data["content"]).decode()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)
        raise

    summary = ""
    try:
        llms_data = gh_api(f"{name}/llms.txt")
        llms_text = base64.b64decode(llms_data["content"]).decode()
        summary = extract_module_summary(llms_text)
    except httpx.HTTPStatusError:
        pass

    secrets: list[str] = []
    try:
        schema_data = gh_api(f"{name}/.env.schema")
        schema_text = base64.b64decode(schema_data["content"]).decode()
        secrets = parse_env_schema(schema_text)
    except httpx.HTTPStatusError:
        pass

    return {"name": name, "content": content, "summary": summary, "secrets": secrets}


@router.post("", status_code=201)
async def api_create_module(body: CreateModuleRequest):
    """Create a new module with info.md, llms.txt, and optional .env.schema."""
    name = validate_module_name(body.name)
    try:
        gh_create_file(f"{name}/info.md", body.content, f"Create module {name}")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 422:
            return JSONResponse({"error": f"Module '{name}' already exists"}, status_code=409)
        raise

    files = ["info.md"]

    if body.secrets:
        schema = generate_env_schema(body.secrets)
        gh_create_file(f"{name}/.env.schema", schema, f"Add secrets schema for {name}")
        files.append(".env.schema")

    llms_txt = generate_module_llms_txt(name, body.summary, files)
    gh_create_file(f"{name}/llms.txt", llms_txt, f"Add llms.txt for {name}")

    invalidate_module_cache()
    return {"name": name}


@router.put("/{name}")
async def api_update_module(name: str, body: UpdateModuleRequest):
    """Update a module's info.md, llms.txt, and .env.schema."""
    try:
        file_data = gh_api(f"{name}/info.md")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)
        raise
    gh_update_file(f"{name}/info.md", body.content, file_data["sha"], f"Update {name}/info.md")

    schema_sha = ""
    try:
        schema_data = gh_api(f"{name}/.env.schema")
        schema_sha = schema_data["sha"]
    except httpx.HTTPStatusError:
        pass

    if body.secrets:
        schema = generate_env_schema(body.secrets)
        if schema_sha:
            gh_update_file(f"{name}/.env.schema", schema, schema_sha, f"Update secrets schema for {name}")
        else:
            gh_create_file(f"{name}/.env.schema", schema, f"Add secrets schema for {name}")
    elif schema_sha:
        gh_delete_file(f"{name}/.env.schema", schema_sha, f"Remove secrets schema for {name}")

    regenerate_module_llms_txt(name, MANAGED_FILES, summary=body.summary)

    return {"name": name}


@router.delete("/{name}")
async def api_delete_module(name: str):
    """Delete a module and all its files from GitHub."""
    try:
        gh_delete_dir(name)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)
        raise
    invalidate_module_cache()
    return {"status": "ok"}


@router.post("/refresh")
async def api_refresh_modules():
    """Force-refresh the module list from GitHub (bypasses cache)."""
    return {"modules": list_available_modules(bypass_cache=True)}


# ── AI generation ────────────────────────────────────────────

_GENERATE_PROMPT_TEMPLATE = """You are writing a summary for a context module — a package of documentation that a coding agent loads to understand a tool or service.

Read the info.md content below for the module named "{module_name}" and write a summary of 1-2 sentences. The summary should describe:
- What this tool/service is and what the team uses it for
- Key details like account structure, environments, or integration points

Write ONLY the summary text. No markdown formatting, no headings, no bullet points — just plain sentences.

---

{raw_content}"""


@router.post("/{name}/generate")
def api_generate_module(name: str, body: GenerateModuleRequest):
    """Use Claude to generate a summary from raw info.md content.

    NOTE: This is a sync `def` (not `async def`) so FastAPI runs it in a
    threadpool automatically — subprocess.run blocks for up to 120s and
    must not block the async event loop.
    """
    if not body.content.strip():
        return JSONResponse({"error": "Content is empty"}, status_code=400)

    prompt = _GENERATE_PROMPT_TEMPLATE.format(
        module_name=name,
        raw_content=body.content,
    )

    env = {
        **os.environ,
        "DISABLE_AUTOUPDATER": "1",
        "CLAUDE_CODE_ENABLE_TELEMETRY": "0",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    }

    proc = subprocess.run(
        ["claude", "-p", prompt, "--output-format", "text", "--max-turns", "1"],
        capture_output=True,
        text=True,
        env=env,
        timeout=120,
    )

    if proc.returncode != 0:
        return JSONResponse(
            {"error": f"Claude failed: {proc.stderr.strip()}"}, status_code=502
        )

    summary = proc.stdout.strip()

    return GenerateModuleResponse(summary=summary)


# --- Module file CRUD ---


@router.get("/{name}/files")
async def api_list_module_files(name: str):
    """List content files in a module."""
    try:
        files = list_module_files(name, MANAGED_FILES)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)
        raise
    return {"files": files}


@router.get("/{name}/files/{file_path:path}")
async def api_get_module_file(name: str, file_path: str):
    """Get a file's content from a module."""
    try:
        validate_module_file_path(file_path, MANAGED_FILES)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)

    try:
        data = gh_api(f"{name}/{file_path}")
        content = base64.b64decode(data["content"]).decode()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"File '{file_path}' not found in module '{name}'"}, status_code=404)
        raise
    return {"path": file_path, "content": content}


@router.put("/{name}/files/{file_path:path}")
async def api_save_module_file(name: str, file_path: str, body: FileContentRequest):
    """Create or update a file in a module. Regenerates llms.txt."""
    try:
        file_path = validate_module_file_path(file_path, MANAGED_FILES)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)

    gh_path = f"{name}/{file_path}"
    try:
        existing = gh_api(gh_path)
        gh_update_file(gh_path, body.content, existing["sha"], f"Update {gh_path}")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            gh_create_file(gh_path, body.content, f"Create {gh_path}")
        else:
            raise

    regenerate_module_llms_txt(name, MANAGED_FILES)
    return {"path": file_path}


@router.delete("/{name}/files/{file_path:path}")
async def api_delete_module_file(name: str, file_path: str):
    """Delete a file from a module. info.md cannot be deleted. Regenerates llms.txt."""
    try:
        file_path = validate_module_file_path(file_path, MANAGED_FILES)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)

    if file_path == "info.md":
        return JSONResponse({"error": "info.md cannot be deleted"}, status_code=400)

    gh_path = f"{name}/{file_path}"
    try:
        data = gh_api(gh_path)
        gh_delete_file(gh_path, data["sha"], f"Delete {gh_path}")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return JSONResponse({"error": f"File '{file_path}' not found"}, status_code=404)
        raise

    regenerate_module_llms_txt(name, MANAGED_FILES)
    return {"status": "ok"}
