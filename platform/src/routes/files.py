import logging
import mimetypes
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from src.config import settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/files", tags=["files"])

MAX_DOWNLOAD_SIZE = 100 * 1024 * 1024  # 100 MB

_context_resolved = settings.CONTEXT_DIR.resolve()
_modules_repo_resolved = settings.MODULES_REPO_DIR.resolve()
_tmp_resolved = Path("/tmp").resolve()


def _validate_path(path_str: str) -> Path:
    """Resolve path and ensure it's within CONTEXT_DIR, MODULES_REPO_DIR, or /tmp.

    CONTEXT_DIR entries are symlinks into MODULES_REPO_DIR, so the resolved
    target lands in the latter — both are valid.
    """
    p = Path(path_str)
    if p.is_absolute():
        resolved = p.resolve()
    else:
        resolved = (settings.CONTEXT_DIR / path_str).resolve()

    if not (
        resolved.is_relative_to(_context_resolved)
        or resolved.is_relative_to(_modules_repo_resolved)
        or resolved.is_relative_to(_tmp_resolved)
    ):
        raise HTTPException(403, "Path outside allowed directories")

    return resolved


@router.get("/download")
async def download_file(
    path: str = Query(..., description="Absolute or relative path to file"),
):
    """Download a file with Content-Disposition: attachment."""
    target = _validate_path(path)

    if not target.exists():
        raise HTTPException(404, "File not found")
    if not target.is_file():
        raise HTTPException(400, "Path is not a file")
    if target.stat().st_size > MAX_DOWNLOAD_SIZE:
        raise HTTPException(413, "File too large (max 100MB)")

    return FileResponse(
        path=target,
        filename=target.name,
        media_type="application/octet-stream",
    )


@router.get("/preview")
async def preview_file(
    path: str = Query(..., description="Absolute or relative path to file"),
):
    """Serve a file inline with auto-detected MIME (so images render in <img>)."""
    target = _validate_path(path)

    if not target.exists():
        raise HTTPException(404, "File not found")
    if not target.is_file():
        raise HTTPException(400, "Path is not a file")
    if target.stat().st_size > MAX_DOWNLOAD_SIZE:
        raise HTTPException(413, "File too large (max 100MB)")

    mime, _ = mimetypes.guess_type(target.name)
    return FileResponse(path=target, media_type=mime or "application/octet-stream")
