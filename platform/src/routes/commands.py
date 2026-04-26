import logging

from fastapi import APIRouter

from src.commands import list_commands

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["commands"])


@router.get("/commands")
async def api_list_commands():
    """List available slash commands from the dynamic registry."""
    return {
        "commands": [
            {"name": cmd.name, "description": cmd.description}
            for cmd in list_commands()
        ]
    }
