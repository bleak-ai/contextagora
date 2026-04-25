from dataclasses import asdict

from fastapi.testclient import TestClient

from src.server import app
from src.services.jobs import RunRecord, scheduler


def test_list_jobs_empty(monkeypatch):
    monkeypatch.setattr(scheduler, "list_jobs", lambda: [])
    client = TestClient(app)
    r = client.get("/api/jobs")
    assert r.status_code == 200
    assert r.json() == []


def test_list_jobs_returns_scheduler_state(monkeypatch):
    monkeypatch.setattr(scheduler, "list_jobs", lambda: [
        {"module": "linear", "name": "cleanup", "id": "linear/cleanup",
         "script": "scripts/cleanup.py", "every": "1h", "every_seconds": 3600,
         "running": False, "last_run": None}
    ])
    client = TestClient(app)
    r = client.get("/api/jobs")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["id"] == "linear/cleanup"


def test_get_runs_returns_history(monkeypatch):
    rec = RunRecord(
        job_id="linear/cleanup", started_at=100.0, ended_at=101.0,
        exit_code=0, stdout="ok", stderr="",
    )
    monkeypatch.setattr(scheduler, "runs", lambda jid: [rec] if jid == "linear/cleanup" else [])
    client = TestClient(app)
    r = client.get("/api/jobs/linear/cleanup/runs")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["exit_code"] == 0
    assert body[0]["duration_ms"] == 1000


def test_trigger_returns_fired(monkeypatch):
    async def fake_trigger(jid):
        return True
    monkeypatch.setattr(scheduler, "trigger_now", fake_trigger)
    client = TestClient(app)
    r = client.post("/api/jobs/linear/cleanup/run")
    assert r.status_code == 200
    assert r.json() == {"fired": True}


def test_trigger_404_for_unknown(monkeypatch):
    async def fake_trigger(jid):
        return False
    monkeypatch.setattr(scheduler, "trigger_now", fake_trigger)
    monkeypatch.setattr(scheduler, "list_jobs", lambda: [])
    client = TestClient(app)
    r = client.post("/api/jobs/foo/bar/run")
    assert r.status_code == 404


def test_trigger_does_not_block_route(monkeypatch):
    """The route must return promptly even if the subprocess is slow.
    trigger_now is async + dispatches to a background task, so the route's
    `await` returns as soon as the task is scheduled.
    """
    import time as _time

    call_started_at: list[float] = []
    call_returned_at: list[float] = []

    async def fake_trigger(jid):
        call_started_at.append(_time.time())
        return True

    monkeypatch.setattr(scheduler, "trigger_now", fake_trigger)
    client = TestClient(app)
    t0 = _time.time()
    r = client.post("/api/jobs/linear/cleanup/run")
    call_returned_at.append(_time.time())
    assert r.status_code == 200
    assert (call_returned_at[0] - t0) < 1.0
