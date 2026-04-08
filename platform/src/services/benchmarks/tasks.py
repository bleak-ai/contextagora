from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

TASKS_DIR = Path(__file__).resolve().parents[2] / "benchmarks" / "tasks"


@dataclass(frozen=True)
class Task:
    id: str
    prompt: str
    judge_prompt: str
    description: str = ""


def load_tasks() -> list[Task]:
    if not TASKS_DIR.is_dir():
        return []
    tasks: list[Task] = []
    for f in sorted(TASKS_DIR.glob("*.yaml")):
        data = yaml.safe_load(f.read_text()) or {}
        tasks.append(Task(
            id=data.get("id") or f.stem,
            prompt=data.get("prompt", ""),
            judge_prompt=data.get("judge_prompt", ""),
            description=data.get("description", ""),
        ))
    return tasks


def get_task(task_id: str) -> Task | None:
    for t in load_tasks():
        if t.id == task_id:
            return t
    return None


_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def is_valid_id(task_id: str) -> bool:
    return bool(_ID_RE.match(task_id))


def write_task(task: Task) -> Path:
    if not is_valid_id(task.id):
        raise ValueError(f"invalid task id: {task.id!r}")
    TASKS_DIR.mkdir(parents=True, exist_ok=True)
    path = TASKS_DIR / f"{task.id}.yaml"
    path.write_text(yaml.safe_dump(
        {
            "id": task.id,
            "description": task.description,
            "prompt": task.prompt,
            "judge_prompt": task.judge_prompt,
        },
        sort_keys=False,
        default_flow_style=False,
    ))
    return path


def delete_task(task_id: str) -> bool:
    if not is_valid_id(task_id):
        return False
    path = TASKS_DIR / f"{task_id}.yaml"
    if not path.is_file():
        return False
    path.unlink()
    return True
