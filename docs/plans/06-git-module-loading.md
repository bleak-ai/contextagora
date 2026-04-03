# Plan: Git-Based Module Loading

## Goal

Replace the static `MODULES_DIR` / volume mount with git-based module loading. Modules live in their own git repo, and the app clones them at startup. This enables customers to maintain their own module repos.

## Steps

1. **Add `MODULES_REPO` env var** — a git URL pointing to the customer's module repo (e.g. `git@github.com:org/context-modules.git`)

2. **Add git credentials support** — support SSH key (mount) or token-based auth (`GIT_TOKEN` env var) for private repos

3. **Clone repo at startup** — on app start, clone `MODULES_REPO` into `MODULES_DIR`; if already cloned, pull latest

4. **Add refresh endpoint** — `POST /refresh-modules` triggers a `git pull` on the modules repo without restarting the container

5. **Remove `fixtures/` from context-loader repo** — modules are no longer shipped with the platform; they live in their own repo

6. **Update Dockerfile** — install git, handle SSH key mounting for private repos

7. **Update `docker-compose.yml`** — add `MODULES_REPO`, `GIT_TOKEN` env vars and optional SSH key volume

## File changes

```
platform/src/server.py         — add git clone on startup, add /refresh-modules endpoint
platform/deploy/Dockerfile     — install git, add SSH config
platform/deploy/docker-compose.yml — add MODULES_REPO, GIT_TOKEN, SSH key mount
fixtures/                      — remove entirely (moves to its own repo)
```

## Startup logic (pseudocode)

```python
import subprocess
from pathlib import Path

MODULES_DIR = Path(os.getenv("MODULES_DIR", "/app/modules"))
MODULES_REPO = os.getenv("MODULES_REPO")

def clone_or_pull_modules():
    if not MODULES_REPO:
        return  # fall back to local modules dir
    if (MODULES_DIR / ".git").exists():
        subprocess.run(["git", "-C", str(MODULES_DIR), "pull"], check=True)
    else:
        subprocess.run(["git", "clone", MODULES_REPO, str(MODULES_DIR)], check=True)
```

## Refresh endpoint

```python
@app.post("/refresh-modules")
async def refresh_modules():
    clone_or_pull_modules()
    return {"status": "ok", "modules": list_modules()}
```

## Sample `docker-compose.yml` changes

```yaml
services:
  context-loader:
    environment:
      - MODULES_REPO=${MODULES_REPO}
      - GIT_TOKEN=${GIT_TOKEN:-}
    volumes:
      - ~/.ssh/id_ed25519:/root/.ssh/id_ed25519:ro  # optional, for SSH auth
```

## Verification

1. Set `MODULES_REPO` to a test repo URL, start the container
2. Confirm modules are cloned into `MODULES_DIR` on startup
3. Add a new module to the remote repo, call `POST /refresh-modules`
4. Confirm the new module appears without restart
5. Test with both SSH and token auth for private repos
6. Test fallback: no `MODULES_REPO` set → uses local `MODULES_DIR` as before

## Dependencies

- None (can be done independently of Infisical)
