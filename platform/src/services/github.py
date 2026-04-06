import base64
import logging
import os
import time

import httpx

log = logging.getLogger(__name__)

# --- GitHub config ---
GH_OWNER = os.environ.get("GH_OWNER")
GH_REPO = os.environ.get("GH_REPO")
GH_TOKEN = os.environ.get("GH_TOKEN")

# Cache for remote module list
_modules_cache: list[str] = []
_modules_cache_ts: float = 0
_CACHE_TTL = 60  # seconds

_MAX_DOWNLOAD_DEPTH = 10


def gh_headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if GH_TOKEN:
        headers["Authorization"] = f"Bearer {GH_TOKEN}"
    return headers


def gh_api(path: str) -> list | dict:
    """Call the GitHub API and return parsed JSON."""
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.get(url, headers=gh_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def gh_create_file(path: str, content: str, message: str) -> dict:
    """Create a file in the GitHub repo."""
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.put(url, headers=gh_headers(), json={
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def gh_update_file(path: str, content: str, sha: str, message: str) -> dict:
    """Update an existing file in the GitHub repo."""
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.put(url, headers=gh_headers(), json={
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
        "sha": sha,
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def gh_delete_file(path: str, sha: str, message: str) -> dict:
    """Delete a file from the GitHub repo."""
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.request("DELETE", url, headers=gh_headers(), json={
        "message": message,
        "sha": sha,
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def gh_delete_dir(path: str) -> None:
    """Recursively delete all files in a GitHub directory."""
    items = gh_api(path)
    for item in items:
        if item["type"] == "file":
            gh_delete_file(item["path"], item["sha"], f"Delete {item['path']}")
        elif item["type"] == "dir":
            gh_delete_dir(item["path"])


def list_remote_modules(*, bypass_cache: bool = False) -> list[str]:
    """List module names (top-level directories) from the GitHub repo."""
    global _modules_cache, _modules_cache_ts
    if not GH_OWNER:
        return []
    if not bypass_cache and _modules_cache and (time.monotonic() - _modules_cache_ts) < _CACHE_TTL:
        return _modules_cache
    items = gh_api("")
    _modules_cache = sorted(
        item["name"] for item in items
        if item["type"] == "dir" and not item["name"].startswith(".")
    )
    _modules_cache_ts = time.monotonic()
    return _modules_cache


def invalidate_module_cache() -> None:
    """Reset the module cache so the next list call hits GitHub."""
    global _modules_cache_ts
    _modules_cache_ts = 0


def download_module(name: str, dest, *, _depth: int = 0) -> None:
    """Download a module directory from GitHub into dest (a Path)."""
    if _depth > _MAX_DOWNLOAD_DEPTH:
        raise ValueError(f"Module directory too deeply nested (>{_MAX_DOWNLOAD_DEPTH} levels)")
    dest.mkdir(parents=True, exist_ok=True)
    items = gh_api(name)
    for item in items:
        target = dest / item["name"]
        if item["type"] == "file":
            content_resp = gh_api(f"{name}/{item['name']}")
            target.write_bytes(base64.b64decode(content_resp["content"]))
        elif item["type"] == "dir":
            download_module(f"{name}/{item['name']}", target, _depth=_depth + 1)


def list_available_modules(*, bypass_cache: bool = False) -> list[str]:
    """List available modules from GitHub with error handling."""
    if not GH_OWNER:
        return []
    try:
        return list_remote_modules(bypass_cache=bypass_cache)
    except httpx.HTTPError as exc:
        log.error("Failed to list modules from GitHub: %s", exc)
        return _modules_cache if _modules_cache else []


def list_module_files(name: str, managed_files: set[str]) -> list[dict]:
    """List all content files in a module from GitHub (excludes managed files)."""
    result = []
    items = gh_api(name)
    for item in items:
        if item["type"] == "file" and item["name"] not in managed_files:
            result.append({"name": item["name"], "path": item["name"]})
        elif item["type"] == "dir" and item["name"] == "docs":
            try:
                doc_items = gh_api(f"{name}/docs")
                for doc in doc_items:
                    if doc["type"] == "file" and doc["name"].endswith(".md"):
                        result.append({"name": doc["name"], "path": f"docs/{doc['name']}"})
            except httpx.HTTPStatusError:
                pass
    return result


def list_all_module_file_paths(name: str, managed_files: set[str]) -> list[str]:
    """List all content file paths in a module (for llms.txt generation)."""
    return [f["path"] for f in list_module_files(name, managed_files)]
