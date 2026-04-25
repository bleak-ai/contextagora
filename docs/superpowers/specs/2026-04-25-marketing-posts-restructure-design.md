# Marketing posts: per-post files + in-chat overview

## Problem

Today, the `marketing-contextagora` module stores its launch series in three coupled files:

- `playbook.md` (340 lines): post copy, voice, schedule, strategic rationale, all interleaved.
- `posts.csv`: status tracker, one row per post-platform pair.
- `info.md`: a small ad-hoc task checklist.

Finding "what should I post today" requires opening `info.md`, then jumping to `playbook.md`, then scrolling to the right post, then selecting and copying multi-paragraph prose. There is no place for an image to live alongside a post, no easy "browse upcoming posts" view, and no overview surface inside Contextagora itself — the user is currently expected to leave the chat (or open `playbook.md` in a separate editor) to do their day-to-day posting.

The user works inside Contextagora and wants the entire posting workflow to live there: ask the agent for an overview, pick a post, copy it, paste into LinkedIn or X. Images, when they exist, should be alongside the post and easy to find.

This restructure is also a deliberate first step toward a future React dashboard that renders the same data interactively (the user explicitly framed the work as "a start that can escalate"). The data layer chosen now must be one a future React component can read without modification.

## Goals

- One file per post, addressable by date and platform from a directory listing.
- Images live next to the post that uses them; multiple posts can reference the same image.
- The agent, asked from inside Contextagora chat, can surface (a) an overview of upcoming posts and (b) the full body of any one post, ready to paste.
- Status (scheduled / posted) is a property of the post, not a folder location.
- The data layout is React-ready: a future `<PostsPanel>` component reads the same `posts/` directory unchanged.
- Migrating preserves every word currently in `playbook.md` — no copy is rewritten as part of this work.

## Non-goals

- Building the React dashboard. That is Phase 2; this spec only locks the data layer it will consume.
- Building a CLI or terminal script for browsing posts. The agent in chat is the only Phase 1 surface.
- Auto-scheduling, auto-posting, or any LinkedIn/X API integration.
- Analytics ingestion (impressions, comments, signups). Frontmatter has fields for these, but populating them is manual and out of scope.
- Image generation or asset management workflow.
- Migrating other modules (e.g. `outbound-contextagora`) to a similar layout. This spec is scoped to `marketing-contextagora`.

## Design

### Directory layout (after migration)

```
platform/src/context/marketing-contextagora/
  info.md                             ← module index + how to use posts/ (rewritten)
  llms.txt                            ← updated to point at posts/
  module.yaml                         ← unchanged
  playbook.md                         ← kept; trimmed to strategy/voice only (post copy moves out)
  posts/
    2026-04-21-launch-linkedin.md
    2026-04-21-launch-x.md
    2026-04-21-launch.png             ← shared image, referenced by both LinkedIn + X
    2026-04-23-checkin-linkedin.md
    2026-04-23-checkin-x.md
    2026-04-28-onboarding-linkedin.md
    2026-04-28-onboarding-x.md
    2026-04-30-soundmurai-linkedin.md
    2026-04-30-soundmurai-x.md
    2026-05-05-cross-tools-linkedin.md
    2026-05-05-cross-tools-x.md
```

Filenames follow `YYYY-MM-DD-<slug>-<platform>.md`. The date prefix gives natural chronological sort in any editor; the slug matches the existing `series-post-N` topic words for human recognition; the platform suffix disambiguates the LinkedIn and X versions of the same post.

Images are sibling files. They have no fixed naming convention beyond living in `posts/`; the post that uses an image references it by relative filename in frontmatter. One image may be referenced by several posts (e.g. the LinkedIn and X versions of the same launch post both point at `2026-04-21-launch.png`).

### Post file schema

Each `posts/*.md` is YAML frontmatter + Markdown body.

```markdown
---
platform: linkedin            # linkedin | x
scheduled_date: 2026-04-21
status: scheduled             # scheduled | posted
posted_at:                    # ISO datetime, filled when status flips to posted
image: 2026-04-21-launch.png  # relative to posts/, optional
source: series-post-0         # free-form, mirrors current posts.csv
link:                         # URL of the live post, filled after posting
notes:                        # free-form, optional
---
I built a thing. It's called Contextagora.

Why I built it: for the past year I kept having the same annoying moment...

(full paste-ready body follows, no extra wrapping)
```

The body is the **exact text the user will paste**. No headings, no commentary, no "LinkedIn version:" prefix — just the post copy, in the order it should appear in the destination. Whitespace and line breaks are preserved as-is when the agent renders the body in chat.

### X thread handling

X threads are multiple tweets posted as a chain. The body holds the whole thread, with tweets separated by a `---` line. This keeps the file format identical for both platforms and lets the user copy either the entire thread (one paste, then split manually) or one tweet at a time.

```markdown
---
platform: x
...
---
"How many members haven't checked into their gym in 30 days but are still being billed?"

Someone on our support team at MAAT asked that yesterday.

What answering it used to take vs what it takes now ↓

---

Before Contextagora:

open the db → remember the schema → write the join → cross-ref Stripe for active subs → paste into a spreadsheet.

~20 minutes.

---

Now:

type the question into Contextagora. It already knows our db and Stripe (we told it once). Writes the script, runs it, returns the list.

~15 seconds.

---

Teach the AI your stack once. Ask questions forever.

If your support team lives in SQL + dashboards, join the waitlist → contextagora.com
```

The `---` separator is intentionally Markdown's thematic break, so the file still renders cleanly in any Markdown previewer if the user opens it directly.

### Agent convention

The way the agent surfaces posts in chat is documented in the module's `info.md` (so the contract is visible to the user) and reinforced by the way `posts/` is described in `llms.txt` (so the agent finds the convention naturally). There is no new prompt, no new slash command — this is a documented pattern, not new infrastructure.

Two recognised user intents:

**1. "show posts" / "what's coming up" / "upcoming posts" / "what should I post today"**

The agent lists posts with `status: scheduled`, sorted by `scheduled_date` ascending. Output is a Markdown numbered list, one entry per post, with date, platform, and a one-line preview drawn from the first non-empty line of the body. Today's posts are flagged with a `← today` suffix. Example:

```
Upcoming posts:

1. 2026-04-21 · linkedin · "I built a thing. It's called Contextagora." ← today
2. 2026-04-21 · x · "I built Contextagora." ← today
3. 2026-04-23 · linkedin · "How many members haven't checked into their gym..."
4. 2026-04-23 · x · "How many members haven't checked into their gym..."
5. 2026-04-28 · linkedin · "First week for someone new on our support team..."
...

To copy one, ask "post 3" or "today's linkedin".
```

**2. "post N" / "today's <platform>" / "the launch post" / similar**

`N` resolves against the most recent overview the agent showed in the current conversation, not against any global numbering. (Numbers shift as posts get marked posted, so a stable global index would be misleading.) "Today's linkedin", "the launch post", and similar natural-language references resolve directly from frontmatter without going through the overview.

The agent identifies the matching post file, then renders **only** the body inside a fenced code block — no commentary above or below the block, no extra prose. If `image:` is set in frontmatter, a single line follows the block: `Image: posts/<filename>` (the absolute path, copy-pasteable into Finder / `open`).

```
[fenced code block: full post body, exact paste copy]

Image: /Users/.../marketing-contextagora/posts/2026-04-21-launch.png
```

The fenced code block is the copy surface. With the clipboard-button enhancement (below), the user clicks once and the body is on their clipboard, ready to paste.

**3. Status updates: "I posted post 1" / "mark today's linkedin as posted"**

The agent edits the relevant post file's frontmatter: sets `status: posted`, `posted_at:` to the current ISO datetime, and asks once for the live URL to populate `link:`. No file moves; the post stays in `posts/`.

### Clipboard button on chat code blocks

The chat already renders Markdown via `MarkdownText.tsx` (`platform/frontend/src/components/chat/MarkdownText.tsx`) and styles `pre` blocks via `.aui-md pre` (`platform/frontend/src/styles/index.css`). It does not currently render a copy button on code blocks.

A small enhancement adds a clipboard button to every rendered `<pre>` block. It's a custom `pre` component passed into `MarkdownTextPrimitive`'s `components` map, alongside the existing `a: DownloadLink`. The button absolute-positions in the top-right of the code block, calls `navigator.clipboard.writeText` on the inner text, and shows a brief "Copied" confirmation. No styling overhaul — match the existing border/radius language of `.aui-md pre`.

This is a generic chat improvement that benefits every code block, not just posts. It is in scope for this spec because it is the difference between "click to copy" (the user's actual ask) and "manually select multi-paragraph text in a chat bubble" (the fallback).

### `playbook.md` — what stays, what goes

The current `playbook.md` mixes three concerns. After migration:

- **Post copy → moves out** to individual `posts/*.md` bodies. Verbatim. No edits.
- **Voice / format rules** ("real question → before → after → CTA", "if a post doesn't have a real question in it, it's not ready yet", "kill survey CTAs", "no em dashes") → **stays in `playbook.md`**. This is the writing standard, applied to every new post.
- **Launch schedule + cadence rules + strategic rationale** → **stays in `playbook.md`**. This is the strategy doc.

After migration, `playbook.md` becomes a ~150-line strategy + voice doc, not a content store. The "Universal format" section, "Posting tips", "What not to post", and the strategic rationale remain. The five "Post N" sections are replaced by a one-paragraph pointer to `posts/`.

### `info.md` — rewritten as the entry point

Today `info.md` is a hand-maintained task checklist that has already drifted (the launch is in two days; the checklist still shows pre-launch tasks). Replacement contents:

```markdown
# Marketing — Contextagora

Content engine, Barcelona founder events, and launch moments.

## How to use this module

- **See what's coming up:** ask "show upcoming posts".
- **Get a post to publish:** ask "post 3" or "today's linkedin".
- **Mark one as posted:** ask "I posted post 3" — include the live URL.
- **Browse / edit directly:** posts live in `posts/`, one file per post.

## Files

| File | Purpose |
|---|---|
| `posts/` | One file per post + sibling images. The source of truth for what gets published. |
| `playbook.md` | Voice, format rules, schedule, strategic rationale. Read before writing a new post. |
| `llms.txt` / `module.yaml` | Module entry points. |
```

No more launch-day checklist; that information now lives in the relevant `posts/*.md` files (each scheduled date is on the post itself).

### `llms.txt` — updated entries

The current `llms.txt` references `playbook.md` and `posts.csv`. The replacement points at `posts/` and re-describes `playbook.md`'s narrower role:

```
- [info.md](info.md) — module overview + how to ask the agent for posts.
- [posts/](posts/) — one file per post (Markdown body + frontmatter), with sibling image files.
- [playbook.md](playbook.md) — voice, format rules, launch schedule, strategic rationale.
```

The cross-module note about `outbound-contextagora` partner stories stays, with its `posts.csv` reference replaced by a reference to creating a new `posts/<date>-<partner>-<platform>.md` file with `source: partner-<name>` in frontmatter.

### `posts.csv` — dropped

`posts.csv` is removed during migration. Its data (id, topic, platform, scheduled_date, status, source) is fully expressible in the per-post frontmatter, and keeping it as a sibling file would mean two sources of truth for status. The metric columns (impressions, comments, signups) are likewise frontmatter fields.

If a flat aggregate ever becomes useful again — for analytics or reporting — it can be regenerated on demand from `posts/`. It is not regenerated automatically; nothing in Phase 1 produces a CSV.

### Migration

A one-shot, manual migration. Sequence:

1. Create `posts/` directory.
2. For each row in current `posts.csv`, create one `posts/<date>-<slug>-<platform>.md` file. Copy the body verbatim from the matching section of `playbook.md`. Populate frontmatter from the CSV row.
3. For posts where the existing `playbook.md` documents a specific visual ask (Post 0's 15-sec screen recording, the X pin video), set `image:` in frontmatter to the planned filename (e.g. `2026-04-21-launch.png`). **No binary is committed** — the file is added later by the user when the asset is ready. The frontmatter reference is a placeholder, not a zero-byte file. For posts without a specified visual, leave `image:` empty.
4. Trim `playbook.md` to remove the "Post 0–4" copy sections; replace with a one-paragraph pointer.
5. Rewrite `info.md` per above.
6. Update `llms.txt` per above.
7. Delete `posts.csv`.
8. Update cross-module references in `outbound-contextagora/`. Two existing files reference `../marketing-contextagora/posts.csv` and a non-existent `build-in-public-posts.md`:
    - `outbound-contextagora/llms.txt` line 21: replace the "log a content idea in `posts.csv`" sentence with a pointer to creating a new `posts/<date>-<slug>-<platform>.md` file with `source: partner-<name>`.
    - `outbound-contextagora/info.md` line 15: same replacement.
    - `outbound-contextagora/playbook.md` lines 170 and 183: replace the broken `build-in-public-posts.md` link with a link to `marketing-contextagora/playbook.md` (the trimmed strategy doc) or `posts/` (the new content store), whichever the surrounding sentence is actually about.

The user reviews the result. No automated tooling, no migration script committed — this is a one-time content edit.

### Future (Phase 2, not in scope)

A React `<PostsPanel>` reads `posts/` via a new backend endpoint (parallel to the existing module file APIs), parses frontmatter, and renders an interactive overview: cards grouped by status, copy buttons per body, image thumbnails, click-to-edit status. This work re-uses the social-post component patterns already in `platform/frontend/src/components/social-post/` (`SocialPostCard`, `SocialPostModal`, theme system). No file in `posts/` changes when Phase 2 lands.

## Risks and tradeoffs

- **Status drift.** Frontmatter status only stays accurate if updated. Mitigation: the agent updates it via the "I posted X" intent, so the user doesn't have to remember to edit YAML. If the user starts forgetting to tell the agent, the `posts.csv` problem returns in a new form. Acceptable for Phase 1; Phase 2's UI fixes it with a button.
- **YAML in user-facing files.** Frontmatter is a small mental tax for someone editing posts directly in an editor. The agent shields the user from this in normal use; direct editing is the exception, and the schema is small (8 fields, all simple).
- **Trimming `playbook.md` may lose context.** A future writer reading only the trimmed playbook might miss the lived voice from the original Post 0–4 examples. Mitigation: the "Universal format" section still names the structure, and `posts/` is the canonical example library.
- **One image referenced by multiple posts.** Convenient (LinkedIn + X share an asset) but means deleting a post does not safely delete its image. Acceptable: image deletion is rare and a manual operation either way.

## Open decisions

The user has approved the data-layer design (flat `posts/`, frontmatter status, one file per post-platform pair). Two scope choices remain, surfaced for resolution before the implementation plan:

- **Clipboard button on chat code blocks.** Recommended yes — the user's stated workflow ("click copy") collapses to manual select-and-copy without it, which is exactly the friction this spec exists to remove. Roughly 30 minutes of frontend work; benefits every code block in chat, not just posts. The alternative is to ship the data restructure now and add the button in a follow-up if the manual path proves annoying.
- **`posts.csv` removal vs. keep-as-generated.** Recommended remove — keeping a generated CSV adds a build step (something has to write it) for an output nothing currently consumes. If a future need for a flat aggregate appears, regenerating from `posts/` is a one-off script, not a maintained artifact.
