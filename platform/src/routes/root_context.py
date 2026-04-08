from fastapi import APIRouter
from pydantic import BaseModel

from src.server import CONTEXT_DIR

router = APIRouter(prefix="/api/root-context", tags=["root-context"])

MAX_BYTES = 256 * 1024  # 256 KB safety cap


class RootFile(BaseModel):
    path: str
    exists: bool
    content: str | None


class RootContextResponse(BaseModel):
    claude_md: RootFile
    llms_txt: RootFile


def _read_root_file(name: str) -> RootFile:
    target = CONTEXT_DIR / name
    if not target.is_file():
        return RootFile(path=str(target), exists=False, content=None)
    raw = target.read_bytes()[:MAX_BYTES]
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        content = raw.decode("utf-8", errors="replace")
    return RootFile(path=str(target), exists=True, content=content)


@router.get("", response_model=RootContextResponse)
def get_root_context() -> RootContextResponse:
    return RootContextResponse(
        claude_md=_read_root_file("CLAUDE.md"),
        llms_txt=_read_root_file("llms.txt"),
    )
