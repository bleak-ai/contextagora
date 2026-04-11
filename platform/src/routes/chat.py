import json
import logging
import os
import subprocess
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from src.commands import COMMANDS
from src.models import ChatRequest
from src.config import settings
from src.services.claude_sessions import list_sessions

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])

_COMMANDS_BY_NAME = {c.name: c for c in COMMANDS}


def _expand_slash_command(prompt: str) -> str:
    """If prompt starts with /<registered-command>, replace with the
    command's full prompt text, appending any trailing args."""
    if not prompt.startswith("/"):
        return prompt
    head, _, rest = prompt[1:].partition(" ")
    cmd_def = _COMMANDS_BY_NAME.get(head)
    if cmd_def is None:
        return prompt
    if rest.strip():
        return f"{cmd_def.prompt}\n\nUser arguments: {rest.strip()}"
    return cmd_def.prompt


# ── Session listing (read-through to Claude's on-disk transcripts) ──


@router.get("/sessions")
async def api_list_sessions():
    """List all Claude sessions for settings.CONTEXT_DIR, newest first.

    Sessions are read directly from ~/.claude/projects/<encoded-cwd>/*.jsonl.
    There is no server-side session state; this is a pure projection of disk.
    """
    return {"sessions": list_sessions(settings.CONTEXT_DIR)}


@router.post("/chat")
async def api_chat(body: ChatRequest):
    """Run claude with stream-json output.

    Stateless w.r.t. sessions: if `claude_session_id` is provided, resume it;
    otherwise start a fresh Claude session. The new session id is streamed
    back to the client via the `session` SSE event so it can be remembered
    for the next turn.
    """

    def generate():
      try:
        env = {**os.environ}

        # Map simplified LLM config to Claude CLI env vars
        if settings.LLM_API_KEY:
            env.setdefault("ANTHROPIC_AUTH_TOKEN", settings.LLM_API_KEY)
        if settings.LLM_BASE_URL:
            env.setdefault("ANTHROPIC_BASE_URL", settings.LLM_BASE_URL)
        if settings.LLM_MODEL:
            env.setdefault("ANTHROPIC_DEFAULT_OPUS_MODEL", settings.LLM_MODEL)
            env.setdefault("ANTHROPIC_DEFAULT_SONNET_MODEL", settings.LLM_MODEL)
            env.setdefault("ANTHROPIC_DEFAULT_HAIKU_MODEL", settings.LLM_MODEL)

        cmd = [
            "claude", "-p", _expand_slash_command(body.prompt),
            "--verbose",
            "--output-format", "stream-json",
            "--include-partial-messages",
            "--allowedTools", "Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "Glob(*)", "Grep(*)",
        ]

        if body.claude_session_id:
            cmd.extend(["--resume", body.claude_session_id])

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(settings.CONTEXT_DIR),
                env=env,
                text=True,
            )
        except FileNotFoundError:
            yield f"event: error\ndata: {json.dumps({'message': 'claude CLI not found on server'})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"
            return
        except OSError as e:
            yield f"event: error\ndata: {json.dumps({'message': f'Failed to start claude: {e}'})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"
            return

        seen_tool_ids = set()
        non_json_stdout: list[str] = []

        # Per-request tree state. Lives only for the duration of this stream;
        # the frontend treats `tree_navigation` events as a live view, not
        # persisted history.
        tree_accessed: set[str] = set()
        tree_module_counts: dict[str, int] = {}

        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                non_json_stdout.append(line)
                continue

            event_type = event.get("type", "")

            if event_type == "system":
                sid = event.get("session_id")
                if sid:
                    payload = {"session_id": sid}
                    model = event.get("model")
                    if model:
                        payload["model"] = model
                    yield f"event: session\ndata: {json.dumps(payload)}\n\n"

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
                message = event.get("message", {})
                content = message.get("content", [])
                for block in content:
                    if block.get("type") == "tool_use":
                        tool_id = block.get("id", "")
                        tool_name = block.get("name", "")
                        tool_input = block.get("input", {})
                        if tool_id not in seen_tool_ids:
                            seen_tool_ids.add(tool_id)
                            yield f"event: tool_use\ndata: {json.dumps({'tool': tool_name, 'tool_id': tool_id, 'input': tool_input})}\n\n"

                            if tool_name == "Read":
                                file_path = tool_input.get("file_path", "") or tool_input.get("path", "")
                                try:
                                    relative_path = Path(file_path).relative_to(settings.CONTEXT_DIR)
                                except ValueError:
                                    relative_path = None
                                if relative_path is not None:
                                    path_parts = str(relative_path).split("/")
                                    tree_accessed.add(str(relative_path))
                                    if path_parts:
                                        module = path_parts[0]
                                        tree_module_counts[module] = tree_module_counts.get(module, 0) + 1
                                    payload = {
                                        "active_path": path_parts,
                                        "accessed_files": list(tree_accessed),
                                        "module_counts": tree_module_counts,
                                    }
                                    yield f"event: tree_navigation\ndata: {json.dumps(payload)}\n\n"

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
            stderr = (proc.stderr.read() if proc.stderr else "").strip()
            extra = "\n".join(non_json_stdout[-20:]).strip()
            log.error(
                "claude exited rc=%s cmd=%s stderr=%r stdout_tail=%r",
                proc.returncode, cmd, stderr, extra,
            )
            msg = stderr or extra or f"claude exited with code {proc.returncode}"
            yield f"event: error\ndata: {json.dumps({'message': msg, 'returncode': proc.returncode, 'stderr': stderr, 'stdout_tail': extra})}\n\n"
        yield f"event: done\ndata: {{}}\n\n"
      except Exception as e:
        log.exception("chat stream crashed")
        yield f"event: error\ndata: {json.dumps({'message': f'Server error: {e}'})}\n\n"
        yield f"event: done\ndata: {{}}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
