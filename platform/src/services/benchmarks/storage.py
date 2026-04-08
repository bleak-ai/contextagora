from __future__ import annotations

from pathlib import Path

RUNS_DIR = Path(__file__).resolve().parents[2] / "benchmarks" / "runs"


def _task_dir(task_id: str) -> Path:
    d = RUNS_DIR / task_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def write_run(task_id: str, run_id: str, markdown: str) -> Path:
    p = _task_dir(task_id) / f"{run_id}.md"
    p.write_text(markdown)
    return p


def list_runs(task_id: str) -> list[dict]:
    d = RUNS_DIR / task_id
    if not d.is_dir():
        return []
    out = []
    for f in sorted(d.glob("*.md"), reverse=True):
        out.append({"id": f.stem, "mtime": f.stat().st_mtime})
    return out


def read_run(task_id: str, run_id: str) -> str | None:
    p = RUNS_DIR / task_id / f"{run_id}.md"
    return p.read_text() if p.is_file() else None


def delete_run(task_id: str, run_id: str) -> bool:
    p = RUNS_DIR / task_id / f"{run_id}.md"
    if not p.is_file():
        return False
    p.unlink()
    return True
