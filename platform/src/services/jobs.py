"""In-process scheduler for module-declared cron jobs.

State (last run times, run history, in-flight set) is kept in memory
and is intentionally lost on process restart. See
docs/superpowers/plans/2026-04-25-module-cron-jobs.md for design.
"""
from __future__ import annotations

import asyncio
import logging
import subprocess
import time
from collections import deque
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from src.config import settings
from src.services.modules.manifest import ModuleManifest

log = logging.getLogger(__name__)

TICK_SECONDS = 30
HISTORY_PER_JOB = 50
STDOUT_TAIL_BYTES = 8 * 1024  # 8 KB tail kept per stream


@dataclass
class RunRecord:
    job_id: str
    started_at: float
    ended_at: float
    exit_code: int
    stdout: str
    stderr: str

    @property
    def duration_ms(self) -> int:
        return int((self.ended_at - self.started_at) * 1000)

    @property
    def succeeded(self) -> bool:
        return self.exit_code == 0


SpawnFn = Callable[[str, list[str], Path, dict[str, str]], RunRecord]
ListLoadedFn = Callable[[], list[str]]
ReadManifestFn = Callable[[str], ModuleManifest]


def _default_list_loaded() -> list[str]:
    from src.services.modules.workspace import list_loaded_modules
    return list_loaded_modules(settings.CONTEXT_DIR)


def _default_read_manifest(module: str) -> ModuleManifest:
    from src.services.modules.manifest import read_manifest
    return read_manifest(settings.CONTEXT_DIR / module)


def _default_spawn(job_id: str, cmd: list[str], cwd: Path, env: dict[str, str]) -> RunRecord:
    """Run a job synchronously and return its record. Used inside asyncio.to_thread."""
    started = time.time()
    try:
        proc = subprocess.run(
            cmd, cwd=str(cwd), env=env,
            capture_output=True, text=True,
        )
        ended = time.time()
        return RunRecord(
            job_id=job_id,
            started_at=started,
            ended_at=ended,
            exit_code=proc.returncode,
            stdout=proc.stdout[-STDOUT_TAIL_BYTES:],
            stderr=proc.stderr[-STDOUT_TAIL_BYTES:],
        )
    except Exception as exc:
        ended = time.time()
        log.exception("Job %s spawn failed", job_id)
        return RunRecord(
            job_id=job_id, started_at=started, ended_at=ended,
            exit_code=-1, stdout="", stderr=f"spawn error: {exc}",
        )


def build_job_command(module: str, script: str) -> list[str]:
    """The exact argv used to run a job. Matches _conventions.md §8 — absolute path
    under MODULES_REPO_DIR. Kept as a function so tests can assert it.
    """
    abs_script = settings.MODULES_REPO_DIR / module / script
    return ["varlock", "run", "--", "uv", "run", "python", str(abs_script)]


def build_job_env() -> dict[str, str]:
    """Env for job subprocesses. Mirrors services.claude.build_env (telemetry off)."""
    from src.services.chat.claude import build_env
    return build_env()


class JobScheduler:
    def __init__(
        self,
        list_loaded: ListLoadedFn = _default_list_loaded,
        read_manifest: ReadManifestFn = _default_read_manifest,
        spawn: SpawnFn = _default_spawn,
    ) -> None:
        self._list_loaded = list_loaded
        self._read_manifest = read_manifest
        self._spawn = spawn
        self._last_run: dict[str, float] = {}
        self._runs: dict[str, deque[RunRecord]] = {}
        self._running: set[str] = set()
        self._task: asyncio.Task | None = None
        self._stopping = asyncio.Event()
        self._bg_tasks: set[asyncio.Task] = set()

    # ---- query API ----

    def list_jobs(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for module, spec in self._iter_loaded_jobs():
            jid = f"{module}/{spec.name}"
            history = self._runs.get(jid)
            last = history[-1] if history else None
            out.append({
                "module": module,
                "name": spec.name,
                "id": jid,
                "script": spec.script,
                "every": spec.every,
                "every_seconds": spec.every_seconds,
                "running": jid in self._running,
                "last_run": (
                    {**asdict(last), "duration_ms": last.duration_ms, "succeeded": last.succeeded}
                    if last else None
                ),
            })
        return out

    def runs(self, job_id: str) -> Iterable[RunRecord]:
        return list(self._runs.get(job_id, ()))

    # ---- core tick ----

    def tick(self, now: float | None = None) -> list[str]:
        """Synchronous tick — fires due jobs via self._spawn. Returns fired job_ids."""
        now = time.time() if now is None else now
        fired: list[str] = []
        for module, spec in self._iter_loaded_jobs():
            jid = f"{module}/{spec.name}"
            if jid in self._running:
                log.debug("Skipping %s — still running", jid)
                continue
            last = self._last_run.get(jid)
            if last is not None and (now - last) < spec.every_seconds:
                continue
            self._fire(jid, module, spec, now)
            fired.append(jid)
        return fired

    async def trigger_now(self, job_id: str) -> bool:
        """Schedule a job to run now in the background. Returns True if scheduled."""
        for module, spec in self._iter_loaded_jobs():
            if f"{module}/{spec.name}" == job_id:
                if job_id in self._running:
                    return False
                self._running.add(job_id)
                self._last_run[job_id] = time.time()
                task = asyncio.create_task(self._fire_async(job_id, module, spec))
                self._bg_tasks.add(task)
                task.add_done_callback(self._bg_tasks.discard)
                await asyncio.sleep(0)  # let _fire_async hit its to_thread before returning
                return True
        return False

    async def _fire_async(self, jid: str, module: str, spec) -> None:
        """Background path used by trigger_now — runs spawn off the event loop."""
        cmd = build_job_command(module, spec.script)
        env = build_job_env()
        try:
            record = await asyncio.to_thread(
                self._spawn, jid, cmd, settings.CONTEXT_DIR, env
            )
        finally:
            self._running.discard(jid)
        history = self._runs.setdefault(jid, deque(maxlen=HISTORY_PER_JOB))
        history.append(record)

    # ---- internals ----

    def _iter_loaded_jobs(self):
        for module in self._list_loaded():
            try:
                manifest = self._read_manifest(module)
            except (OSError, ValueError):
                continue
            for spec in manifest.jobs:
                yield module, spec

    def _fire(self, jid: str, module: str, spec, now: float) -> None:
        self._running.add(jid)
        self._last_run[jid] = now
        try:
            cmd = build_job_command(module, spec.script)
            env = build_job_env()
            record = self._spawn(jid, cmd, settings.CONTEXT_DIR, env)
        finally:
            self._running.discard(jid)
        history = self._runs.setdefault(jid, deque(maxlen=HISTORY_PER_JOB))
        history.append(record)

    # ---- async lifecycle ----

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stopping.clear()
        self._task = asyncio.create_task(self._loop(), name="jobs-scheduler")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._stopping.set()
        self._task.cancel()
        try:
            await self._task
        except (asyncio.CancelledError, Exception):
            pass
        self._task = None

    async def _loop(self) -> None:
        log.info("JobScheduler started; tick=%ss", TICK_SECONDS)
        try:
            while not self._stopping.is_set():
                try:
                    await asyncio.to_thread(self.tick)
                except Exception:
                    log.exception("Scheduler tick raised")
                try:
                    await asyncio.wait_for(self._stopping.wait(), timeout=TICK_SECONDS)
                except asyncio.TimeoutError:
                    pass
        finally:
            log.info("JobScheduler stopped")


# Module-level singleton. Imported by routes.
scheduler = JobScheduler()
