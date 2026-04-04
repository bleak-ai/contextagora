import json
import os
import subprocess

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from src.models import ChatRequest
from src.server import CONTEXT_DIR

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat")
async def api_chat(body: ChatRequest):
    """Run claude with stream-json output, converting NDJSON to SSE events."""

    def generate():
        env = {
            **os.environ,
            "DISABLE_AUTOUPDATER": "1",
            "CLAUDE_CODE_ENABLE_TELEMETRY": "0",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
            "CLAUDE_CODE_ATTRIBUTION_HEADER": "0",
        }
        proc = subprocess.Popen(
            [
                "claude", "-p", body.prompt,
                "--continue",
                "--verbose",
                "--output-format", "stream-json",
                "--allowedTools", "Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "Glob(*)", "Grep(*)",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(CONTEXT_DIR),
            env=env,
            text=True,
        )
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue

            event_type = event.get("type", "")

            if event_type == "assistant" and "message" in event:
                continue
            elif event_type == "content_block_start":
                block = event.get("content_block", {})
                if block.get("type") == "thinking":
                    yield f"event: thinking\ndata: {json.dumps({'text': block.get('thinking', '')})}\n\n"
                elif block.get("type") == "tool_use":
                    yield f"event: tool_use\ndata: {json.dumps({'tool': block.get('name', ''), 'input': block.get('input', {})})}\n\n"
            elif event_type == "content_block_delta":
                delta = event.get("delta", {})
                if delta.get("type") == "thinking_delta":
                    yield f"event: thinking\ndata: {json.dumps({'text': delta.get('thinking', '')})}\n\n"
                elif delta.get("type") == "text_delta":
                    yield f"event: text\ndata: {json.dumps({'text': delta.get('text', '')})}\n\n"
                elif delta.get("type") == "input_json_delta":
                    yield f"event: tool_input\ndata: {json.dumps({'partial_json': delta.get('partial_json', '')})}\n\n"
            elif event_type == "result":
                text = event.get("result", "")
                if text:
                    yield f"event: text\ndata: {json.dumps({'text': text})}\n\n"
                yield f"event: done\ndata: {{}}\n\n"

        proc.wait()
        if proc.returncode != 0:
            stderr = proc.stderr.read()
            if stderr:
                yield f"event: error\ndata: {json.dumps({'message': stderr.strip()})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
