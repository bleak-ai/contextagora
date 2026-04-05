"""MCP server exposing module create/update tools for the Claude agent."""

import os

import httpx
from mcp.server.fastmcp import FastMCP

API_BASE = os.environ.get("CONTEXT_LOADER_API", "http://localhost:8080")

mcp = FastMCP("modules")


@mcp.tool()
def create_module(
    name: str,
    summary: str,
    content: str,
    secrets: list[str] | None = None,
) -> str:
    """Create a new context module with documentation the AI agent can read.

    Args:
        name: Module identifier (lowercase, alphanumeric, hyphens/underscores allowed).
        summary: One-line description of what the module provides.
        content: Full markdown content for info.md — the main documentation file.
        secrets: Optional list of environment variable names the module needs (e.g. ["LINEAR_API_KEY"]).
    """
    resp = httpx.post(
        f"{API_BASE}/api/modules",
        json={
            "name": name,
            "summary": summary,
            "content": content,
            "secrets": secrets or [],
        },
        timeout=30,
    )
    if resp.status_code == 409:
        return f"Error: Module '{name}' already exists. Use update_module to modify it."
    resp.raise_for_status()
    return f"Module '{name}' created successfully."


@mcp.tool()
def update_module(
    name: str,
    content: str,
    summary: str = "",
    secrets: list[str] | None = None,
) -> str:
    """Update an existing context module's documentation or secrets.

    Args:
        name: Name of the module to update.
        content: Updated markdown content for info.md.
        summary: Updated one-line summary (optional, keeps existing if empty).
        secrets: Updated list of secret variable names (optional).
    """
    resp = httpx.put(
        f"{API_BASE}/api/modules/{name}",
        json={
            "content": content,
            "summary": summary,
            "secrets": secrets or [],
        },
        timeout=30,
    )
    if resp.status_code == 404:
        return f"Error: Module '{name}' not found. Use create_module to create it first."
    resp.raise_for_status()
    return f"Module '{name}' updated successfully."


if __name__ == "__main__":
    mcp.run()
