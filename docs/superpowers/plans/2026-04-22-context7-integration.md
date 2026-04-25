# Context7 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Contextagora modules the ability to pull topic-scoped, version-pinned SDK documentation from Context7 on demand. The agent (or the user, via slash command) calls a `pull-context7` action with a module name and a topic; the backend fetches from the Context7 HTTP API, caches the result as `modules-repo/<name>/docs/context7/<topic-slug>.md`, and regenerates the module's `llms.txt` so the doc shows up through the existing context-loading pipeline.

**Architecture:** Backend-proxied (no MCP dependency on end users). One new backend service (`services/context7.py`) wraps the two Context7 HTTP endpoints. One new route (`POST /api/modules/{name}/context7/pull`) calls the service, writes the cache file, and regenerates `llms.txt`. One new slash command (`/pull-context7`) invokes that endpoint. The `module.yaml` gains an optional `context7.library_id` block that stores the resolved ID (remembering which Context7 library maps to this module). All cached docs live inside the module's own directory, so they get symlinked into `context/` on workspace load, appear in `llms.txt`, are `@`-mentionable, show up in the decision tree, and are git-versioned like any other module file.

**Tech Stack:** Python 3.12, FastAPI, pytest (+ `tmp_path`, `monkeypatch`, `httpx`-level mocking), Pydantic v2, PyYAML, markdown prompts with `{conventions}` injection.

**Reference conversation:** this plan supersedes the option-A sketch from the 2026-04-22 design chat (a new-module-yaml-field + on-demand fetch with per-topic caching).

**Standing rules (from `~/.claude/CLAUDE.md`):**
- **Never** run `python` directly — always use `uv run python` / `uv run pytest`.
- **Do not commit** unless the user explicitly asks. The "Stage" steps below stop at `git add`.
- **Never run `rm -rf`** or any delete commands against the real filesystem (test tmp_path dirs are fine — pytest handles them).
- After adding/renaming/removing files, update the relevant `llms.txt` per CLAUDE.md's navigation rules.

**Scope check (what this plan is NOT):**
- No MCP-server integration. Users of self-hosted Contextagora never install a Context7 MCP.
- No automatic refresh / TTL expiry. Refresh is explicit (re-run the command, optionally with `--refresh`).
- No UI button in the module editor. Invocation is slash command (manual) or agent-tool (automatic via the agent calling the endpoint during a task). The existing docs/ tab renders the cached file automatically once `llms.txt` lists it.
- No `/add-integration` auto-detection of the `context7` field in this plan — that is a follow-up (see Out of Scope below). Users fill the field themselves for v1, or the agent does so while chatting.

---

## File Structure

### Files to create

- `platform/src/services/context7.py` — thin async HTTP client + pure `slugify_topic()` helper. Calls the two Context7 endpoints. No filesystem I/O.
- `platform/src/services/context7_cache.py` — composes `context7.fetch_docs()` + `git_repo.write_file()` + `llms.regenerate_module_llms_txt()`. This is the one function routes call.
- `platform/src/routes/context7.py` — new FastAPI router: `POST /api/modules/{name}/context7/pull`.
- `platform/src/prompts/commands/pull_context7.md` — slash-command prompt.
- `platform/tests/test_context7_service.py` — unit tests for the HTTP client (mocked) + slug helper.
- `platform/tests/test_context7_cache.py` — integration tests for the cache writer (mocked service + real `tmp_path` filesystem).
- `platform/tests/test_context7_route.py` — route tests (FastAPI `TestClient`, mocked cache writer).
- `platform/tests/test_pull_context7_prompt.py` — shape/registration test for the slash command (mirrors `test_add_script.py`).

### Files to modify

- `platform/src/services/manifest.py` — extend `ModuleManifest` with an optional `context7` sub-model; teach `write_manifest` to round-trip it.
- `platform/src/config.py` — add `CONTEXT7_API_KEY: str = ""` and `CONTEXT7_BASE_URL: str = "https://context7.com"`.
- `platform/src/commands.py` — register `/pull-context7` in `COMMANDS`.
- `platform/src/server.py` — include the new router.
- `platform/src/prompts/_conventions.md` — extend §5 (Module Structure) to mention `docs/context7/*.md`; add a new §10 "Context7 Docs" explaining the `context7.library_id` field, the `/pull-context7` command, and when the agent should pull topic docs.
- `platform/tests/test_manifest.py` — new tests for the `context7` field round-trip.
- `platform/tests/test_config.py` — assert defaults for the two new env vars.
- `llms.txt` (project root) — add the new backend files.
- `platform/src/prompts/llms.txt` (if it exists) or the prompts directory navigation — add the new command prompt.
- `.env.example` — document `CONTEXT7_API_KEY`.

### Files NOT to modify

- `platform/src/services/git_repo.py` — `list_module_files` already walks `docs/*.md`; nested `docs/context7/*.md` is **not** walked by design (see Open Question #3) — if we want it surfaced, that's a follow-up change. For v1 we rely on `llms.txt` + the agent reading the file directly; the file does NOT need to appear in the sidebar file list.
- `platform/src/services/workspace_inspect.py` — same reasoning.
- Frontend — zero changes. The chat UI surfaces the slash command automatically via `/api/commands`.

### Commands

All commands are run from `platform/` unless noted. Never use bare `python`.

- Run all tests: `uv run pytest -v`
- Run a single file: `uv run pytest tests/test_context7_service.py -v`
- Run a single test: `uv run pytest tests/test_context7_service.py::test_resolve_library_id -v`
- Start dev server: `uv run start`

### Relevant skills

- @superpowers:test-driven-development — every task below is test-first.
- @superpowers:verification-before-completion — Task 9 (manual end-to-end) before declaring done.

---

## Task 1: Add `CONTEXT7_API_KEY` and `CONTEXT7_BASE_URL` settings

**Rationale:** Every subsequent task depends on these settings existing. Ship them first so the HTTP client can import `settings.CONTEXT7_API_KEY` without guard clauses.

**Files:**
- Modify: `platform/src/config.py`
- Modify: `platform/tests/test_config.py`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

Open `platform/tests/test_config.py` and add these two tests at the bottom:

```python
def test_context7_api_key_default_empty():
    from src.config import settings
    assert settings.CONTEXT7_API_KEY == ""


def test_context7_base_url_default():
    from src.config import settings
    assert settings.CONTEXT7_BASE_URL == "https://context7.com"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_config.py -v`

Expected: the two new tests fail with `AttributeError: 'Settings' object has no attribute 'CONTEXT7_API_KEY'`.

- [ ] **Step 3: Add the settings**

Open `platform/src/config.py`. Inside the `Settings` class, below the `LLM_MODEL: str = ""` line, add:

```python
    # Context7 (SDK docs service)
    CONTEXT7_API_KEY: str = ""
    CONTEXT7_BASE_URL: str = "https://context7.com"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_config.py -v`

Expected: all tests in the file pass.

- [ ] **Step 5: Document the env var**

Open `.env.example`. Add (preserve the file's existing ordering / comment style — if the file groups by topic, add a "# Context7" block near the LLM section):

```
# Context7 API key (optional — required only if any module uses context7:)
CONTEXT7_API_KEY=
```

Do not add `CONTEXT7_BASE_URL` here — it has a sensible default and should only be overridden in development/testing contexts. Documenting an override the reader won't usually need just adds noise.

- [ ] **Step 6: Run the full suite to check for regressions**

Run: `uv run pytest -v`

Expected: all tests pass.

- [ ] **Step 7: Stage**

```bash
git add platform/src/config.py platform/tests/test_config.py .env.example
```

---

## Task 2: Extend `ModuleManifest` with an optional `context7` block

**Rationale:** This is the manifest field that records "which Context7 library does this module map to." A nested Pydantic model (not a flat `context7_library_id` string) lets us add `max_tokens` and future fields without another migration.

**Files:**
- Modify: `platform/src/services/manifest.py`
- Modify: `platform/tests/test_manifest.py`

- [ ] **Step 1: Write the failing tests**

Open `platform/tests/test_manifest.py` and add:

```python
from src.services.manifest import Context7Config


def test_manifest_context7_defaults_none():
    m = ModuleManifest(name="x")
    assert m.context7 is None


def test_read_manifest_parses_context7(tmp_path):
    (tmp_path / "module.yaml").write_text(yaml.dump({
        "name": "stripe",
        "context7": {"library_id": "/stripe/stripe-node", "max_tokens": 3000},
    }))
    m = read_manifest(tmp_path)
    assert m.context7 is not None
    assert m.context7.library_id == "/stripe/stripe-node"
    assert m.context7.max_tokens == 3000


def test_read_manifest_context7_defaults_max_tokens(tmp_path):
    (tmp_path / "module.yaml").write_text(yaml.dump({
        "name": "stripe",
        "context7": {"library_id": "/stripe/stripe-node"},
    }))
    m = read_manifest(tmp_path)
    assert m.context7.max_tokens == 3000  # default


def test_write_manifest_round_trips_context7(tmp_path):
    m = ModuleManifest(
        name="stripe",
        context7=Context7Config(library_id="/stripe/stripe-node", max_tokens=5000),
    )
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert raw["context7"] == {"library_id": "/stripe/stripe-node", "max_tokens": 5000}


def test_write_manifest_omits_context7_when_none(tmp_path):
    m = ModuleManifest(name="stripe")
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert "context7" not in raw
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_manifest.py -v`

Expected: `ImportError` on `Context7Config` and downstream `AttributeError` on `m.context7`.

- [ ] **Step 3: Add the sub-model and extend `ModuleManifest`**

Open `platform/src/services/manifest.py`. Above the `ModuleManifest` class, add:

```python
class Context7Config(BaseModel):
    """Mapping from a Contextagora module to a Context7 library."""
    library_id: str
    max_tokens: int = 3000
```

In `ModuleManifest`, add the field (keep the existing fields in order; append at the end of the field list, before any methods):

```python
    context7: Context7Config | None = None
```

In `write_manifest`, add **before** the closing `(module_dir / "module.yaml").write_text(...)` call (after the `if manifest.archived:` block):

```python
    if manifest.context7:
        data["context7"] = manifest.context7.model_dump()
```

`read_manifest` needs no change — Pydantic auto-parses the nested dict into `Context7Config` via the model declaration.

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_manifest.py -v`

Expected: all tests pass.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `uv run pytest -v`

Expected: all tests pass. If `test_register.py` or others fail because they load existing modules — they shouldn't, because `context7: None` is the default and `write_manifest` omits the key when None.

- [ ] **Step 6: Stage**

```bash
git add platform/src/services/manifest.py platform/tests/test_manifest.py
```

---

## Task 3: Add `services/context7.py` — HTTP client and slug helper

**Rationale:** Encapsulate the Context7 API surface in one testable module. The HTTP client returns parsed markdown (ready to write); `slugify_topic` gives us deterministic file names for the cache.

**Files:**
- Create: `platform/src/services/context7.py`
- Create: `platform/tests/test_context7_service.py`

### Context7 API reference (from their docs)

| Operation | Method | Path | Query params | Response shape |
|---|---|---|---|---|
| Resolve library | GET | `/api/v2/libs/search` | `libraryName` (required), `query` (optional) | `{ "results": [ { "id": "/stripe/stripe-node", ... } ] }` |
| Fetch docs | GET | `/api/v2/context` | `libraryId` (required), `query` (topic), `type=json` | `{ "codeSnippets": [...], "infoSnippets": [...] }` |

Auth: `Authorization: Bearer <CONTEXT7_API_KEY>` on both endpoints.

**Implementer note:** The exact JSON keys for snippet items (e.g. `text`, `code`, `language`, `title`) are not fully documented — make one real test call during development to confirm the field names, then update the `_render_markdown` helper accordingly. The structure of the tests below pins the contract at the boundary of our wrapper, not at Context7's side.

- [ ] **Step 1: Write the failing tests**

Create `platform/tests/test_context7_service.py`:

```python
"""Unit tests for the Context7 HTTP client wrapper.

All tests mock the HTTP layer — no real network calls.
"""
from unittest.mock import patch

import pytest

from src.services import context7


# ---------- slugify_topic -------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("subscriptions", "subscriptions"),
    ("Subscriptions", "subscriptions"),
    ("Stripe Subscriptions", "stripe-subscriptions"),
    ("stripe_subscriptions", "stripe-subscriptions"),
    ("  Webhooks & Events!  ", "webhooks-events"),
    ("a//b", "a-b"),
    ("---trim---", "trim"),
])
def test_slugify_topic(raw, expected):
    assert context7.slugify_topic(raw) == expected


def test_slugify_topic_rejects_empty():
    with pytest.raises(ValueError):
        context7.slugify_topic("   ")


def test_slugify_topic_rejects_non_ascii_only():
    # After stripping, nothing remains.
    with pytest.raises(ValueError):
        context7.slugify_topic("!!!")


# ---------- resolve_library_id --------------------------------------------

def test_resolve_library_id_returns_first_match(monkeypatch):
    def fake_get(url, headers, params, timeout):
        assert url == "https://context7.com/api/v2/libs/search"
        assert headers["Authorization"] == "Bearer FAKE_KEY"
        assert params["libraryName"] == "stripe"
        return _mock_response(200, {
            "results": [
                {"id": "/stripe/stripe-node", "name": "stripe-node"},
                {"id": "/stripe/stripe-python", "name": "stripe-python"},
            ]
        })

    monkeypatch.setattr("src.config.settings.CONTEXT7_API_KEY", "FAKE_KEY")
    monkeypatch.setattr(context7, "_http_get", fake_get)

    assert context7.resolve_library_id("stripe") == "/stripe/stripe-node"


def test_resolve_library_id_returns_none_on_empty(monkeypatch):
    monkeypatch.setattr("src.config.settings.CONTEXT7_API_KEY", "FAKE_KEY")
    monkeypatch.setattr(context7, "_http_get", lambda *a, **kw:
                        _mock_response(200, {"results": []}))
    assert context7.resolve_library_id("nonesuch") is None


def test_resolve_library_id_raises_without_api_key(monkeypatch):
    monkeypatch.setattr("src.config.settings.CONTEXT7_API_KEY", "")
    with pytest.raises(context7.Context7Error, match="CONTEXT7_API_KEY"):
        context7.resolve_library_id("stripe")


def test_resolve_library_id_raises_on_http_error(monkeypatch):
    monkeypatch.setattr("src.config.settings.CONTEXT7_API_KEY", "FAKE_KEY")
    monkeypatch.setattr(context7, "_http_get", lambda *a, **kw:
                        _mock_response(401, {"error": "unauthorized"}))
    with pytest.raises(context7.Context7Error, match="401"):
        context7.resolve_library_id("stripe")


# ---------- fetch_docs -----------------------------------------------------

def test_fetch_docs_renders_markdown(monkeypatch):
    def fake_get(url, headers, params, timeout):
        assert url == "https://context7.com/api/v2/context"
        assert params["libraryId"] == "/stripe/stripe-node"
        assert params["query"] == "subscriptions"
        assert params["type"] == "json"
        return _mock_response(200, {
            "codeSnippets": [
                {"title": "Create a subscription",
                 "language": "python",
                 "code": "stripe.Subscription.create(...)"},
            ],
            "infoSnippets": [
                {"title": "Subscriptions overview",
                 "text": "A subscription represents a recurring charge."},
            ],
        })

    monkeypatch.setattr("src.config.settings.CONTEXT7_API_KEY", "FAKE_KEY")
    monkeypatch.setattr(context7, "_http_get", fake_get)

    md = context7.fetch_docs("/stripe/stripe-node", topic="subscriptions", max_tokens=3000)
    # The exact format is a markdown rendering of snippets; pin the key signals:
    assert "Subscriptions overview" in md
    assert "A subscription represents a recurring charge." in md
    assert "Create a subscription" in md
    assert "```python" in md
    assert "stripe.Subscription.create" in md


def test_fetch_docs_raises_on_http_error(monkeypatch):
    monkeypatch.setattr("src.config.settings.CONTEXT7_API_KEY", "FAKE_KEY")
    monkeypatch.setattr(context7, "_http_get", lambda *a, **kw:
                        _mock_response(500, {"error": "boom"}))
    with pytest.raises(context7.Context7Error):
        context7.fetch_docs("/stripe/stripe-node", topic="subs", max_tokens=3000)


def test_fetch_docs_empty_snippets_raises(monkeypatch):
    """Empty results should not silently produce an empty markdown file —
    the caller should know so it can report 'topic not found'."""
    monkeypatch.setattr("src.config.settings.CONTEXT7_API_KEY", "FAKE_KEY")
    monkeypatch.setattr(context7, "_http_get", lambda *a, **kw:
                        _mock_response(200, {"codeSnippets": [], "infoSnippets": []}))
    with pytest.raises(context7.Context7Error, match="no snippets"):
        context7.fetch_docs("/stripe/stripe-node", topic="xyzzy", max_tokens=3000)


# ---------- helpers --------------------------------------------------------

class _FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def _mock_response(status_code, payload):
    return _FakeResponse(status_code, payload)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_context7_service.py -v`

Expected: `ModuleNotFoundError: No module named 'src.services.context7'`.

- [ ] **Step 3: Implement `services/context7.py`**

Create `platform/src/services/context7.py`:

```python
"""Thin client for the Context7 documentation API.

Two operations:
- resolve_library_id(name) -> best-match Context7 library ID (or None)
- fetch_docs(library_id, topic, max_tokens) -> rendered markdown string

No filesystem I/O happens here. Callers are responsible for persistence.
All network I/O is synchronous (FastAPI endpoints run this in a threadpool).
"""
from __future__ import annotations

import re
from typing import Any

import requests

from src.config import settings


class Context7Error(RuntimeError):
    """Any failure interacting with Context7 (auth, network, empty result)."""


_SLUG_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def slugify_topic(raw: str) -> str:
    """Normalize a free-form topic string to a filesystem-safe slug.

    Empty / non-alphanumeric-only inputs raise ValueError — the caller
    must not write a file with no meaningful name.
    """
    cleaned = raw.strip().lower().replace("_", "-")
    cleaned = _SLUG_NON_ALNUM.sub("-", cleaned).strip("-")
    if not cleaned:
        raise ValueError(f"topic {raw!r} slugs to empty string")
    return cleaned


def _require_api_key() -> str:
    key = settings.CONTEXT7_API_KEY
    if not key:
        raise Context7Error(
            "CONTEXT7_API_KEY is not set — cannot call Context7 API"
        )
    return key


def _http_get(url: str, headers: dict, params: dict, timeout: float):
    """Indirection point so tests can monkeypatch without hitting the network."""
    return requests.get(url, headers=headers, params=params, timeout=timeout)


def resolve_library_id(library_name: str) -> str | None:
    """Ask Context7 which library ID corresponds to a free-form name.

    Returns the first result's ID, or None if no matches. Raises
    Context7Error on auth / network failure.
    """
    key = _require_api_key()
    resp = _http_get(
        f"{settings.CONTEXT7_BASE_URL}/api/v2/libs/search",
        headers={"Authorization": f"Bearer {key}"},
        params={"libraryName": library_name},
        timeout=10.0,
    )
    if resp.status_code != 200:
        raise Context7Error(
            f"Context7 search returned {resp.status_code} for {library_name!r}"
        )
    data = resp.json() or {}
    results = data.get("results") or []
    if not results:
        return None
    first = results[0]
    lib_id = first.get("id")
    if not isinstance(lib_id, str) or not lib_id:
        raise Context7Error(f"Context7 search returned malformed result: {first!r}")
    return lib_id


def fetch_docs(library_id: str, topic: str, max_tokens: int) -> str:
    """Fetch topic-scoped docs for a library and render as markdown.

    Raises Context7Error on failure, including when the API returns an
    empty snippet set (so the caller can surface 'no docs for this topic').
    The token budget is advisory — Context7 may return less; we do not
    enforce on our side.
    """
    key = _require_api_key()
    resp = _http_get(
        f"{settings.CONTEXT7_BASE_URL}/api/v2/context",
        headers={"Authorization": f"Bearer {key}"},
        params={
            "libraryId": library_id,
            "query": topic,
            "type": "json",
            # 'tokens' param name is best-effort — Context7 accepts it where supported
            "tokens": max_tokens,
        },
        timeout=30.0,
    )
    if resp.status_code != 200:
        raise Context7Error(
            f"Context7 context returned {resp.status_code} "
            f"for {library_id!r} topic={topic!r}"
        )
    data = resp.json() or {}
    return _render_markdown(data, library_id, topic)


def _render_markdown(payload: dict[str, Any], library_id: str, topic: str) -> str:
    """Format Context7 snippet payload as a single markdown string.

    Layout:
        # <library_id> — <topic>

        ## <info snippet title>
        <info snippet text>

        ## <code snippet title>
        ```<language>
        <code>
        ```
    """
    info_snippets = payload.get("infoSnippets") or []
    code_snippets = payload.get("codeSnippets") or []
    if not info_snippets and not code_snippets:
        raise Context7Error(
            f"Context7 returned no snippets for {library_id!r} topic={topic!r}"
        )

    lines: list[str] = [f"# {library_id} — {topic}", ""]

    for snippet in info_snippets:
        title = snippet.get("title") or "Overview"
        text = snippet.get("text") or snippet.get("description") or ""
        lines.append(f"## {title}")
        lines.append("")
        lines.append(text)
        lines.append("")

    for snippet in code_snippets:
        title = snippet.get("title") or "Example"
        language = snippet.get("language") or ""
        code = snippet.get("code") or snippet.get("text") or ""
        lines.append(f"## {title}")
        lines.append("")
        lines.append(f"```{language}")
        lines.append(code)
        lines.append("```")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_context7_service.py -v`

Expected: all tests pass.

- [ ] **Step 5: Run the full suite**

Run: `uv run pytest -v`

Expected: all tests pass.

- [ ] **Step 6: Stage**

```bash
git add platform/src/services/context7.py platform/tests/test_context7_service.py
```

---

## Task 4: Add `services/context7_cache.py` — composes service + filesystem

**Rationale:** Separating the HTTP client (pure) from the filesystem writer (side-effectful) keeps each unit testable. The cache writer is also where the "auto-resolve library_id on first pull" convenience lives: if `module.yaml` has a `context7` block missing `library_id`, this writer can populate it (we defer that branch to the route layer in this plan — see Task 5).

**Files:**
- Create: `platform/src/services/context7_cache.py`
- Create: `platform/tests/test_context7_cache.py`

- [ ] **Step 1: Write the failing tests**

Create `platform/tests/test_context7_cache.py`:

```python
"""Tests for the on-disk cache writer for Context7 pulls.

Uses tmp_path as a fake MODULES_REPO_DIR and monkeypatches the Context7
HTTP client — no real network calls.
"""
from pathlib import Path

import pytest
import yaml

from src.services import context7_cache
from src.services.manifest import Context7Config, ModuleManifest, write_manifest


# ---------- setup helpers -------------------------------------------------

def _setup_module_with_context7(clone_dir: Path, name: str,
                                 library_id: str = "/stripe/stripe-node") -> Path:
    module_dir = clone_dir / name
    module_dir.mkdir(parents=True)
    write_manifest(module_dir, ModuleManifest(
        name=name,
        summary=f"{name} integration",
        context7=Context7Config(library_id=library_id),
    ))
    (module_dir / "llms.txt").write_text(f"# {name}\n> {name} integration\n")
    (module_dir / "info.md").write_text(f"# {name}\n")
    return module_dir


def _patch_clone_dir(monkeypatch, tmp_path: Path):
    monkeypatch.setattr("src.config.settings.MODULES_REPO_DIR", tmp_path)


# ---------- pull_topic ----------------------------------------------------

def test_pull_topic_writes_cache_file(monkeypatch, tmp_path):
    _patch_clone_dir(monkeypatch, tmp_path)
    _setup_module_with_context7(tmp_path, "stripe")

    monkeypatch.setattr(
        "src.services.context7.fetch_docs",
        lambda lib, topic, max_tokens: f"# docs for {lib} / {topic}\n",
    )

    result = context7_cache.pull_topic("stripe", "subscriptions")

    assert result["path"] == "docs/context7/subscriptions.md"
    cache_file = tmp_path / "stripe" / "docs" / "context7" / "subscriptions.md"
    assert cache_file.exists()
    body = cache_file.read_text()
    # Writer prepends a YAML header block.
    assert body.startswith("---\n")
    assert "library_id: /stripe/stripe-node" in body
    assert "topic: subscriptions" in body
    assert "fetched_at:" in body
    # Then the rendered docs.
    assert "# docs for /stripe/stripe-node / subscriptions" in body


def test_pull_topic_updates_llms_txt(monkeypatch, tmp_path):
    _patch_clone_dir(monkeypatch, tmp_path)
    _setup_module_with_context7(tmp_path, "stripe")
    monkeypatch.setattr(
        "src.services.context7.fetch_docs",
        lambda lib, topic, max_tokens: "# docs\n",
    )

    context7_cache.pull_topic("stripe", "subscriptions")

    llms = (tmp_path / "stripe" / "llms.txt").read_text()
    assert "docs/context7/subscriptions.md" in llms


def test_pull_topic_slugifies_topic(monkeypatch, tmp_path):
    _patch_clone_dir(monkeypatch, tmp_path)
    _setup_module_with_context7(tmp_path, "stripe")
    monkeypatch.setattr(
        "src.services.context7.fetch_docs",
        lambda lib, topic, max_tokens: "# docs\n",
    )

    result = context7_cache.pull_topic("stripe", "Stripe Subscriptions")

    assert result["path"] == "docs/context7/stripe-subscriptions.md"
    assert (tmp_path / "stripe" / "docs" / "context7"
            / "stripe-subscriptions.md").exists()


def test_pull_topic_reuses_cache_when_fresh(monkeypatch, tmp_path):
    _patch_clone_dir(monkeypatch, tmp_path)
    _setup_module_with_context7(tmp_path, "stripe")

    calls = {"n": 0}
    def fake_fetch(lib, topic, max_tokens):
        calls["n"] += 1
        return "# fresh\n"
    monkeypatch.setattr("src.services.context7.fetch_docs", fake_fetch)

    context7_cache.pull_topic("stripe", "subscriptions")
    context7_cache.pull_topic("stripe", "subscriptions")

    # Second call must NOT refetch.
    assert calls["n"] == 1


def test_pull_topic_refresh_forces_refetch(monkeypatch, tmp_path):
    _patch_clone_dir(monkeypatch, tmp_path)
    _setup_module_with_context7(tmp_path, "stripe")

    calls = {"n": 0}
    def fake_fetch(lib, topic, max_tokens):
        calls["n"] += 1
        return f"# call {calls['n']}\n"
    monkeypatch.setattr("src.services.context7.fetch_docs", fake_fetch)

    context7_cache.pull_topic("stripe", "subscriptions")
    context7_cache.pull_topic("stripe", "subscriptions", refresh=True)

    assert calls["n"] == 2
    body = (tmp_path / "stripe" / "docs" / "context7"
            / "subscriptions.md").read_text()
    assert "# call 2" in body


def test_pull_topic_raises_when_module_missing(monkeypatch, tmp_path):
    _patch_clone_dir(monkeypatch, tmp_path)
    with pytest.raises(FileNotFoundError):
        context7_cache.pull_topic("ghost", "subscriptions")


def test_pull_topic_raises_when_context7_not_configured(monkeypatch, tmp_path):
    _patch_clone_dir(monkeypatch, tmp_path)
    module_dir = tmp_path / "stripe"
    module_dir.mkdir()
    write_manifest(module_dir, ModuleManifest(name="stripe"))
    (module_dir / "llms.txt").write_text("# stripe\n")
    with pytest.raises(context7_cache.Context7NotConfigured):
        context7_cache.pull_topic("stripe", "subscriptions")


def test_pull_topic_uses_manifest_max_tokens(monkeypatch, tmp_path):
    _patch_clone_dir(monkeypatch, tmp_path)
    module_dir = tmp_path / "stripe"
    module_dir.mkdir()
    write_manifest(module_dir, ModuleManifest(
        name="stripe",
        context7=Context7Config(
            library_id="/stripe/stripe-node", max_tokens=5000),
    ))
    (module_dir / "llms.txt").write_text("# stripe\n")

    seen = {}
    def fake_fetch(lib, topic, max_tokens):
        seen.update({"lib": lib, "topic": topic, "tokens": max_tokens})
        return "# docs\n"
    monkeypatch.setattr("src.services.context7.fetch_docs", fake_fetch)

    context7_cache.pull_topic("stripe", "subscriptions")

    assert seen == {
        "lib": "/stripe/stripe-node",
        "topic": "subscriptions",
        "tokens": 5000,
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_context7_cache.py -v`

Expected: `ModuleNotFoundError: No module named 'src.services.context7_cache'`.

- [ ] **Step 3: Implement `services/context7_cache.py`**

Create `platform/src/services/context7_cache.py`:

```python
"""Topic-scoped on-disk cache for Context7 documentation.

Composes `services.context7` (pure HTTP) with `services.git_repo`
(filesystem) and `services.manifest` (module metadata). The one public
function callers use is `pull_topic`.

Cache layout: `modules-repo/<name>/docs/context7/<topic-slug>.md`
Each file starts with a YAML header recording library_id / topic /
fetched_at for provenance.
"""
from __future__ import annotations

from datetime import date

from src.config import settings
from src.llms import regenerate_module_llms_txt
from src.services import context7, git_repo
from src.services.manifest import read_manifest


class Context7NotConfigured(RuntimeError):
    """Raised when a module has no `context7` block in module.yaml."""


def pull_topic(
    module_name: str,
    topic: str,
    *,
    refresh: bool = False,
) -> dict[str, str]:
    """Fetch Context7 docs for `module_name` on `topic` and cache to disk.

    Returns a dict with `path` (relative to the module dir) and `cached`
    (bool — True if we reused an existing file, False if we refetched).

    Raises:
        FileNotFoundError: module dir does not exist.
        Context7NotConfigured: module.yaml has no `context7.library_id`.
        context7.Context7Error: HTTP failure or empty result from Context7.
        ValueError: topic slugs to empty string.
    """
    if not git_repo.module_exists(module_name):
        raise FileNotFoundError(f"Module '{module_name}' not found")

    manifest = read_manifest(git_repo.module_dir(module_name))
    if manifest.context7 is None or not manifest.context7.library_id:
        raise Context7NotConfigured(
            f"Module '{module_name}' has no context7.library_id in module.yaml"
        )

    slug = context7.slugify_topic(topic)
    rel_path = f"docs/context7/{slug}.md"
    abs_path = git_repo.module_dir(module_name) / rel_path

    if abs_path.exists() and not refresh:
        return {"path": rel_path, "cached": True}

    rendered = context7.fetch_docs(
        manifest.context7.library_id,
        topic=topic,
        max_tokens=manifest.context7.max_tokens,
    )

    body = _with_header(
        library_id=manifest.context7.library_id,
        topic=topic,
        rendered=rendered,
    )
    git_repo.write_file(module_name, rel_path, body)

    regenerate_module_llms_txt(module_name, settings.MANAGED_FILES)

    return {"path": rel_path, "cached": False}


def _with_header(*, library_id: str, topic: str, rendered: str) -> str:
    """Prepend a YAML provenance header to a rendered docs body."""
    header = (
        "---\n"
        f"library_id: {library_id}\n"
        f"topic: {topic}\n"
        f"fetched_at: {date.today().isoformat()}\n"
        "source: context7\n"
        "---\n\n"
    )
    return header + rendered
```

**Design note (write to the reader):** we do *not* persist a TTL — the `fetched_at` date is a provenance marker, not a cache expiry. "Stale" is user-decided (they can always pass `refresh=True`). This keeps the cache deterministic: same topic + same library_id = same file, unless the user forces a refresh.

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_context7_cache.py -v`

Expected: all tests pass.

- [ ] **Step 5: Run the full suite**

Run: `uv run pytest -v`

Expected: all tests pass.

- [ ] **Step 6: Stage**

```bash
git add platform/src/services/context7_cache.py platform/tests/test_context7_cache.py
```

---

## Task 5: Add `POST /api/modules/{name}/context7/pull` route

**Rationale:** One HTTP endpoint exposes the cache writer to the slash command and (later) to agent tools. The route's job is thin: validate the module name, call `pull_topic`, translate exceptions into status codes.

**Files:**
- Create: `platform/src/routes/context7.py`
- Create: `platform/tests/test_context7_route.py`
- Modify: `platform/src/server.py`

- [ ] **Step 1: Write the failing tests**

Create `platform/tests/test_context7_route.py`:

```python
"""Tests for POST /api/modules/{name}/context7/pull.

Mocks `context7_cache.pull_topic` — no HTTP or filesystem concerns here.
"""
from fastapi.testclient import TestClient

from src.server import create_app
from src.services import context7, context7_cache


def _app():
    return TestClient(create_app())


def test_pull_returns_path_on_success(monkeypatch):
    monkeypatch.setattr(context7_cache, "pull_topic",
                        lambda name, topic, refresh=False: {
                            "path": "docs/context7/subscriptions.md",
                            "cached": False,
                        })
    resp = _app().post(
        "/api/modules/stripe/context7/pull",
        json={"topic": "subscriptions"},
    )
    assert resp.status_code == 200
    assert resp.json() == {
        "path": "docs/context7/subscriptions.md",
        "cached": False,
    }


def test_pull_forwards_refresh_flag(monkeypatch):
    seen = {}
    def fake_pull(name, topic, refresh=False):
        seen.update({"name": name, "topic": topic, "refresh": refresh})
        return {"path": "x.md", "cached": False}
    monkeypatch.setattr(context7_cache, "pull_topic", fake_pull)

    _app().post(
        "/api/modules/stripe/context7/pull",
        json={"topic": "subs", "refresh": True},
    )
    assert seen == {"name": "stripe", "topic": "subs", "refresh": True}


def test_pull_returns_404_when_module_missing(monkeypatch):
    def raise_missing(*a, **kw):
        raise FileNotFoundError("nope")
    monkeypatch.setattr(context7_cache, "pull_topic", raise_missing)

    resp = _app().post(
        "/api/modules/ghost/context7/pull",
        json={"topic": "x"},
    )
    assert resp.status_code == 404


def test_pull_returns_400_when_not_configured(monkeypatch):
    def raise_nc(*a, **kw):
        raise context7_cache.Context7NotConfigured("no block")
    monkeypatch.setattr(context7_cache, "pull_topic", raise_nc)

    resp = _app().post(
        "/api/modules/stripe/context7/pull",
        json={"topic": "x"},
    )
    assert resp.status_code == 400
    assert "context7" in resp.json()["error"].lower()


def test_pull_returns_502_on_context7_error(monkeypatch):
    def raise_c7(*a, **kw):
        raise context7.Context7Error("upstream down")
    monkeypatch.setattr(context7_cache, "pull_topic", raise_c7)

    resp = _app().post(
        "/api/modules/stripe/context7/pull",
        json={"topic": "x"},
    )
    assert resp.status_code == 502


def test_pull_rejects_empty_topic(monkeypatch):
    resp = _app().post(
        "/api/modules/stripe/context7/pull",
        json={"topic": ""},
    )
    assert resp.status_code == 422  # Pydantic validation


def test_pull_rejects_bad_module_name(monkeypatch):
    # validate_module_name rejects path traversal / empty / weird chars
    resp = _app().post(
        "/api/modules/..%2Fetc/context7/pull",
        json={"topic": "x"},
    )
    assert resp.status_code in (400, 404)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_context7_route.py -v`

Expected: all tests fail — the route does not exist (404 on every call).

- [ ] **Step 3: Implement the route**

Create `platform/src/routes/context7.py`:

```python
"""Context7 pull endpoint.

Exposes `POST /api/modules/{name}/context7/pull`, the single entry point
for both the /pull-context7 slash command and (later) agent tools.
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from src.services import context7, context7_cache
from src.services.schemas import validate_module_name

router = APIRouter(prefix="/api/modules", tags=["context7"])


class PullRequest(BaseModel):
    topic: str = Field(min_length=1)
    refresh: bool = False


@router.post("/{name}/context7/pull")
async def api_pull_context7(name: str, body: PullRequest):
    """Fetch Context7 docs for a topic and cache them inside the module."""
    try:
        validate_module_name(name)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    try:
        result = context7_cache.pull_topic(
            name, body.topic, refresh=body.refresh
        )
    except FileNotFoundError as e:
        return JSONResponse({"error": str(e)}, status_code=404)
    except context7_cache.Context7NotConfigured as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    except context7.Context7Error as e:
        return JSONResponse({"error": str(e)}, status_code=502)
    except ValueError as e:
        # slugify_topic raises ValueError on empty slug — treat as 422-ish
        return JSONResponse({"error": str(e)}, status_code=400)

    return result
```

- [ ] **Step 4: Register the router**

Open `platform/src/server.py`. Find the existing router imports and `include_router` calls. Add, in the imports block:

```python
from src.routes.context7 import router as context7_router
```

And in `create_app` (or wherever existing routers are included), add:

```python
    app.include_router(context7_router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_context7_route.py -v`

Expected: all tests pass.

- [ ] **Step 6: Run the full suite**

Run: `uv run pytest -v`

Expected: all tests pass.

- [ ] **Step 7: Stage**

```bash
git add platform/src/routes/context7.py platform/src/server.py platform/tests/test_context7_route.py
```

---

## Task 6: Update `_conventions.md` — §5 and new §10

**Rationale:** The conventions file is auto-injected into every slash-command prompt that references `{conventions}`. Adding the `docs/context7/` structure and a new "Context7 Docs" section means every command the agent runs knows the new convention — no scattershot updates to each prompt.

**Files:**
- Modify: `platform/src/prompts/_conventions.md`

No new tests here — the slash-command registration tests in Task 7 will implicitly verify injection still works (no unreplaced `{conventions}` placeholder).

- [ ] **Step 1: Extend §5 Module Structure**

Open `platform/src/prompts/_conventions.md`. Find the §5 bullet list of module folder contents. Below the existing `docs/*.md` bullet, add:

```
- `docs/context7/*.md` — topic-scoped SDK reference pulled from Context7 via `/pull-context7`; never hand-edit, always refresh via the command
```

- [ ] **Step 2: Add a new §10 Context7 Docs at the end of the file**

Append to `platform/src/prompts/_conventions.md` (after the existing §9 Verify Script block, preserving the file's trailing-newline behavior):

```markdown

## 10. Context7 Docs

Context7 is an external service that indexes up-to-date SDK documentation. Contextagora integrates it so agents working on a module (e.g. Stripe, Supabase) can pull **topic-scoped** reference docs on demand instead of relying on training-data-era SDK knowledge.

**module.yaml wiring.** A module opts into Context7 by adding:

```yaml
context7:
  library_id: /stripe/stripe-node    # from Context7's resolve-library-id
  max_tokens: 3000                    # optional; per-topic budget
```

Modules without this block cannot pull Context7 docs.

**Pulling docs.** Use the `/pull-context7 <module> <topic>` slash command, or `POST /api/modules/<module>/context7/pull` with `{"topic": "<topic>"}`. Topics are free-form (e.g. `subscriptions`, `webhooks`, `rate limiting`). The docs are cached to `modules-repo/<module>/docs/context7/<slug>.md` and automatically added to the module's `llms.txt` — subsequent reads hit the cache.

**When the agent should pull.** If you are working with an integration module that has a `context7.library_id` set, and the user is asking about a specific SDK operation (creating a subscription, listing webhooks, handling a rate-limit error), first check whether `docs/context7/<topic>.md` already exists in the module. If not, call `POST /api/modules/<module>/context7/pull` with a concise topic before attempting to answer. Prefer concrete nouns (`subscriptions`, not "stripe stuff").

**Refresh.** Pass `"refresh": true` to overwrite a cached file with the latest Context7 content. No automatic refresh — staleness is opt-in.

**When Context7 is not configured.** If the module has no `context7` block (or `CONTEXT7_API_KEY` is unset at the deployment level), fall back to the module's existing `info.md` and the agent's own knowledge. Do not prompt the user to configure Context7 unless they explicitly ask about SDK docs.
```

- [ ] **Step 3: Run the suite to check existing prompts still render**

Run: `uv run pytest -v`

Expected: all tests pass, in particular `tests/test_commands.py` (which verifies `{conventions}` still injects cleanly into `/add-verify` and `/add-integration`).

- [ ] **Step 4: Sanity-read the rendered `/add-integration` prompt**

From `platform/`:

```bash
uv run python -c "from src.commands import COMMANDS; p = next(c for c in COMMANDS if c.name == 'add-integration').prompt; print(p)" | tail -80
```

Expected: the tail of the rendered prompt now includes `## 10. Context7 Docs`, and no `{conventions}` literal remains.

- [ ] **Step 5: Stage**

```bash
git add platform/src/prompts/_conventions.md
```

---

## Task 7: Create `/pull-context7` slash-command prompt

**Rationale:** The prompt is the conversational contract. It tells the agent how to interpret `/pull-context7 <module> <topic>`, how to handle missing module / missing context7 block, when to suggest `refresh`, and how to summarize the result to the user.

**Files:**
- Create: `platform/src/prompts/commands/pull_context7.md`
- Create: `platform/tests/test_pull_context7_prompt.py`
- Modify: `platform/src/commands.py`

- [ ] **Step 1: Write the failing tests**

Create `platform/tests/test_pull_context7_prompt.py`:

```python
"""Smoke tests for the /pull-context7 slash command registration."""
from src.commands import COMMANDS


def test_pull_context7_is_registered():
    names = [c.name for c in COMMANDS]
    assert "pull-context7" in names


def test_pull_context7_prompt_has_required_shape():
    cmd = next(c for c in COMMANDS if c.name == "pull-context7")
    assert cmd.description
    p = cmd.prompt
    assert "{conventions}" not in p  # injected
    # References the endpoint and the command surface.
    assert "/api/modules/" in p
    assert "/context7/pull" in p
    # Mentions the cache layout so the agent knows where the file lands.
    assert "docs/context7/" in p
    # Pulls in conventions §10.
    assert "Context7 Docs" in p or "context7.library_id" in p
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_pull_context7_prompt.py -v`

Expected: both tests fail with `StopIteration` (command not registered).

- [ ] **Step 3: Create the prompt file**

Create `platform/src/prompts/commands/pull_context7.md` with the following content:

````markdown
# /pull-context7

| Phase | Trigger | Agent does | Ends with |
|-------|---------|------------|-----------|
| 1. Parse args | user runs `/pull-context7` | Parse `<module> <topic>` from the invocation. If either missing, ask for it. | Wait for input or proceed |
| 2. Validate | module + topic known | Read `modules-repo/<module>/module.yaml`. If the module doesn't exist, stop and tell the user. If there is no `context7.library_id`, stop and explain how to add it. | Wait or proceed |
| 3. Pull | validated | Call `POST {base_url}/api/modules/<module>/context7/pull` with `{"topic": "<topic>"}` (and `"refresh": true` if the user asked to refresh). | One-line status |
| 4. Report | pull returned | Tell the user: path of the cached file, whether it was freshly fetched or served from cache, and a `<<TRY:...>>` marker the user can click to ask a sample question against the new doc. | Done |

You are a conversational assistant helping the user pull topic-scoped SDK documentation from Context7 into an existing module.

The user invoked `/pull-context7`. The arguments are `<module> <topic>` (topic may be multi-word). If the user includes the word "refresh" or `--refresh` anywhere, pass `refresh: true`.

IMPORTANT: If either `<module>` or `<topic>` is missing, ask a single clarifying question and STOP. Do not guess.

IMPORTANT: Never edit `docs/context7/*.md` by hand. They are managed by this command.

═══════════════════════════════════════════════════════════════
HOW THIS WORKS
═══════════════════════════════════════════════════════════════

1. Verify the module exists and has `context7.library_id` in its `module.yaml`. If not:
   - Missing module → "Module `<name>` doesn't exist. Run `/add-integration <name>` first."
   - Missing `context7` block → Tell the user to add a block like:

     ```yaml
     context7:
       library_id: /stripe/stripe-node
     ```

     to `modules-repo/<name>/module.yaml`. Mention they can look up the library ID at https://context7.com/ .

2. Call:

   ```bash
   curl -sS -X POST {base_url}/api/modules/<module>/context7/pull \
     -H 'Content-Type: application/json' \
     -d '{"topic": "<topic>"}'
   ```

   Add `"refresh": true` to the JSON body if the user asked for a refresh.

3. Interpret the response:
   - `{"path": "docs/context7/<slug>.md", "cached": false}` → freshly fetched. Tell the user:
     "Pulled fresh `<topic>` docs for `<module>`. Cached at `docs/context7/<slug>.md` and linked into the module's `llms.txt`."
   - `{"path": "...", "cached": true}` → served from cache. Tell the user:
     "Already cached at `<path>`. Pass `refresh` to re-pull the latest."
   - 4xx/5xx → surface the `error` field from the JSON body. Do not retry.

4. Emit a `<<TRY: ... >>` marker (see TRY syntax in Conventions) with a concrete prompt that uses the newly-pulled doc — e.g.:

   ```
   <<TRY: Using the Stripe subscriptions docs, write a Python script that creates a monthly subscription for customer cus_123 on price price_456>>
   ```

═══════════════════════════════════════════════════════════════
WHAT YOU WILL NOT DO
═══════════════════════════════════════════════════════════════

- Do NOT edit `docs/context7/*.md` directly — these are managed files.
- Do NOT create the `context7:` block yourself — the user must add the library_id (so they intentionally pick the right mapping).
- Do NOT call Context7 for modules without the block.

═══════════════════════════════════════════════════════════════
CONVENTIONS
═══════════════════════════════════════════════════════════════

{conventions}
````

- [ ] **Step 4: Register the command**

Open `platform/src/commands.py`. In the `COMMANDS` list, append (after the last existing entry, before the closing `]`):

```python
    CommandDef(
        name="pull-context7",
        description="Pull topic-scoped SDK docs from Context7 into a module",
        prompt=_load_prompt("commands/pull_context7.md", inject_conventions=True),
    ),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_pull_context7_prompt.py -v`

Expected: both tests pass.

- [ ] **Step 6: Run the full suite**

Run: `uv run pytest -v`

Expected: all tests pass.

- [ ] **Step 7: Stage**

```bash
git add platform/src/prompts/commands/pull_context7.md platform/src/commands.py platform/tests/test_pull_context7_prompt.py
```

---

## Task 8: Update navigation `llms.txt` files

**Rationale:** CLAUDE.md requires every `llms.txt` to stay in sync with added/removed files. This task closes that loop.

**Files:**
- Modify: `llms.txt` (project root)
- Modify (if present): `platform/src/prompts/llms.txt`

- [ ] **Step 1: Add the new backend files to the root `llms.txt`**

Open the project's root `llms.txt`. In the `## Platform Backend` section, in alphabetical/logical order, add:

```
- [platform/src/services/context7.py](platform/src/services/context7.py) — Context7 HTTP client (resolve_library_id, fetch_docs, slugify_topic)
- [platform/src/services/context7_cache.py](platform/src/services/context7_cache.py) — On-disk topic cache writer at `docs/context7/<slug>.md`; composes context7 + git_repo + llms
- [platform/src/routes/context7.py](platform/src/routes/context7.py) — POST /api/modules/{name}/context7/pull endpoint
```

- [ ] **Step 2: Check for a prompts `llms.txt`**

```bash
ls platform/src/prompts/llms.txt 2>/dev/null && echo EXISTS || echo MISSING
```

If `EXISTS`: add a line for `commands/pull_context7.md` in the appropriate section. If `MISSING`: skip.

- [ ] **Step 3: Stage**

```bash
git add llms.txt
# Add platform/src/prompts/llms.txt too if you edited it.
```

---

## Task 9: Manual end-to-end verification

**Rationale:** Unit + integration tests cover the endpoint and the cache writer, but only a live run verifies the full conversational flow, the real Context7 API response shape (particularly `_render_markdown`'s field assumptions), and the interaction with workspace loading.

**Files:** none modified (inspection only).

**Prerequisites:**
- A real `CONTEXT7_API_KEY` in the running deployment's `.env`.
- At least one integration module exists in `modules-repo/` (e.g. `stripe`, `linear`).

- [ ] **Step 1: Restart the dev server so new env vars load**

From `platform/`:

```bash
uv run start
```

- [ ] **Step 2: Add a `context7` block to an existing module**

Edit `modules-repo/<existing-module>/module.yaml` and add, for example:

```yaml
context7:
  library_id: /stripe/stripe-node
```

(Use a library_id that actually exists — look it up at https://context7.com/ or via the resolve endpoint.)

- [ ] **Step 3: Run `/pull-context7` in the chat UI**

In the chat composer, type `/pull-context7 stripe subscriptions` and send.

Expected flow:
1. Agent reads the manifest.
2. Agent POSTs to `/api/modules/stripe/context7/pull` with `{"topic": "subscriptions"}`.
3. Response: `{"path": "docs/context7/subscriptions.md", "cached": false}`.
4. File appears at `modules-repo/stripe/docs/context7/subscriptions.md` with YAML header + rendered snippets.
5. `modules-repo/stripe/llms.txt` now lists `docs/context7/subscriptions.md`.
6. Agent surfaces a `<<TRY: ... >>` marker that uses the new doc.

- [ ] **Step 4: Inspect the rendered markdown**

Open `modules-repo/stripe/docs/context7/subscriptions.md`. Verify the YAML header has `library_id`, `topic`, `fetched_at`, and `source: context7`; the body contains Stripe subscription content (not a placeholder); code blocks are syntax-tagged.

**If the body is empty or sections look mangled:** the issue is in `context7._render_markdown` — the field names (`text` / `code` / `title` / `language`) don't match what Context7 actually returns. Check an API response directly:

```bash
curl -s -H "Authorization: Bearer $CONTEXT7_API_KEY" \
  "https://context7.com/api/v2/context?libraryId=/stripe/stripe-node&query=subscriptions&type=json" \
  | head -80
```

Adjust `_render_markdown` to match the real field names, rerun the unit tests (update the fixture payloads to match), and re-pull.

- [ ] **Step 5: Re-run the same command — verify cache hit**

Type `/pull-context7 stripe subscriptions` again.

Expected: response says "Already cached at `docs/context7/subscriptions.md`. Pass `refresh` to re-pull the latest." No new network call (check server logs).

- [ ] **Step 6: Force a refresh**

Type `/pull-context7 stripe subscriptions refresh`.

Expected: file overwritten, `fetched_at` header updated to today's date.

- [ ] **Step 7: Error paths**

Each should produce a clear agent message, no crash:

1. `/pull-context7 nonexistent foo` → module not found.
2. Remove the `context7:` block from `module.yaml` and re-run → "no context7 in module.yaml" with the fix recipe.
3. Temporarily set `CONTEXT7_API_KEY=""` in `.env`, restart, re-run → 502 bubbling up "CONTEXT7_API_KEY is not set". Restore the key afterwards.

- [ ] **Step 8: Verify the loaded workspace sees the new doc**

Load the module into the workspace (via the sidebar toggle). Confirm:
- `context/<module>/docs/context7/subscriptions.md` exists (symlink through the module).
- `context/llms.txt` indirectly exposes it (through the module's own `llms.txt`).
- In a fresh chat, ask "what do you know about Stripe subscriptions from the loaded context?" — the agent should cite the file.

- [ ] **Step 9: Verify the decision-tree panel reports reads**

While the agent answers the question above, watch the Decision Tree panel on the right. The `stripe` module should show an access count and the `subscriptions.md` file should light up briefly — confirming the agent actually pulled the doc into context.

- [ ] **Step 10: Stage any drift**

```bash
git status
# Normally empty at this point. Stage anything unexpected and review.
```

---

## Out of Scope (explicit non-goals; track as follow-ups)

1. **Auto-detection during `/add-integration` and `/improve-integration`** — hooking Context7's `resolve-library-id` into those flows so the `context7.library_id` field is proposed on module creation. Defer until the basic flow is proven.
2. **UI for browsing cached context7 docs** — the files are visible via the existing docs tab of the module editor only if we teach `list_module_files` to walk `docs/context7/`. For v1 we rely on the agent reading through `llms.txt`; no sidebar surface.
3. **MCP passthrough** — exposing Context7 as an MCP tool so users with a Context7 MCP installed bypass the backend. Not needed for v1 and adds installation complexity for end users.
4. **Automatic cache invalidation / TTL** — the header records `fetched_at` for provenance only. No automatic expiry. Users refresh explicitly.
5. **Agent-triggered auto-pull without slash command** — technically the agent can already POST to the endpoint mid-conversation once the conventions §10 instruction is injected, but we should observe real usage before investing in prompt tuning or dedicated tool wiring.
6. **Library-ID validation against Context7's catalog** at `module.yaml` write time. For v1 we trust the user / agent. Invalid IDs surface on the first pull as a 502.
7. **Benchmark reference run** demonstrating the value (same prompt with/without context7 docs loaded). High-value follow-up but standalone work.
8. **Plan review loop via plan-document-reviewer subagent** — the user has explicitly stated they will hand this plan to Codex for external review, which serves as the equivalent reviewer pass.

---

## Open Design Questions (flagged for Codex review)

1. **`_render_markdown` field assumptions.** The unit tests pin the shape we *want* Context7 to return (`codeSnippets`/`infoSnippets` with `title`/`text`/`code`/`language`). The public docs don't spell these out. Task 9 Step 4 explicitly recommends adjusting `_render_markdown` against a real response if the fields differ. Is there a less fragile rendering strategy — e.g. passing `type=markdown` instead of `type=json` and writing the raw string through, trusting Context7's own formatting?
2. **Token budget parameter name.** I used `tokens` in the query params; Context7 may name it something else (`maxTokens`?). Confirm at integration time; unit tests don't pin this.
3. **Sidebar visibility of cached docs.** Deliberately punted. If we want `docs/context7/*.md` to appear in the ModuleEditor file list, extend both `list_workspace_files` and `list_module_files` to walk one directory deeper under `docs/`. Worth doing?
4. **`slugify_topic` collisions.** Two distinct topics ("subscriptions" vs "Subscriptions!") slugify to the same file. Users/agents inadvertently overwriting each other's caches is a minor risk — is collision detection worth adding, or is "last write wins" fine?
5. **Writing the `context7` block during `/add-integration`.** Excluded from this plan to keep scope tight, but it's the highest-ROI follow-up. Any reason NOT to ship it in the next iteration?
6. **Plan review loop.** The writing-plans skill asks for a plan-document-reviewer subagent pass. The user has explicitly said they will send this plan to Codex for review — treat that as the equivalent reviewer pass rather than dispatching an in-session subagent?

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-04-22-context7-integration.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task (Tasks 1–8 are mostly independent; 5 depends on 4, 4 depends on 3, 3 depends on 2 and 1; 6/7/8 depend on the earlier stack being in place). Review between tasks.
2. **Inline Execution** — run through Tasks 1–9 sequentially in a single session with a checkpoint after each.

For a feature this size, **Inline Execution** is probably the right call — there are real cross-task dependencies (manifest → service → cache → route → prompt), and a single-session run preserves context across them without repeatedly re-orienting a new subagent.
