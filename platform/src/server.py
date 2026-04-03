import os
import shutil
from pathlib import Path

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# --- Paths ---
# Where the app source lives
BASE_DIR = Path(__file__).resolve().parent
# Where available modules are read from (the "registry")
# Set MODULES_DIR to point at your team's module repo/directory.
# Defaults to local fixtures/ for development.
MODULES_DIR = Path(os.environ.get("MODULES_DIR", BASE_DIR.parent.parent / "fixtures"))

# Where selected modules get copied to (the agent's workspace)
CONTEXT_DIR = BASE_DIR / "context"
CONTEXT_DIR.mkdir(exist_ok=True)

# Files in context/ that should survive when modules are reloaded
PRESERVED_FILES = {"CLAUDE.md"}

# --- App setup ---
app = FastAPI()
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def list_modules(directory: Path) -> list[str]:
    """Return sorted names of subdirectories (each subdir = one module)."""
    return sorted(p.name for p in directory.iterdir() if p.is_dir())


# --- Routes ---


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Render the module picker UI."""
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "modules": list_modules(MODULES_DIR),
            "loaded": list_modules(CONTEXT_DIR),
        },
    )


@app.post("/load")
async def load(modules: list[str] = Form(default=[])):
    """Clear context/, then copy selected modules from the registry into it."""
    # Remove previously loaded modules
    for p in CONTEXT_DIR.iterdir():
        if p.is_dir():
            shutil.rmtree(p)
        elif p.name not in PRESERVED_FILES:
            p.unlink()

    # Only copy modules that actually exist in the registry (prevents path traversal)
    available = set(list_modules(MODULES_DIR))
    for name in modules:
        if name not in available:
            continue
        shutil.copytree(MODULES_DIR / name, CONTEXT_DIR / name)

    return RedirectResponse(url="/", status_code=303)


@app.get("/api/context")
async def api_context():
    """Return the list of currently loaded modules as JSON."""
    return {"loaded_modules": list_modules(CONTEXT_DIR)}


# Serve context/ files so they can be browsed in the browser
app.mount("/files", StaticFiles(directory=str(CONTEXT_DIR)), name="files")


# --- Entry point ---


def main():
    import uvicorn

    uvicorn.run("src.server:app", host="0.0.0.0", port=8080, reload=True)


if __name__ == "__main__":
    main()
