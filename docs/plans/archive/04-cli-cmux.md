# Plan: CLI with cmux

## Goal

Add a CLI tool (`ctx`) that replaces the web picker for selecting and loading modules, and use cmux to orchestrate a multi-pane terminal layout where the user sees the module selector, the agent, and the file browser side by side.

## What changes

1. **Create a `ctx` CLI script** (Python, using simple `input()` or a TUI library like `pick`) that:
   - Lists available modules
   - Lets the user select with arrow keys / checkboxes
   - Copies selected modules to `/context/`
   - Generates `CLAUDE.md`

2. **Create a cmux launch script** that sets up the workspace layout:
   - Pane 1: `ctx` CLI (module selector)
   - Pane 2: Claude Code agent (pointed at `/context/`)
   - Pane 3: file watcher or `ls` on `/context/` (optional)

3. **This runs on the host Mac**, not inside Docker — cmux is a native macOS terminal app. The CLI manages Docker or local files.

## File changes

```
cli/
  ctx.py             — module selector CLI (~50 lines)
  launch.sh          — cmux workspace setup script
  pyproject.toml     — dependencies (pick library)
```

## ctx.py (minimal)

```python
"""Module selector CLI. Run with: uv run ctx.py"""
import shutil
from pathlib import Path

# Uses 'pick' for interactive checkbox selection
from pick import pick

MODULES_DIR = Path("modules")
CONTEXT_DIR = Path("context")

options = sorted(p.name for p in MODULES_DIR.iterdir() if p.is_dir())
selected = pick(options, "Select modules to load:", multiselect=True, min_selection_count=0)

# Clear and load
for p in CONTEXT_DIR.iterdir():
    if p.is_dir():
        shutil.rmtree(p)
for name, _ in selected:
    shutil.copytree(MODULES_DIR / name, CONTEXT_DIR / name)

print(f"Loaded: {[name for name, _ in selected]}")
```

## cmux launch script

```bash
#!/bin/bash
# Launch context-loader workspace in cmux

# Open a new cmux window with the module selector
cmux send "uv run cli/ctx.py"
cmux send-key Return

# Split and start Claude Code in the right pane
cmux new-split --direction right
cmux send "cd context && claude"
cmux send-key Return
```

## Usage flow

```
┌──────────────────────┬──────────────────────┐
│  ctx.py              │  Claude Code         │
│                      │                      │
│  Select modules:     │  > What modules are  │
│  [x] linear          │    available?         │
│  [x] supabase          │                      │
│  [ ] slack           │  I can see linear/   │
│                      │  and supabase/ in      │
│  Loaded: [linear,    │  /context/...        │
│           supabase]    │                      │
└──────────────────────┴──────────────────────┘
```

## Verification

1. Install cmux from cmux.com
2. Run `./cli/launch.sh`
3. Select modules in the left pane
4. In the right pane, ask Claude about loaded context
5. Reload modules in left pane, ask Claude again — it sees updated files

## Out of scope

- Profiles / saved configurations
- `--profile` / `--modules` CLI flags
- Docker integration from the CLI (runs locally for now)
- Always-on module defaults
