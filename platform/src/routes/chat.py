import json
import logging
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from src.commands import list_commands
from src.models import ChatRequest, SessionModeRequest
from src.config import settings
from src.services.chat import claude, sessions_store
from src.services.chat.claude_sessions import (
    claude_project_dir,
    list_sessions,
    load_session_messages,
)
from src.services.chat.suggestion_parser import SuggestionBuffer
from src.services.chat.transcript_recorder import TranscriptRecorder
from src.services.modules import validator_runtime

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
_CHAT_SYSTEM_PROMPT_PATH = _PROMPTS_DIR / "chat" / "system.md"
try:
    _CHAT_SYSTEM_PROMPT = _CHAT_SYSTEM_PROMPT_PATH.read_text()
except FileNotFoundError as e:
    raise RuntimeError(
        f"chat system prompt missing at {_CHAT_SYSTEM_PROMPT_PATH}; "
        "the server cannot start without it"
    ) from e

_MODE_PROMPT_NORMAL = (
    "[mode: NORMAL — context offloading enabled]\n"
    "You may propose writes to module files when the conversation produces "
    "durable content (a note worth keeping, a finding, a lesson, a new "
    "module). You MUST NOT write silently. Every write goes through the "
    "confirm-before-write protocol below."
)

_MODE_PROMPT_QUICK = (
    "[mode: QUICK — context offloading disabled]\n"
    "You are in read-only mode. Do NOT propose writes. Do NOT promise to "
    "\"save\" or \"remember\" anything beyond this turn. If the user asks "
    "you to save something, briefly remind them they are in Quick mode "
    "and suggest switching to Normal mode if they want offloading."
)

_TOOLS_READ_ONLY = ["Read(*)", "Glob(*)", "Grep(*)", "WebFetch(*)", "WebSearch(*)"]
_TOOLS_NORMAL = _TOOLS_READ_ONLY + ["Bash(*)", "Write(*)", "Edit(*)", "Agent(*)"]


def _build_allowed_tools(mode: str) -> list[str]:
    return list(_TOOLS_NORMAL) if mode == "normal" else list(_TOOLS_READ_ONLY)


def _build_mode_prompt(mode: str) -> str:
    return _MODE_PROMPT_NORMAL if mode == "normal" else _MODE_PROMPT_QUICK


def _build_system_prompt(mode: str) -> str:
    return _CHAT_SYSTEM_PROMPT.replace("{mode}", _build_mode_prompt(mode))


def _module_slug_for_path(path: Path, modules_repo: Path) -> str | None:
    """Return the module slug for a write target, or None if outside the repo."""
    try:
        rel = path.resolve().relative_to(modules_repo.resolve())
    except ValueError:
        return None
    parts = rel.parts
    if not parts:
        return None
    return parts[0]


def _expand_slash_command(prompt: str) -> str:
    """If prompt starts with /<registered-command>, replace with the
    command's full prompt text, appending any trailing args.

    The command set is recomputed each call so auto-registered workflow
    commands (added/removed when modules change on disk) are always seen.
    """
    if not prompt.startswith("/"):
        return prompt
    head, _, rest = prompt[1:].partition(" ")
    commands_by_name = {c.name: c for c in list_commands()}
    cmd_def = commands_by_name.get(head)
    if cmd_def is None:
        return prompt
    if rest.strip():
        return f"{cmd_def.prompt}\n\nUser arguments: {rest.strip()}"
    return cmd_def.prompt


@router.get("/sessions")
async def api_list_sessions():
    """List all Claude sessions for settings.CONTEXT_DIR, newest first.

    Sessions are read directly from ~/.claude/projects/<encoded-cwd>/*.jsonl.
    There is no server-side session state; this is a pure projection of disk.
    """
    return {"sessions": list_sessions(settings.CONTEXT_DIR)}


@router.get("/sessions/{session_id}/messages")
async def api_session_messages(session_id: str, request: Request):
    """Return the full transcript for a session, in frontend ChatMessage shape.

    Lets any client (e.g., a second computer) hydrate a session it didn't
    originate. Rejects ids containing path separators so we can't escape the
    project dir.
    """
    if "/" in session_id or "\\" in session_id or ".." in session_id:
        raise HTTPException(status_code=400, detail="invalid session id")
    proj_dir = claude_project_dir(settings.CONTEXT_DIR)
    jsonl = proj_dir / f"{session_id}.jsonl"
    db = request.app.state.sessions_db
    lock = request.app.state.sessions_db_lock
    # Share the write lock: the single sqlite3.Connection lives on app.state,
    # and Python's Connection wrapper holds non-threadsafe state even when
    # the underlying SQLite build is threadsafety=3.
    with lock:
        msgs = load_session_messages(session_id, db, proj_dir)
    # 404 only when neither source knows about this session. Returns an empty
    # list for sessions that exist on either side but have no consumable
    # messages yet (in-flight first turn, or JSONL with only skipped events).
    if not msgs and not jsonl.is_file():
        raise HTTPException(status_code=404, detail="session not found")
    return {"messages": msgs}


def _persist(conn, lock, recorder: TranscriptRecorder) -> None:
    """Write the recorder's [user, assistant] pair into the sessions DB.

    Appends after any existing messages for the same session (resumed turns).
    No-ops if the stream never produced a session_id (e.g., the subprocess
    crashed before Claude emitted its `system` event).

    The lock serializes both the read-then-write seq computation (otherwise
    two concurrent persists for the same session would pick the same
    base_seq and the second `INSERT OR REPLACE` would silently overwrite
    the first) and the shared SQLite connection itself (the single
    `check_same_thread=False` connection is not safe for concurrent use
    across threads).
    """
    if recorder.session_id is None:
        return
    with lock:
        base_seq = conn.execute(
            "SELECT COALESCE(MAX(seq), -1) FROM messages WHERE session_id = ?",
            (recorder.session_id,),
        ).fetchone()[0] + 1
        now = int(time.time() * 1000)
        for i, msg in enumerate(recorder.messages):
            sessions_store.save_message(
                conn, recorder.session_id,
                seq=base_seq + i, message=msg, created_at_ms=now,
            )


@router.post("/chat")
async def api_chat(body: ChatRequest, request: Request):
    """Run claude with stream-json output.

    Stateless w.r.t. sessions: if `claude_session_id` is provided, resume it;
    otherwise start a fresh Claude session. The new session id is streamed
    back to the client via the `session` SSE event so it can be remembered
    for the next turn.

    Side-effect: every SSE event is also fed to an in-memory TranscriptRecorder
    and persisted to the sessions DB when the stream ends, so the session's
    transcript survives container restarts (see docs/superpowers/plans/
    2026-04-21-durable-session-storage.md).
    """
    db = request.app.state.sessions_db
    lock = request.app.state.sessions_db_lock
    recorder = TranscriptRecorder()
    # Record what the user typed (e.g., "/command args"), not the expanded
    # prompt template, so replay matches what the UI shows.
    recorder.begin_turn(body.prompt)

    def generate():
      persisted = False  # guards against the dual `done` emission paths below

      def _persist_once():
          nonlocal persisted
          if persisted:
              return
          persisted = True
          recorder.finalize()
          _persist(db, lock, recorder)

      try:
        try:
            proc = claude.stream(
                prompt=_expand_slash_command(body.prompt),
                session_id=body.claude_session_id,
                cwd=settings.CONTEXT_DIR,
                allowed_tools=_build_allowed_tools(body.mode),
                append_system_prompt=_build_system_prompt(body.mode),
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

        touched_modules: set[str] = set()

        suggestion_buf = SuggestionBuffer()

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
                    recorder.set_session_id(sid)
                    with lock:
                        sessions_store.set_session_mode(db, sid, body.mode)
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
                        recorder.on_thinking(delta.get("thinking", ""))
                        yield f"event: thinking\ndata: {json.dumps({'text': delta.get('thinking', '')})}\n\n"
                    elif delta_type == "text_delta":
                        raw = delta.get("text", "")
                        visible, suggestions = suggestion_buf.feed(raw)
                        if visible:
                            recorder.on_text(visible)
                            yield f"event: text\ndata: {json.dumps({'text': visible})}\n\n"
                        for sug in suggestions:
                            yield f"event: suggestion\ndata: {json.dumps({'prompt': sug})}\n\n"
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
                            recorder.on_tool_use(tool_id, tool_name, tool_input)
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

                            if tool_name in ("Write", "Edit"):
                                file_path = tool_input.get("file_path", "")
                                if file_path:
                                    slug = _module_slug_for_path(Path(file_path), settings.MODULES_REPO_DIR)
                                    if slug:
                                        touched_modules.add(slug)
                            elif tool_name == "Bash":
                                # Bash can write via redirection; the path is opaque. We do not
                                # attempt to parse Bash invocations — Task 6's validator will catch
                                # any module that the agent wrote into via Bash if its path matches
                                # known modules. For this accumulator, Bash writes are a known gap
                                # accepted by the spec (validation still runs on every known module
                                # if needed; for now we only validate modules we observed).
                                pass

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
                        recorder.on_tool_result(tool_use_id, result_content)
                        yield f"event: tool_result\ndata: {json.dumps({'tool_id': tool_use_id, 'output': result_content})}\n\n"

            elif event_type == "result":
                yield f"event: done\ndata: {{}}\n\n"

        tail = suggestion_buf.finalize()
        if tail:
            # Feed the tail into the recorder before yielding so the
            # persisted transcript includes trailing suggestion-buffer text.
            recorder.on_text(tail)
            yield f"event: text\ndata: {json.dumps({'text': tail})}\n\n"

        proc.wait()
        if proc.returncode != 0:
            stderr = (proc.stderr.read() if proc.stderr else "").strip()
            extra = "\n".join(non_json_stdout[-20:]).strip()
            log.error(
                "claude exited rc=%s args=%s stderr=%r stdout_tail=%r",
                proc.returncode, proc.args, stderr, extra,
            )
            msg = stderr or extra or f"claude exited with code {proc.returncode}"
            yield f"event: error\ndata: {json.dumps({'message': msg, 'returncode': proc.returncode, 'stderr': stderr, 'stdout_tail': extra})}\n\n"

        # Validate every module the turn touched. Errors are surfaced as a
        # `validation_error` SSE event the frontend renders; the agent will
        # see them on its next turn (Claude Code includes prior turn output
        # in context) and can self-correct. We swallow validator crashes so
        # a bug in the validator never breaks an otherwise successful chat
        # response.
        for slug in sorted(touched_modules):
            try:
                report = validator_runtime.validate_module(slug)
            except Exception as e:
                log.warning("validator crashed for %s: %s", slug, e)
                continue
            if report.errors:
                payload = {"module": slug, "errors": report.errors}
                yield f"event: validation_error\ndata: {json.dumps(payload)}\n\n"

        yield f"event: done\ndata: {{}}\n\n"
      except Exception as e:
        log.exception("chat stream crashed")
        yield f"event: error\ndata: {json.dumps({'message': f'Server error: {e}'})}\n\n"
        yield f"event: done\ndata: {{}}\n\n"
      finally:
        # Runs on every exit path: normal completion, error yield, and
        # GeneratorExit raised when the client drops the SSE connection
        # (inherits from BaseException, so `except Exception` above does
        # NOT catch it). Without the proc cleanup below, abandoned streams
        # leak claude subprocesses (each ~100 MB + 2 pipe FDs) and burn
        # tokens until the model finishes.
        proc_local = locals().get("proc")
        if proc_local is not None:
            try:
                if proc_local.poll() is None:
                    proc_local.terminate()
                    try:
                        proc_local.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        proc_local.kill()
                        proc_local.wait(timeout=2)
            except Exception:
                log.exception("failed to terminate claude subprocess")
            for stream in (proc_local.stdout, proc_local.stderr):
                if stream is not None:
                    try:
                        stream.close()
                    except Exception:
                        pass
        _persist_once()

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/sessions/{session_id}/mode")
async def api_get_session_mode(session_id: str, request: Request):
    db = request.app.state.sessions_db
    lock = request.app.state.sessions_db_lock
    with lock:
        mode = sessions_store.get_session_mode(db, session_id)
    return {"mode": mode}


@router.put("/sessions/{session_id}/mode")
async def api_set_session_mode(
    session_id: str,
    body: SessionModeRequest,
    request: Request,
):
    if "/" in session_id or "\\" in session_id or ".." in session_id:
        raise HTTPException(status_code=400, detail="invalid session id")
    db = request.app.state.sessions_db
    lock = request.app.state.sessions_db_lock
    with lock:
        sessions_store.set_session_mode(db, session_id, body.mode)
    return {"mode": body.mode}
