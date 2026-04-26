"""Workflow listing and run-creation routes."""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.services import workflows as wf_service

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


class StartRunRequest(BaseModel):
    title: str


@router.get("")
async def api_list_workflows():
    summaries = wf_service.list_workflows()
    return {"workflows": [
        {
            "name": s.name,
            "summary": s.summary,
            "entry_step": s.entry_step,
            "steps": s.steps,
            "in_flight_runs": s.in_flight_runs,
        }
        for s in summaries
    ]}


@router.post("/{workflow}/runs", status_code=201)
async def api_start_run(workflow: str, body: StartRunRequest):
    if not body.title or not body.title.strip():
        return JSONResponse({"error": "title must not be empty"}, status_code=400)
    try:
        info = wf_service.start_run(workflow, body.title)
    except wf_service.WorkflowNotFound as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except wf_service.WorkflowEntryStepMissing as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    return {"run_task_name": info.run_task_name, "path": str(info.path)}
