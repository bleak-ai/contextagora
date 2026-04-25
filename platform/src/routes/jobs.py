"""Read-only listing + manual trigger for module-declared cron jobs."""
from dataclasses import asdict

from fastapi import APIRouter, HTTPException

from src.services.jobs import scheduler

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
def list_jobs():
    return scheduler.list_jobs()


@router.get("/{module}/{name}/runs")
def get_runs(module: str, name: str):
    job_id = f"{module}/{name}"
    return [
        {**asdict(r), "duration_ms": r.duration_ms, "succeeded": r.succeeded}
        for r in scheduler.runs(job_id)
    ]


@router.post("/{module}/{name}/run")
async def trigger(module: str, name: str):
    """Schedule a job to run now. Returns as soon as the bg task is dispatched.

    `scheduler.trigger_now` is async + non-blocking — the actual subprocess
    runs in a background asyncio task via asyncio.to_thread, so the HTTP
    response is fast regardless of how long the script takes.
    """
    job_id = f"{module}/{name}"
    fired = await scheduler.trigger_now(job_id)
    if not fired:
        known = any(j["id"] == job_id for j in scheduler.list_jobs())
        if not known:
            raise HTTPException(status_code=404, detail=f"job {job_id} not found")
    return {"fired": fired}
