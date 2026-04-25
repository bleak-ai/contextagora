"""POST /api/sessions/{id}/social-post — generate a social-post payload.

See docs/superpowers/specs/2026-04-24-social-post-from-session-design.md
"""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from src.config import settings
from src.models import SocialPostPayload
from src.services import social_post
from src.services.claude_sessions import claude_project_dir

router = APIRouter(prefix="/api/sessions", tags=["social-post"])


@router.post("/{session_id}/social-post", response_model=SocialPostPayload)
async def api_generate_social_post(session_id: str, request: Request):
    # Guard against path traversal via session_id (mirrors chat.py:60)
    if "/" in session_id or "\\" in session_id or ".." in session_id:
        raise HTTPException(status_code=400, detail="invalid session id")

    conn = request.app.state.sessions_db
    lock = request.app.state.sessions_db_lock
    project_dir = claude_project_dir(settings.CONTEXT_DIR)

    # The single sqlite3.Connection on app.state is NOT threadsafe, so every
    # caller that touches it must acquire the shared write lock — same pattern
    # as routes/chat.py:65.
    try:
        with lock:
            payload = social_post.generate_social_post(session_id, conn, project_dir)
    except social_post.SessionNotFoundError:
        return JSONResponse(
            {"error": f"Session '{session_id}' not found."},
            status_code=404,
        )
    except social_post.NoToolCallsError:
        return JSONResponse(
            {"error": "This session doesn't have enough to show — the agent didn't run any tools."},
            status_code=422,
        )
    except social_post.ExtractionError as e:
        return JSONResponse(
            {"error": f"Couldn't generate the post: {e}"},
            status_code=502,
        )

    return payload
