import logging

from fastapi import APIRouter

from src.server import CONTEXT_DIR

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["commands"])


@router.get("/commands")
async def list_commands():
    """List available slash commands from .claude/commands/*.md files."""
    commands_dir = CONTEXT_DIR / ".claude" / "commands"
    if not commands_dir.exists():
        return {"commands": []}

    commands = []
    for f in sorted(commands_dir.glob("*.md")):
        text = f.read_text().strip()
        description = text.split("\n")[0] if text else ""
        commands.append({"name": f.stem, "description": description})
    return {"commands": commands}
