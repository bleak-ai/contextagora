import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

log = logging.getLogger(__name__)

# --- Paths & constants ---
BASE_DIR = Path(__file__).resolve().parent
CONTEXT_DIR = BASE_DIR / "context"
CONTEXT_DIR.mkdir(exist_ok=True)

# Files in context/ that should survive when modules are reloaded
PRESERVED_FILES = {"CLAUDE.md"}

# Files managed automatically per module (not user-editable)
MANAGED_FILES = {"llms.txt", ".env.schema", "requirements.txt"}


def list_modules(directory: Path) -> list[str]:
    """Return sorted names of subdirectories (each subdir = one module)."""
    return sorted(
        p.name for p in directory.iterdir()
        if p.is_dir() and not p.name.startswith(".")
    )


# --- App setup ---
# NOTE: Router imports MUST stay below the constant definitions above.
# Routes import CONTEXT_DIR, MANAGED_FILES, etc. from this module.
# Moving these imports above the constants will cause ImportError.
app = FastAPI()

from src.routes.benchmarks import router as benchmarks_router  # noqa: E402
from src.routes.chat import router as chat_router  # noqa: E402
from src.routes.commands import router as commands_router  # noqa: E402
from src.routes.files import router as files_router  # noqa: E402
from src.routes.health import router as health_router  # noqa: E402
from src.routes.modules import router as modules_router  # noqa: E402
from src.routes.root_context import router as root_context_router  # noqa: E402
from src.routes.sync import router as sync_router  # noqa: E402
from src.routes.workspace import router as workspace_router  # noqa: E402
from src.services import git_repo  # noqa: E402

app.include_router(health_router)  # Liveness/readiness probes
app.include_router(modules_router)  # CRUD for context modules (subdirs of context/)
app.include_router(workspace_router)  # Active workspace state & module selection
app.include_router(chat_router)  # Chat/LLM interaction endpoints
app.include_router(files_router)  # Read/write files inside modules
app.include_router(commands_router)  # Execute predefined commands/scripts
app.include_router(sync_router)  # Sync modules with the remote git repo
app.include_router(benchmarks_router)  # Benchmark task CRUD, runs, and reports
app.include_router(root_context_router)  # Read-only: root CLAUDE.md and llms.txt


@app.on_event("startup")
def _bootstrap_modules_repo() -> None:
    try:
        git_repo.init_repo()
        log.info("Modules repo cloned at %s", git_repo.MODULES_REPO_DIR)
    except git_repo.GitRepoError as exc:
        log.error("Failed to init modules repo: %s", exc)

# --- SPA static file serving ---
STATIC_DIR = BASE_DIR / "static"

if STATIC_DIR.exists():
    from fastapi.responses import FileResponse

    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="static-assets")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        """Serve index.html for all non-API routes (SPA client-side routing)."""
        file_path = STATIC_DIR / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")


# --- Entry point ---


def main():
    import os
    import uvicorn

    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run("src.server:app", host="0.0.0.0", port=port, reload=True)


if __name__ == "__main__":
    main()
