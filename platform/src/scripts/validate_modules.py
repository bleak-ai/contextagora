"""Validate that all modules in modules-repo follow project conventions.

Usage:
    uv run python platform/src/scripts/validate_modules.py
    uv run python platform/src/scripts/validate_modules.py --repo-dir path/to/modules
    uv run python platform/src/scripts/validate_modules.py --module linear supabase
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

# ── Severity ─────────────────────────────────────────────────────────────

ERROR = "ERROR"
WARN = "WARN"

# ── Colours (disabled when not a tty) ────────────────────────────────────

USE_COLOUR = sys.stdout.isatty()


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if USE_COLOUR else text


def red(t: str) -> str:
    return _c("31", t)


def yellow(t: str) -> str:
    return _c("33", t)


def green(t: str) -> str:
    return _c("32", t)


def bold(t: str) -> str:
    return _c("1", t)


def dim(t: str) -> str:
    return _c("2", t)


# ── Markdown helpers ─────────────────────────────────────────────────────

def _extract_section(content: str, heading: str) -> str:
    """Return text under a ## or ### heading, up to the next heading."""
    pat = rf"^#{{2,3}}\s+{re.escape(heading)}\s*$"
    m = re.search(pat, content, re.MULTILINE | re.IGNORECASE)
    if not m:
        return ""
    start = m.end()
    nxt = re.search(r"^#{1,3}\s+", content[start:], re.MULTILINE)
    end = start + nxt.start() if nxt else len(content)
    return content[start:end].strip()


def _extract_secrets_from_info(content: str) -> list[str]:
    section = _extract_section(content, "Auth & access")
    if not section:
        return []
    return re.findall(r"`([A-Z][A-Z0-9_]+)`", section)


def _extract_packages_from_info(content: str) -> list[str]:
    section = _extract_section(content, "Python packages")
    if not section:
        return []
    return [
        line.strip()
        for line in section.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def _has_heading(content: str, level: int, title: str) -> bool:
    pat = rf"^#{{  {level}  }}\s+{re.escape(title)}\s*$"
    # Build precise pattern
    pat = rf"^{'#' * level}\s+{re.escape(title)}\s*$"
    return bool(re.search(pat, content, re.MULTILINE | re.IGNORECASE))


def _has_top_heading(content: str) -> bool:
    return bool(re.search(r"^#\s+\S", content, re.MULTILINE))


# ── Code-block convention checks ────────────────────────────────────────

def _extract_code_blocks(content: str) -> list[str]:
    return re.findall(r"```(?:\w*)\n(.*?)```", content, re.DOTALL)


# ── Validators ───────────────────────────────────────────────────────────

Issue = tuple[str, str]  # (severity, message)


def validate_module(module_dir: Path) -> list[Issue]:
    issues: list[Issue] = []
    name = module_dir.name

    # ── Required files ───────────────────────────────────────────────
    info_path = module_dir / "info.md"
    manifest_path = module_dir / "module.yaml"

    if not info_path.exists():
        issues.append((ERROR, "Missing required file: info.md"))
    if not manifest_path.exists():
        issues.append((ERROR, "Missing required file: module.yaml"))

    # ── Forbidden files ──────────────────────────────────────────────
    for forbidden in (".env", ".env.schema", "requirements.txt"):
        if (module_dir / forbidden).exists():
            issues.append((ERROR, f"Forbidden file present: {forbidden}"))

    # ── module.yaml checks ───────────────────────────────────────────
    manifest: dict = {}
    if manifest_path.exists():
        try:
            manifest = yaml.safe_load(manifest_path.read_text()) or {}
        except yaml.YAMLError as e:
            issues.append((ERROR, f"module.yaml is invalid YAML: {e}"))
            manifest = {}

        if manifest:
            # name
            if "name" not in manifest:
                issues.append((ERROR, "module.yaml missing 'name' field"))
            elif manifest["name"] != name:
                issues.append(
                    (ERROR, f"module.yaml name '{manifest['name']}' does not match directory name '{name}'")
                )

            # summary
            if not manifest.get("summary"):
                issues.append((WARN, "module.yaml missing 'summary' field"))

    # ── info.md checks ───────────────────────────────────────────────
    info_content = ""
    if info_path.exists():
        info_content = info_path.read_text()

        # top-level heading
        if not _has_top_heading(info_content):
            issues.append((WARN, "info.md missing top-level # heading"))

        # recommended sections
        recommended_sections = [
            "Purpose",
            "Where it lives",
            "Auth & access",
            "Key entities",
            "Operations",
            "Examples",
        ]
        for section in recommended_sections:
            if not _has_heading(info_content, 2, section):
                issues.append((WARN, f"info.md missing recommended section: ## {section}"))

        # ── Cross-validate secrets ───────────────────────────────────
        info_secrets = sorted(set(_extract_secrets_from_info(info_content)))
        manifest_secrets = sorted(manifest.get("secrets", []))

        if info_secrets and not manifest_secrets:
            issues.append(
                (ERROR, f"info.md declares secrets {info_secrets} but module.yaml has none")
            )
        elif manifest_secrets and not info_secrets:
            issues.append(
                (WARN, f"module.yaml declares secrets {manifest_secrets} but info.md 'Auth & access' section is missing or has none")
            )
        elif info_secrets != manifest_secrets:
            only_info = sorted(set(info_secrets) - set(manifest_secrets))
            only_manifest = sorted(set(manifest_secrets) - set(info_secrets))
            parts = []
            if only_info:
                parts.append(f"in info.md but not module.yaml: {only_info}")
            if only_manifest:
                parts.append(f"in module.yaml but not info.md: {only_manifest}")
            issues.append((ERROR, f"Secrets mismatch — {'; '.join(parts)}"))

        # ── Cross-validate dependencies ──────────────────────────────
        info_packages = sorted(set(_extract_packages_from_info(info_content)))
        manifest_deps = sorted(manifest.get("dependencies", []))

        if info_packages and not manifest_deps:
            issues.append(
                (ERROR, f"info.md declares packages {info_packages} but module.yaml has no dependencies")
            )
        elif manifest_deps and not info_packages:
            issues.append(
                (WARN, f"module.yaml declares dependencies {manifest_deps} but info.md 'Python packages' section is missing or empty")
            )
        elif info_packages != manifest_deps:
            only_info = sorted(set(info_packages) - set(manifest_deps))
            only_manifest = sorted(set(manifest_deps) - set(info_packages))
            parts = []
            if only_info:
                parts.append(f"in info.md but not module.yaml: {only_info}")
            if only_manifest:
                parts.append(f"in module.yaml but not info.md: {only_manifest}")
            issues.append((ERROR, f"Dependencies mismatch — {'; '.join(parts)}"))

        # ── Example convention checks ────────────────────────────────
        code_blocks = _extract_code_blocks(info_content)
        has_secrets = bool(info_secrets or manifest_secrets)

        for i, block in enumerate(code_blocks, 1):
            block_label = f"code block #{i}"

            if "load_dotenv" in block:
                issues.append((ERROR, f"{block_label}: uses load_dotenv() — forbidden"))

            # Check for bare python (not uv run python)
            if re.search(r"(?<!uv run )python -c", block):
                issues.append((WARN, f"{block_label}: uses bare 'python' instead of 'uv run python'"))

            if "pip install" in block:
                issues.append((WARN, f"{block_label}: uses pip — use uv instead"))

            # If module has secrets and example uses env vars, it should use varlock
            if has_secrets and "os.environ" in block and "varlock run" not in block:
                issues.append(
                    (WARN, f"{block_label}: reads os.environ but doesn't use 'varlock run'")
                )

    # ── llms.txt checks ──────────────────────────────────────────────
    llms_path = module_dir / "llms.txt"
    if not llms_path.exists():
        issues.append((WARN, "Missing recommended file: llms.txt"))
    else:
        llms_content = llms_path.read_text()

        # Check link targets exist
        links = re.findall(r"\[.*?\]\((.*?)\)", llms_content)
        for link in links:
            target = module_dir / link
            if not target.exists():
                issues.append((ERROR, f"llms.txt links to non-existent file: {link}"))

    return issues


# ── Output ───────────────────────────────────────────────────────────────

def print_report(results: dict[str, list[Issue]]) -> int:
    total_errors = 0
    total_warnings = 0
    passed = 0
    failed = 0

    print()
    print(bold("Module Validation Report"))
    print("=" * 60)

    for name, issues in sorted(results.items()):
        errors = [i for i in issues if i[0] == ERROR]
        warnings = [i for i in issues if i[0] == WARN]
        total_errors += len(errors)
        total_warnings += len(warnings)

        if errors:
            failed += 1
            status = red("FAIL")
        elif warnings:
            passed += 1
            status = yellow("WARN")
        else:
            passed += 1
            status = green("PASS")

        print()
        print(f"  {bold(name):30s}  {status}  ({len(errors)}E / {len(warnings)}W)")

        if issues:
            for severity, msg in issues:
                tag = red(f"  {severity}") if severity == ERROR else yellow(f"  {severity} ")
                print(f"    {tag}  {msg}")

    print()
    print("=" * 60)
    print(
        f"  Modules: {len(results)}  |  "
        f"{green(f'Passed: {passed}')}  |  "
        f"{red(f'Failed: {failed}')}  |  "
        f"Errors: {total_errors}  |  Warnings: {total_warnings}"
    )
    print()

    return 1 if total_errors > 0 else 0


# ── CLI ──────────────────────────────────────────────────────────────────

def main() -> int:
    default_repo = Path(__file__).resolve().parent.parent / "modules-repo"

    parser = argparse.ArgumentParser(description="Validate context modules")
    parser.add_argument(
        "--repo-dir",
        type=Path,
        default=default_repo,
        help=f"Path to modules repo (default: {default_repo})",
    )
    parser.add_argument(
        "--module",
        nargs="*",
        help="Validate only these modules (by directory name)",
    )
    args = parser.parse_args()

    repo_dir: Path = args.repo_dir.resolve()
    if not repo_dir.is_dir():
        print(f"Error: modules repo not found at {repo_dir}", file=sys.stderr)
        return 1

    # Discover modules
    module_dirs = sorted(
        d for d in repo_dir.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    )

    if args.module:
        module_dirs = [d for d in module_dirs if d.name in args.module]
        if not module_dirs:
            print(f"Error: no matching modules found for {args.module}", file=sys.stderr)
            return 1

    if not module_dirs:
        print("No modules found.", file=sys.stderr)
        return 1

    results = {d.name: validate_module(d) for d in module_dirs}
    return print_report(results)


if __name__ == "__main__":
    sys.exit(main())
