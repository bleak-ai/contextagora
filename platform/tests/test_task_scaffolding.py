from src.services.modules.manifest import slugify_task_name


def test_slugify_basic():
    assert slugify_task_name("Tax Correction") == "tax-correction"


def test_slugify_mixed_case():
    assert slugify_task_name("Stealth TicketBAI Errors") == "stealth-ticketbai-errors"


def test_slugify_underscores():
    assert slugify_task_name("maat_stripe_migration") == "maat-stripe-migration"


def test_slugify_special_chars():
    assert slugify_task_name("fix: bug #123") == "fix-bug-123"


def test_slugify_collapse_hyphens():
    assert slugify_task_name("foo - - bar") == "foo-bar"


def test_slugify_strip_edges():
    assert slugify_task_name("  hello world  ") == "hello-world"
