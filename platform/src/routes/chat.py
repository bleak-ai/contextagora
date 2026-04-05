import json
import logging
import os
import subprocess
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from src.models import ChatRequest, CreateSessionRequest, RenameSessionRequest
from src.server import CONTEXT_DIR
from src.services.sessions import store

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])


# ── Session CRUD ─────────────────────────────────────────────


@router.get("/sessions")
async def list_sessions():
    """Return all sessions, newest first."""
    return {
        "sessions": [
            {"id": s.id, "name": s.name, "created_at": s.created_at}
            for s in store.list_all()
        ]
    }


@router.post("/sessions")
async def create_session(body: CreateSessionRequest):
    """Create a new chat session."""
    session_id = uuid.uuid4().hex[:12]
    session = store.create(session_id, body.name)
    return {"id": session.id, "name": session.name, "created_at": session.created_at}


@router.patch("/sessions/{session_id}")
async def rename_session(session_id: str, body: RenameSessionRequest):
    """Rename a session."""
    session = store.rename(session_id, body.name)
    if not session:
        raise HTTPException(404, "session not found")
    return {"id": session.id, "name": session.name}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    if not store.delete(session_id):
        raise HTTPException(404, "session not found")
    return {"ok": True}


# ── Chat (scoped to session) ────────────────────────────────


@router.post("/chat")
async def api_chat(body: ChatRequest):
    """Run claude with stream-json output, scoped to a session.

    Lazy-creates the backend session if it doesn't exist (handles
    server restarts where frontend still has the session in localStorage).
    """
    session = store.get(body.session_id)
    if not session:
        session = store.create(body.session_id, "Restored session")

    # Auto-name session from the first prompt if still default
    is_default_name = session.name in ("New chat", "Restored session")
    auto_name = None
    if is_default_name:
        trimmed = body.prompt.strip().split("\n")[0][:60]
        if len(body.prompt.strip()) > 60:
            trimmed += "..."
        session.name = trimmed
        auto_name = trimmed

    def generate():
        # Emit auto-generated name before streaming starts
        if auto_name:
            yield f"event: session_name\ndata: {json.dumps({'name': auto_name})}\n\n"

        env = {
            **os.environ,
            "DISABLE_AUTOUPDATER": "1",
            "CLAUDE_CODE_ENABLE_TELEMETRY": "0",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
            "CLAUDE_CODE_ATTRIBUTION_HEADER": "0",
        }

        cmd = [
            "claude", "-p", body.prompt,
            "--verbose",
            "--output-format", "stream-json",
            "--include-partial-messages",
            "--allowedTools", "Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "Glob(*)", "Grep(*)",
        ]

        # Resume existing Claude session or start fresh
        if session.claude_session_id:
            cmd.extend(["--resume", session.claude_session_id])

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(CONTEXT_DIR),
            env=env,
            text=True,
        )

        seen_tool_ids = set()
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue

            event_type = event.get("type", "")

            if event_type == "system":
                sid = event.get("session_id")
                if sid:
                    session.claude_session_id = sid
                    yield f"event: session\ndata: {json.dumps({'session_id': sid})}\n\n"

            elif event_type == "stream_event":
                inner = event.get("event", {})
                inner_type = inner.get("type", "")

                if inner_type == "content_block_delta":
                    delta = inner.get("delta", {})
                    delta_type = delta.get("type", "")
                    if delta_type == "thinking_delta":
                        yield f"event: thinking\ndata: {json.dumps({'text': delta.get('thinking', '')})}\n\n"
                    elif delta_type == "text_delta":
                        yield f"event: text\ndata: {json.dumps({'text': delta.get('text', '')})}\n\n"
                    elif delta_type == "input_json_delta":
                        yield f"event: tool_input\ndata: {json.dumps({'partial_json': delta.get('partial_json', '')})}\n\n"

            elif event_type == "assistant":
                sid = event.get("session_id")
                if sid:
                    session.claude_session_id = sid

                message = event.get("message", {})
                content = message.get("content", [])
                for block in content:
                    if block.get("type") == "tool_use":
                        tool_id = block.get("id", "")
                        if tool_id not in seen_tool_ids:
                            seen_tool_ids.add(tool_id)
                            yield f"event: tool_use\ndata: {json.dumps({'tool': block.get('name', ''), 'tool_id': tool_id, 'input': block.get('input', {})})}\n\n"

            elif event_type == "user":
                message = event.get("message", {})
                content = message.get("content", [])
                for block in content:
                    if block.get("type") == "tool_result":
                        tool_use_id = block.get("tool_use_id", "")
                        result_content = block.get("content", "")
                        if isinstance(result_content, list):
                            result_content = "\n".join(
                                b.get("text", "") for b in result_content if b.get("type") == "text"
                            )
                        yield f"event: tool_result\ndata: {json.dumps({'tool_id': tool_use_id, 'output': result_content})}\n\n"

            elif event_type == "result":
                yield f"event: done\ndata: {{}}\n\n"

        proc.wait()
        if proc.returncode != 0:
            stderr = proc.stderr.read()
            if stderr:
                yield f"event: error\ndata: {json.dumps({'message': stderr.strip()})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
