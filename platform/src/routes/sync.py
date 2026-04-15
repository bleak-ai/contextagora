import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.models import PushRequest
from src.services import git_repo

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sync", tags=["sync"])


_CLEAN_SYNC = {"dirty": False, "ahead": 0, "behind": 0, "can_pull": False, "can_push": False}


@router.get("/status")
def api_sync_status():
    try:
        return git_repo.sync_status()
    except git_repo.GitRepoError as exc:
        return JSONResponse(
            {"error": str(exc), "initialized": False}, status_code=503
        )


@router.post("/pull")
def api_sync_pull():
    try:
        git_repo.pull()
    except git_repo.GitRepoError as exc:
        return JSONResponse({"error": str(exc)}, status_code=502)
    return {"status": "ok", "sync": _CLEAN_SYNC}


@router.post("/push")
def api_sync_push(body: PushRequest):
    message = body.message.strip()
    if not message:
        return JSONResponse({"error": "Commit message is required"}, status_code=400)
    try:
        commit = git_repo.push(message)
    except git_repo.GitRepoError as exc:
        msg = str(exc)
        status_code = 409 if ("Nothing to push" in msg or "pull first" in msg) else 502
        return JSONResponse({"error": str(exc)}, status_code=status_code)
    return {"status": "ok", "commit": commit, "sync": _CLEAN_SYNC}
