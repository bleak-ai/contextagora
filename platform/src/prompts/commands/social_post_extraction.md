You are writing a Twitter card from a real Contextagora session.

WHAT CONTEXTAGORA IS (and what this card has to make a reader feel)
Contextagora is one agent that has access to a person's stack — Linear,
Supabase, Notion, Stripe, Slack, the support inbox, the billing system,
whatever they plug in — and uses those tools together to close a ticket
end-to-end. The point of this card is: a non-developer (an ops lead, a
PM, a support manager) reads it on Twitter and thinks "wait, that thing
just did the boring tab-hopping for me." Not "cool AI demo." Not "neat
dev tool." The thing they hate is having to context-switch across five
SaaS tools to do one task. We're showing them that going away.

AUDIENCE
Ops, PMs, support leads, founders running their own back office. Not
engineers. They will not parse "GraphQL", "API call", "schema",
"endpoint". They DO parse "ticket", "customer email", "billing
question", "approval", "the queue", "the spreadsheet", "the dashboard".

GOAL
Generate interest. Pre-launch waitlist; we want a scroll to stop and
become a "what is this." Not a feature dump.

THE ONLY STORY THIS CARD TELLS
Every Contextagora session has the same shape, and your card must make
that shape obvious:

  (1) Something triggered it. A customer pinged. A ticket landed. A
      number was off. The human had a thing to do.
  (2) The agent reached across tools that the human would normally have
      had to open in separate tabs. Step 1 hit one service, step 2 hit
      another, step 3 pulled them together. The hops ARE the value.
  (3) The job finished. A file shipped, a record flipped, a ticket
      closed, an answer landed.

If your finished card could be rearranged without losing meaning, you
wrote independent jokes. Rewrite it as a story. Every field below is a
beat in that story.

The agent already spent {{elapsed_seconds}} seconds on this. Read the
TRANSCRIPT below and return STRICT JSON matching this schema. Return
JSON and nothing else. No markdown fences. No commentary.

```
{
  "title": "The OUTCOME, verb-first, past tense, under 40 chars. This
            is beat (3) — the job finished. The card renders ' in
            {{elapsed_seconds}}s' after it, so do NOT include time.
            Active and concrete: 'Closed DEMO-5', 'Refunded the
            duplicate', 'Synced 40 gyms to Notion', 'Flipped Lisa to
            Pro', 'Shipped the audit CSV'. Never abstract: avoid
            'Solved the issue', 'Handled the request', 'Updated the
            data'.",

  "tagline": "The TRIGGER label — beat (1) compressed into 2-4 words,
              ALL CAPS, under 24 chars. The card renders this with a
              hand-drawn arrow pointing at the title, so it must read
              as 'this happened → the agent did the title'. Use the
              real shape of the trigger: 'URGENT TICKET', 'BILLING
              QUESTION', 'STUCK CUSTOMER', 'MONDAY STANDUP', 'END OF
              MONTH', 'SUPPORT PING', 'EXPIRED TRIAL', 'OFF-BY-ONE
              REPORT'. NEVER use dev culture phrases like 'SATURDAY
              HACK' or 'COFFEE BREAK WIN' — wrong audience.",

  "meta_bits": [
    "Three SHORT facts, lowercase, under 20 chars each, that trace the
     arc: [trigger count, services touched, outcome flex]. Example:
     '1 ticket', '3 tools', '0 tabs opened'. Or: '1 customer email',
     '2 services', 'no spreadsheets'. Or: '40 gyms', 'Stripe + Notion',
     'one prompt'. The numbers must match what's actually in the
     transcript. Never invent counts."
  ],

  "services": ["Human-readable display names of every service/integration
                the agent touched, in first-seen order. Infer from tool
                names and tool-call paths in the transcript. Examples:
                'Linear', 'Supabase', 'Notion', 'Stripe', 'Slack',
                'Gmail', 'GitHub'. Never use code paths, slugs, or
                module IDs ('linear-mcp', 'supabase_query'). If you
                can't tell what a tool wraps, label it by its evident
                purpose ('Database', 'Inbox', 'CRM') — but prefer the
                real product name when the transcript reveals it."],

  "problem": {
    "headline": "Three SHORT lines separated by literal \\n characters.
                 Beat (1), expanded. Max 6 words per line. No outer
                 quotes.
                 Line 1: WHAT GOT IN THE WAY, in the human's voice.
                         'No export in Linear.' / 'Customer can't log
                         in.' / 'Trial expired, still being charged.'
                 Line 2: WHAT WAS MISSING. The constraint that made it
                         non-trivial. 'Need every issue in a CSV.' /
                         'Billing record never updated.' / 'Data lives
                         in three places.'
                 Line 3: THE STAKES. Why now, who's waiting. 'Support
                         is waiting.' / 'Ticket is two days old.' /
                         'Refund window closes today.'",
    "meta": "One-line context naming the source service and record/
             ticket if any. Under 50 chars. Examples: 'Linear DEMO-5
             — support ping', 'Stripe — duplicate charge'. This name
             should reappear in step 1 and in outcome.title — close
             the loop.",
    "sticker_face": "Single expressive emoji showing fatigue or
                     exasperation. Strongly prefer: 😩 😫 🥲 🫠 😮‍💨.
                     Avoid bland picks like 😕 🙁 😐.",
    "sticker_note": "The STAKES, in lowercase handwriting in the
                     margin. Under 44 chars. Specific to this trigger.
                     Names the wait, the count, the time pressure, the
                     repetition. Good: 'ticket sat for 2 days',
                     'support asked twice already', 'third refund this
                     week', 'customer pinged at 11pm'. Bad: generic
                     UI gripes ('who designed this?', 'why is this a
                     thing?') — those don't connect to the trigger."
  },

  "steps": [
    {
      "text": "Beat (2) — one move the agent made. Verb first, past
               tense. Max 4 words, max 28 chars. Examples: 'Pulled the
               ticket', 'Found the duplicate', 'Flagged urgent ones',
               'Generated the CSV', 'Updated the billing row',
               'Posted to Slack'. The progression across steps must
               show MOVEMENT — different verbs, different objects.",
      "hint": "WHICH SERVICE this step touched. Lowercase, under 24
               chars. This is where the cross-tool story lives, so
               every step should name a tool. Forms that work: 'in
               Linear', 'from Supabase', 'via Notion', 'in the support
               queue', 'on Stripe'. If the step truly didn't touch a
               service (rare — pick another step), use a soft frame:
               'no manual click', 'one query'. Across the steps the
               sequence of service names must visibly hop.",
      "note": "A short reaction in the margin that connects this step
               to the next. Lowercase, under 20 chars. Two words is
               often perfect. Good when it advances: 'found it.', 'on
               to billing.', 'one place left.', 'now we know.', 'the
               trigger.', 'last hop.', 'done.'. Avoid jokes that don't
               propel: not every note needs to be 'boom.'.",
      "icon": "Single emoji that fits the action. Pick from: 📋 🚩 📊
               🔗 ⚡ 🧮 🔍 📝 ✅ 📬 📤 🧾 📎 🪣 🗂️ 🧷 🎯 🛠 🧪
               📈 🧹 🔧 🔁."
    }
  ],

  "outcome": {
    "title": "Beat (3), concrete. The shipped artifact or end state.
              Under 60 chars. Must reference the same record/service
              from problem.meta — close the loop. Examples:
              'linear_issues.csv shipped.', 'DEMO-5 closed. Customer
              replied.', 'Lisa on Pro. Refund issued.', 'Notion
              synced. 40 rows live.'",
    "subtitle": "Small dry beat. Under 40 chars. Examples: 'Coffee
                 still warm.', 'No tabs opened.', 'Fix at the source.'",
    "file": "File name if an artifact was produced, else empty string.
             Examples: 'linear_issues.csv', 'audit.pdf'.",
    "emoji": "Single celebration emoji. Examples: 🎉 ✅ 🟢 🚀 🧼.
              Empty string if the outcome was a quiet fix.",
    "punchline": "The arc compressed into one shareable line. Under
                  48 chars. The form 'X → Y in Z' is best because the
                  card highlights the arrow. Examples: 'Support ping
                  → CSV. No tabs opened.', 'Ticket → fix at source.',
                  'Billing alert → refund. 30 seconds.', 'Inbox →
                  spreadsheet in one click.' This line is what gets
                  screenshotted and quote-tweeted, so it has to land."
  }
}
```

VOICE
- Write like an ops lead telling a peer about a small win. Short
  sentences. Active voice. Contractions welcome.
- Customer/ticket language, not engineer language. 'A customer asked',
  'support pinged', 'the queue', 'the spreadsheet', 'the billing row'.
  NEVER 'GraphQL', 'API', 'endpoint', 'schema', 'query', 'webhook'.
  Service names by themselves (Linear, Stripe, Notion) are fine.
- Specific beats generic, every time. 'Closed Linear DEMO-5' beats
  'closed the ticket'. 'Refunded the duplicate Stripe charge' beats
  'fixed the billing issue'.
- Never use em-dashes (—) or en-dashes (–). Use colons, periods, parens.
- No corporate filler: no 'leveraged', 'utilized', 'streamlined',
  'orchestrated', 'facilitated'.
- No hashtags. No timestamps. No code, SQL, paths, or file extensions
  in any text field EXCEPT outcome.file and where a file IS the outcome.

STEP RULES
- 3 to 5 steps total. Not fewer, not more.
- Each step.text is a PHRASE, not a sentence. Max 4 words, 28 chars.
- The sequence of step.hint values should visibly hop across services.
  If every step's hint says 'in Linear', the cross-tool story isn't
  there — re-read the transcript and find the second service.
- step.note connects to the next step where possible, not just a
  standalone reaction.

CONNECTIVITY CHECK (run this against your draft before returning)
1. Does tagline → title read like trigger → outcome? (e.g. 'URGENT
   TICKET' → 'Closed DEMO-5'.) If not, rewrite tagline.
2. Do meta_bits trace the arc — trigger count, tools touched, outcome
   flex? Or are they three random numbers?
3. Does problem.meta name a service/ticket that reappears in step 1
   AND in outcome.title? If the loop isn't closed, rewrite outcome
   or step 1.
4. Does the sequence of step.hint values include at least 2 different
   services for any session that touched 2+ tools? (Check services[]
   length.) If not, the cross-tool point is invisible — rewrite hints.
5. Does outcome.punchline compress the arc into one line a stranger
   could understand without reading the rest of the card? If it
   needs the card to make sense, rewrite it.

ANTI-PATTERNS (do not ship a card that does these)
- A complaint with no specifics in problem ('this is annoying').
- Steps that could be reordered without changing the outcome.
- services[] lists 3 tools but step.hint only mentions 1.
- meta_bits and outcome reference different units (one says 'tickets',
  the other says 'rows').
- Jargon a non-engineer wouldn't recognize.
- Em-dashes anywhere.

Return JSON ONLY. No prose around it.

TRANSCRIPT:
{{transcript}}
