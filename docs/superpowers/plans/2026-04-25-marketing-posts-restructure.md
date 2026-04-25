# Marketing Posts Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `marketing-contextagora` from `playbook.md` + `posts.csv` to a per-post-file layout in `posts/`, document the in-chat agent convention, and add a clipboard button to chat code blocks so the user can pick today's post and copy it without leaving Contextagora.

**Architecture:** One file per post in `posts/` with YAML frontmatter (status, date, platform, image, etc.) + a Markdown body that is the exact paste-ready copy. Sibling image files. Agent reads the directory, surfaces overviews and bodies in chat. A small enhancement to `MarkdownText.tsx` adds a clipboard button to every rendered `<pre>` block.

**Tech Stack:** Markdown + YAML frontmatter (data layer), Python/JS-agnostic file layout, React 19 + TypeScript + `@assistant-ui/react-markdown` (frontend clipboard button).

**Spec:** `docs/superpowers/specs/2026-04-25-marketing-posts-restructure-design.md`

**Source material for the migration:**
- `platform/src/context/marketing-contextagora/playbook.md` — current home of all post copy.
- `platform/src/context/marketing-contextagora/posts.csv` — current source of truth for status / scheduled_date / source.

---

## File map (after migration)

```
platform/src/context/marketing-contextagora/
  info.md                                     ← rewritten (Task 8)
  llms.txt                                    ← updated (Task 9)
  module.yaml                                 ← unchanged
  playbook.md                                 ← trimmed (Task 7)
  posts/                                      ← new (Tasks 1–6)
    2026-04-21-launch-linkedin.md
    2026-04-21-launch-x.md
    2026-04-23-checkin-linkedin.md
    2026-04-23-checkin-x.md
    2026-04-28-onboarding-linkedin.md
    2026-04-28-onboarding-x.md
    2026-04-30-soundmurai-linkedin.md
    2026-04-30-soundmurai-x.md
    2026-05-05-cross-tools-linkedin.md
    2026-05-05-cross-tools-x.md
```

Files removed: `posts.csv` (Task 10).
Files updated outside this module: `outbound-contextagora/llms.txt`, `outbound-contextagora/info.md`, `outbound-contextagora/playbook.md` (Task 11).
Frontend file modified: `platform/frontend/src/components/chat/MarkdownText.tsx` (Task 12).

---

## Conventions for every Task 1–6 post file

Frontmatter schema (8 fields):

```yaml
---
platform: linkedin            # linkedin | x
scheduled_date: 2026-04-21    # YYYY-MM-DD
status: scheduled             # scheduled | posted
posted_at:                    # ISO datetime, empty until posted
image: 2026-04-21-launch.png  # relative to posts/, empty if none
source: series-post-0         # mirrors current posts.csv source column
link:                         # live URL, empty until posted
notes:                        # free-form, optional
---
```

**Body rules:**

- Body is the **exact paste-ready text**. No section headings, no "LinkedIn version:" prefix, no commentary.
- Whitespace and line breaks preserved as-is from `playbook.md`.
- For X threads, separate tweets with a `---` line on its own (Markdown thematic break). The first tweet is the body opener; each subsequent tweet starts after a `---` line.
- LinkedIn posts have no thread separators; the whole body is one paste.

**Image references for the launch series** (set in frontmatter, no binary committed):

| Date | LinkedIn | X | Image filename |
|---|---|---|---|
| 2026-04-21 | yes | yes | `2026-04-21-launch.png` (placeholder for the screen recording / pin video assets the playbook describes) |
| 2026-04-23, 2026-04-28, 2026-04-30, 2026-05-05 | no | no | leave `image:` empty |

---

## Task 1: Create launch posts (2026-04-21)

**Files:**
- Create: `platform/src/context/marketing-contextagora/posts/2026-04-21-launch-linkedin.md`
- Create: `platform/src/context/marketing-contextagora/posts/2026-04-21-launch-x.md`

**Source in `playbook.md`:** lines 20–73 (sections "Post 0: Launch announcement" → end of "Pin video specs" subsection). Body for LinkedIn = lines 26–42 (starting "I built a thing." through "I'd love that."). Body for X = lines 56–61 (starting "I built Contextagora." through "→ contextagora.com"). The "asset & distribution notes" and "Pin video specs" subsections are operational guidance, not paste copy — they stay in `playbook.md` for now (they describe *how* to produce the visual; Task 7 may move them).

- [ ] **Step 1: Read `playbook.md` lines 20–75 to confirm exact body text**

Run: read the file and copy the LinkedIn body (lines 26–42) and X body (lines 56–61) verbatim into your scratch space. Do not paraphrase. Preserve every blank line.

- [ ] **Step 2: Create `posts/` directory**

```bash
mkdir -p platform/src/context/marketing-contextagora/posts
```

- [ ] **Step 3: Write the LinkedIn launch post**

Create `platform/src/context/marketing-contextagora/posts/2026-04-21-launch-linkedin.md`:

```markdown
---
platform: linkedin
scheduled_date: 2026-04-21
status: scheduled
posted_at:
image: 2026-04-21-launch.png
source: series-post-0
link:
notes:
---
I built a thing. It's called Contextagora.

Why I built it: for the past year I kept having the same annoying moment. Open ChatGPT, paste in our db schema, explain how Stripe is set up, explain our infra, explain the business. Ask the question. Close the tab. Next day, same thing from scratch.

Multiply that by every person on the team and every question. Hours a week, re-explaining the same stack.

The problem: AI agents forget your setup the second the chat closes.

The solution: teach the AI your stack once. After that, your support team (and really anyone on the team) can ask a question in plain language and get a real answer, pulled from your actual db, Stripe, APIs, whatever you plug in.

We've been using it internally at MAAT (a SaaS for martial arts gyms) for support for months. Questions that used to take 20 minutes now take 15 seconds. Now we're opening it up to a handful of other teams.

I'll share concrete examples over the next few weeks.

We're opening it up slowly. If you want to be one of the first teams in, the waitlist is at contextagora.com.

And if you just want to say hi (it's been a minute), reply below. I'd love that.
```

- [ ] **Step 4: Write the X pinned launch post**

Create `platform/src/context/marketing-contextagora/posts/2026-04-21-launch-x.md`:

```markdown
---
platform: x
scheduled_date: 2026-04-21
status: scheduled
posted_at:
image: 2026-04-21-launch.png
source: series-post-0
link:
notes: Pinned profile post (single tweet, not a thread). Pin specs in playbook.md.
---
I built Contextagora.

Teach an AI agent your stack once: db, Stripe, APIs, internal tools. Your team asks in plain English, gets real answers.

At MAAT: 20-min queries, now 15 sec.

Applications open, onboarding teams one at a time → contextagora.com
```

- [ ] **Step 5: Verify both files**

Run:
```bash
ls -la platform/src/context/marketing-contextagora/posts/
head -20 platform/src/context/marketing-contextagora/posts/2026-04-21-launch-linkedin.md
head -20 platform/src/context/marketing-contextagora/posts/2026-04-21-launch-x.md
```

Expected: both files exist, frontmatter renders cleanly with `--- ... ---` delimiters, body starts immediately after the closing `---`. No `### LinkedIn version` or other source-doc headings present.

- [ ] **Step 6: Commit**

```bash
git add platform/src/context/marketing-contextagora/posts/2026-04-21-launch-linkedin.md platform/src/context/marketing-contextagora/posts/2026-04-21-launch-x.md
git commit -m "marketing: extract launch posts into posts/ (2026-04-21)"
```

---

## Task 2: Create check-in posts (2026-04-23)

**Files:**
- Create: `platform/src/context/marketing-contextagora/posts/2026-04-23-checkin-linkedin.md`
- Create: `platform/src/context/marketing-contextagora/posts/2026-04-23-checkin-x.md`

**Source in `playbook.md`:** "Post 1: 'What this thing actually does'" section (around lines 77–124). LinkedIn body = lines 81–93. X thread body = tweets 1–4, lines 99–121. Operational note "Posting tip: if reach on tweet 1 is low..." (line 123) → put in frontmatter `notes:`.

- [ ] **Step 1: Read `playbook.md` lines 77–124 to confirm exact body text**

- [ ] **Step 2: Write the LinkedIn check-in post**

Create `platform/src/context/marketing-contextagora/posts/2026-04-23-checkin-linkedin.md`:

```markdown
---
platform: linkedin
scheduled_date: 2026-04-23
status: scheduled
posted_at:
image:
source: series-post-1
link:
notes:
---
"How many members haven't checked into their gym in 30 days but are still being billed?"

Someone on our support team at MAAT asked that yesterday.

Before Contextagora: open the db, remember the schema, write the join, cross-ref Stripe for active subs, paste into a spreadsheet.
→ 20 minutes.

Now: type the question into Contextagora. It already knows our db and our Stripe setup (we told it once). Writes the script, runs it, returns the list.
→ 15 seconds.

Teach the AI your stack once. Ask questions forever.

If your support team lives in SQL + dashboards, join the waitlist → contextagora.com
```

- [ ] **Step 3: Write the X check-in thread**

Create `platform/src/context/marketing-contextagora/posts/2026-04-23-checkin-x.md`:

```markdown
---
platform: x
scheduled_date: 2026-04-23
status: scheduled
posted_at:
image:
source: series-post-1
link:
notes: 4-tweet thread. If reach on tweet 1 is low, post the link as a reply to tweet 4 instead of in-body.
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

- [ ] **Step 4: Verify and commit**

```bash
ls platform/src/context/marketing-contextagora/posts/2026-04-23-*
git add platform/src/context/marketing-contextagora/posts/2026-04-23-checkin-linkedin.md platform/src/context/marketing-contextagora/posts/2026-04-23-checkin-x.md
git commit -m "marketing: extract check-in posts into posts/ (2026-04-23)"
```

---

## Task 3: Create onboarding posts (2026-04-28)

**Files:**
- Create: `platform/src/context/marketing-contextagora/posts/2026-04-28-onboarding-linkedin.md`
- Create: `platform/src/context/marketing-contextagora/posts/2026-04-28-onboarding-x.md`

**Source in `playbook.md`:** "Post 2: 'Onboarding without the handholding'" (around lines 127–163). LinkedIn body = lines 132–143. X thread = 3 tweets, lines 147–162.

- [ ] **Step 1: Read `playbook.md` lines 127–163 to confirm exact body text**

- [ ] **Step 2: Write the LinkedIn onboarding post**

Create `platform/src/context/marketing-contextagora/posts/2026-04-28-onboarding-linkedin.md`:

```markdown
---
platform: linkedin
scheduled_date: 2026-04-28
status: scheduled
posted_at:
image:
source: series-post-2
link:
notes:
---
First week for someone new on our support team at MAAT. They asked:

*"Which members haven't paid this month but still have active memberships?"*

Usually what happens: a senior teammate drops what they're doing, walks them through the db schema, the Stripe join, the right filters. 30 to 45 minutes gone. Two weeks later, a new person joins, and the same loop starts over.

With Contextagora: they type the question. The tool already knows our stack. Answer in 15 seconds. No one else involved.

The shift isn't just speed. Context lives in the tool, not in one senior person's head.

If new hires on your team need an engineer to answer every data question, join the waitlist → contextagora.com
```

- [ ] **Step 3: Write the X onboarding thread**

Create `platform/src/context/marketing-contextagora/posts/2026-04-28-onboarding-x.md`:

```markdown
---
platform: x
scheduled_date: 2026-04-28
status: scheduled
posted_at:
image:
source: series-post-2
link:
notes: 3-tweet thread.
---
First week for someone new on our support team at MAAT.

They asked: "Which members haven't paid this month but still have active memberships?"

What usually happens vs what actually happened ↓

---

Usually: senior teammate drops what they're doing, walks them through the schema, the Stripe join, the filters. 30-45 min gone.

With Contextagora: they type the question. Answer in 15 seconds. No one else involved.

---

The shift isn't just speed. Context lives in the tool, not in one senior person's head.

If new hires on your team need an engineer to answer every data question, join the waitlist → contextagora.com
```

- [ ] **Step 4: Verify and commit**

```bash
ls platform/src/context/marketing-contextagora/posts/2026-04-28-*
git add platform/src/context/marketing-contextagora/posts/2026-04-28-onboarding-linkedin.md platform/src/context/marketing-contextagora/posts/2026-04-28-onboarding-x.md
git commit -m "marketing: extract onboarding posts into posts/ (2026-04-28)"
```

---

## Task 4: Create Soundmurai posts (2026-04-30)

**Files:**
- Create: `platform/src/context/marketing-contextagora/posts/2026-04-30-soundmurai-linkedin.md`
- Create: `platform/src/context/marketing-contextagora/posts/2026-04-30-soundmurai-x.md`

**Source in `playbook.md`:** "Post 3: 'How Soundmurai uses Contextagora'" (around lines 166–208). LinkedIn body = lines 171–187. X thread = 3 tweets, lines 191–208.

- [ ] **Step 1: Read `playbook.md` lines 166–208 to confirm exact body text**

- [ ] **Step 2: Write the LinkedIn Soundmurai post**

Create `platform/src/context/marketing-contextagora/posts/2026-04-30-soundmurai-linkedin.md`:

```markdown
---
platform: linkedin
scheduled_date: 2026-04-30
status: scheduled
posted_at:
image:
source: series-post-3
link:
notes:
---
Soundmurai runs a marketplace for live music opportunities.

They plugged Contextagora into their user-facing chat. A user types:

*"What's the average price for independent artists in Berlin?"*

What happens:
1. The agent finds the right context file for their db.
2. It reads the schema and how artists, venues, and prices are related.
3. It generates a script against their live data to pull Berlin artists and venue prices.
4. Filters to the matches.
5. Returns the answer.

No SQL. No dashboards. One question, answered live, against their real data.

This pattern ports to any product with a db and real users. If you want it for yours, join the waitlist → contextagora.com
```

- [ ] **Step 3: Write the X Soundmurai thread**

Create `platform/src/context/marketing-contextagora/posts/2026-04-30-soundmurai-x.md`:

```markdown
---
platform: x
scheduled_date: 2026-04-30
status: scheduled
posted_at:
image:
source: series-post-3
link:
notes: 3-tweet thread.
---
Soundmurai runs a marketplace for live music opportunities.

They plugged Contextagora into their user-facing chat.

Here's what that unlocks ↓

---

A user types: "What's the average price for independent artists in Berlin?"

Contextagora finds the db context, reads the schema, writes a script against their live data, filters to Berlin, returns the answer.

No SQL. No dashboards. One question.

---

This pattern ports to any product with a db and real users.

If you want it for yours, join the waitlist → contextagora.com
```

- [ ] **Step 4: Verify and commit**

```bash
ls platform/src/context/marketing-contextagora/posts/2026-04-30-*
git add platform/src/context/marketing-contextagora/posts/2026-04-30-soundmurai-linkedin.md platform/src/context/marketing-contextagora/posts/2026-04-30-soundmurai-x.md
git commit -m "marketing: extract soundmurai posts into posts/ (2026-04-30)"
```

---

## Task 5: Create cross-tools posts (2026-05-05)

**Files:**
- Create: `platform/src/context/marketing-contextagora/posts/2026-05-05-cross-tools-linkedin.md`
- Create: `platform/src/context/marketing-contextagora/posts/2026-05-05-cross-tools-x.md`

**Source in `playbook.md`:** "Post 4: 'When context across tools pays off'" (around lines 212–249). LinkedIn body = lines 217–230. X thread = 3 tweets, lines 234–249.

- [ ] **Step 1: Read `playbook.md` lines 212–249 to confirm exact body text**

- [ ] **Step 2: Write the LinkedIn cross-tools post**

Create `platform/src/context/marketing-contextagora/posts/2026-05-05-cross-tools-linkedin.md`:

```markdown
---
platform: linkedin
scheduled_date: 2026-05-05
status: scheduled
posted_at:
image:
source: series-post-4
link:
notes:
---
Yesterday at MAAT someone on support asked:

*"Which members got charged twice this month and what did they buy?"*

This needs two sources: Stripe (payments) and our db (members + purchases).

Before Contextagora: open Stripe, filter charges, export CSV, open db, look up each member id, cross-reference by hand. About 30 minutes, error-prone.

Now: one question in Contextagora. The agent pulls from both context modules, joins the data, answers in 20 seconds.

This is the moment context-across-tools pays off. Not one integration. Many, at once, from a single question.

If your team is jumping between 4 tabs to answer one support question, join the waitlist → contextagora.com
```

- [ ] **Step 3: Write the X cross-tools thread**

Create `platform/src/context/marketing-contextagora/posts/2026-05-05-cross-tools-x.md`:

```markdown
---
platform: x
scheduled_date: 2026-05-05
status: scheduled
posted_at:
image:
source: series-post-4
link:
notes: 3-tweet thread.
---
Yesterday at MAAT someone on support asked:

"Which members got charged twice this month and what did they buy?"

Needs two sources: Stripe and our db. Here's before/after ↓

---

Before: open Stripe, filter charges, export CSV, open db, look up each member id, cross-reference by hand. 30 min. Error-prone.

Now: one question in Contextagora. Pulls from both, joins, answers in 20 seconds.

---

Not one integration. Many, at once, from one question.

If your team is jumping between 4 tabs for one support question, join the waitlist → contextagora.com
```

- [ ] **Step 4: Verify and commit**

```bash
ls platform/src/context/marketing-contextagora/posts/2026-05-05-*
git add platform/src/context/marketing-contextagora/posts/2026-05-05-cross-tools-linkedin.md platform/src/context/marketing-contextagora/posts/2026-05-05-cross-tools-x.md
git commit -m "marketing: extract cross-tools posts into posts/ (2026-05-05)"
```

---

## Task 6: Verify content fidelity end-to-end

**Files:**
- Verify: all 10 files in `platform/src/context/marketing-contextagora/posts/`

The whole point of Tasks 1–5 was a verbatim migration. This task confirms nothing was paraphrased or dropped.

- [ ] **Step 1: List the new posts directory**

Run:
```bash
ls -1 platform/src/context/marketing-contextagora/posts/
```

Expected: exactly 10 files, all `.md`, dates 2026-04-21, 2026-04-23, 2026-04-28, 2026-04-30, 2026-05-05, two per date (`-linkedin` and `-x`).

- [ ] **Step 2: For each post, diff the body against the playbook source**

For each pair of (post file, playbook section), open both side-by-side and confirm the body text is character-identical. Specifically check:

- The LinkedIn launch body line "And if you just want to say hi (it's been a minute), reply below. I'd love that." appears verbatim.
- The em-dash-free `→` arrow characters are preserved (the playbook uses `→` and `~` consistently — these must round-trip).
- Italicized lines (e.g. `*"Which members haven't paid this month..."*`) keep the asterisks.
- The thematic-break `---` separators appear only between tweets in X threads, never inside a body.

- [ ] **Step 3: Verify frontmatter parses cleanly**

Each post must start with exactly one `---` line, exactly 8 frontmatter keys (`platform`, `scheduled_date`, `status`, `posted_at`, `image`, `source`, `link`, `notes`), one closing `---`, then a blank line, then body. No extra keys, no missing keys, no comment text inside frontmatter.

If any post fails this check, fix in place and amend the relevant Task 1–5 commit.

- [ ] **Step 4: No commit needed unless fixes were made**

This is verification, not new content. If fixes were made, commit with:

```bash
git commit -am "marketing: fix post body fidelity"
```

---

## Task 7: Trim `playbook.md`

**Files:**
- Modify: `platform/src/context/marketing-contextagora/playbook.md`

After this task, `playbook.md` is a voice + strategy doc, not a content store. The five "Post N" copy sections are removed; the format rules, posting tips, launch schedule, "what not to post", and strategic rationale stay.

- [ ] **Step 1: Identify what to keep and what to cut**

**Keep these sections** (line numbers from the current 340-line file):
- Lines 1–18: title, "Universal format", "Product stage note"
- Lines 253–284: "Launch schedule" (cadence still applies post-migration)
- Lines 287–302: "Posting tips (operational)" and "What not to post (yet)"
- Lines 305–339: "Strategic rationale" through end-of-file

**Cut these sections:**
- Lines 19–250: all five "Post N" sections including their "asset & distribution notes" and "Pin video specs" subsections.

The asset/distribution notes for Post 0 (15-sec screen recording specs, pin video specs) are operational guidance about *how to produce visuals* — they are not paste copy. Move them into a new `## Visual production notes` section appended after "Posting tips" (this preserves the content without bloating individual post files).

- [ ] **Step 2: Replace the cut block with a one-paragraph pointer**

Where the "Post 0" section started (after "Product stage note"), insert:

```markdown
---

## Where the post copy lives

Each post is its own file in [`posts/`](posts/), with frontmatter (status, scheduled_date, platform, image, source, link) and a body that is the exact paste-ready text. The agent surfaces upcoming posts in chat when asked ("show upcoming posts" → overview list; "post N" or "today's linkedin" → just the body in a copy-able block). To add a new post, drop a new file in `posts/` following the `YYYY-MM-DD-<slug>-<platform>.md` filename pattern.

---
```

- [ ] **Step 3: Add the new "Visual production notes" section**

Append this section *after* "What not to post (yet)" and *before* "Strategic rationale":

```markdown
---

## Visual production notes

How to produce assets for posts that need them. The post itself sets `image: <filename>` in frontmatter; this section is the playbook for actually shooting/recording that asset.

### Launch post (2026-04-21) — LinkedIn

- **15-sec screen recording** of typing a real question into Contextagora and getting the answer back. This is worth more than the copy. Fallback: screenshot of the interface showing a question + real result.
- **Skip:** logos, product headshots, generic marketing stills.
- **Link placement:** in the **body** of the post (not comments). This is a launch to warm contacts where clicks matter more than reach.

### Launch post (2026-04-21) — X pinned profile

- **Length: 10–25 seconds.** Not 2 minutes. Pin-video attention is glance-level; visitors decide in 3–5 sec.
- **Structure (~15 sec target):**
  - 0–3s: cursor in Contextagora input, typing the real MAAT question (or fade in pre-typed)
  - 3–6s: brief thinking / loading state
  - 6–12s: answer appears with real data (blur/redact member names)
  - 12–15s: linger on the result
- **No voice-over.** X autoplays muted. Assume no sound. Keep on-screen text large enough to read at mobile size.
- **Job of this video:** show the moment of magic (question → answer). The before/after contrast is carried by the tweet copy, not the video.
- **Do NOT reuse the 2-min landing page demo.** Different audience position, different job.

### Posts 1–4

No specific visual asset required; copy carries the post.
```

- [ ] **Step 4: Verify length and content**

Run:
```bash
wc -l platform/src/context/marketing-contextagora/playbook.md
```

Expected: roughly 130–170 lines (down from 340). If it's still over 200 lines, the cut wasn't aggressive enough — the five Post sections must be entirely gone.

Run:
```bash
grep -n "^## Post " platform/src/context/marketing-contextagora/playbook.md
```

Expected: zero matches. If any line matches, that section wasn't removed.

- [ ] **Step 5: Commit**

```bash
git add platform/src/context/marketing-contextagora/playbook.md
git commit -m "marketing: trim playbook to voice + strategy + visual notes"
```

---

## Task 8: Rewrite `info.md`

**Files:**
- Modify: `platform/src/context/marketing-contextagora/info.md` (full rewrite)

The new `info.md` is the entry-point doc. It documents the agent convention so the agent (and the user reading the file) know how the workflow works.

- [ ] **Step 1: Replace the entire contents of `info.md`**

Overwrite the file with:

```markdown
# Marketing — Contextagora

Content engine, Barcelona founder events, and launch moments.

## How to use this module

Posts live in [`posts/`](posts/), one file per post. The agent surfaces them in this chat when asked. You don't open files; you ask.

- **See what's coming up:** ask "show upcoming posts". The agent lists scheduled posts oldest-first, today's flagged with `← today`, each with a one-line preview.
- **Get a post to publish:** ask "post 3" (referring to the most recent overview), or "today's linkedin", or "the launch post". The agent prints the body in a fenced code block — click the copy icon, paste into LinkedIn or X.
- **Image goes with it:** if the post has `image:` set, the agent prints the absolute path on a line below the code block. Open it from Finder / `open <path>`.
- **Mark one as posted:** ask "I posted post 3 — link is https://..." (or paste the URL when the agent asks). The agent updates frontmatter (`status: posted`, `posted_at: <now>`, `link: <url>`).

## Conventions

- Filename pattern: `YYYY-MM-DD-<slug>-<platform>.md`. Date prefix gives chronological sort; platform suffix disambiguates LinkedIn vs X.
- Frontmatter fields: `platform`, `scheduled_date`, `status`, `posted_at`, `image`, `source`, `link`, `notes`. Status is `scheduled` or `posted`.
- Body is the **exact paste-ready text** — no headings, no commentary.
- X threads separate tweets with `---` lines. LinkedIn posts have no separators.
- Voice + format rules + launch schedule live in [`playbook.md`](playbook.md). Read that before drafting a new post.

## Files

| File | Purpose |
|---|---|
| `posts/` | One file per post (Markdown body + frontmatter), with sibling image files. Source of truth for what gets published. |
| `playbook.md` | Voice, format rules, launch schedule, visual production notes, strategic rationale. |
| `llms.txt` / `module.yaml` | Module entry points. |
```

- [ ] **Step 2: Verify**

Run:
```bash
cat platform/src/context/marketing-contextagora/info.md
```

Expected: the new content, no leftover lines from the old "Current focus: Launch series" table or the `posts.csv` reference.

- [ ] **Step 3: Commit**

```bash
git add platform/src/context/marketing-contextagora/info.md
git commit -m "marketing: rewrite info.md as module entry point"
```

---

## Task 9: Update `llms.txt`

**Files:**
- Modify: `platform/src/context/marketing-contextagora/llms.txt`

- [ ] **Step 1: Read current `llms.txt`**

Run:
```bash
cat platform/src/context/marketing-contextagora/llms.txt
```

Expected current content includes references to `playbook.md` and `posts.csv` and a cross-module note about `outbound-contextagora` writing to `posts.csv`.

- [ ] **Step 2: Replace content**

Overwrite `platform/src/context/marketing-contextagora/llms.txt` with:

```
# marketing-contextagora
> Build-in-public content engine, Barcelona founder events, and launch moments for Contextagora.

## Read first

- [../contextagora/product-marketing.md](../contextagora/product-marketing.md) — wedge, ICP, anti-patterns.

## Marketing

- [info.md](info.md) — module overview + how to ask the agent for posts.
- [posts/](posts/) — one file per post (Markdown body + frontmatter), with sibling image files. The source of truth for what gets published.
- [playbook.md](playbook.md) — voice, format rules, launch schedule, visual production notes, strategic rationale.

## Cross-module

Marketing consumes from [`outbound-contextagora`](../outbound-contextagora/llms.txt): design-partner stories become teardown posts and homepage testimonials. When a partner is ready to be quoted publicly, drop a new file in [`posts/`](posts/) following the `YYYY-MM-DD-<slug>-<platform>.md` pattern with `source: partner-<name>` in frontmatter.
```

- [ ] **Step 3: Verify no `posts.csv` references remain**

Run:
```bash
grep -n "posts.csv" platform/src/context/marketing-contextagora/llms.txt
```

Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add platform/src/context/marketing-contextagora/llms.txt
git commit -m "marketing: point llms.txt at posts/ instead of posts.csv"
```

---

## Task 10: Delete `posts.csv`

**Files:**
- Delete: `platform/src/context/marketing-contextagora/posts.csv`

Only run this after Tasks 1–9 are committed. The CSV's data has been fully migrated to per-post frontmatter; nothing reads it now.

- [ ] **Step 1: Confirm no in-repo code reads `posts.csv`**

Run:
```bash
grep -rn "posts.csv" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.md" /Users/bsampera/Documents/bleak-dev/context-loader
```

Expected: zero matches in `.py`/`.ts`/`.tsx` files. Markdown matches must be limited to `outbound-contextagora/` (handled in Task 11) — there should be no remaining match inside `marketing-contextagora/` after Task 9.

If any code file matches, **stop** and surface the dependency. Do not delete.

- [ ] **Step 2: Delete the file**

```bash
git rm platform/src/context/marketing-contextagora/posts.csv
```

- [ ] **Step 3: Commit**

```bash
git commit -m "marketing: drop posts.csv (status now in per-post frontmatter)"
```

---

## Task 11: Update `outbound-contextagora` cross-references

**Files:**
- Modify: `platform/src/context/outbound-contextagora/llms.txt`
- Modify: `platform/src/context/outbound-contextagora/info.md`
- Modify: `platform/src/context/outbound-contextagora/playbook.md`

Three files reference `marketing-contextagora`'s old structure. The references will be broken after Task 10.

- [ ] **Step 1: Update `outbound-contextagora/llms.txt`**

Find the line referencing `posts.csv` (currently around line 21):

```
Outbound feeds [`marketing-contextagora`](../marketing-contextagora/llms.txt): design-partner stories become content (build-in-public posts, case studies). When a partner agrees to be quoted publicly, log a content idea in `../marketing-contextagora/posts.csv`.
```

Replace with:

```
Outbound feeds [`marketing-contextagora`](../marketing-contextagora/llms.txt): design-partner stories become content (build-in-public posts, case studies). When a partner agrees to be quoted publicly, drop a new file in `../marketing-contextagora/posts/` following the `YYYY-MM-DD-<slug>-<platform>.md` pattern with `source: partner-<name>` in frontmatter.
```

- [ ] **Step 2: Update `outbound-contextagora/info.md`**

Find the line (currently around line 15):

```
Design partners feed [`marketing-contextagora`](../marketing-contextagora/llms.txt): each partner becomes 3–5 posts and a homepage testimonial. When ready to publish a partner story, append rows to `../marketing-contextagora/posts.csv`.
```

Replace with:

```
Design partners feed [`marketing-contextagora`](../marketing-contextagora/llms.txt): each partner becomes 3–5 posts and a homepage testimonial. When ready to publish a partner story, drop new files in `../marketing-contextagora/posts/` (one per platform) with `source: partner-<name>` in frontmatter.
```

- [ ] **Step 3: Update `outbound-contextagora/playbook.md`**

This file references a non-existent `build-in-public-posts.md` in two places (lines ~170 and ~183 in the current file). Both should point at the trimmed `playbook.md` (the strategy doc that survived Task 7), since the surrounding sentences are about the content-engine motion / signup targets, not specific posts.

Find:
```
The content engine (see [`../marketing-contextagora/build-in-public-posts.md`](../marketing-contextagora/build-in-public-posts.md)) runs from day 1 as the primary marketing motion.
```

Replace with:
```
The content engine (see [`../marketing-contextagora/playbook.md`](../marketing-contextagora/playbook.md) §Strategic rationale) runs from day 1 as the primary marketing motion.
```

Find:
```
- Content engine signup targets hit (see [`../marketing-contextagora/build-in-public-posts.md`](../marketing-contextagora/build-in-public-posts.md) "After May 5" section).
```

Replace with:
```
- Content engine signup targets hit (see [`../marketing-contextagora/playbook.md`](../marketing-contextagora/playbook.md) §Strategic rationale "Expected milestones").
```

- [ ] **Step 4: Verify no broken references remain**

Run:
```bash
grep -rn "posts.csv\|build-in-public-posts" platform/src/context/outbound-contextagora/
```

Expected: zero matches.

- [ ] **Step 5: Commit**

```bash
git add platform/src/context/outbound-contextagora/llms.txt platform/src/context/outbound-contextagora/info.md platform/src/context/outbound-contextagora/playbook.md
git commit -m "outbound: repoint marketing cross-refs at posts/ + trimmed playbook"
```

---

## Task 12: Add clipboard button to chat code blocks

**Files:**
- Modify: `platform/frontend/src/components/chat/MarkdownText.tsx`

The current file (65 lines) renders Markdown via `MarkdownTextPrimitive` and wires up one custom component (`a → DownloadLink`). We add a custom `pre` component that overlays a clipboard button.

**Note: the frontend has no test framework configured (no `vitest`, no `jest` in `package.json`). Verification is manual: run `pnpm dev`, ask the agent something that produces a code block, click the button, paste somewhere.**

- [ ] **Step 1: Read the current file in full**

Run:
```bash
cat platform/frontend/src/components/chat/MarkdownText.tsx
```

Confirm the structure: imports, `TypingIndicator`, `DownloadLink`, `REMARK_PLUGINS`, `MD_COMPONENTS`, `MarkdownText` export.

- [ ] **Step 2: Add the `CopyablePre` component**

Insert this component definition immediately after `DownloadLink` (before `REMARK_PLUGINS`):

```tsx
type PreProps = ComponentPropsWithoutRef<"pre"> & { node?: unknown };

const CopyablePre = (props: PreProps) => {
  // `node` is passed by @assistant-ui/react-markdown's custom `pre` override
  // (see DefaultPre in the package). It must NOT leak onto the DOM <pre>.
  const { children, node: _node, ...rest } = props;
  const preRef = useRef<HTMLPreElement | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    // Read only the inner <code> element's text — never `preRef.current.innerText`,
    // which would also pick up the "Copy"/"Copied" label from the button below.
    const codeEl = preRef.current?.querySelector("code");
    const text = (codeEl?.innerText ?? preRef.current?.innerText ?? "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be blocked (insecure context, denied permission).
      // Silently no-op; user can fall back to manual select.
    }
  };

  return (
    <pre ref={preRef} {...rest} className={`${rest.className ?? ""} relative group`}>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-[11px] font-medium rounded border border-border bg-bg-raised text-text-muted opacity-0 group-hover:opacity-100 hover:text-text transition"
        aria-label={copied ? "Copied" : "Copy code"}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {children}
    </pre>
  );
};
```

**Why the two safeguards matter:**

1. **`querySelector("code")` for the read source.** Without this, `preRef.current.innerText` walks the whole `<pre>` subtree — including the `<button>` we just rendered — so the clipboard ends up holding `"Copy\n<actual body>"`. Markdown fenced blocks always render content inside a child `<code>` element via `remark-gfm`, so reading from there is safe and gives only the post body. The `?? preRef.current?.innerText` fallback covers the rare case (e.g. a `<pre>` with no `<code>` child) but never fires in our real usage.
2. **`node: _node` destructure.** `@assistant-ui/react-markdown` passes a hast `node` prop to every custom-component override. If we just `...rest` it onto a DOM `<pre>`, React logs an unknown-attribute warning and ships an invalid attribute to the browser. Pulling `node` out of the spread is the standard pattern (it's exactly what the package's own `DefaultPre` does).

- [ ] **Step 3: Add the necessary imports**

Update the top-of-file import block. Current:

```tsx
import type { ComponentPropsWithoutRef } from "react";
import type { TextMessagePartProps } from "@assistant-ui/react";
import { MessagePartPrimitive } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
```

Replace with:

```tsx
import { useRef, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import type { TextMessagePartProps } from "@assistant-ui/react";
import { MessagePartPrimitive } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
```

- [ ] **Step 4: Wire `CopyablePre` into the components map**

Find:
```tsx
const MD_COMPONENTS = { a: DownloadLink };
```

Replace with:
```tsx
const MD_COMPONENTS = { a: DownloadLink, pre: CopyablePre };
```

- [ ] **Step 5: Type-check**

Run:
```bash
cd platform/frontend && pnpm exec tsc -b --noEmit
```

Expected: clean exit, no errors. `pre` is a valid key in the `components` prop type per `@assistant-ui/react-markdown`'s `MarkdownTextPrimitive` definition, so no extra type gymnastics should be needed.

- [ ] **Step 6: Lint**

Run:
```bash
cd platform/frontend && pnpm lint
```

Expected: no new errors in `MarkdownText.tsx`.

- [ ] **Step 7: Manual verification — visual + functional**

Start the dev server:
```bash
cd platform/frontend && pnpm dev
```

In the running app:
1. Open a chat session.
2. Ask the agent something that produces a fenced code block (e.g. "show upcoming posts" once Tasks 1–9 are merged, or any prompt that returns code).
3. Confirm a "Copy" button appears in the top-right of the code block on hover (and is invisible without hover).
4. Click it. Confirm:
   - The label changes to "Copied" briefly.
   - **Critical:** paste into a text editor and confirm the clipboard contains **only** the code body. The literal word `Copy` (or `Copied`) **must not** appear at the start. If it does, `querySelector("code")` is not finding the inner element — debug by adding a `console.log(preRef.current?.outerHTML)` in `handleCopy`. This is the most likely failure mode given how the component is wired.
5. Open the browser devtools console. Confirm there are **no** React warnings of the form `Warning: React does not recognize the 'node' prop on a DOM element`. If you see one, the `node: _node` destructure was not applied correctly.
6. Confirm code blocks still render correctly otherwise: scroll behavior, syntax (none — these are plain `<pre>` blocks, no highlighting), border/radius matching the existing `.aui-md pre` style.

Do **not** mark this step complete based on type-check + lint alone. The button must be observed working in the browser, and the clipboard payload must be verified by paste.

- [ ] **Step 8: Commit**

```bash
git add platform/frontend/src/components/chat/MarkdownText.tsx
git commit -m "chat: add copy button to rendered code blocks"
```

---

## Task 13: End-to-end workflow verification

This is the integration test: does the user actually get the workflow the spec promised?

The data layer (Tasks 1–11) and the UI assist (Task 12) only matter if the in-chat workflow works. This task verifies the agent's behavior matches the convention documented in `info.md`.

- [ ] **Step 1: Restart the platform if needed**

Make sure the platform is running and the agent has fresh access to the updated `marketing-contextagora` module.

- [ ] **Step 2: Test the overview intent**

In a Contextagora chat, ask: **"show upcoming posts"**.

Expected response: a numbered list of all 10 posts, sorted by `scheduled_date` ascending, each line showing date + platform + a one-line preview (first line of body), with `← today` flagged on whichever date matches today's local date if any.

- [ ] **Step 3: Test the body-by-number intent**

Right after the overview, ask: **"post 1"**.

Expected response: a single fenced code block containing only the body of the first post in that overview. Below the block, if the post has `image:` set, a single line: `Image: <absolute-path-to-image>`. No commentary above or below.

- [ ] **Step 4: Test the natural-language intent**

In a fresh prompt, ask: **"give me the launch linkedin post"**.

Expected response: same shape as Step 3, but resolved by content (`source: series-post-0` + `platform: linkedin`) without going through the overview.

- [ ] **Step 5: Test the copy button**

On the code block from Step 3 or 4, hover, click "Copy", paste into a scratch document. Confirm the body is character-identical to the file body.

- [ ] **Step 6: Test the "mark as posted" intent**

In chat, ask: **"I posted the launch linkedin post — link is https://example.com/test"**.

Expected response: agent edits `posts/2026-04-21-launch-linkedin.md` setting `status: posted`, `posted_at: <ISO datetime>`, `link: https://example.com/test`. Confirm via:

```bash
head -10 platform/src/context/marketing-contextagora/posts/2026-04-21-launch-linkedin.md
```

- [ ] **Step 7: Revert the test edit**

The post isn't actually posted; this was a smoke test. Revert:

```bash
git checkout platform/src/context/marketing-contextagora/posts/2026-04-21-launch-linkedin.md
```

- [ ] **Step 8: No commit**

This task is verification. Any issues surfaced here go back to the relevant earlier task (likely Task 8, which documents the agent convention).

---

## Done criteria

The plan is complete when all of:

- 10 post files exist in `posts/` with verbatim bodies from `playbook.md`.
- `playbook.md` is trimmed to ~150 lines, contains zero `## Post N` headings.
- `info.md` describes the agent workflow, no longer lists pre-launch checklist tasks.
- `llms.txt` (both `marketing-contextagora` and `outbound-contextagora`) point at `posts/`, never `posts.csv`.
- `posts.csv` no longer exists.
- The chat UI shows a copy button on hover over any `<pre>` block; clicking copies the inner text.
- The agent answers "show upcoming posts" with the spec-compliant overview and "post N" with just the body.
