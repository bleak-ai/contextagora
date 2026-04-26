# Social-post card: save-to-/tmp and download buttons

## Problem

The SocialPostCard (rendered inside `SocialPostModal`) is a marketing visual we want to publish on Twitter and LinkedIn. Today both `TweetSection` and `LinkedinSection` expose only a single image action — **Copy image** — which rasterises the card via `html-to-image` and writes a PNG `Blob` to the system clipboard.

Two real workflows aren't covered:

1. **Pasting the rendered image into the Contextagora chat itself** so the underlying Claude Code subprocess can `Read` the file. The chat backend takes a text prompt; pasting raw image bytes isn't supported. The simplest path is to surface a server-side file path the user can paste in as text.
2. **Saving the PNG to disk** so it can be drag-dropped into the LinkedIn / Twitter composer or kept as an artifact next to the rest of the post copy. Today the only escape hatch is the clipboard, which is ephemeral and a single slot.

Both `TweetSection` and `LinkedinSection` already duplicate the rasterise + clipboard-write code (`TweetSection.tsx:49–71`, `LinkedinSection.tsx:48–70`) so any new image action would be duplicated three ways without a small extraction.

## Goals

- Add **Save to /tmp** and **Download** buttons next to the existing **Copy image** button in both `TweetSection` and `LinkedinSection`.
- *Save to /tmp* writes the rasterised PNG to the server's `/tmp` directory and copies the resulting absolute path to the user's clipboard, so it can be pasted into the Contextagora chat as text.
- *Download* triggers a browser download of the PNG with a slugified filename derived from the card title.
- Extract the shared rasterise / save / download logic into one helper so it lives in exactly one place.
- Reuse the existing `_validate_path` allowlist in `platform/src/routes/files.py:18` (already permits `/tmp`) so the saved file is reachable through `/api/files/preview` and `/api/files/download` for free.

## Non-goals

- Replacing the existing **Copy image** button. It stays — pasting a PNG straight into another app's composer is a distinct workflow from grabbing a server path.
- Garbage-collecting `/tmp` images. They're temp by virtue of `/tmp`'s OS-level lifecycle (typically cleared on reboot or by `tmpwatch`); we don't add our own sweeper.
- A general image-upload endpoint, image library, or drag-and-drop into chat from the user's local disk. This spec is scoped to *outbound* rasterised cards only.
- Server-side image transforms (resizing, compression, format conversion).
- Persisting saved card paths in any DB or session store.
- Authentication / per-user scoping. Contextagora is single-tenant self-hosted; the existing `/api/files/*` endpoints have no auth gate either.

## Design

### Backend

#### New endpoint: `POST /api/uploads/tmp-image`

Lives in a new file `platform/src/routes/uploads.py`, registered in `platform/src/server.py` alongside the other routers.

- **Accepts** a `multipart/form-data` request with one field:
  - `file`: the PNG `Blob` posted from the frontend (FastAPI `UploadFile`).
- **Validates**:
  - The first 8 bytes of the upload match the PNG magic header `89 50 4E 47 0D 0A 1A 0A`. Reject other formats with HTTP 415.
  - Size cap: 10 MB (`MAX_UPLOAD_SIZE = 10 * 1024 * 1024`). Reject larger uploads with HTTP 413.
- **Writes** to `/tmp/contextagora-card-<unix-ms-timestamp>-<8-char-uuid-hex>.png` using a small helper (e.g. `secrets.token_hex(4)`).
- **Returns** `{ "path": "/tmp/contextagora-card-…png" }` with HTTP 201.
- Uses Python stdlib only — no new dependencies.

The `/tmp` write target is intentionally hard-coded; we are not parameterising the directory. If we later decide to move it (e.g. into `settings.UPLOAD_DIR`), the change is local to this file.

#### Why a new router file (not folded into `files.py`)

`files.py` is read-only download/preview. Mixing in a write endpoint would muddy that contract; a dedicated `uploads.py` keeps responsibilities clean and makes it obvious where future write endpoints (chat image paste, etc.) would land.

#### Reachability of the saved file

Once written, the PNG is retrievable via the existing `GET /api/files/preview?path=/tmp/contextagora-card-…png` and `GET /api/files/download?path=…` because `_validate_path` in `platform/src/routes/files.py:18` already allowlists `/tmp`. No additional routing or validation work needed.

### Frontend

#### New shared helper: `platform/frontend/src/components/social-post/imageActions.ts`

Three functions, each pure of UI state:

```ts
export async function rasterize(node: HTMLElement): Promise<Blob>
export async function saveToTmp(node: HTMLElement): Promise<{ path: string }>
export async function downloadAsPng(node: HTMLElement, filename: string): Promise<void>
```

- `rasterize` wraps `toBlob(node, { pixelRatio: 2, cacheBust: true })` with a `throw new Error("rasterize failed")` on null. This is the same call shape both sections use today.
- `saveToTmp` calls `rasterize`, builds a `FormData` with the blob as `file`, POSTs to `/api/uploads/tmp-image`, returns the parsed JSON. Throws on non-2xx.
- `downloadAsPng` calls `rasterize`, creates an object URL, programmatically clicks an `<a download={filename}>`, and revokes the URL. Filename is supplied by the caller; the helper does not slugify.

The helper does **not** touch the clipboard or React state. Each section owns its own button-state machine (idle / busy / done / error) and decides whether to copy the path to the clipboard after `saveToTmp` resolves. This keeps the helper testable and the side-effects visible at the call site.

#### New API client: `platform/frontend/src/api/uploads.ts`

One thin function:

```ts
export async function uploadTmpImage(blob: Blob): Promise<{ path: string }>
```

Posts to `/api/uploads/tmp-image` with a `FormData` containing `file`. Throws on non-2xx with the response text in the message. `imageActions.saveToTmp` calls this — keeps the network layer separate from the rasterisation layer, matching the `api/` vs `components/` split everywhere else in the codebase.

#### `TweetSection` and `LinkedinSection` changes

Both files get the same edit, applied symmetrically.

1. Replace the existing inline `toBlob` block in `onCopyImage` with a call to `rasterize(node)` from the helper. (Behaviour unchanged; just removes the duplication.)
2. Add two new state machines next to `imageCopy` / `imageBusy`:
   - `saveState: "idle" | "saved" | "error"` and `saveBusy: boolean`
   - `downloadState: "idle" | "done" | "error"` and `downloadBusy: boolean`
3. Add two handlers:
   - `onSaveToTmp` — calls `saveToTmp(node)`, then `navigator.clipboard.writeText(path)`. Flips `saveState` to `"saved"` for ~2 s. On failure, `"error"` for ~2 s.
   - `onDownload` — derives `filename = slugify(card.title) + ".png"` (slugify is local to the section file; tiny one-liner), then calls `downloadAsPng(node, filename)`. Flips `downloadState` for the same durations.
4. Add two `<button>` elements after the existing **Copy image** button, matching its styling exactly:
   - **Save to /tmp** → label cycles `Save to /tmp` → `Saving…` → `Path copied!` / `Save failed` → back to idle.
   - **Download** → label cycles `Download` → `Rendering…` → `Downloaded!` / `Download failed` → back to idle.

Button order in the row: **Copy text/post · Copy image · Save to /tmp · Download · Regenerate**.

#### Slugify

Inline in the section files:

```ts
function slugifyTitle(title: string): string {
  return (title || "card")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "card";
}
```

No external dependency. The `|| "card"` fallback handles empty / non-ASCII-only titles. The 60-char cap keeps filenames sane.

## Data flow (happy path — Save to /tmp)

1. User clicks **Save to /tmp** in `TweetSection`.
2. Section state → `saveBusy = true`.
3. `imageActions.saveToTmp(cardRef.current)`:
   - Calls `rasterize` → PNG `Blob` from `html-to-image`.
   - Wraps in `FormData`, POSTs to `/api/uploads/tmp-image`.
4. Backend:
   - Reads `UploadFile`, checks PNG magic + size cap.
   - Generates `/tmp/contextagora-card-1714137600000-a1b2c3d4.png`.
   - Writes the bytes via `Path.write_bytes`.
   - Returns `{ "path": "/tmp/contextagora-card-1714137600000-a1b2c3d4.png" }`.
5. Frontend: `await navigator.clipboard.writeText(path)`.
6. Section state → `saveState = "saved"`, `saveBusy = false`. Button reads **"Path copied!"** for ~2 s, then resets.
7. User pastes the path into the Contextagora chat (or any other text field). Claude Code's `Read` tool can then ingest the image directly from `/tmp`.

## Data flow (happy path — Download)

1. User clicks **Download** in `LinkedinSection`.
2. Section state → `downloadBusy = true`.
3. `imageActions.downloadAsPng(cardRef.current, "stop-repeating-yourself.png")`:
   - Calls `rasterize` → PNG `Blob`.
   - `URL.createObjectURL(blob)`.
   - Creates a detached `<a href={url} download={filename}>`, clicks it, removes it.
   - `URL.revokeObjectURL(url)`.
4. Browser saves to the user's default Downloads folder.
5. Section state → `downloadState = "done"`, `downloadBusy = false`. Button reads **"Downloaded!"** briefly, then resets.

## Error handling and edge cases

- **`html-to-image` fails** (CORS-tainted image, font load timeout). `rasterize` throws; both handlers flip to `"error"`. Button label shows **"Save failed"** / **"Download failed"** for ~2 s.
- **Backend rejects upload** (non-PNG, oversize). `saveToTmp` throws on non-2xx; UI shows `"Save failed"`. We do **not** surface the HTTP status text in the button label — the existing **Copy image** flow doesn't either, and the row stays compact. A console error from the API client is acceptable for debugging.
- **Clipboard write fails** (no document focus, denied permission). `navigator.clipboard.writeText` throws; treat the same as a save error. The PNG is still on disk at the returned path; we accept that the user has to retry to get the path into the clipboard. We do **not** keep the path on screen as a fallback — keeping the surface area small is preferred.
- **`cardRef.current` is null** (e.g. the card hasn't rendered yet). Both handlers early-return to `"error"`. Same behaviour as the existing **Copy image** button.
- **Title is empty / all punctuation.** `slugifyTitle` falls back to `"card"`, so the download is `card.png`.
- **Concurrent clicks.** Each button has its own `*Busy` flag and is `disabled` while busy. The two new buttons are independent of each other and of **Copy image** (a user could in theory click both at once — each would fire its own rasterise, which is wasteful but not broken). Not worth adding a shared lock.
- **`/tmp` not writable** (extremely unlikely in our self-hosted Docker / dev environments). The endpoint raises `OSError` → FastAPI returns 500 → frontend treats as save failure.
- **Path-injection / traversal via filename.** The endpoint generates the filename internally (`token_hex` + timestamp); the client cannot influence it. Nothing to validate beyond magic bytes and size.

## Manual verification plan

1. Open a session that has produced a SocialPostCard (or trigger one via the existing `useSocialPost` flow).
2. Click **T** to open the Tweet section, wait for it to render, then click **Save to /tmp**.
3. Expect: button briefly reads **"Path copied!"**. Paste into a terminal — value looks like `/tmp/contextagora-card-1714137600000-a1b2c3d4.png`. `ls` it — file exists, opens as a valid PNG.
4. Click **Download** in the same section. Expect: a PNG named like `stop-repeating-yourself.png` lands in Downloads.
5. Open the LinkedIn section (**L** button) and repeat 3–4 — expect the same behaviour, independent state.
6. Click **Copy image** to confirm the existing flow still works (no regression from the helper extraction).
7. From a terminal, `curl -F "file=@/tmp/notapng.txt" http://localhost:<port>/api/uploads/tmp-image` — expect `415`.
8. Manually create an 11 MB PNG and POST it — expect `413`.
9. Confirm the Tweet/LinkedIn flow still works after a server restart (the helper, hook, and routes load cleanly with no missing imports).

## Open questions

None.
