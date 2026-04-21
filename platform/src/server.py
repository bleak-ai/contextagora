import logging

from fastapi import FastAPI

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(name)s - %(message)s",
)
from fastapi.staticfiles import StaticFiles

from src.config import settings
from src.routes.benchmarks import router as benchmarks_router
from src.routes.chat import router as chat_router
from src.routes.commands import router as commands_router
from src.routes.files import router as files_router
from src.routes.health import router as health_router
from src.routes.modules import router as modules_router
from src.routes.onboarding import router as onboarding_router
from src.routes.root_context import router as root_context_router
from src.routes.sync import router as sync_router
from src.routes.workspace import router as workspace_router
from src.services import git_repo
from src.services.workspace import (
    all_integration_names,
    list_loaded_modules,
    reload_workspace,
)

log = logging.getLogger(__name__)

settings.CONTEXT_DIR.mkdir(exist_ok=True)

app = FastAPI()

app.include_router(health_router)
app.include_router(modules_router)
app.include_router(workspace_router)
app.include_router(chat_router)
app.include_router(files_router)
app.include_router(commands_router)
app.include_router(sync_router)
app.include_router(benchmarks_router)
app.include_router(root_context_router)
app.include_router(onboarding_router)


@app.on_event("startup")
def _bootstrap_modules_repo() -> None:
    try:
        git_repo.init_repo()
        log.info("Modules repo cloned at %s", settings.MODULES_REPO_DIR)
    except git_repo.GitRepoError as exc:
        log.error("Failed to init modules repo: %s", exc)
        return
    # Enforce the "non-archived tasks are always loaded" invariant on boot:
    # reload the workspace with whatever is currently symlinked, which merges
    # in active tasks via reload_workspace's own logic. On a fresh install
    # (no symlinks yet), default to enabling all integrations so users land
    # on a populated workspace instead of an empty one.
    try:
        current = list_loaded_modules(settings.CONTEXT_DIR)
        if not current:
            current = all_integration_names()
        reload_workspace(current)
    except Exception:
        log.exception("Initial workspace sync failed")


# Strong references to background tasks so asyncio doesn't GC them mid-run.
_background_tasks: set = set()


@app.on_event("startup")
async def _bootstrap_install_module_deps() -> None:
    """Reinstall module Python deps on boot.

    Container recreates wipe the writable layer, so packages that were
    installed at runtime via /api/workspace/{module}/install-deps are
    gone. Re-run the install in a background thread so server boot
    isn't blocked; package-status endpoints will reflect reality as
    the installs complete.
    """
    import asyncio

    from src.services.deps import install_all_module_deps

    task = asyncio.create_task(asyncio.to_thread(install_all_module_deps))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


if settings.STATIC_DIR.exists():
    from fastapi.responses import FileResponse

    app.mount("/assets", StaticFiles(directory=str(settings.STATIC_DIR / "assets")), name="static-assets")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        """Serve index.html for all non-API routes (SPA client-side routing)."""
        file_path = settings.STATIC_DIR / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(settings.STATIC_DIR / "index.html")


def main():
    import uvicorn
    uvicorn.run("src.server:app", host="0.0.0.0", port=settings.PORT, reload=True)


if __name__ == "__main__":
    main()
