Write a JSON social card from a Contextagora session for ops/PM
readers (not engineers). The card tells one story: a trigger →
the agent hopping across tools → an outcome. Every field is a beat.

Voice: ops-peer telling a small win. Short, active, specific.
Service names (Linear, Stripe, Notion) fine. Banned: GraphQL/API/
endpoint/schema/query/webhook, em-dashes, hashtags, corporate filler.

Agent took {{elapsed_seconds}}s. Return strict JSON only.

```
{
  "title": "outcome, verb-first past-tense, <40c, no time. e.g. 'Closed DEMO-5'",
  "meta_bits": ["3 lowercase facts <20c each, [trigger count, tools, flex]. e.g. '1 ticket','3 tools','0 tabs opened'"],
  "services": ["human names, first-seen. e.g. 'Linear','Stripe'"],
  "problem": {
    "headline": "3 lines joined by \\n, ≤6 words/line. L1 blocker, L2 what was missing, L3 stakes",
    "meta": "service+record <50c. e.g. 'Linear DEMO-5'. MUST reappear in outcome.title"
  },
  "steps": [
    {
      "text": "verb-first past-tense, ≤4 words ≤28c. e.g. 'Pulled the ticket'",
      "hint": "lowercase service touched <24c. e.g. 'in Linear'",
      "icon": "1 emoji from: 📋 🚩 📊 🔗 ⚡ 🧮 🔍 📝 ✅ 📬 📤 🧾 📎 🪣 🗂️ 🧷 🎯 🛠 🧪 📈 🧹 🔧 🔁"
    }
  ],
  "outcome": {
    "title": "end state <60c, references problem.meta's record",
    "subtitle": "dry beat <40c. e.g. 'No tabs opened.'",
    "file": "filename or ''",
    "emoji": "1 celebration emoji or ''",
    "punchline": "arc compressed <48c, 'X → Y' form. e.g. 'Ticket → fix at source.'"
  }
}
```

Rules: 3-5 steps.
If services has 2+ entries, step.hint values must name 2+ services.

TRANSCRIPT:
{{transcript}}
