import json
import logging
import os
import subprocess

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from src.models import ChatRequest
from src.server import CONTEXT_DIR

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])

# Track the current Claude session ID so --continue resumes the right one
_session_id: str | None = None


@router.get("/chat/session")
async def api_chat_session():
    """Return the current session status."""
    return {"session_id": _session_id}


@router.post("/chat/reset")
async def api_chat_reset():
    """Reset the Claude conversation session."""
    global _session_id
    _session_id = None
    return {"ok": True}


@router.post("/chat")
async def api_chat(body: ChatRequest):
    """Run claude with stream-json output, converting NDJSON to SSE events."""
    global _session_id

    def generate():
        global _session_id

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

        # Resume existing session or start fresh
        if _session_id:
            cmd.extend(["--resume", _session_id])

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
                # Capture session ID from init event
                sid = event.get("session_id")
                if sid:
                    _session_id = sid
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
                # Capture session ID from assistant events too
                sid = event.get("session_id")
                if sid:
                    _session_id = sid

                # Use assistant snapshots for tool_use (has complete input)
                message = event.get("message", {})
                content = message.get("content", [])
                for block in content:
                    if block.get("type") == "tool_use":
                        tool_id = block.get("id", "")
                        if tool_id not in seen_tool_ids:
                            seen_tool_ids.add(tool_id)
                            yield f"event: tool_use\ndata: {json.dumps({'tool': block.get('name', ''), 'tool_id': tool_id, 'input': block.get('input', {})})}\n\n"

            elif event_type == "user":
                # Tool results come as user messages
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
