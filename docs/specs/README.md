# Refactor Specs

One spec per tech-debt item identified in `REFACTOR_QUESTIONS.md` (repo root).
Each spec assumes the answers in that file and contains a step-by-step implementation plan.

## Specs

| # | Title | Status |
|---|---|---|
| 01 | [Split `ModuleCard.tsx`](01-split-module-card.md) | Ready |
| 02 | [Break up `routes/modules.py`](02-break-up-modules-route.md) | Ready — depends on #09 |
| 03 | [Delete dead `sessions.py` files](03-delete-dead-code.md) | Ready (5 min) |
| 04 | [Remove `_secrets_cache` global](04-remove-secrets-cache.md) | Ready |
| 05 | [Tests for streaming / subprocess code](05-tests.md) | **Deferred** (explicit "no tests for now") |
| 06 | [Decompose `ContextPanel.tsx`](06-decompose-context-panel.md) | Ready |
| 07 | [Chat pipeline cleanups](07-chat-pipeline-cleanups.md) | Ready (frontend only; backend parts deferred) |
| 08 | [Remove `.claude` pseudo-module](08-remove-claude-pseudo-module.md) | Ready |
| 09 | [Unify Claude subprocess](09-unify-claude-subprocess.md) | Ready |
| 10 | [Retire `validate_modules.py`](10-validate-modules-script.md) | Ready (just delete) |

## Recommended execution order

Each arrow means "finish the left before starting the right."

```
03 (delete dead code)     →  quick wins first
10 (retire script)        →  quick wins first
08 (remove .claude)       →  independent

04 (secrets cache)        →  small, isolated

09 (unify claude)         →  02 (break up modules route)
                          ↘  09 is a prerequisite for 02

01 (split ModuleCard)     →  independent; do when you have UI bandwidth

06 (context panel)        →  after 01 (same UI surface)
07 (chat store)           →  independent

05 (tests)                →  pick up later, no blocker
```

## Pick-up rules

- Read the spec top-to-bottom before coding; the "Answers driving this spec" section is load-bearing.
- If a step feels wrong mid-implementation, update the spec and flag the drift — don't silently deviate.
- Every spec has an **Acceptance** section; use it as the PR checklist.
