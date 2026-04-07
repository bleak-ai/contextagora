"""Static slash-command definitions.

Commands are materialized into CONTEXT_DIR/.claude/commands/ at startup
and after workspace loads, so the Claude CLI subprocess can resolve them
from its working directory.
"""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CommandDef:
    name: str
    description: str
    prompt: str


_DOWNLOAD_PROMPT = """Download files written in this session

Scan the conversation history for files written using the Write tool in this session.

**If a hint was provided after `/download`** (e.g. `/download csv` or `/download report`), use it to match against filenames or paths — pick the best match.

**If no hint was provided**, use all written files.

---

## Rules

- Construct each download link using this format:
  `[filename](/api/files/download?path=URL_ENCODED_FULL_PATH)`
  where the path is URL-encoded (e.g. `/tmp/data.csv` → `/api/files/download?path=%2Ftmp%2Fdata.csv`).

- If **one file** matches → reply with a single download link, no extra commentary.

- If **multiple files** match → list them all as download links, putting the most recently written one first with a "(latest)" label.

- If **no files were written** in this session → say "No files written in this session." and nothing else.

Do not explain your reasoning. Just output the link(s).
"""


COMMANDS: list[CommandDef] = [
    CommandDef(
        name="download",
        description="Download files written in this session",
        prompt=_DOWNLOAD_PROMPT,
    ),
]


def materialize_commands(context_dir: Path) -> None:
    """Write all command .md files into context_dir/.claude/commands/.

    Idempotent — safe to call multiple times.
    """
    commands_dir = context_dir / ".claude" / "commands"
    commands_dir.mkdir(parents=True, exist_ok=True)
    for cmd in COMMANDS:
        (commands_dir / f"{cmd.name}.md").write_text(cmd.prompt)
