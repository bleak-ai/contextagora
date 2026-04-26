# /add-workflow

| Phase | Trigger | Agent does | Ends with |
|-------|---------|------------|-----------|
| 1. Name check | user runs `/add-workflow` | If no name given, ask for one. Normalize to slug. | Wait for name or proceed |
| 2. Discovery | name provided | Ask one question: what the workflow does and the steps in order | Wait for answer |
| 3. Draft | user answers | Build info.md and every steps/N-<slug>.md, show all drafts | "Look good? Say **save** to create it, or tell me what to change." |
| 4. Revision | user requests changes | Update drafts, re-show | Same |
| 5. Save | user says "save" | Write files + register | TRY marker + next steps |

You are a conversational assistant helping the user create a workflow module.

The user invoked `/add-workflow`. The argument after the command is the workflow name.

IMPORTANT: If no workflow name was given, ask: "What is the workflow name?" and STOP.

Normalize the name to a lowercase slug (e.g. `MAAT Support` -> `maat-support`).

---

## How this works

A workflow is a folder of numbered Markdown step files. Each step's prose tells the agent what to do and what to read next. Flow control lives in the prose, not in YAML.

On disk it looks like:

```
{modules_repo}/<name>/
  module.yaml          # kind: workflow, entry_step: 1-<slug>.md
  info.md              # what the workflow does and its ordered steps
  steps/
    1-<slug>.md
    2-<slug>.md
    ...
```

Have a short conversation to understand the workflow, then YOU build the files from the user's answers.

---

## Discovery

Ask the user ONE question:

> What does this workflow do, and what are the steps in order? If any step needs to split into variants depending on the situation, mention that too.

Keep it conversational. If the user already gave you enough in the initial message, skip straight to the draft.

You need to come away with:

1. A 1-2 sentence purpose for the workflow.
2. An ordered list of steps. For each step: a short title and a one-line description of what happens.
3. Any explicit branches the user mentioned (e.g. "step 4 splits depending on whether the gym uses Stripe or GoCardless").

Do NOT ask the user about branching if they did not mention it. Default to a fully linear workflow.

---

## Drafting

Once you have the info, assemble these files in memory and show them all to the user inline (use fenced code blocks, one per file).

### `info.md`

Free-form prose. NOT the integration template. Structure:

```
# <workflow_name>

## Purpose
(1-2 sentences from what the user told you)

## Steps
1. <title> - <one-line description>
2. <title> - <one-line description>
...
```

If a step has variants, list them as sub-bullets under that step.

### `steps/N-<slug>.md` (one file per step)

The slug for each step file is a lowercase hyphenated slug of the step title (e.g. `Plan the change` -> `2-plan-the-change.md`). Numbering starts at 1 and is contiguous. Variants share a number with a letter suffix (`4a-price-setup.md`, `4b-price-match.md`).

Each step file follows this shape:

```
# Step N: <title>

<short paragraph or 2-6 bullets describing what to do in this step>

## Next

<prose telling the agent what to read next>
```

Rules for the `## Next` section:

- Linear next step: `Read steps/<N+1>-<next-slug>.md and continue.`
- Branching: list each branch as a bullet, each saying "If <condition> -> read `steps/<Na-slug>.md`."
- Loop-back: `If <condition>, read steps/<earlier>-<slug>.md again.`
- Last step: `End of workflow. Confirm completion with the user and remind them they can archive this run task from the sidebar.`
- For a step that has variants (`4a`, `4b`), the PRIOR step's `## Next` section asks the user which variant to take, then reads the chosen file. Each variant file's own `## Next` rejoins the linear flow at the next number.

Keep step files short. Bullets over paragraphs. The agent reading them is smart; do not over-explain.

---

## Conciseness

These files are loaded as context into a coding agent. Every extra line costs tokens. Cut ruthlessly.

- Purpose: 1-2 sentences max.
- Step descriptions: one line each in `info.md`.
- Inside each step file: 2-6 bullets, plus the `## Next` section. No preamble.

Show the drafts and ask: "Look good? Say **save** to create it, or tell me what to change."

---

## Saving

When the user says `save`:

1. Create the directories:

       mkdir -p {modules_repo}/<name>/steps

2. Write `module.yaml` to `{modules_repo}/<name>/module.yaml`:

   ```yaml
   name: <name>
   kind: workflow
   summary: <one-sentence summary derived from Purpose>
   entry_step: 1-<slug-of-step-1>.md
   ```

   No `secrets:` or `dependencies:` fields. Workflows do not declare those; the run tasks they spawn can declare their own if needed later.

3. Write `info.md` to `{modules_repo}/<name>/info.md` using the Write tool.

4. Write each step file to `{modules_repo}/<name>/steps/<N>-<slug>.md` using the Write tool.

5. Register the workflow:

       curl -sS -X POST {base_url}/api/modules/<name>/register

   This regenerates `llms.txt`, links the workflow into the workspace, and makes the `/<name>` slash command available immediately (the command registry is dynamic).

6. On success, tell the user:
   - The workflow is now visible in the **Workflows** sidebar zone above Active Tasks.
   - To start a run: click **Start run** on the workflow card, OR type `/<name>` in chat.
   - **Push** via Sync to persist the workflow to the repo.

   Emit ONE concrete TRY marker that starts the first run, on its own line, no quotes, no code fence:

   ```
   <<TRY: /<name>>>
   ```

7. On error: show the error and stop.
