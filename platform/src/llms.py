from pathlib import Path

from src.services import git_repo


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


def regenerate_module_llms_txt(
    name: str, managed_files: set[str], summary: str | None = None
) -> None:
    """Regenerate a module's llms.txt from its current files and summary.

    Reads and writes through the local git_repo clone.
    """
    if summary is None:
        try:
            llms_text = git_repo.read_file(name, "llms.txt")
            summary = extract_module_summary(llms_text)
        except FileNotFoundError:
            summary = ""

    files = [f["path"] for f in git_repo.list_module_files(name, managed_files)]
    llms_txt = generate_module_llms_txt(name, summary, files)
    git_repo.write_file(name, "llms.txt", llms_txt)
