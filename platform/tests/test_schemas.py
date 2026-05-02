import pytest
from src.services.modules.schemas import validate_module_file_path

MANAGED_FILES = frozenset({"module.yaml", "llms.txt"})


def test_info_md_allowed():
    assert validate_module_file_path("info.md", MANAGED_FILES) == "info.md"


def test_docs_subdir_allowed():
    assert validate_module_file_path("docs/guide.md", MANAGED_FILES) == "docs/guide.md"


def test_top_level_md_allowed():
    assert validate_module_file_path("social-posts.md", MANAGED_FILES) == "social-posts.md"


def test_non_md_file_rejected():
    with pytest.raises(ValueError, match="Only .md and .py files are allowed"):
        validate_module_file_path("random.txt", MANAGED_FILES)


def test_managed_file_rejected():
    with pytest.raises(ValueError, match="managed"):
        validate_module_file_path("module.yaml", MANAGED_FILES)
