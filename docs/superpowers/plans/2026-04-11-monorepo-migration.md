# Monorepo Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `semelweis-landing` repo into the `context-loader` repo as a `landing/` directory, move the Dockerfile into `platform/`, and update all references.

**Architecture:** The context-loader repo becomes the single monorepo. The landing page lives at `landing/`, the platform at `platform/` (with its own Dockerfile), docs stay at `docs/`, and CI builds the platform image from `platform/` context. The separate `semelweis-landing` GitHub repo can be archived after migration.

**Tech Stack:** Git, Docker, GitHub Actions, Astro

---

### Task 1: Move Dockerfile into `platform/`

**Files:**
- Move: `Dockerfile` → `platform/Dockerfile`
- Move: `.dockerignore` → `platform/.dockerignore`
- Modify: `platform/Dockerfile` (fix COPY paths — they become relative to `platform/`)
- Modify: `.github/workflows/publish.yml` (change build context to `platform/`)

- [ ] **Step 1: Move Dockerfile and .dockerignore**

```bash
git mv Dockerfile platform/Dockerfile
git mv .dockerignore platform/.dockerignore
```

- [ ] **Step 2: Update COPY paths in Dockerfile**

All paths currently reference `platform/` prefix (e.g. `COPY platform/frontend/package*.json .`). Since the Dockerfile is now inside `platform/`, remove the `platform/` prefix:

```dockerfile
# Stage 1 — was: COPY platform/frontend/package*.json .
COPY frontend/package*.json .
# was: COPY platform/frontend/ .
COPY frontend/ .

# Stage 2 — was: COPY platform/pyproject.toml platform/uv.lock ./
COPY pyproject.toml uv.lock ./
# was: COPY platform/src/ src/
COPY src/ src/
```

- [ ] **Step 3: Update .dockerignore paths**

Remove `platform/` prefixes since context is now `platform/`:

```
*.env
.env.*
!*.env.schema
.envrc
.venv/
__pycache__/
*.egg-info/
.git/
**/node_modules/
src/context/*
!src/context/CLAUDE.md
```

- [ ] **Step 4: Update CI workflow context**

In `.github/workflows/publish.yml`, change the build context from `.` to `platform/`:

```yaml
      - uses: docker/build-push-action@v6
        with:
          context: platform/
```

- [ ] **Step 5: Verify Docker build locally**

```bash
cd platform && docker build -t ghcr.io/bleak-ai/context-loader:test .
```

Expected: successful build.

- [ ] **Step 6: Commit**

```bash
git add platform/Dockerfile platform/.dockerignore .github/workflows/publish.yml
git commit -m "refactor: move Dockerfile into platform/"
```

---

### Task 2: Copy landing page into `landing/`

**Files:**
- Create: `landing/` (contents from `semelweis-landind` repo, excluding `.git/`, `node_modules/`, `dist/`, `.astro/`)

- [ ] **Step 1: Copy landing repo files (excluding git/build artifacts)**

```bash
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.astro' --exclude='.env' \
  /Users/bsampera/Documents/bleak-dev/semelweis-landind/ landing/
```

- [ ] **Step 2: Verify the copy**

```bash
ls landing/
```

Expected: `astro.config.mjs`, `package.json`, `package-lock.json`, `public/`, `src/`, `tsconfig.json`, `.gitignore`, `.vscode/`, `README.md`

- [ ] **Step 3: Update landing .gitignore**

Ensure `landing/.gitignore` excludes `node_modules/`, `dist/`, `.astro/`, `.env`.

- [ ] **Step 4: Point deployment.md import to monorepo docs**

Since docs now live in the same repo, update `src/pages/deploy.astro` to import directly from `docs/` instead of a local copy:

```astro
// In landing/src/pages/deploy.astro — change line 4:
// was: import deploymentMd from '../content/deployment.md?raw';
import deploymentMd from '../../../docs/guides/deployment.md?raw';
```

Then delete the duplicate:

```bash
rm landing/src/content/deployment.md
```

If `src/content/` is now empty, remove it too:

```bash
rmdir landing/src/content 2>/dev/null || true
```

- [ ] **Step 5: Verify landing page builds**

```bash
cd landing && npm install && npm run build
```

Expected: successful build, `dist/` created.

- [ ] **Step 6: Commit**

```bash
git add landing/
git commit -m "feat: add landing page to monorepo"
```

---

### Task 3: Update root-level files

**Files:**
- Modify: `llms.txt` (add landing/ section)
- Modify: `docker-compose.yml` (update Dockerfile path if referenced)

- [ ] **Step 1: Update docker-compose.yml build context**

Change `build: .` to `build: platform/`:

```yaml
services:
  context-loader:
    image: ghcr.io/bleak-ai/context-loader:latest
    build: platform/
```

- [ ] **Step 2: Update llms.txt**

Add a `landing/` section pointing to the landing page files.

- [ ] **Step 3: Commit**

```bash
git add llms.txt docker-compose.yml
git commit -m "docs: update root references for monorepo structure"
```

---

### Task 4: Clean up and verify

- [ ] **Step 1: Verify Docker build from repo root**

```bash
docker build -t ghcr.io/bleak-ai/context-loader:test platform/
```

Expected: successful build.

- [ ] **Step 2: Verify landing page build**

```bash
cd landing && npm run build
```

Expected: successful build.

- [ ] **Step 3: Final commit if any fixups needed**

- [ ] **Step 4: Archive the old `semelweis-landing` repo on GitHub**

After confirming everything works, archive `bleak-ai/semelweis-landing` via GitHub Settings > Danger Zone > Archive.
