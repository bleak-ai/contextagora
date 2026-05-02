import subprocess
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.llms import (
    extract_module_summary,
)
from src.services.modules.growth_areas import parse as parse_growth_areas
from src.models import (
    CreateModuleRequest,
    FileContentRequest,
    ModuleInfo,
    UpdateModuleRequest,
)
from src.config import settings
from src.services.modules import git_repo
from src.services.modules.manifest import (
    KINDS,
    ModuleManifest,
    read_manifest,
    scaffold_module,
    slugify_task_name,
    write_manifest,
)
from src.services.modules.schemas import validate_module_file_path
from src.services.modules.workspace import get_loaded_module_names, reload_workspace

router = APIRouter(prefix="/api/modules", tags=["modules"])


@router.get("")
async def api_list_modules():
    """List available modules from the local clone."""
    modules = []
    for name in git_repo.list_modules():
        manifest = read_manifest(git_repo.module_dir(name))
        try:
            llms_text = git_repo.read_file(name, "llms.txt")
            summary = extract_module_summary(llms_text)
            has_growth_areas = bool(parse_growth_areas(llms_text))
        except FileNotFoundError:
            summary = ""
            has_growth_areas = False
        modules.append(ModuleInfo(
            name=name,
            kind=manifest.kind,
            summary=summary,
            has_growth_areas=has_growth_areas,
        ))
    return {"modules": modules}


@router.get("/{name}")
async def api_get_module(name: str):
    """Get module detail: info.md content, summary, secrets, dependencies."""
    try:
        content = git_repo.read_file(name, "info.md")
    except FileNotFoundError:
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    manifest = read_manifest(git_repo.module_dir(name))

    try:
        llms_text = git_repo.read_file(name, "llms.txt")
        summary = extract_module_summary(llms_text)
    except FileNotFoundError:
        summary = ""

    return {
        "name": name,
        "content": content,
        "summary": summary,
        "secrets": manifest.secrets,
        "requirements": manifest.dependencies,
    }


@router.post("", status_code=201)
async def api_create_module(body: CreateModuleRequest):
    """Create a new module. kind is a labeling tag; scaffold is uniform."""
    if body.kind not in KINDS:
        return JSONResponse(
            {"error": f"Invalid kind '{body.kind}'. Must be one of: {', '.join(KINDS)}"},
            status_code=400,
        )

    slug = slugify_task_name(body.name)

    try:
        git_repo.create_module_dir(slug)
    except FileExistsError:
        return JSONResponse(
            {"error": f"Module '{slug}' already exists"}, status_code=409
        )

    manifest = ModuleManifest(
        name=slug,
        kind=body.kind,
        secrets=body.secrets,
        dependencies=body.requirements,
    )
    write_manifest(git_repo.module_dir(slug), manifest)

    scaffold_module(slug, body)

    current = get_loaded_module_names()
    if slug not in current:
        current.append(slug)
    reload_workspace(current)

    return {"name": slug}



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
        "secrets": body.secrets,
        "dependencies": body.requirements,
    })
    write_manifest(git_repo.module_dir(name), manifest)

    return {"name": name}


@router.delete("/{name}")
async def api_delete_module(name: str):
    """Delete a module and all its files. Unloads first if loaded."""
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    # Remove the module dir first so reload_workspace's workflow invariant
    # can't resurrect its symlink.
    git_repo.delete_module_dir(name)

    current = get_loaded_module_names()
    if name in current:
        current.remove(name)
    reload_workspace(current)

    return {"status": "ok"}



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
    return {"status": "ok"}
