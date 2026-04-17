import os
import re as _re
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
    ModuleInfo,
    UpdateModuleRequest,
)
from src.config import settings
from src.services import git_repo
from src.services.manifest import (
    ModuleManifest,
    read_manifest,
    write_manifest,
)
from src.services.schemas import validate_module_file_path, validate_module_name
from src.services.workspace import get_loaded_module_names, reload_workspace

router = APIRouter(prefix="/api/modules", tags=["modules"])


def slugify_task_name(name: str) -> str:
    """Convert a human task name to a folder-safe slug."""
    slug = name.strip().lower()
    slug = slug.replace("_", "-")
    slug = _re.sub(r"[^a-z0-9-]", "-", slug)
    slug = _re.sub(r"-+", "-", slug)
    slug = slug.strip("-")
    return slug


@router.get("")
async def api_list_modules():
    """List available modules from the local clone."""
    modules = []
    for name in git_repo.list_modules():
        manifest = read_manifest(git_repo.module_dir(name))
        modules.append(ModuleInfo(
            name=name,
            kind=manifest.kind,
            summary=manifest.summary,
            archived=manifest.archived,
        ))
    return {"modules": modules}


def _set_module_archived(name: str, archived: bool) -> None:
    """Update the archived flag in a module's manifest."""
    manifest = read_manifest(git_repo.module_dir(name))
    manifest = manifest.model_copy(update={"archived": archived})
    write_manifest(git_repo.module_dir(name), manifest)


@router.post("/{name}/archive")
async def api_archive_module(name: str):
    """Set archived=true on a module and unload it if loaded."""
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    _set_module_archived(name, True)

    current = get_loaded_module_names()
    if name in current:
        current.remove(name)
        reload_workspace(current)

    return {"status": "ok"}


@router.post("/{name}/unarchive")
async def api_unarchive_module(name: str):
    """Set archived=false on a module."""
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    _set_module_archived(name, False)

    return {"status": "ok"}


@router.get("/{name}")
async def api_get_module(name: str):
    """Get module detail: info.md content, summary, secrets, dependencies."""
    try:
        content = git_repo.read_file(name, "info.md")
    except FileNotFoundError:
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    manifest = read_manifest(git_repo.module_dir(name))

    summary = manifest.summary
    if not summary:
        try:
            llms_text = git_repo.read_file(name, "llms.txt")
            summary = extract_module_summary(llms_text)
        except FileNotFoundError:
            pass

    return {
        "name": name,
        "content": content,
        "summary": summary,
        "secrets": manifest.secrets,
        "requirements": manifest.dependencies,
    }


def _scaffold_integration(slug: str, body: CreateModuleRequest) -> None:
    """Scaffold files for an integration module."""
    git_repo.write_file(slug, "info.md", body.content)
    llms_txt = generate_module_llms_txt(slug, body.summary, ["info.md"])
    git_repo.write_file(slug, "llms.txt", llms_txt)


def _scaffold_task(slug: str, body: CreateModuleRequest) -> None:
    """Scaffold files for a task module."""
    from datetime import date

    title = body.name.strip()
    description = body.description.strip() if body.description else ""
    summary = description or title

    info_lines = [f"# {title}", ""]
    if description:
        info_lines.append(description)
    git_repo.write_file(slug, "info.md", "\n".join(info_lines) + "\n")

    status_lines = [
        f"# {title} — Status",
        "",
        f"**Created:** {date.today().isoformat()}",
        "",
        "## Context",
        summary,
        "",
        "## Next Steps",
        "- ",
    ]
    git_repo.write_file(slug, "status.md", "\n".join(status_lines) + "\n")

    llms_lines = [
        f"# {title}",
        f"> {summary}",
        "",
        "## Status",
        f"- [status.md](status.md) — Current status and next steps",
    ]
    git_repo.write_file(slug, "llms.txt", "\n".join(llms_lines) + "\n")


_SCAFFOLD_FN = {
    "integration": _scaffold_integration,
    "task": _scaffold_task,
}

VALID_KINDS = frozenset(_SCAFFOLD_FN.keys())


@router.post("", status_code=201)
async def api_create_module(body: CreateModuleRequest):
    """Create a new module. Scaffolded files depend on body.kind."""
    if body.kind not in VALID_KINDS:
        return JSONResponse(
            {"error": f"Invalid kind '{body.kind}'. Must be one of: {', '.join(sorted(VALID_KINDS))}"},
            status_code=400,
        )

    slug = (
        slugify_task_name(body.name) if body.kind != "integration"
        else validate_module_name(body.name)
    )

    try:
        git_repo.create_module_dir(slug)
    except FileExistsError:
        return JSONResponse(
            {"error": f"Module '{slug}' already exists"}, status_code=409
        )

    summary = body.summary or body.description or ""
    manifest = ModuleManifest(
        name=slug,
        kind=body.kind,
        summary=summary,
        secrets=body.secrets,
        dependencies=body.requirements,
    )
    write_manifest(git_repo.module_dir(slug), manifest)

    _SCAFFOLD_FN[body.kind](slug, body)

    # Auto-load tasks into workspace
    if body.kind != "integration":
        current = get_loaded_module_names()
        if slug not in current:
            current.append(slug)
        reload_workspace(current)

    return {"name": slug}


@router.post("/{name}/register")
async def api_register_module(name: str):
    """Register a module from files already written to disk.

    Reads info.md and module.yaml from modules-repo/{name}/, generates
    llms.txt, and optionally auto-loads non-integration modules.
    """
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    module_dir = git_repo.module_dir(name)

    # Validate info.md exists
    try:
        git_repo.read_file(name, "info.md")
    except FileNotFoundError:
        return JSONResponse(
            {"error": f"Module '{name}' is missing info.md"}, status_code=400
        )

    # Validate and read module.yaml
    manifest_path = module_dir / "module.yaml"
    if not manifest_path.exists():
        return JSONResponse(
            {"error": f"Module '{name}' is missing module.yaml"}, status_code=400
        )
    try:
        manifest = read_manifest(module_dir)
    except Exception as exc:
        return JSONResponse(
            {"error": f"Module '{name}' has invalid module.yaml: {exc}"}, status_code=400
        )

    # Generate llms.txt
    regenerate_module_llms_txt(name, settings.MANAGED_FILES, summary=manifest.summary)

    # Auto-load non-integrations into workspace
    if manifest.kind != "integration":
        current = get_loaded_module_names()
        if name not in current:
            current.append(name)
        reload_workspace(current)

    return {
        "name": manifest.name,
        "kind": manifest.kind,
        "summary": manifest.summary,
    }


@router.put("/{name}")
async def api_update_module(name: str, body: UpdateModuleRequest):
    """Update a module's info.md, module.yaml, and llms.txt."""
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    git_repo.write_file(name, "info.md", body.content)

    existing = read_manifest(git_repo.module_dir(name))
    manifest = existing.model_copy(update={
        "summary": body.summary,
        "secrets": body.secrets,
        "dependencies": body.requirements,
    })
    write_manifest(git_repo.module_dir(name), manifest)

    regenerate_module_llms_txt(name, settings.MANAGED_FILES, summary=body.summary)

    return {"name": name}


@router.delete("/{name}")
async def api_delete_module(name: str):
    """Delete a module and all its files. Unloads first if loaded."""
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    current = get_loaded_module_names()
    if name in current:
        current.remove(name)
        reload_workspace(current)

    git_repo.delete_module_dir(name)
    return {"status": "ok"}


_CLAUDE_HEADLESS_ENV = {
    "DISABLE_AUTOUPDATER": "1",
    "CLAUDE_CODE_ENABLE_TELEMETRY": "0",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
}


def _run_claude_headless(prompt: str, *, timeout: int = 120) -> subprocess.CompletedProcess:
    """Run a single-turn headless Claude CLI call with telemetry disabled.

    Returns the CompletedProcess so callers can inspect returncode/stdout/stderr.
    """
    env = {**os.environ, **_CLAUDE_HEADLESS_ENV}
    return subprocess.run(
        ["claude", "-p", prompt, "--output-format", "text", "--max-turns", "1"],
        capture_output=True,
        text=True,
        env=env,
        timeout=timeout,
    )


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

    proc = _run_claude_headless(prompt)

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

    proc = _run_claude_headless(prompt)

    if proc.returncode != 0:
        return JSONResponse(
            {"error": f"Claude failed: {proc.stderr.strip()}"}, status_code=502
        )

    raw = proc.stdout.strip()
    if raw.upper() == "NONE":
        return {"packages": []}

    packages = [p.strip().strip("`").lower() for p in raw.split(",") if p.strip().strip("`")]
    return {"packages": packages}


@router.get("/{name}/files")
async def api_list_module_files(name: str):
    try:
        files = git_repo.list_module_files(name, settings.MANAGED_FILES)
    except FileNotFoundError:
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)
    return {"files": files}


@router.get("/{name}/files/{file_path:path}")
async def api_get_module_file(name: str, file_path: str):
    try:
        file_path = validate_module_file_path(file_path, settings.MANAGED_FILES)
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
        file_path = validate_module_file_path(file_path, settings.MANAGED_FILES)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    git_repo.write_file(name, file_path, body.content)
    regenerate_module_llms_txt(name, settings.MANAGED_FILES)
    return {"path": file_path}


@router.delete("/{name}/files/{file_path:path}")
async def api_delete_module_file(name: str, file_path: str):
    try:
        file_path = validate_module_file_path(file_path, settings.MANAGED_FILES)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    if file_path == "info.md":
        return JSONResponse({"error": "info.md cannot be deleted"}, status_code=400)
    try:
        git_repo.delete_file(name, file_path)
    except FileNotFoundError:
        return JSONResponse({"error": f"File '{file_path}' not found"}, status_code=404)
    regenerate_module_llms_txt(name, settings.MANAGED_FILES)
    return {"status": "ok"}
