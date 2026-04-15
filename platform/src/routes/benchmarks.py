from __future__ import annotations

import json
import re

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import PlainTextResponse, StreamingResponse

from src.models import BenchmarkTaskBody as TaskBody, BenchmarkTaskUpdateBody as TaskUpdateBody
from src.services.benchmarks import storage
from src.services.benchmarks.runner import run_task_stream

from src.services.benchmarks.tasks import (
    Task,
    TASKS_DIR,
    delete_task,
    get_task,
    is_valid_id,
    load_tasks,
    write_task,
)

_RUN_ID_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$")
_FRIENDLY_RE = re.compile(r"(\d{4}-\d{2}-\d{2})[_T](\d{2})h(\d{2})")


def _friendly_filename(task_id: str, run_id: str) -> str:
    # run_id is like 2026-04-08T14-23-05Z → 2026-04-08_14h23
    m = re.match(r"^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-\d{2}Z$", run_id)
    if not m:
        return f"{task_id}-{run_id}.md"
    date, hh, mm = m.groups()
    return f"{task_id}_{date}_{hh}h{mm}.md"


def _parse_uploaded_stem(task_id: str, stem: str) -> str | None:
    """Return the canonical run_id (strict timestamp) from an uploaded
    filename stem, or None if it can't be parsed."""
    if _RUN_ID_RE.match(stem):
        return stem
    prefix = f"{task_id}-"
    if stem.startswith(prefix):
        rest = stem[len(prefix):]
        if _RUN_ID_RE.match(rest):
            return rest
    # Friendly form: <task>_<YYYY-MM-DD>_<HH>h<MM>(.md)
    if stem.startswith(f"{task_id}_"):
        rest = stem[len(task_id) + 1:]
        m = _FRIENDLY_RE.match(rest)
        if m:
            date, hh, mm = m.groups()
            return f"{date}T{hh}-{mm}-00Z"
    return None

router = APIRouter(prefix="/api/benchmarks", tags=["benchmarks"])


@router.get("/tasks")
def api_list_tasks():
    return {
        "tasks": [
            {
                "id": t.id,
                "description": t.description,
                "prompt": t.prompt,
                "judge_prompt": t.judge_prompt,
            }
            for t in load_tasks()
        ]
    }


@router.post("/tasks")
def api_create_task(body: TaskBody):
    if not is_valid_id(body.id):
        raise HTTPException(400, "id must match ^[a-z0-9][a-z0-9_-]{0,63}$")
    if get_task(body.id) is not None:
        raise HTTPException(409, f"task {body.id} already exists")
    write_task(Task(
        id=body.id,
        description=body.description,
        prompt=body.prompt,
        judge_prompt=body.judge_prompt,
    ))
    return {"ok": True, "id": body.id}


@router.put("/tasks/{task_id}")
def api_update_task(task_id: str, body: TaskUpdateBody):
    if get_task(task_id) is None:
        raise HTTPException(404, f"task {task_id} not found")
    write_task(Task(
        id=task_id,
        description=body.description,
        prompt=body.prompt,
        judge_prompt=body.judge_prompt,
    ))
    return {"ok": True, "id": task_id}


@router.delete("/tasks/{task_id}")
def api_delete_task(task_id: str):
    if not delete_task(task_id):
        raise HTTPException(404, f"task {task_id} not found")
    return {"ok": True}


@router.get("/tasks/{task_id}/download")
def api_download_task(task_id: str):
    if not is_valid_id(task_id):
        raise HTTPException(400, "invalid task id")
    path = TASKS_DIR / f"{task_id}.yaml"
    if not path.is_file():
        raise HTTPException(404, "task not found")
    return PlainTextResponse(
        path.read_text(),
        media_type="application/x-yaml",
        headers={"Content-Disposition": f'attachment; filename="{task_id}.yaml"'},
    )


@router.post("/tasks/upload")
async def api_upload_task(file: UploadFile = File(...)):
    raw_name = (file.filename or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if not (raw_name.endswith(".yaml") or raw_name.endswith(".yml")):
        raise HTTPException(400, "filename must end in .yaml")
    stem = raw_name.rsplit(".", 1)[0]
    if not is_valid_id(stem):
        raise HTTPException(400, "filename stem must be a valid task id")
    if get_task(stem) is not None:
        raise HTTPException(409, f"task {stem} already exists")
    content = (await file.read()).decode("utf-8", errors="replace")
    import yaml as _yaml
    try:
        data = _yaml.safe_load(content) or {}
    except _yaml.YAMLError as e:
        raise HTTPException(400, f"invalid yaml: {e}")
    if not isinstance(data, dict) or "prompt" not in data or "judge_prompt" not in data:
        raise HTTPException(400, "yaml must contain prompt and judge_prompt")
    write_task(Task(
        id=stem,
        description=data.get("description", ""),
        prompt=data.get("prompt", ""),
        judge_prompt=data.get("judge_prompt", ""),
    ))
    return {"ok": True, "id": stem}


@router.get("/tasks/{task_id}/runs")
def api_list_runs(task_id: str):
    return {"runs": storage.list_runs(task_id)}


@router.get("/tasks/{task_id}/runs/{run_id}")
def api_get_run(task_id: str, run_id: str):
    md = storage.read_run(task_id, run_id)
    if md is None:
        raise HTTPException(404, "run not found")
    return {"markdown": md}


@router.get("/tasks/{task_id}/runs/{run_id}/download")
def api_download_run(task_id: str, run_id: str):
    md = storage.read_run(task_id, run_id)
    if md is None:
        raise HTTPException(404, "run not found")
    filename = _friendly_filename(task_id, run_id)
    return PlainTextResponse(
        md,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/tasks/{task_id}/runs/{run_id}")
def api_delete_run(task_id: str, run_id: str):
    if not _RUN_ID_RE.match(run_id):
        raise HTTPException(400, "invalid run_id")
    if not storage.delete_run(task_id, run_id):
        raise HTTPException(404, "run not found")
    return {"ok": True}


@router.post("/tasks/{task_id}/runs/upload")
async def api_upload_run(task_id: str, file: UploadFile = File(...)):
    """Import a previously-exported run markdown file. The run_id is taken
    from the filename stem (must match the ISO timestamp format)."""
    raw_name = (file.filename or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    stem = raw_name[:-3] if raw_name.endswith(".md") else raw_name
    run_id = _parse_uploaded_stem(task_id, stem)
    if run_id is None:
        raise HTTPException(
            400,
            "filename must be <task>_<YYYY-MM-DD>_<HH>h<MM>.md "
            "or <task>-<YYYY-MM-DDTHH-MM-SSZ>.md",
        )
    content = (await file.read()).decode("utf-8", errors="replace")
    if storage.read_run(task_id, run_id) is not None:
        raise HTTPException(409, f"run {run_id} already exists")
    storage.write_run(task_id, run_id, content)
    return {"ok": True, "task_id": task_id, "run_id": run_id}


@router.post("/tasks/{task_id}/run")
def api_run_task(task_id: str):
    """Stream benchmark progress as SSE. Yields `progress` events as the
    agent makes tool calls, then a final `done` (with run_id) or `error`."""
    task = get_task(task_id)
    if task is None:
        raise HTTPException(404, f"task {task_id} not found")

    def generate():
        try:
            for event in run_task_stream(task):
                ev_type = event.pop("type", "message")
                yield f"event: {ev_type}\ndata: {json.dumps(event)}\n\n"
        except Exception as e:  # noqa: BLE001
            yield f"event: error\ndata: {json.dumps({'error': f'server error: {e}'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
