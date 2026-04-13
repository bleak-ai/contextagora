# Use Cases Section — Design Spec

**Date:** 2026-04-13  
**Status:** Approved  
**Location:** `landing/src/pages/index.astro`

---

## Goal

Add a "In the wild" section to the main landing page that shows real companies using ContextAgora, building trust and demonstrating concretely how the product works. Placed after the existing "How it works" section.

---

## Layout: Company Spotlight

Each company gets a full spotlight block:

- Company logo (initials placeholder, swappable for real logo later)
- Company name + one-line descriptor
- Use case description (2-3 sentences)
- Example query block — shows a real question the user typed
- 5-step numbered flow — shows how ContextAgora resolved the query
- Video embed (iframe) — placeholder shown until video is ready

Below all spotlights: a dimmed "coming soon" card for companies not yet published.

---

## Companies

### Soundmurai (live)

- **Site:** soundmurai.com
- **Descriptor:** Marketplace for live music opportunities
- **Use case:** AI-native team querying their live database via ContextAgora's chat
- **Example query:** "Which is the average price for independent artists in Berlin?"
- **5-step flow:**
  1. The agent finds the right context file for their database
  2. It reads and understands how their DB is structured
  3. It generates a script or URL to retrieve artists in Berlin and venue prices
  4. It filters the results that match the question
  5. It delivers a clear, accurate answer to the user
- **Video:** Placeholder until demo is recorded; replace with `<iframe>` embed

### MAAT (coming soon)

- Shown as a dimmed card with "Coming soon" badge
- Content to be added in a follow-up

---

## Visual Design

Matches existing landing page design language:

- Dark background `#252523` (bg-raised) with `border border-accent/20`
- Gold accent `#c4a35a` for step numbers and query label
- Muted text `#908e8c` for descriptions
- Example query styled as an inset box with a gold `→` label
- Step numbers as small bordered squares (not filled circles)
- Video area: `aspect-ratio: 16/9`, dashed border, centered play icon + label
- MAAT card: same structure, `opacity-50`, dimmed colors, "Coming soon" badge

---

## File Changes

| File | Change |
|---|---|
| `landing/src/pages/index.astro` | Add "In the wild" section after the `<!-- How it works -->` section |

No new files, no new layouts, no new components. Pure Astro/Tailwind inline in the page.

---

## Video Swap

When the demo video is ready, replace the placeholder `<div>` with:

```html
<iframe
  src="VIDEO_EMBED_URL"
  class="w-full aspect-video"
  frameborder="0"
  allow="autoplay; fullscreen"
  allowfullscreen
></iframe>
```

---

## Future

- When MAAT content is ready: fill in the coming-soon card with the same spotlight structure
- When 4+ companies exist: consider a `/use-cases` sub-page with teaser cards on the main landing
