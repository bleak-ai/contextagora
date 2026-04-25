# Short-Form Video Engine for Contextagora

**Date:** 2026-04-25
**Owner:** Bernat (solo CTO, also CTO of MAAT)
**Stage:** Pre-launch waitlist. Goal of this channel = generate interest, route to `contextagora.com` waitlist.
**Why this plan exists:** X (Twitter) is already wired via the social-card screenshot flow. Ops, PMs, and support leads (the actual ICP) live more on LinkedIn and on YouTube Shorts than on X. A short-form video engine reuses the same per-session supply (every real Contextagora run is a clip) and lands in the rooms where the audience actually scrolls.

---

## The Strategy

**One recording per session, four distribution shapes.** Every Contextagora session that already produces a social card also produces a 30-90 second screen recording of the agent doing the work. That single clip is reformatted (different captions, different aspect ratios) for YouTube Shorts, LinkedIn video, TikTok, and X video. No "content creation" — the content IS the product running.

**Why this fits Contextagora specifically:**
- The ICP (ops leads / PMs / support managers) does not believe abstract AI claims. They believe screen recordings of tickets being closed.
- The product is *visual* — the cross-tool moment is the punchline, and short-form video shows that moment in a way no tweet can.
- Memory note: "marketing visuals must show the actual app/workflow." Video is the strongest expression of that rule.
- You already have an unfair supply: MAAT (your other company) generates real ops sessions every week. Every one of those is a clip.
- The motion is fun, not cold-DM grind: record → caption → post → next.

---

## Format Spec

### Episode shape

Every episode is the same skeleton. Don't reinvent per video.

| Beat | Time | What's on screen | Notes |
|---|---|---|---|
| Hook | 0:00 - 0:03 | Big text card: the trigger ("A customer was charged twice.") | First 3 sec decide retention. No logo, no "hey what's up", straight to the situation. |
| Old way | 0:03 - 0:15 | Fast cuts of opening Stripe, Linear, Notion in separate tabs. Visible cursor, real UI. | "Old way" badge in corner. ~12 sec max. Use real data, blur PII. |
| Cut to product | 0:15 - 0:18 | Hard cut to Contextagora prompt box. One typed sentence. | The cut is the punchline. No transition effect. |
| Agent runs | 0:18 - 0:40 | Real session playing back at 1.5x-2x. Tool calls land visibly, services named in captions. | Captions name each service as it's hit ("Linear...", "Stripe...", "Notion..."). |
| Outcome | 0:40 - 0:50 | Final state on screen. Big text card: "Refunded. Ticket closed. 22 sec." | Stats from the actual session. |
| CTA | 0:50 - 0:55 | Static card: "Join the waitlist: contextagora.com" + Contextagora gold mark | Brand consistency. |

**Total target:** 45-60 seconds. Hard cap 90.

### Production variant

**Variant C only — pure screen + kinetic text overlays.** No face cam, no voiceover. Reasons:
1. Lowest friction: solo founder, multiple companies. Voiceover adds 30+ min per video.
2. Localization-free: works for non-native English viewers.
3. Watch in mute (LinkedIn / commute scrolling default).
4. Fastest iteration: any session becomes a clip in one editing session.

Add face cam + voice later (Variant A) for the 1-2 episodes per month that are "founder hot takes" / non-product. Don't add it to product clips.

### Tooling (start free)

- **Recorder:** macOS Cmd+Shift+5 → "Record Selected Portion" at 1080p. Free.
- **Editor:** CapCut (free, macOS native or browser). Auto-captions.
- **Aspect ratios to export:** 9:16 (Shorts/Reels/TikTok), 1:1 (LinkedIn feed), 16:9 (YouTube long if reused).
- Upgrade later: ScreenStudio ($229) for cleaner zoom-on-click and built-in cursor smoothing.

---

## Cadence

| Phase | Weeks | Output | Why |
|---|---|---|---|
| Calibration | 1-2 | 2 videos / week | Find your edit pace. Don't optimize yet — just ship. |
| Steady state | 3-12 | 3 videos / week | Algorithms reward consistency. 3/week is the floor where the YouTube Shorts algo will start showing you to non-followers. |
| Compound | 12+ | 3-5 / week | At week 12 you have 30+ videos. Pin the top 3. Re-cut the top 3 into a 5-min YouTube long-form. |

**Posting days:** Mon / Wed / Fri at 9am local time. Ops/PMs check feeds at start of day.

---

## Distribution

Every video → 5 surfaces. Same clip, platform-tuned captions.

| Platform | Aspect | Duration cap | Caption style | Source |
|---|---|---|---|---|
| YouTube Shorts | 9:16 | 60s | Title under 60 chars, 3 hashtags | Anchor, evergreen, indexed by search |
| LinkedIn video | 1:1 (square reads better in feed than 9:16) | 90s | Use the LinkedIn copy from the modal (the new feature). Hook in line 1. 3-5 hashtags at end. | Where the ICP actually is |
| TikTok | 9:16 | 60s | Punchy 1-line hook. No links work, so visible "Join the waitlist on contextagora.com" overlay near the end | Lottery ticket — discovery > followers |
| X (Twitter) video | 9:16 | 60s | Use the tweet copy from the modal | Already in your X workflow |
| Instagram Reels | 9:16 | 60s | Same as TikTok | Free cross-post, low effort |

**Source of truth:** YouTube Shorts. Every other platform points back to the same Shorts URL via your bio/links if needed.

---

## First 5 Episodes (concrete topics, drawn from real sessions)

These are the first five clips to ship in weeks 1-2. Pick from MAAT ops or test sessions.

1. **"A customer got charged twice."**
   - Old: open Stripe → find the charge → check Notion subscription → email them → manually refund.
   - New: one prompt to Contextagora. Stripe + Notion in one shot. Refund in ~30s.
   - Why it lands: every founder running a SaaS has handled this exact ticket. Pure recognition.

2. **"It's Monday. What broke this weekend?"**
   - Old: tab through Linear bugs, Sentry alerts, support inbox.
   - New: one prompt. Contextagora pulls weekend issues across all 3 sources, summarises, flags the urgent one.
   - Why it lands: Monday morning energy. PMs/eng managers will save this.

3. **"Sync 40 gyms from Stripe to Notion."** (MAAT dogfood)
   - Old: export CSV from Stripe, paste rows into Notion, fix formatting, repeat next month.
   - New: one prompt. Done in 22 seconds.
   - Why it lands: real numbers, real data, real company (MAAT). "These guys use it for their own startup" is the credibility unlock.

4. **"Why was this customer charged $0?"** (the debugging one)
   - Old: SQL query → cross-ref Stripe webhooks → check feature flags → ask the eng team → wait two days.
   - New: ops lead asks Contextagora in plain English. Answer pulled across Supabase + Stripe in 18s.
   - Why it lands: shows non-engineers solving an engineering-feeling problem without bothering an engineer.

5. **"Generate this week's support digest."**
   - Old: open the inbox, count tickets by type, copy into Slack.
   - New: one prompt. Contextagora reads the inbox, groups, posts the digest to Slack.
   - Why it lands: this is a repeating chore — it converts because viewers think "I'd do this every Friday."

---

## KPIs (track these, ignore everything else)

### Leading (what you control)
- Videos shipped per week. Target: 3.
- Time from session-end to video-published. Target: under 90 minutes by week 4.

### Lagging (what matters)
- **Unique waitlist signups attributed to video** — UTM-tag every link: `?ref=yt-shorts`, `?ref=li-video`, `?ref=tiktok`. Goal: 30 video-attributed waitlist signups by day 60.
- **Saves on LinkedIn** (LinkedIn weights saves heavily — they predict re-shares). Goal: 5+ saves on the median post by week 6.
- **Median view-through rate (VTR) on YouTube Shorts**. Goal: above 60% by week 8. Below 40% means hook is wrong.
- **Comments per video** (any platform) where a viewer self-identifies as ICP ("I'd use this for our support stack"). Qualitative — log in a spreadsheet.

### Decision rules
- After 12 videos with median VTR < 40%: rework hooks, not topics.
- After 24 videos with < 5 video-attributed signups: the channel isn't reaching ICP. Switch from "how it works" to "before/after of MAAT" exclusively for 4 weeks.
- After 24 videos hitting targets: 2x cadence and start sponsoring an ops newsletter to amplify the top 3.

---

## What to do today (first action, 60 minutes)

- [ ] Pick one Contextagora session you ran in the last week that closed cleanly. The cleaner the session, the cleaner the clip. (Run a fresh one if needed — fix something on MAAT.)
- [ ] macOS Cmd+Shift+5 → record the screen at 1080p while you replay or re-run that session live. Aim for under 60 sec.
- [ ] Open CapCut, drop the recording in, add 4 text overlays: hook (0-3s), "old way" badge (3-15s), service names as captions during agent run (18-40s), outcome card (40-50s).
- [ ] Add the CTA card at the end: "Join the waitlist: contextagora.com" + Contextagora gold mark.
- [ ] Export 9:16. Upload to YouTube Shorts as **unlisted**. Send the link to one friend. Get one piece of feedback.
- [ ] Don't publish yet. The point of today is proving the loop takes under 90 min.

---

## What NOT to do (anti-patterns for this channel)

- Don't put your face on camera in product clips. Save face for occasional founder takes.
- Don't add background music in early videos. Voice-off + captions is enough; music masks the cursor sounds that signal "this is real."
- Don't use stock footage. The product running on real data IS the asset. Stock footage signals you don't have one.
- Don't mention the underlying tech (Claude, MCP, prompts, agents). The audience does not care. The audience wants to see the spreadsheet stop existing.
- Don't end with "follow for more." End with the waitlist link. Every clip is a top-of-funnel asset.
- Don't post the same caption across all platforms. Use the LinkedIn copy on LinkedIn, the tweet copy on X. They're already generated by the modal.
- Don't measure followers. Measure waitlist signups attributed by UTM.

---

## Open questions (resolve as you ship)

1. Should the videos include MAAT branding when the session is a MAAT one, or stay pure Contextagora? (Test both. Founder credibility may compound when MAAT shows up.)
2. Is there a "compilation" rhythm — every 4 weeks, cut the top 3 clips into a 5-min YouTube long? (Probably yes, defer until week 8.)
3. When does Variant A (face cam + voice) earn its keep? (Probably never for product clips. Reserve for "founder responds to a tweet" reactive content.)
4. Sponsorship vs organic: is there an ops newsletter ($500-1000/issue) where one of these clips would land at 10x the rate? (Look at Lenny's, The Run-Up, Software Snack Bites once you have 3 clips with > 60% VTR to point to.)

---

## Why this beats more X content

- **Reach per minute of work.** A LinkedIn or YouTube Shorts video reaches 5-20x the impressions of an X post for ops/PM-flavored content, because that audience opens those apps more than X.
- **Native search.** YouTube Shorts get indexed by YouTube search. "How to refund a duplicate Stripe charge" is a query you can rank for. X posts evaporate in 4 hours.
- **Lower funny-tweet pressure.** X demands wit. LinkedIn and YouTube reward concrete utility. Concrete utility is what Contextagora has.
- **Reuses the social-card supply chain.** Every session that produces a card now produces a video too. No new content engine to maintain — same input, second output.
