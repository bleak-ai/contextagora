# platform/src/routes/onboarding.py
"""Read-only endpoint that reports state needed by the chat empty-state card."""
import logging

from fastapi import APIRouter

from src.config import settings
from src.services import git_repo

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["onboarding"])


def _list_loaded_module_names() -> list[str]:
    """Return top-level entries under context/ that look like loaded modules.

    Loaded modules are top-level directories (typically symlinks) whose name
    does not start with a dot. Files like CLAUDE.md and llms.txt are skipped,
    and dotfile dirs like .schemas / .claude are skipped.
    """
    if not settings.CONTEXT_DIR.exists():
        return []
    return sorted(
        entry.name
        for entry in settings.CONTEXT_DIR.iterdir()
        if entry.is_dir() and not entry.name.startswith(".")
    )


@router.get("/onboarding/state")
async def get_onboarding_state():
    """Return counts and names used by the chat panel empty-state card.

    Three states are derived client-side from this payload:
        - cold:     modules_in_repo == 0
        - lukewarm: modules_in_repo > 0 and modules_loaded == 0
        - warm:     modules_loaded > 0
    """
    modules_in_repo = len(git_repo.list_modules())
    loaded = _list_loaded_module_names()
    return {
        "modules_in_repo": modules_in_repo,
        "modules_loaded": len(loaded),
        "loaded_module_names": loaded,
    }
