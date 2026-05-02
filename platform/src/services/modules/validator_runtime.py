"""Runtime wrapper around validate_modules.py for per-module checks.

Exposes a single function `validate_module(name)` returning a structured
report (errors / warnings / infos) so the chat route can call validation
inline after a turn completes. The script's CLI behavior is untouched.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from src.services.modules import git_repo
# Import the public per-module validator from validate_modules.py.
# The script returns list[Issue] where Issue is (level, message); level
# is ERROR or WARN (no INFO level today, so report.infos stays empty).
from src.scripts.validate_modules import (
    validate_module as _run_validator,
    ERROR,
    WARN,
)


@dataclass
class ValidationReport:
    module: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    infos: list[str] = field(default_factory=list)


def validate_module(name: str) -> ValidationReport:
    report = ValidationReport(module=name)

    if not git_repo.module_exists(name):
        report.errors.append(f"module '{name}' does not exist")
        return report

    module_dir: Path = git_repo.module_dir(name)
    issues = _run_validator(module_dir)
    for level, message in issues:
        if level == ERROR:
            report.errors.append(message)
        elif level == WARN:
            report.warnings.append(message)
        else:
            report.infos.append(message)
    return report
