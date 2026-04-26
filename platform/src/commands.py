"""Static slash-command registry consumed by the /api/commands endpoint."""

from dataclasses import dataclass
from pathlib import Path

from src.config import settings

_PROMPTS_DIR = Path(__file__).parent / "prompts"

_CONVENTIONS = (_PROMPTS_DIR / "_conventions.md").read_text()

_BASE_URL = f"http://localhost:{settings.PORT}"
_MODULES_REPO = str(settings.MODULES_REPO_DIR)


def _load_prompt(name: str, inject_conventions: bool = False,
                 extra_replacements: dict[str, str] | None = None) -> str:
    """Read a prompt markdown file from src/prompts/.

    If inject_conventions is True, replace {conventions} placeholders
    with the shared conventions block.
    extra_replacements allows injecting other prompt content (e.g.
    composing /introduction with /add-integration).
    Always replaces {base_url} with the configured server URL and
    {modules_repo} with the absolute MODULES_REPO_DIR path.
    """
    raw = (_PROMPTS_DIR / name).read_text()
    if inject_conventions:
        raw = raw.replace("{conventions}", _CONVENTIONS)
    if extra_replacements:
        for key, value in extra_replacements.items():
            raw = raw.replace(key, value)
    raw = raw.replace("{base_url}", _BASE_URL)
    raw = raw.replace("{modules_repo}", _MODULES_REPO)
    return raw


# Internal prompts — not user-facing slash commands, so NOT added to COMMANDS.
# Used by routes/modules.py for module-summary / package-detection calls.
_SUMMARY_PROMPT = _load_prompt("templates/summary.md", inject_conventions=True)
_DETECT_PACKAGES_PROMPT = _load_prompt("templates/detect_packages.md", inject_conventions=True)


@dataclass(frozen=True)
class CommandDef:
    name: str
    description: str
    prompt: str


_STATIC_COMMANDS: list[CommandDef] = [
    CommandDef(
        name="download",
        description="Download files written in this session",
        prompt=_load_prompt("commands/download.md"),
    ),
    CommandDef(
        name="add-integration",
        description="Create a new context module from a generated info.md",
        prompt=_load_prompt("commands/add_integration.md", inject_conventions=True),
    ),
    CommandDef(
        name="introduction",
        description="First-time setup: explain Context Agora and choose your first integration",
        prompt=_load_prompt("commands/introduction.md", inject_conventions=True),
    ),
    CommandDef(
        name="guide",
        description="Show what's loaded right now and prompts to try",
        prompt=_load_prompt("commands/guide.md", inject_conventions=True),
    ),
    CommandDef(
        name="improve-integration",
        description="Improve an existing context module",
        prompt=_load_prompt("commands/improve_integration.md", inject_conventions=True),
    ),
    CommandDef(
        name="add-verify",
        description="Add a read-only smoke test (verify.py) to an existing module",
        prompt=_load_prompt("commands/add_verify.md", inject_conventions=True),
    ),
    CommandDef(
        name="add-script",
        description="Add a Python script (read or write) to an existing module's scripts/",
        prompt=_load_prompt("commands/add_script.md", inject_conventions=True),
    ),
    CommandDef(
        name="cron-jobs",
        description="View, add, modify, or remove scheduled jobs on the loaded modules",
        prompt=_load_prompt("commands/cron_jobs.md", inject_conventions=True),
    ),
]

_WORKFLOW_PROMPT_TEMPLATE = (
    "Begin a new run of the {workflow_name} workflow.\n"
    "Read steps/{entry_step} from the workflow folder and follow it exactly.\n"
    "The step's prose will tell you to call POST /api/workflows/"
    "{workflow_name}/runs with a one-line title to create the run task."
)


def _workflow_command(name: str, entry_step: str) -> CommandDef:
    return CommandDef(
        name=name,
        description=f"Start a new run of the '{name}' workflow",
        prompt=_WORKFLOW_PROMPT_TEMPLATE.format(workflow_name=name, entry_step=entry_step),
    )


def list_commands() -> list[CommandDef]:
    """Return static commands plus one auto-registered command per workflow.

    Recomputed on every call. Reads the modules repo directly.
    """
    # Local imports to avoid a circular at module load (services may import commands).
    from src.services import git_repo
    from src.services.manifest import read_manifest

    workflow_cmds: list[CommandDef] = []
    for name in git_repo.list_modules():
        try:
            m = read_manifest(git_repo.module_dir(name))
        except (OSError, ValueError):
            continue
        if m.kind == "workflow" and m.entry_step:
            workflow_cmds.append(_workflow_command(name, m.entry_step))
    return [*_STATIC_COMMANDS, *workflow_cmds]
