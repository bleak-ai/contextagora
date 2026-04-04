from importlib.metadata import version as pkg_version

from fastapi import APIRouter

router = APIRouter(tags=["health"])

APP_VERSION = pkg_version("context-loader-poc")


@router.get("/api/health")
@router.get("/health")
async def health():
    """Health check endpoint for Docker and monitoring."""
    return {"status": "ok", "version": APP_VERSION}
