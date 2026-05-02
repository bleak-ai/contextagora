"""Serves the one-time list of modules that were archived under the old schema."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from src.config import settings


router = APIRouter()


@router.get("/api/legacy-archived")
def get_legacy_archived() -> list[str]:
    """Return the list of names recorded by the v2 migration."""
    path = settings.LEGACY_ARCHIVED_PATH
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"failed to read legacy archived list: {exc}")
