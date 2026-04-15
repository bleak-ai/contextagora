"""Read-only endpoint that reports state needed by the chat empty-state card."""
import logging

from fastapi import APIRouter

from src.services import git_repo
from src.services.workspace import get_loaded_module_names

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["onboarding"])


@router.get("/onboarding/state")
async def get_onboarding_state():
    """Return counts and names used by the chat panel empty-state card.

    Three states are derived client-side from this payload:
        - cold:     modules_in_repo == 0
        - lukewarm: modules_in_repo > 0 and modules_loaded == 0
        - warm:     modules_loaded > 0
    """
    modules_in_repo = len(git_repo.list_modules())
    loaded = get_loaded_module_names()
    return {
        "modules_in_repo": modules_in_repo,
        "modules_loaded": len(loaded),
        "loaded_module_names": loaded,
    }
