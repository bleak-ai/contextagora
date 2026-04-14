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
