import base64
from pathlib import Path

import httpx

from src.services.github import (
    gh_api,
    gh_create_file,
    gh_update_file,
    list_all_module_file_paths,
)


def generate_module_llms_txt(name: str, summary: str, files: list[str]) -> str:
    """Generate a per-module llms.txt from the module name, summary, and file list."""
    lines = [f"# {name}"]
    if summary:
        lines.append(f"> {summary}")
    lines.append("")
    for f in files:
        lines.append(f"- [{f}]({f})")
    return "\n".join(lines) + "\n"


def extract_module_summary(llms_txt_content: str) -> str:
    """Extract the > blockquote description from a module's llms.txt."""
    for line in llms_txt_content.splitlines():
        if line.startswith("> "):
            return line[2:].strip()
    return ""


def generate_root_llms_txt(context_dir: Path) -> None:
    """Generate root llms.txt from loaded modules' llms.txt files."""
    entries = []
    for mod_dir in sorted(context_dir.iterdir()):
        if not mod_dir.is_dir():
            continue
        llms_file = mod_dir / "llms.txt"
        if llms_file.exists():
            summary = extract_module_summary(llms_file.read_text())
        else:
            summary = "Context module"
        entries.append(f"- [{mod_dir.name}]({mod_dir.name}/llms.txt): {summary}")

    lines = ["# Loaded Context Modules", ""]
    lines.extend(entries)
    (context_dir / "llms.txt").write_text("\n".join(lines) + "\n")


def regenerate_module_llms_txt(name: str, managed_files: set[str], summary: str | None = None) -> None:
    """Regenerate a module's llms.txt from its current files and summary."""
    if summary is None:
        try:
            llms_data = gh_api(f"{name}/llms.txt")
            llms_text = base64.b64decode(llms_data["content"]).decode()
            summary = extract_module_summary(llms_text)
        except httpx.HTTPStatusError:
            summary = ""

    files = list_all_module_file_paths(name, managed_files)
    llms_txt = generate_module_llms_txt(name, summary, files)

    try:
        llms_data = gh_api(f"{name}/llms.txt")
        gh_update_file(f"{name}/llms.txt", llms_txt, llms_data["sha"], f"Update llms.txt for {name}")
    except httpx.HTTPStatusError:
        gh_create_file(f"{name}/llms.txt", llms_txt, f"Add llms.txt for {name}")
