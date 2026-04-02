import os
import shutil
from pathlib import Path
from typing import List

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

BASE_DIR = Path(__file__).resolve().parent
MODULES_DIR = Path(os.environ.get("MODULES_DIR", BASE_DIR.parent.parent / "fixtures"))
CONTEXT_DIR = BASE_DIR / "context"
CONTEXT_DIR.mkdir(exist_ok=True)

app = FastAPI()
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    available = sorted(p.name for p in MODULES_DIR.iterdir() if p.is_dir())
    loaded = sorted(p.name for p in CONTEXT_DIR.iterdir() if p.is_dir())
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"modules": available, "loaded": loaded},
    )


@app.post("/load")
async def load(modules: List[str] = Form(default=[])):
    # Clear context
    for p in CONTEXT_DIR.iterdir():
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()
    # Copy selected modules
    for name in modules:
        src = MODULES_DIR / name
        if src.is_dir():
            shutil.copytree(src, CONTEXT_DIR / name)
    return RedirectResponse(url="/", status_code=303)


@app.get("/api/context")
async def api_context():
    loaded = sorted(p.name for p in CONTEXT_DIR.iterdir() if p.is_dir())
    return {"loaded_modules": loaded}


app.mount("/files", StaticFiles(directory=str(CONTEXT_DIR)), name="files")


def main():
    import uvicorn

    uvicorn.run("src.server:app", host="0.0.0.0", port=8080, reload=True)


if __name__ == "__main__":
    main()
