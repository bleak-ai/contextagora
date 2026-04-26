"""Upload endpoints. Currently: POST /tmp-image, used by the SocialPostCard
'Save to /tmp' button so the rasterized PNG lands at a stable path the user
can paste into the chat (Claude reads images via the Read tool).

Writes to /tmp directly. The existing /api/files/preview and /api/files/download
endpoints already allowlist /tmp via _validate_path in routes/files.py, so the
returned path is reachable for free.
"""
from __future__ import annotations

import logging
import secrets
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
TMP_DIR = Path("/tmp")


@router.post("/tmp-image", status_code=201)
async def upload_tmp_image(file: UploadFile) -> dict:
    """Save a PNG upload to /tmp and return its absolute path."""
    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_UPLOAD_SIZE // (1024 * 1024)} MB)",
        )
    if not data.startswith(PNG_MAGIC):
        raise HTTPException(status_code=415, detail="Only PNG uploads are accepted")

    name = f"contextagora-card-{int(time.time() * 1000)}-{secrets.token_hex(4)}.png"
    target = TMP_DIR / name
    target.write_bytes(data)
    log.info("Saved upload to %s (%d bytes)", target, len(data))
    return {"path": str(target)}
