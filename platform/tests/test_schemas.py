# platform/tests/test_schemas.py
"""Tests for schema generation from manifest data."""
import pytest


class TestGenerateGlobalSchema:
    def test_single_module_produces_valid_schema(self):
        from src.services.schemas import generate_global_schema

        result = generate_global_schema({"linear": ["LINEAR_API_KEY"]})
        assert "LINEAR_API_KEY=infisical(linear, LINEAR_API_KEY)" in result
        assert "secretPath=/linear" in result
        assert "@plugin(" in result

    def test_multiple_modules_sorted(self):
        from src.services.schemas import generate_global_schema

        result = generate_global_schema({
            "stripe": ["STRIPE_SECRET_KEY"],
            "linear": ["LINEAR_API_KEY"],
        })
        # linear should come before stripe (sorted)
        linear_pos = result.index("secretPath=/linear")
        stripe_pos = result.index("secretPath=/stripe")
        assert linear_pos < stripe_pos

    def test_empty_modules_still_has_header(self):
        from src.services.schemas import generate_global_schema

        result = generate_global_schema({})
        assert "AUTO-GENERATED" in result
        assert "INFISICAL_PROJECT_ID=" in result

    def test_multiple_secrets_per_module(self):
        from src.services.schemas import generate_global_schema

        result = generate_global_schema({
            "stripe": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
        })
        assert "STRIPE_SECRET_KEY=infisical(stripe, STRIPE_SECRET_KEY)" in result
        assert "STRIPE_WEBHOOK_SECRET=infisical(stripe, STRIPE_WEBHOOK_SECRET)" in result


class TestValidateModuleName:
    def test_valid_name(self):
        from src.services.schemas import validate_module_name
        assert validate_module_name("linear") == "linear"

    def test_strips_whitespace(self):
        from src.services.schemas import validate_module_name
        assert validate_module_name("  linear  ") == "linear"

    def test_rejects_empty(self):
        from src.services.schemas import validate_module_name
        with pytest.raises(ValueError):
            validate_module_name("")

    def test_rejects_path_traversal(self):
        from src.services.schemas import validate_module_name
        with pytest.raises(ValueError):
            validate_module_name("../etc")
