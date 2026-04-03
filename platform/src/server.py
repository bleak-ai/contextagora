import logging
import os
import shlex
import shutil
import subprocess
from pathlib import Path

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

log = logging.getLogger(__name__)

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


def get_secrets_status(directory: Path) -> dict[str, dict[str, str | None]]:
    """Return per-module secret availability with preview using varlock printenv."""
    status = {}
    for mod in list_modules(directory):
        schema_file = directory / mod / ".env.schema"
        if not schema_file.exists():
            continue
        # Parse schema for declared var names
        var_names = []
        for line in schema_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                var_names.append(line.split("=")[0])
        # Check each var with varlock printenv
        mod_path = str(directory / mod)
        status[mod] = {}
        for var in var_names:
            result = subprocess.run(
                ["varlock", "printenv", "--path", mod_path, var],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0 and result.stdout.strip():
                value = result.stdout.strip()
                status[mod][var] = value[:2] + "▒" * 5
            else:
                status[mod][var] = None
    return status


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
            "secrets": get_secrets_status(CONTEXT_DIR),
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

    # Validate secrets for each loaded module
    for name in modules:
        module_dir = CONTEXT_DIR / name
        if not (module_dir / ".env.schema").exists():
            continue
        result = subprocess.run(
            ["varlock", "load", "--format", "json", "--path", str(module_dir)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            log.warning("varlock: %s has missing secrets:\n%s", name, result.stderr)
        else:
            log.info("varlock: %s secrets validated", name)

    return RedirectResponse(url="/", status_code=303)


@app.get("/api/context")
async def api_context():
    """Return the list of currently loaded modules as JSON."""
    return {"loaded_modules": list_modules(CONTEXT_DIR)}


@app.post("/run")
async def run(module: str = Form(), cmd: str = Form()):
    """Run a command with secrets injected via varlock."""
    module_dir = CONTEXT_DIR / module
    if not module_dir.is_dir() or module not in list_modules(CONTEXT_DIR):
        return JSONResponse({"error": f"module '{module}' not loaded"}, status_code=404)

    result = subprocess.run(
        ["varlock", "run", "--path", str(module_dir), "--", *shlex.split(cmd)],
        capture_output=True,
        text=True,
        cwd=str(module_dir),
        timeout=30,
    )
    return JSONResponse({
        "exit_code": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    })


# Serve context/ files so they can be browsed in the browser
app.mount("/files", StaticFiles(directory=str(CONTEXT_DIR)), name="files")


# --- Entry point ---


def main():
    import uvicorn

    uvicorn.run("src.server:app", host="0.0.0.0", port=8080, reload=True)


if __name__ == "__main__":
    main()
