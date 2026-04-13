"""Static slash-command registry consumed by the /api/commands endpoint."""

from dataclasses import dataclass
from pathlib import Path

_PROMPTS_DIR = Path(__file__).parent / "prompts"

_CONVENTIONS = (_PROMPTS_DIR / "_conventions.md").read_text()


def _load_prompt(name: str, inject_conventions: bool = False,
                 extra_replacements: dict[str, str] | None = None) -> str:
    """Read a prompt markdown file from src/prompts/.

    If inject_conventions is True, replace {conventions} placeholders
    with the shared conventions block.
    extra_replacements allows injecting other prompt content (e.g.
    composing /introduction with /add-integration).
    """
    raw = (_PROMPTS_DIR / name).read_text()
    if inject_conventions:
        raw = raw.replace("{conventions}", _CONVENTIONS)
    if extra_replacements:
        for key, value in extra_replacements.items():
            raw = raw.replace(key, value)
    return raw


@dataclass(frozen=True)
class CommandDef:
    name: str
    description: str
    prompt: str


# Load add_integration first so the standalone command is registered once.
_ADD_INTEGRATION_PROMPT = _load_prompt("add_integration.md", inject_conventions=True)

COMMANDS: list[CommandDef] = [
    CommandDef(
        name="download",
        description="Download files written in this session",
        prompt=_load_prompt("download.md"),
    ),
    CommandDef(
        name="add-integration",
        description="Create a new context module from a generated info.md",
        prompt=_ADD_INTEGRATION_PROMPT,
    ),
    CommandDef(
        name="introduction",
        description="First-time setup: explain Context Agora and choose your first integration",
        prompt=_load_prompt("introduction.md", inject_conventions=True),
    ),
    CommandDef(
        name="guide",
        description="Show what's loaded right now and prompts to try",
        prompt=_load_prompt("guide.md", inject_conventions=True),
    ),
]
