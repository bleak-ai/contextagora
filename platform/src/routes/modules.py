import subprocess
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.llms import (
    extract_module_summary,
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
from src.commands import _SUMMARY_PROMPT, _DETECT_PACKAGES_PROMPT
from src.config import settings
from src.services import git_repo
from src.services.claude import run_headless
from src.services.manifest import (
    ModuleKind,
    ModuleManifest,
    read_manifest,
    set_archived,
    slugify_task_name,
    write_manifest,
)
from src.services.schemas import validate_module_file_path, validate_module_name
from src.services.workspace import get_loaded_module_names, reload_workspace

router = APIRouter(prefix="/api/modules", tags=["modules"])


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


@router.post("/{name}/archive")
async def api_archive_module(name: str):
    """Set archived=true on a module and unload it if loaded."""
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    set_archived(name, True)

    current = get_loaded_module_names()
    if name in current:
        current.remove(name)
        reload_workspace(current)

    return {"status": "ok"}


@router.post("/{name}/unarchive")
async def api_unarchive_module(name: str):
    """Set archived=false on a module and reload so the task invariant
    (non-archived tasks are always loaded) takes effect."""
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    set_archived(name, False)
    reload_workspace(get_loaded_module_names())

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


@router.post("", status_code=201)
async def api_create_module(body: CreateModuleRequest):
    """Create a new module. Scaffolded files depend on body.kind."""
    try:
        kind = ModuleKind(body.kind)
    except ValueError:
        return JSONResponse(
            {"error": f"Invalid kind '{body.kind}'. Must be one of: {', '.join(k.value for k in ModuleKind)}"},
            status_code=400,
        )

    slug = (
        slugify_task_name(body.name) if kind is not ModuleKind.INTEGRATION
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
        kind=kind.value,
        summary=summary,
        secrets=body.secrets,
        dependencies=body.requirements,
    )
    write_manifest(git_repo.module_dir(slug), manifest)

    kind.scaffold(slug, body)

    if kind.auto_load:
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

    # Always load on register so the module is immediately usable:
    # - Symlink into CONTEXT_DIR so claude can read it
    # - Secrets populated into .env.schema for varlock
    # Already-loaded modules keep their state (reload_workspace is idempotent
    # on membership). Users can still opt out later via the sidebar toggle.
    current = get_loaded_module_names()
    if name not in current:
        current.append(name)
    reload_workspace(current)

    return {
        "name": manifest.name,
        "kind": manifest.kind,
        "summary": manifest.summary,
    }



@router.post("/{name}/files/{file_path:path}/run")
def api_run_module_file(name: str, file_path: str):
    """Run a .py file inside a module using varlock.

    NOTE: Sync ``def`` so FastAPI runs it in a threadpool — subprocess.run
    blocks and must not block the async event loop.
    """
    # Validate path (schema: .md or .py, no .., no managed files)
    try:
        file_path = validate_module_file_path(file_path, settings.MANAGED_FILES)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)

    # Only .py files are runnable
    if not file_path.endswith(".py"):
        return JSONResponse({"error": "Only .py files can be run"}, status_code=400)

    # 404 if module doesn't exist
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    # 400 if file doesn't exist on disk
    absolute_path = git_repo.module_dir(name) / file_path
    if not absolute_path.exists():
        return JSONResponse(
            {"error": f"File '{file_path}' not found in module '{name}'"},
            status_code=400,
        )

    start = time.perf_counter()
    try:
        proc = subprocess.run(
            ["varlock", "run", "--", "uv", "run", "python", str(absolute_path)],
            cwd=settings.CONTEXT_DIR,
            capture_output=True,
            text=True,
            timeout=30,
        )
        duration_ms = int((time.perf_counter() - start) * 1000)
        return JSONResponse({
            "exit_code": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "duration_ms": duration_ms,
        })
    except subprocess.TimeoutExpired:
        duration_ms = int((time.perf_counter() - start) * 1000)
        return JSONResponse({
            "exit_code": -1,
            "stdout": "",
            "stderr": "timeout after 30s",
            "duration_ms": duration_ms,
        })


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

    # Remove the module dir first so reload_workspace's task invariant
    # (non-archived tasks always loaded) can't resurrect its symlink.
    git_repo.delete_module_dir(name)

    current = get_loaded_module_names()
    if name in current:
        current.remove(name)
    reload_workspace(current)

    return {"status": "ok"}


@router.post("/{name}/generate")
def api_generate_module(name: str, body: GenerateModuleRequest):
    """Use Claude to generate a summary from raw info.md content.

    Sync ``def`` so FastAPI runs it in a threadpool (run_headless blocks).
    """
    if not body.content.strip():
        return JSONResponse({"error": "Content is empty"}, status_code=400)

    prompt = (
        _SUMMARY_PROMPT
        .replace("{module_name}", name)
        .replace("{raw_content}", body.content)
    )
    proc = run_headless(prompt)

    if proc.returncode != 0:
        return JSONResponse(
            {"error": f"Claude failed: {proc.stderr.strip()}"}, status_code=502
        )
    return GenerateModuleResponse(summary=proc.stdout.strip())


@router.post("/{name}/detect-packages")
def api_detect_packages(name: str, body: GenerateModuleRequest):
    """Use Claude to detect Python packages from info.md content."""
    if not body.content.strip():
        return JSONResponse({"error": "Content is empty"}, status_code=400)

    prompt = _DETECT_PACKAGES_PROMPT.replace("{raw_content}", body.content)
    proc = run_headless(prompt)

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
