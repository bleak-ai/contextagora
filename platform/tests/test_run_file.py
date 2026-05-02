"""Tests for the generic run-file endpoint (POST /api/modules/{name}/files/{path}/run).

TDD: tests written before the endpoint exists.
"""
import json
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.services.modules.schemas import validate_module_file_path


# ---------------------------------------------------------------------------
# (1) Validator tests — validate_module_file_path widened to accept .py
# ---------------------------------------------------------------------------

MANAGED = frozenset({"llms.txt", "module.yaml"})


def test_validator_accepts_md():
    assert validate_module_file_path("info.md", MANAGED) == "info.md"


def test_validator_accepts_py():
    assert validate_module_file_path("verify.py", MANAGED) == "verify.py"


def test_validator_rejects_empty():
    with pytest.raises(ValueError, match="cannot be empty"):
        validate_module_file_path("", MANAGED)


def test_validator_rejects_dotdot():
    with pytest.raises(ValueError, match="cannot contain"):
        validate_module_file_path("../evil.py", MANAGED)


def test_validator_rejects_managed_file():
    with pytest.raises(ValueError, match="managed automatically"):
        validate_module_file_path("llms.txt", MANAGED)


# ---------------------------------------------------------------------------
# Endpoint tests — import inside each function to tolerate ImportError during
# the red phase (validator tests above still run independently).
# ---------------------------------------------------------------------------


def _import_endpoint():
    from src.routes.modules import api_run_module_file
    return api_run_module_file


def test_run_file_404_nonexistent_module():
    """404 when the module does not exist."""
    api_run_module_file = _import_endpoint()

    with patch("src.routes.modules.git_repo") as mock_repo:
        mock_repo.module_exists.return_value = False

        result = api_run_module_file("nonexistent", "verify.py")

    assert result.status_code == 404


def test_run_file_400_non_py_file(tmp_path):
    """400 when the file is not a .py file."""
    api_run_module_file = _import_endpoint()

    with patch("src.routes.modules.git_repo") as mock_repo:
        mock_repo.module_exists.return_value = True
        mock_repo.module_dir.return_value = tmp_path

        result = api_run_module_file("mymodule", "info.md")

    assert result.status_code == 400
    body = json.loads(result.body)
    assert "Only .py files can be run" in body["error"]


def test_run_file_400_file_missing_on_disk(tmp_path):
    """400 when the .py file does not exist on disk."""
    api_run_module_file = _import_endpoint()

    with patch("src.routes.modules.git_repo") as mock_repo:
        mock_repo.module_exists.return_value = True
        mock_repo.module_dir.return_value = tmp_path
        # verify.py does NOT exist in tmp_path

        result = api_run_module_file("mymodule", "verify.py")

    assert result.status_code == 400
    body = json.loads(result.body)
    assert "not found" in body["error"].lower() or "does not exist" in body["error"].lower()


def test_run_file_happy_path(tmp_path):
    """Success: returncode=0, correct cwd, no --path, absolute path at argv[6]."""
    api_run_module_file = _import_endpoint()

    py_file = tmp_path / "verify.py"
    py_file.write_text("print('OK')\n")

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = "OK\n"
    mock_proc.stderr = ""

    with patch("src.routes.modules.git_repo") as mock_repo, \
         patch("src.routes.modules.subprocess.run", return_value=mock_proc) as mock_run:
        mock_repo.module_exists.return_value = True
        mock_repo.module_dir.return_value = tmp_path

        result = api_run_module_file("mymodule", "verify.py")

    assert result.status_code == 200
    body = json.loads(result.body)
    assert body["exit_code"] == 0
    assert body["stdout"] == "OK\n"
    assert "duration_ms" in body

    call = mock_run.call_args
    argv = call.args[0]
    assert argv[0] == "varlock"
    assert argv[1] == "run"
    assert argv[2] == "--"
    assert argv[6] == str(py_file)
    assert "--path" not in argv

    from src.config import settings
    assert call.kwargs["cwd"] == settings.CONTEXT_DIR


def test_run_file_failure_path(tmp_path):
    """Failure: returncode=1, stderr captured."""
    api_run_module_file = _import_endpoint()

    py_file = tmp_path / "verify.py"
    py_file.write_text("raise SystemExit(1)\n")

    mock_proc = MagicMock()
    mock_proc.returncode = 1
    mock_proc.stdout = ""
    mock_proc.stderr = "Error: something went wrong"

    with patch("src.routes.modules.git_repo") as mock_repo, \
         patch("src.routes.modules.subprocess.run", return_value=mock_proc):
        mock_repo.module_exists.return_value = True
        mock_repo.module_dir.return_value = tmp_path

        result = api_run_module_file("mymodule", "verify.py")

    assert result.status_code == 200
    body = json.loads(result.body)
    assert body["exit_code"] == 1
    assert body["stderr"] == "Error: something went wrong"


def test_run_file_timeout(tmp_path):
    """Timeout: exit_code=-1, stderr contains 'timeout'."""
    api_run_module_file = _import_endpoint()

    py_file = tmp_path / "verify.py"
    py_file.write_text("import time; time.sleep(999)\n")

    with patch("src.routes.modules.git_repo") as mock_repo, \
         patch("src.routes.modules.subprocess.run",
               side_effect=subprocess.TimeoutExpired(cmd=["varlock"], timeout=30)):
        mock_repo.module_exists.return_value = True
        mock_repo.module_dir.return_value = tmp_path

        result = api_run_module_file("mymodule", "verify.py")

    assert result.status_code == 200
    body = json.loads(result.body)
    assert body["exit_code"] == -1
    assert "timeout" in body["stderr"].lower()
    assert "duration_ms" in body
