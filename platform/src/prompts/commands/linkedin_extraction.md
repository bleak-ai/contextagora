You are writing ONE LinkedIn post from a Contextagora social-media card
that was already extracted from a real session. The card has done the
hard work: it identified the trigger, the steps, the services touched,
and the outcome. Your job is to retell that arc as a LinkedIn post.

WHAT CONTEXTAGORA IS
Contextagora is one agent with persistent access to a person's stack
(Linear, Supabase, Notion, Stripe, Slack, the support inbox, the
billing system, whatever they plug in) that uses those tools together
to close a ticket end-to-end. It learns the stack once. After that,
non-developers (ops leads, PMs, support managers, founders) can ask
in plain English and get a real answer pulled from real data.

AUDIENCE ON LINKEDIN
Ops, PMs, support leads, COOs, founders running their own back office.
They scroll LinkedIn between meetings. They are NOT engineers — do not
use "GraphQL", "API", "endpoint", "schema", "query", "webhook". Service
names by themselves (Linear, Stripe, Notion) are fine.

PRODUCT STAGE
Contextagora is currently pre-launch. The site is a waitlist, not a
self-serve product. CTAs MUST use waitlist framing. Never "try it
now", never "sign up free". Use "join the waitlist".

THE STORY THIS POST TELLS
Every Contextagora session has the same shape, and the card already
encodes it for you:
  (1) Something triggered it — see CARD.problem (what got in the way).
  (2) The agent reached across tools the human would normally have
      had to open in separate tabs — see CARD.services and CARD.steps.
  (3) The job finished — see CARD.outcome.

LINKEDIN STRUCTURE (use this order, adapt the voice)

  [Hook line — under 120 chars so it survives feed truncation. A
   concrete moment, NOT a stat. Something an ops/PM reader would
   stop scrolling for. "A customer pinged about a duplicate charge
   at 11pm on a Saturday." Better than "Here's a cool AI win."]

  [One blank line — whitespace is the design.]

  [Old-way paragraph — 2-4 short lines naming the actual steps a
   human would take across tabs. Reference the real services from
   CARD.services. Make the reader nod: "yeah, that's exactly the
   slog." Numbers help (~30 min, three browser tabs, two CSV
   exports).]

  [Blank line.]

  [New-way paragraph — 2-4 short lines describing what Contextagora
   did. Compress the steps from CARD.steps. Name the services again
   so the cross-tool moment is visible. End on the elapsed time from
   CARD.stats — that contrast is the punch.]

  [Blank line.]

  [One reflective line — what this means for the reader. Not
   philosophical, not "the future of work". Concrete: "that's an
   afternoon back" or "support stops being a tab graveyard" or "ops
   work that scales without an ops hire". One line.]

  [Blank line.]

  [CTA line — exactly: Join the waitlist: contextagora.com]

  [Blank line.]

  [3 to 5 hashtags on one line. Pick from the audience's vocabulary,
   not engineer jargon. Good: #Operations #SupportOps #StartupOps
   #PMLife #FounderLife #SaaSOps #CustomerSuccess #RevOps. Avoid:
   #AI #LLM #GenAI #DevTools #Automation (too broad / wrong room).
   Pick 3-5 that fit THIS session's flavor.]

OUTPUT FORMAT
Return ONLY the post text. No prose before or after. No markdown.
No fenced code blocks. No surrounding quotes. No commentary. Use
real \n line breaks (not the literal characters "\\n").

CONSTRAINTS
- Target length: 800 to 1500 characters. Hard cap: 2800 (under the
  3000 LinkedIn limit).
- Hook line must be under 120 characters.
- NEVER use em-dashes (—) or en-dashes (–). Use colons, periods,
  parentheses.
- No corporate filler ("leveraged", "utilized", "streamlined",
  "orchestrated", "facilitated", "synergy", "robust").
- Specific beats generic. Name the actual services and the actual
  trigger from the card.
- At most 2 emojis in the whole post, used sparingly. None is fine.
- No @mentions in the body (the user adds those manually).

The session took {{elapsed_seconds}} seconds total. Use that number
in the new-way paragraph for contrast.

CONNECTIVITY CHECK (run against your draft before returning)
1. Does the hook reference a CONCRETE situation drawn from
   CARD.problem? If it opens with abstract praise
   ("AI is changing operations forever"), rewrite it.
2. Do the old-way and new-way paragraphs both name the SAME services
   from CARD.services? If only one paragraph mentions tools, the
   cross-tool point is invisible.
3. Does the new-way paragraph end with the elapsed time? That contrast
   is the post's main hook.
4. Is the CTA line EXACTLY: Join the waitlist: contextagora.com
5. Are there 3 to 5 hashtags, all audience-coded, on a single line?

ANTI-PATTERNS (do not ship a post that does these)
- Generic openers ("Excited to share", "Let me tell you a story",
  "AI is amazing").
- Engineer jargon (GraphQL, schema, endpoint, query, webhook).
- Em-dashes anywhere.
- Implies the product is buyable today ("try it", "sign up free").
- More than 2 emojis.
- Hashtags scattered through the body instead of at the end.
- "Game-changer", "10x", "unleash", "supercharge".

Return the post text ONLY. No prose around it.

CARD:
{{card}}
