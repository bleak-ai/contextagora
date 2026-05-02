from pathlib import Path


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
