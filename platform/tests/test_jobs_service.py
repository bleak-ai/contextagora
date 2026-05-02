from dataclasses import dataclass
from pathlib import Path

import pytest

from src.services.jobs import JobScheduler, RunRecord
from src.services.modules.manifest import JobSpec, ModuleManifest


@dataclass
class FakeManifestSource:
    """In-memory replacement for `read_manifest` driven by tests."""
    manifests: dict[str, ModuleManifest]
    loaded: list[str]

    def list_loaded(self) -> list[str]:
        return list(self.loaded)

    def read(self, module: str) -> ModuleManifest:
        return self.manifests[module]


def _make_run(job_id: str, t: float) -> RunRecord:
    return RunRecord(
        job_id=job_id,
        started_at=t,
        ended_at=t + 1,
        exit_code=0,
        stdout="ok",
        stderr="",
    )


def test_tick_fires_job_when_never_run():
    spawned: list[str] = []

    def fake_spawn(job_id, cmd, cwd, env):
        spawned.append(job_id)
        return _make_run(job_id, t=100.0)

    src = FakeManifestSource(
        manifests={
            "linear": ModuleManifest(
                name="linear",
                jobs=[JobSpec(name="cleanup", script="scripts/cleanup.py", every="1h")],
            )
        },
        loaded=["linear"],
    )
    sched = JobScheduler(
        list_loaded=src.list_loaded,
        read_manifest=src.read,
        spawn=fake_spawn,
    )
    sched.tick(now=100.0)
    assert spawned == ["linear/cleanup"]


def test_tick_does_not_fire_until_interval_elapsed():
    fired_at: list[float] = []

    def fake_spawn(job_id, cmd, cwd, env):
        fired_at.append(100.0)
        return _make_run(job_id, t=100.0)

    src = FakeManifestSource(
        manifests={
            "linear": ModuleManifest(
                name="linear",
                jobs=[JobSpec(name="cleanup", script="scripts/cleanup.py", every="1h")],
            )
        },
        loaded=["linear"],
    )
    sched = JobScheduler(src.list_loaded, src.read, fake_spawn)
    sched.tick(now=100.0)
    sched.tick(now=100.0 + 30)
    sched.tick(now=100.0 + 3599)
    assert len(fired_at) == 1
    sched.tick(now=100.0 + 3600)
    assert len(fired_at) == 2


def test_tick_skips_unloaded_modules():
    spawned: list[str] = []

    def fake_spawn(job_id, *_):
        spawned.append(job_id)
        return _make_run(job_id, 0)

    src = FakeManifestSource(
        manifests={
            "slack": ModuleManifest(
                name="slack",
                jobs=[JobSpec(name="poll", script="scripts/poll.py", every="5m")],
            )
        },
        loaded=[],
    )
    sched = JobScheduler(src.list_loaded, src.read, fake_spawn)
    sched.tick(now=0.0)
    assert spawned == []


def test_tick_does_not_double_fire_running_job():
    """If a job is still running when the next tick is due, skip."""
    spawned: list[str] = []

    def fake_spawn(job_id, *_):
        spawned.append(job_id)
        return _make_run(job_id, 0)

    src = FakeManifestSource(
        manifests={
            "linear": ModuleManifest(
                name="linear",
                jobs=[JobSpec(name="cleanup", script="scripts/cleanup.py", every="30s")],
            )
        },
        loaded=["linear"],
    )
    sched = JobScheduler(src.list_loaded, src.read, fake_spawn)
    sched._running.add("linear/cleanup")
    sched.tick(now=0.0)
    assert spawned == []


def test_run_history_capped_at_50():
    src = FakeManifestSource(
        manifests={
            "linear": ModuleManifest(
                name="linear",
                jobs=[JobSpec(name="cleanup", script="scripts/cleanup.py", every="30s")],
            )
        },
        loaded=["linear"],
    )
    sched = JobScheduler(src.list_loaded, src.read, lambda jid, *_: _make_run(jid, 0))

    for i in range(60):
        sched.tick(now=i * 30.0)
    runs = list(sched.runs("linear/cleanup"))
    assert len(runs) == 50


def test_list_jobs_includes_last_run_status():
    src = FakeManifestSource(
        manifests={
            "linear": ModuleManifest(
                name="linear",
                jobs=[JobSpec(name="cleanup", script="scripts/cleanup.py", every="30s")],
            )
        },
        loaded=["linear"],
    )
    sched = JobScheduler(src.list_loaded, src.read, lambda jid, *_: _make_run(jid, 100.0))
    sched.tick(now=100.0)

    jobs = sched.list_jobs()
    assert len(jobs) == 1
    j = jobs[0]
    assert j["module"] == "linear"
    assert j["name"] == "cleanup"
    assert j["every"] == "30s"
    assert j["last_run"]["exit_code"] == 0
    # Frontend's JobRun type requires both — `dataclasses.asdict()` drops
    # @property fields, so list_jobs must enrich them explicitly.
    assert j["last_run"]["succeeded"] is True
    assert "duration_ms" in j["last_run"]


@pytest.mark.asyncio
async def test_trigger_now_returns_before_spawn_completes():
    """Manual trigger must not block the HTTP route on the subprocess."""
    import asyncio
    import threading

    spawn_started = threading.Event()
    release_spawn = threading.Event()
    finished_jids: list[str] = []

    def slow_spawn(jid, cmd, cwd, env):
        spawn_started.set()
        release_spawn.wait(timeout=5)
        finished_jids.append(jid)
        return _make_run(jid, t=200.0)

    src = FakeManifestSource(
        manifests={
            "linear": ModuleManifest(
                name="linear",
                jobs=[JobSpec(name="cleanup", script="scripts/cleanup.py", every="1h")],
            )
        },
        loaded=["linear"],
    )
    sched = JobScheduler(src.list_loaded, src.read, slow_spawn)

    fired = await asyncio.wait_for(sched.trigger_now("linear/cleanup"), timeout=0.5)
    assert fired is True
    assert spawn_started.wait(timeout=1.0)
    assert finished_jids == []
    assert "linear/cleanup" in sched._running
    release_spawn.set()
    for _ in range(50):
        if not sched._bg_tasks:
            break
        await asyncio.sleep(0.05)
    assert finished_jids == ["linear/cleanup"]
    assert "linear/cleanup" not in sched._running


@pytest.mark.asyncio
async def test_trigger_now_skipped_when_already_running():
    import asyncio

    src = FakeManifestSource(
        manifests={
            "linear": ModuleManifest(
                name="linear",
                jobs=[JobSpec(name="cleanup", script="scripts/cleanup.py", every="1h")],
            )
        },
        loaded=["linear"],
    )
    sched = JobScheduler(src.list_loaded, src.read, lambda jid, *_: _make_run(jid, 0))
    sched._running.add("linear/cleanup")
    fired = await sched.trigger_now("linear/cleanup")
    assert fired is False
