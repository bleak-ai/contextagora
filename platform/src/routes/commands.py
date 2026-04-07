import logging

from fastapi import APIRouter

from src.commands import COMMANDS

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["commands"])


@router.get("/commands")
async def list_commands():
    """List available slash commands from the static registry."""
    return {
        "commands": [
            {"name": cmd.name, "description": cmd.description}
            for cmd in COMMANDS
        ]
    }
