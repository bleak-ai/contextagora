import os
import subprocess

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.llms import (
    extract_module_summary,
    generate_module_llms_txt,
    regenerate_module_llms_txt,
)
from src.models import (
    CreateModuleRequest,
    FileContentRequest,
    GenerateModuleRequest,
    GenerateModuleResponse,
    UpdateModuleRequest,
)
from src.server import MANAGED_FILES
from src.services import git_repo
from src.services.schemas import (
    generate_env_schema,
    parse_env_schema,
    validate_module_file_path,
    validate_module_name,
)

router = APIRouter(prefix="/api/modules", tags=["modules"])


@router.get("")
async def api_list_modules():
    """List available modules from the local clone."""
    return {"modules": git_repo.list_modules()}


@router.get("/{name}")
async def api_get_module(name: str):
    """Get module detail: info.md content, summary, secrets, requirements."""
    try:
        content = git_repo.read_file(name, "info.md")
    except FileNotFoundError:
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    summary = ""
    try:
        llms_text = git_repo.read_file(name, "llms.txt")
        summary = extract_module_summary(llms_text)
    except FileNotFoundError:
        pass

    secrets: list[str] = []
    try:
        schema_text = git_repo.read_file(name, ".env.schema")
        secrets = parse_env_schema(schema_text)
    except FileNotFoundError:
        pass

    requirements: list[str] = []
    try:
        req_text = git_repo.read_file(name, "requirements.txt")
        requirements = [line.strip() for line in req_text.splitlines() if line.strip()]
    except FileNotFoundError:
        pass

    return {
        "name": name,
        "content": content,
        "summary": summary,
        "secrets": secrets,
        "requirements": requirements,
    }


@router.post("", status_code=201)
async def api_create_module(body: CreateModuleRequest):
    """Create a new module with info.md, llms.txt, and optional .env.schema."""
    name = validate_module_name(body.name)

    try:
        git_repo.create_module_dir(name)
    except FileExistsError:
        return JSONResponse(
            {"error": f"Module '{name}' already exists"}, status_code=409
        )

    git_repo.write_file(name, "info.md", body.content)
    files = ["info.md"]

    if body.secrets:
        schema = generate_env_schema(body.secrets)
        git_repo.write_file(name, ".env.schema", schema)
        files.append(".env.schema")

    if body.requirements:
        req_content = "\n".join(body.requirements) + "\n"
        git_repo.write_file(name, "requirements.txt", req_content)
        files.append("requirements.txt")

    llms_txt = generate_module_llms_txt(name, body.summary, files)
    git_repo.write_file(name, "llms.txt", llms_txt)

    return {"name": name}


@router.put("/{name}")
async def api_update_module(name: str, body: UpdateModuleRequest):
    """Update a module's info.md, .env.schema, requirements, llms.txt."""
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    git_repo.write_file(name, "info.md", body.content)

    if body.secrets:
        git_repo.write_file(name, ".env.schema", generate_env_schema(body.secrets))
    else:
        try:
            git_repo.delete_file(name, ".env.schema")
        except FileNotFoundError:
            pass

    if body.requirements:
        req_content = "\n".join(body.requirements) + "\n"
        git_repo.write_file(name, "requirements.txt", req_content)
    else:
        try:
            git_repo.delete_file(name, "requirements.txt")
        except FileNotFoundError:
            pass

    regenerate_module_llms_txt(name, MANAGED_FILES, summary=body.summary)

    return {"name": name}


@router.delete("/{name}")
async def api_delete_module(name: str):
    """Delete a module and all its files."""
    try:
        git_repo.delete_module_dir(name)
    except FileNotFoundError:
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)
    return {"status": "ok"}


@router.post("/refresh")
async def api_refresh_modules():
    """Kept for frontend compatibility. Local clone listing is always fresh."""
    return {"modules": git_repo.list_modules()}


# ── AI generation ────────────────────────────────────────────

_GENERATE_PROMPT_TEMPLATE = (
    "You are writing a summary for a context module — a package of documentation"
    " that a coding agent loads to understand a tool or service.\n"
    "\n"
    'Read the info.md content below for the module named "{module_name}" and write'
    " a summary of 1-2 sentences. The summary should describe:\n"
    "- What this tool/service is and what the team uses it for\n"
    "- Key details like account structure, environments, or integration points\n"
    "\n"
    "Write ONLY the summary text. No markdown formatting, no headings, no bullet"
    " points — just plain sentences.\n"
    "\n"
    "---\n"
    "\n"
    "{raw_content}"
)


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


_DETECT_PACKAGES_PROMPT = (
    "Read the info.md content below for a context module. Identify all Python"
    " packages (PyPI names) that are needed to run the scripts described in the"
    " module.\n"
    "\n"
    "Only include packages that need to be installed via pip — not standard library"
    " modules.\n"
    "\n"
    "Return ONLY a comma-separated list of package names, nothing else."
    " Example: stripe,python-dotenv,httpx\n"
    "\n"
    "If no packages are needed, return the word NONE.\n"
    "\n"
    "---\n"
    "\n"
    "{raw_content}"
)


@router.post("/{name}/detect-packages")
def api_detect_packages(name: str, body: GenerateModuleRequest):
    """Use Claude to detect Python packages from info.md content."""
    if not body.content.strip():
        return JSONResponse({"error": "Content is empty"}, status_code=400)

    prompt = _DETECT_PACKAGES_PROMPT.format(raw_content=body.content)

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

    raw = proc.stdout.strip()
    if raw.upper() == "NONE":
        return {"packages": []}

    packages = [p.strip().strip("`").lower() for p in raw.split(",") if p.strip().strip("`")]
    return {"packages": packages}


# --- Module file CRUD ---


@router.get("/{name}/files")
async def api_list_module_files(name: str):
    try:
        files = git_repo.list_module_files(name, MANAGED_FILES)
    except FileNotFoundError:
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)
    return {"files": files}


@router.get("/{name}/files/{file_path:path}")
async def api_get_module_file(name: str, file_path: str):
    try:
        file_path = validate_module_file_path(file_path, MANAGED_FILES)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    try:
        content = git_repo.read_file(name, file_path)
    except FileNotFoundError:
        return JSONResponse(
            {"error": f"File '{file_path}' not found in module '{name}'"},
            status_code=404,
        )
    return {"path": file_path, "content": content}


@router.put("/{name}/files/{file_path:path}")
async def api_save_module_file(name: str, file_path: str, body: FileContentRequest):
    try:
        file_path = validate_module_file_path(file_path, MANAGED_FILES)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    git_repo.write_file(name, file_path, body.content)
    regenerate_module_llms_txt(name, MANAGED_FILES)
    return {"path": file_path}


@router.delete("/{name}/files/{file_path:path}")
async def api_delete_module_file(name: str, file_path: str):
    try:
        file_path = validate_module_file_path(file_path, MANAGED_FILES)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    if file_path == "info.md":
        return JSONResponse({"error": "info.md cannot be deleted"}, status_code=400)
    try:
        git_repo.delete_file(name, file_path)
    except FileNotFoundError:
        return JSONResponse({"error": f"File '{file_path}' not found"}, status_code=404)
    regenerate_module_llms_txt(name, MANAGED_FILES)
    return {"status": "ok"}
