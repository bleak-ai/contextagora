# Social-post image save-to-tmp / download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two buttons (Save to /tmp, Download) to the SocialPostCard image actions in both TweetSection and LinkedinSection, backed by a new POST /api/uploads/tmp-image endpoint that writes a PNG to /tmp and returns its absolute path.

**Architecture:** A new FastAPI endpoint validates uploaded PNG bytes (magic header, 10MB cap) and writes them to /tmp with a generated filename. A new frontend helper module rasterizes the card via the existing html-to-image dependency and either uploads (then auto-copies the returned path to clipboard) or triggers a browser download. Both section components call the same helper so the rasterization code lives in exactly one place.

**Tech Stack:** FastAPI, Python stdlib (secrets, time, pathlib), pytest + FastAPI TestClient on the backend; React 19, TypeScript, html-to-image, FormData on the frontend. No new dependencies.

**Spec:** See `docs/superpowers/specs/2026-04-26-social-post-image-save-design.md` for full design and rationale.

---

## File Map

### New files

- `platform/src/routes/uploads.py` -- FastAPI router: POST /api/uploads/tmp-image
- `platform/tests/test_uploads.py` -- pytest coverage of the new endpoint
- `platform/frontend/src/api/uploads.ts` -- thin client function uploadTmpImage(blob)
- `platform/frontend/src/components/social-post/imageActions.ts` -- shared rasterize / saveToTmp / downloadAsPng helpers

### Modified files

- `platform/src/server.py` -- import and register the new uploads_router
- `platform/frontend/src/components/social-post/TweetSection.tsx` -- swap inline toBlob for helper, add 2 buttons
- `platform/frontend/src/components/social-post/LinkedinSection.tsx` -- same
- `llms.txt` -- add entries for new backend route, frontend api client, and frontend helper

---

## Task 1: Backend endpoint test scaffold (TDD)

**Files:**
- Test: `platform/tests/test_uploads.py`

This task writes failing tests for the new endpoint. The endpoint does not exist yet, so test discovery will succeed but the tests will fail with 404 (until Task 2 wires the router).

- [ ] **Step 1: Create the test file with all six tests**

Create `platform/tests/test_uploads.py` with the following content. The tests use FastAPI's TestClient against the real app (no fixtures needed; the app boots from imports).

```python
"""Tests for POST /api/uploads/tmp-image."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.server import app


# Minimal valid 1x1 PNG: magic header + IHDR + IDAT + IEND.
def _tiny_png() -> bytes:
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(b"\x00\xff\xff\xff"))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_uploads_tmp_image_writes_png_and_returns_path(client: TestClient):
    png = _tiny_png()
    res = client.post(
        "/api/uploads/tmp-image",
        files={"file": ("card.png", png, "image/png")},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert "path" in body
    path = Path(body["path"])
    assert path.is_absolute()
    assert str(path).startswith("/tmp/contextagora-card-")
    assert path.suffix == ".png"
    assert path.is_file()
    assert path.read_bytes() == png
    path.unlink()  # cleanup


def test_uploads_tmp_image_generates_unique_paths(client: TestClient):
    png = _tiny_png()
    r1 = client.post("/api/uploads/tmp-image", files={"file": ("a.png", png, "image/png")})
    r2 = client.post("/api/uploads/tmp-image", files={"file": ("b.png", png, "image/png")})
    assert r1.status_code == 201
    assert r2.status_code == 201
    p1, p2 = Path(r1.json()["path"]), Path(r2.json()["path"])
    assert p1 != p2
    p1.unlink()
    p2.unlink()


def test_uploads_tmp_image_rejects_non_png_magic_bytes(client: TestClient):
    res = client.post(
        "/api/uploads/tmp-image",
        files={"file": ("evil.png", b"GIF89a not really a png", "image/png")},
    )
    assert res.status_code == 415


def test_uploads_tmp_image_rejects_oversize_upload(client: TestClient):
    # 10 MB cap. Build a payload starting with the PNG magic so we test the
    # size check, not the magic check.
    payload = b"\x89PNG\r\n\x1a\n" + b"\x00" * (10 * 1024 * 1024)
    res = client.post(
        "/api/uploads/tmp-image",
        files={"file": ("big.png", payload, "image/png")},
    )
    assert res.status_code == 413


def test_uploads_tmp_image_rejects_missing_file_field(client: TestClient):
    res = client.post("/api/uploads/tmp-image")
    assert res.status_code == 422  # FastAPI's missing-field code


def test_uploads_tmp_image_path_is_readable_via_files_preview(client: TestClient):
    """Sanity-check: the returned path round-trips through GET /api/files/preview,
    which is the existing /tmp-allowlisted reader."""
    png = _tiny_png()
    res = client.post(
        "/api/uploads/tmp-image",
        files={"file": ("rt.png", png, "image/png")},
    )
    assert res.status_code == 201
    path = res.json()["path"]
    preview = client.get("/api/files/preview", params={"path": path})
    assert preview.status_code == 200
    assert preview.content == png
    Path(path).unlink()
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd platform && uv run pytest tests/test_uploads.py -v`

Expected: All six tests FAIL. The most common failure will be `404 Not Found` from the TestClient because the route is not registered yet, except `test_uploads_tmp_image_rejects_missing_file_field` which may show a different error path. This is fine -- we only need the tests to fail before implementation.

- [ ] **Step 3: Commit the failing tests**

```bash
git add platform/tests/test_uploads.py
git commit -m "test(uploads): add failing tests for POST /api/uploads/tmp-image"
```

---

## Task 2: Implement the uploads router

**Files:**
- Create: `platform/src/routes/uploads.py`
- Modify: `platform/src/server.py` (imports block + include_router list)

- [ ] **Step 1: Create the router file**

Create `platform/src/routes/uploads.py` with the following content:

```python
"""Upload endpoints. Currently: POST /tmp-image, used by the SocialPostCard
'Save to /tmp' button so the rasterized PNG lands at a stable path the user
can paste into the chat (Claude reads images via the Read tool).

Writes to /tmp directly. The existing /api/files/preview and /api/files/download
endpoints already allowlist /tmp via _validate_path in routes/files.py, so the
returned path is reachable for free.
"""
from __future__ import annotations

import logging
import secrets
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
TMP_DIR = Path("/tmp")


@router.post("/tmp-image", status_code=201)
async def upload_tmp_image(file: UploadFile) -> dict:
    """Save a PNG upload to /tmp and return its absolute path.

    Validates: PNG magic bytes (415), size cap (413). The filename is
    server-generated, so the client cannot influence the path.
    """
    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_UPLOAD_SIZE // (1024 * 1024)} MB)",
        )
    if not data.startswith(PNG_MAGIC):
        raise HTTPException(status_code=415, detail="Only PNG uploads are accepted")

    name = f"contextagora-card-{int(time.time() * 1000)}-{secrets.token_hex(4)}.png"
    target = TMP_DIR / name
    target.write_bytes(data)
    log.info("Saved upload to %s (%d bytes)", target, len(data))
    return {"path": str(target)}
```

- [ ] **Step 2: Register the router in server.py**

Open `platform/src/server.py`. Add an import next to the other route imports (lines 14-28), keeping alphabetical order:

```python
from src.routes.uploads import router as uploads_router
```

Then add an `app.include_router(uploads_router)` line in the include_router block (lines 113-127). Place it after `social_post_router` to keep the spec / file ordering close.

- [ ] **Step 3: Run the tests to confirm they pass**

Run: `cd platform && uv run pytest tests/test_uploads.py -v`

Expected: All six tests PASS. If `test_uploads_tmp_image_rejects_oversize_upload` is slow (around 1-2 seconds is fine), that's expected because TestClient buffers the 10 MB body in memory.

- [ ] **Step 4: Run the full backend test suite to confirm no regressions**

Run: `cd platform && uv run pytest -q`

Expected: All tests pass. This catches the case where adding the import or include_router line broke server boot for other tests.

- [ ] **Step 5: Commit**

```bash
git add platform/src/routes/uploads.py platform/src/server.py
git commit -m "feat(uploads): POST /api/uploads/tmp-image saves PNGs to /tmp"
```

---

## Task 3: Frontend API client

**Files:**
- Create: `platform/frontend/src/api/uploads.ts`

- [ ] **Step 1: Create the API client file**

Create `platform/frontend/src/api/uploads.ts` with the following content. It reuses the existing `apiUpload` helper in `client.ts` by wrapping the Blob in a File (File extends Blob in the browser, but `apiUpload` is typed `File`, so the wrap is required for TypeScript).

```ts
import { apiUpload } from "./client";

/** Upload a rasterized card PNG to /tmp on the server.
 *  Returns the absolute path the server wrote to. */
export async function uploadTmpImage(blob: Blob): Promise<{ path: string }> {
  const file = new File([blob], "card.png", { type: "image/png" });
  return apiUpload<{ path: string }>("/uploads/tmp-image", file);
}
```

- [ ] **Step 2: Type-check the frontend**

Run: `cd platform/frontend && npx tsc -b --noEmit`

Expected: No errors. (If `tsc -b` complains about output paths, `npx tsc --noEmit -p tsconfig.app.json` is the same check.)

- [ ] **Step 3: Commit**

```bash
git add platform/frontend/src/api/uploads.ts
git commit -m "feat(api): uploadTmpImage client for POST /api/uploads/tmp-image"
```

---

## Task 4: Shared imageActions helper

**Files:**
- Create: `platform/frontend/src/components/social-post/imageActions.ts`

This helper is the single home for the rasterization logic that today lives duplicated in TweetSection and LinkedinSection. It returns Promises and has no React state -- callers own UI state.

- [ ] **Step 1: Create the helper file**

Create `platform/frontend/src/components/social-post/imageActions.ts` with the following content:

```ts
import { toBlob } from "html-to-image";
import { uploadTmpImage } from "../../api/uploads";

/** Rasterize a DOM node to a PNG Blob at 2x device pixel ratio.
 *  Throws if html-to-image returns null (e.g., tainted CORS image). */
export async function rasterize(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true });
  if (!blob) throw new Error("rasterize failed");
  return blob;
}

/** Rasterize and save to the server's /tmp. Returns the absolute path. */
export async function saveToTmp(node: HTMLElement): Promise<{ path: string }> {
  const blob = await rasterize(node);
  return uploadTmpImage(blob);
}

/** Rasterize and trigger a browser download with the given filename. */
export async function downloadAsPng(node: HTMLElement, filename: string): Promise<void> {
  const blob = await rasterize(node);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd platform/frontend && npx tsc -b --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add platform/frontend/src/components/social-post/imageActions.ts
git commit -m "feat(social-post): extract rasterize/save/download helpers"
```

---

## Task 5: Wire helper + new buttons into TweetSection

**Files:**
- Modify: `platform/frontend/src/components/social-post/TweetSection.tsx`

The existing `onCopyImage` handler stays (different workflow). We swap its inline toBlob call for the helper, then add two new state machines and two new buttons.

- [ ] **Step 1: Add the imports and slugify helper**

At the top of `TweetSection.tsx`, replace the `import { toBlob } from "html-to-image";` line with:

```ts
import { rasterize, saveToTmp, downloadAsPng } from "./imageActions";
```

Below the `type CopyState = ...` line (around line 17), add a slugify helper:

```ts
function slugifyTitle(title: string): string {
  return (title || "card")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "card";
}
```

- [ ] **Step 2: Replace the inline toBlob call in onCopyImage**

In `onCopyImage`, replace:

```ts
const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true });
if (!blob) throw new Error("rasterize failed");
```

with:

```ts
const blob = await rasterize(node);
```

- [ ] **Step 3: Add the new state hooks**

Below the existing `imageBusy` state declaration, add:

```ts
const [saveState, setSaveState] = useState<CopyState>("idle");
const [saveBusy, setSaveBusy] = useState(false);
const [downloadState, setDownloadState] = useState<"idle" | "done" | "error">("idle");
const [downloadBusy, setDownloadBusy] = useState(false);
```

(`CopyState` is reused for `saveState` because its three states -- idle/copied/error -- map cleanly onto the save flow's idle/path-copied/error.)

- [ ] **Step 4: Add the two handler functions**

Place these next to the existing `onCopyImage` handler:

```ts
const onSaveToTmp = async () => {
  const node = cardRef.current;
  if (!node) {
    setSaveState("error");
    setTimeout(() => setSaveState("idle"), 2000);
    return;
  }
  setSaveBusy(true);
  try {
    const { path } = await saveToTmp(node);
    await navigator.clipboard.writeText(path);
    setSaveState("copied");
    setTimeout(() => setSaveState("idle"), 2000);
  } catch {
    setSaveState("error");
    setTimeout(() => setSaveState("idle"), 2000);
  } finally {
    setSaveBusy(false);
  }
};

const onDownload = async () => {
  const node = cardRef.current;
  if (!node) {
    setDownloadState("error");
    setTimeout(() => setDownloadState("idle"), 2000);
    return;
  }
  setDownloadBusy(true);
  try {
    await downloadAsPng(node, `${slugifyTitle(card.title)}.png`);
    setDownloadState("done");
    setTimeout(() => setDownloadState("idle"), 2000);
  } catch {
    setDownloadState("error");
    setTimeout(() => setDownloadState("idle"), 2000);
  } finally {
    setDownloadBusy(false);
  }
};
```

- [ ] **Step 5: Add the two buttons to the row**

Inside the `<div className="flex flex-wrap items-center gap-2 mt-2">` block, immediately after the existing "Copy image" button and before the "Regenerate" button, add:

```tsx
<button
  type="button"
  onClick={onSaveToTmp}
  disabled={saveBusy}
  className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
>
  {saveBusy
    ? "Saving..."
    : saveState === "copied"
      ? "Path copied!"
      : saveState === "error"
        ? "Save failed"
        : "Save to /tmp"}
</button>
<button
  type="button"
  onClick={onDownload}
  disabled={downloadBusy}
  className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
>
  {downloadBusy
    ? "Rendering..."
    : downloadState === "done"
      ? "Downloaded!"
      : downloadState === "error"
        ? "Download failed"
        : "Download"}
</button>
```

- [ ] **Step 6: Type-check and lint**

Run: `cd platform/frontend && npx tsc -b --noEmit && npm run lint`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add platform/frontend/src/components/social-post/TweetSection.tsx
git commit -m "feat(tweet): add Save to /tmp and Download buttons"
```

---

## Task 6: Mirror the changes in LinkedinSection

**Files:**
- Modify: `platform/frontend/src/components/social-post/LinkedinSection.tsx`

Apply the same six edits from Task 5 to `LinkedinSection.tsx`. The structure of both files is intentionally parallel, so each edit lands in the analogous location.

- [ ] **Step 1: Replace imports**

Replace `import { toBlob } from "html-to-image";` with:

```ts
import { rasterize, saveToTmp, downloadAsPng } from "./imageActions";
```

Add the same `slugifyTitle` helper below the `type CopyState = ...` line.

- [ ] **Step 2: Swap inline toBlob in onCopyImage**

Same edit as Task 5 step 2.

- [ ] **Step 3: Add the four state hooks**

Same as Task 5 step 3.

- [ ] **Step 4: Add the two handler functions**

Same as Task 5 step 4.

- [ ] **Step 5: Add the two buttons**

Same as Task 5 step 5: insert between "Copy image" and "Regenerate".

- [ ] **Step 6: Type-check and lint**

Run: `cd platform/frontend && npx tsc -b --noEmit && npm run lint`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add platform/frontend/src/components/social-post/LinkedinSection.tsx
git commit -m "feat(linkedin): add Save to /tmp and Download buttons"
```

---

## Task 7: Update llms.txt

**Files:**
- Modify: `llms.txt`

The project convention (CLAUDE.md, "llms.txt Navigation" section) requires updating llms.txt when files are added.

- [ ] **Step 1: Add backend route entry**

In the "Platform Backend" section of `llms.txt`, after the existing `routes/files.py` line, add:

```
- [platform/src/routes/uploads.py](platform/src/routes/uploads.py) -- POST /api/uploads/tmp-image: writes PNG uploads to /tmp and returns the absolute path; used by SocialPostCard "Save to /tmp" button
```

- [ ] **Step 2: Add frontend api client entry**

In the same file, near the other `platform/frontend/src/api/*.ts` entries, add:

```
- [platform/frontend/src/api/uploads.ts](platform/frontend/src/api/uploads.ts) -- uploadTmpImage(blob) client for POST /api/uploads/tmp-image
```

- [ ] **Step 3: Add frontend helper entry**

Near the other `social-post` entries (if any) or the chat components block, add:

```
- [platform/frontend/src/components/social-post/imageActions.ts](platform/frontend/src/components/social-post/imageActions.ts) -- shared rasterize/saveToTmp/downloadAsPng helpers used by TweetSection and LinkedinSection
```

- [ ] **Step 4: Commit**

```bash
git add llms.txt
git commit -m "docs(llms): index new uploads route and social-post helpers"
```

---

## Task 8: Manual verification

No frontend test framework is set up (package.json declares no vitest/jest), so the UI gets manually verified.

- [ ] **Step 1: Boot the platform**

Run the dev server per the project's standard start procedure. Open the SPA in a browser.

- [ ] **Step 2: Open a session that has a SocialPostCard**

Trigger the social-post modal from a session with tool calls (the same path as before; `useSocialPost` resolves once the modal opens).

- [ ] **Step 3: Verify Tweet section "Save to /tmp"**

Click the "T" button to render TweetSection, wait for the tweet to populate, click "Save to /tmp".

Expected:
- Button briefly shows "Saving..." then "Path copied!" for ~2 seconds.
- Open a terminal and paste -- the value matches `/tmp/contextagora-card-<digits>-<8-hex-chars>.png`.
- `ls -l <path>` shows the file exists.
- `file <path>` reports "PNG image data".

- [ ] **Step 4: Verify Tweet section "Download"**

Click "Download" in TweetSection.

Expected:
- Button briefly shows "Rendering..." then "Downloaded!".
- A PNG with a slugified filename derived from the card title (e.g. `stop-repeating-yourself.png`) lands in the OS Downloads folder.

- [ ] **Step 5: Verify LinkedIn section**

Click the "L" button. Repeat steps 3 and 4 against LinkedinSection. Expect identical behavior, with state independent from the Tweet section's buttons.

- [ ] **Step 6: Regression check on existing "Copy image"**

Click the existing "Copy image" button in either section. Expected: the clipboard now holds image bytes (paste into a chat or image editor and confirm). This validates that swapping the inline toBlob call for the rasterize helper preserved behavior.

- [ ] **Step 7: Backend negative cases via curl**

From a terminal (replace `<port>` with the dev port, typically 8000):

```bash
# Non-PNG: expect 415
echo "not a png" > /tmp/notapng.txt
curl -i -F "file=@/tmp/notapng.txt" http://localhost:<port>/api/uploads/tmp-image

# Oversize: build an 11 MB file starting with PNG magic, expect 413
( printf '\x89PNG\r\n\x1a\n' && head -c $((11 * 1024 * 1024)) /dev/zero ) > /tmp/big.png
curl -i -F "file=@/tmp/big.png" http://localhost:<port>/api/uploads/tmp-image
```

Expected: first returns HTTP/1.1 415, second returns HTTP/1.1 413.

- [ ] **Step 8: Cleanup**

Remove `/tmp/notapng.txt` and `/tmp/big.png` (and any saved cards you no longer need). The other `/tmp/contextagora-card-*.png` files are harmless; /tmp clears on reboot.

---

## Done criteria

- All six backend tests in `test_uploads.py` pass.
- The full backend suite (`uv run pytest -q`) passes with no regressions.
- `npx tsc -b --noEmit` and `npm run lint` are clean on the frontend.
- TweetSection and LinkedinSection each show five image-row buttons in this order: Copy text/post, Copy image, Save to /tmp, Download, Regenerate.
- Save to /tmp puts a real path on the clipboard that points at a real PNG.
- Download produces a slug-named PNG in the user's Downloads folder.
- llms.txt indexes the three new files.
