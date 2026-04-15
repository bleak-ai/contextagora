"""Local git clone service.

Wraps every git operation used by the platform so that module CRUD reads
and writes from a local checkout instead of the GitHub API.

Config is read from src.config.settings; every public function
accepts overrides for testability.
"""
import logging
import os
import re
import shutil
import subprocess
from pathlib import Path

from src.config import settings

log = logging.getLogger(__name__)

# Regex to strip "x-access-token:XXXX@" from URLs before logging
_TOKEN_IN_URL = re.compile(r"(https://)x-access-token:[^@]*@")


class GitRepoError(RuntimeError):
    pass


def _scrub(text: str) -> str:
    return _TOKEN_IN_URL.sub(r"\1<token>@", text)


def _run(args: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    proc = subprocess.run(
        args,
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        msg = _scrub(proc.stderr.strip() or proc.stdout.strip() or "git failed")
        raise GitRepoError(f"git {args[1] if len(args) > 1 else ''} failed: {msg}")
    return proc


def _default_remote_url() -> str:
    if not (settings.GH_OWNER and settings.GH_REPO):
        raise GitRepoError("GH_OWNER and GH_REPO must be set")
    if settings.GH_TOKEN:
        return f"https://x-access-token:{settings.GH_TOKEN}@github.com/{settings.GH_OWNER}/{settings.GH_REPO}.git"
    return f"https://github.com/{settings.GH_OWNER}/{settings.GH_REPO}.git"


def _resolve_clone(clone_dir: Path | None) -> Path:
    return Path(clone_dir) if clone_dir else settings.MODULES_REPO_DIR


def init_repo(
    *,
    remote_url: str | None = None,
    branch: str | None = None,
    clone_dir: Path | None = None,
) -> None:
    """Delete any existing clone and perform a fresh single-branch clone."""
    url = remote_url or _default_remote_url()
    br = branch or settings.GH_BRANCH
    target = Path(clone_dir) if clone_dir else settings.MODULES_REPO_DIR

    # rmtree safety guard: only remove `target` if it looks like a previous
    # clone (contains a .git subdir) OR it's the default path. Protects
    # against wiping unrelated directories if MODULES_REPO_DIR is misconfigured
    # (e.g. typo, stale env var, bad Docker mount).
    default_dir = (Path(__file__).resolve().parent.parent / "modules-repo").resolve()
    if target.exists():
        resolved = target.resolve()
        is_default = resolved == default_dir
        looks_like_clone = (resolved / ".git").is_dir()
        if not (is_default or looks_like_clone):
            raise GitRepoError(
                f"Refusing to remove {resolved}: not the default clone dir "
                f"and does not contain a .git directory. Set MODULES_REPO_DIR "
                f"to an empty or default path."
            )
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)

    try:
        _run([
            "git", "clone",
            "--single-branch", "--branch", br,
            url,
            str(target),
        ])
    except GitRepoError:
        log.exception("Failed to clone modules repo")
        raise


def list_modules(*, clone_dir: Path | None = None) -> list[str]:
    root = _resolve_clone(clone_dir)
    if not root.exists():
        return []
    return sorted(
        p.name for p in root.iterdir()
        if p.is_dir() and not p.name.startswith(".") and p.name != ".git"
    )


def module_exists(name: str, *, clone_dir: Path | None = None) -> bool:
    return (_resolve_clone(clone_dir) / name).is_dir()


def module_dir(name: str, *, clone_dir: Path | None = None) -> Path:
    return _resolve_clone(clone_dir) / name


def read_file(module: str, rel_path: str, *, clone_dir: Path | None = None) -> str:
    path = _resolve_clone(clone_dir) / module / rel_path
    return path.read_text()


def list_module_files(
    module: str,
    managed_files: frozenset[str],
    *,
    clone_dir: Path | None = None,
) -> list[dict[str, str]]:
    """List top-level non-managed files + `docs/*.md` for a module."""
    root = _resolve_clone(clone_dir) / module
    if not root.is_dir():
        raise FileNotFoundError(f"Module '{module}' not found")

    result: list[dict[str, str]] = []
    for entry in sorted(root.iterdir()):
        if entry.is_file() and entry.name not in managed_files:
            result.append({"name": entry.name, "path": entry.name})
        elif entry.is_dir() and entry.name == "docs":
            for doc in sorted(entry.iterdir()):
                if doc.is_file() and doc.name.endswith(".md"):
                    result.append({"name": doc.name, "path": f"docs/{doc.name}"})
    return result


def write_file(
    module: str,
    rel_path: str,
    content: str,
    *,
    clone_dir: Path | None = None,
) -> None:
    path = _resolve_clone(clone_dir) / module / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def delete_file(module: str, rel_path: str, *, clone_dir: Path | None = None) -> None:
    path = _resolve_clone(clone_dir) / module / rel_path
    if not path.exists():
        raise FileNotFoundError(f"{module}/{rel_path}")
    path.unlink()


def create_module_dir(name: str, *, clone_dir: Path | None = None) -> None:
    path = _resolve_clone(clone_dir) / name
    if path.exists():
        raise FileExistsError(f"Module '{name}' already exists")
    path.mkdir(parents=True)


def delete_module_dir(name: str, *, clone_dir: Path | None = None) -> None:
    path = _resolve_clone(clone_dir) / name
    if not path.is_dir():
        raise FileNotFoundError(f"Module '{name}' not found")
    shutil.rmtree(path)


def _current_branch(clone: Path) -> str:
    proc = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=clone)
    return proc.stdout.strip()


def sync_status(*, clone_dir: Path | None = None) -> dict[str, bool | int]:
    """Report dirty/ahead/behind relative to the remote tracking branch.

    Runs `git fetch` first so `behind` reflects the latest remote state.
    """
    clone = _resolve_clone(clone_dir)
    if not clone.exists():
        return {"dirty": False, "ahead": 0, "behind": 0, "can_pull": False, "can_push": False}
    branch = _current_branch(clone)

    _run(["git", "fetch", "origin", branch], cwd=clone)

    status_proc = _run(["git", "status", "--porcelain"], cwd=clone)
    dirty = bool(status_proc.stdout.strip())

    rev_proc = _run(
        ["git", "rev-list", "--left-right", "--count", f"HEAD...origin/{branch}"],
        cwd=clone,
    )
    ahead_str, behind_str = rev_proc.stdout.strip().split()
    ahead = int(ahead_str)
    behind = int(behind_str)

    return {
        "dirty": dirty,
        "ahead": ahead,
        "behind": behind,
        "can_pull": behind > 0,
        "can_push": dirty or ahead > 0,
    }


def pull(*, clone_dir: Path | None = None) -> None:
    """Hard-reset local to remote. Always discards local changes."""
    clone = _resolve_clone(clone_dir)
    branch = _current_branch(clone)
    _run(["git", "fetch", "origin", branch], cwd=clone)
    _run(["git", "reset", "--hard", f"origin/{branch}"], cwd=clone)
    _run(["git", "clean", "-fd"], cwd=clone)


def push(message: str, *, clone_dir: Path | None = None) -> str:
    """Stage all changes, commit with `message`, and push.

    Returns the resulting commit SHA. Raises GitRepoError if there was
    nothing to push, or if the remote has new commits (the user must
    pull first — per the "remote always wins" design, pulling discards
    local changes, so we refuse to create a local commit that would
    subsequently fail to push).
    """
    clone = _resolve_clone(clone_dir)
    branch = _current_branch(clone)

    status = sync_status(clone_dir=clone)
    if not status["can_push"]:
        raise GitRepoError("Nothing to push")
    if status["behind"] > 0:
        raise GitRepoError("Remote has new commits — pull first")

    if status["dirty"]:
        _run(["git", "add", "-A"], cwd=clone)
        _run(["git", "config", "user.email", "context-loader@local"], cwd=clone)
        _run(["git", "config", "user.name", "Context Agora"], cwd=clone)
        _run(["git", "commit", "-m", message], cwd=clone)

    _run(["git", "push", "origin", branch], cwd=clone)

    sha_proc = _run(["git", "rev-parse", "HEAD"], cwd=clone)
    return sha_proc.stdout.strip()
