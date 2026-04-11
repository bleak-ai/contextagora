# Context Loader — Developer Notes

## Prompt / Architecture Coupling

The files in `platform/src/prompts/` and the inline prompts in `platform/src/commands.py` contain
instructions that are tightly coupled to the project's runtime conventions. **When any of the
following change, update the prompts too:**

| What changed | Prompts to update |
|---|---|
| `varlock run` invocation pattern (flags, path, shell wrapping) | `add_module.md`, `adapt_examples.md`, `commands.py` (`_ADD_INTEGRATION_PROMPT`) |
| Secret storage location (Infisical path schema, vault tool) | `commands.py` (`_ADD_INTEGRATION_PROMPT` step 3), `guide.md` |
| Module manifest format (`module.yaml` fields, filename) | `commands.py` (`_ADD_INTEGRATION_PROMPT` SAVING section), `guide.md` |
| Module directory structure (`info.md`, `llms.txt`, `module.yaml`) | `add_module.md`, `guide.md`, `introduction.md` |
| Python execution convention (`uv run`, `--with` flags) | `add_module.md`, `adapt_examples.md`, `commands.py` |

### Current conventions (as of 2026-04-11)

- **Run scripts:** `varlock run -- sh -c 'uv run python -c "..."'` — no `--path` flag, always from context root
- **Secrets vault:** Infisical, path `/<module_name>`, one key per secret variable
- **Module manifest:** `module.yaml` (not `.env.schema` or `requirements.txt`) declares `secrets:` and `dependencies:`
- **Do not read:** `.env.schema` at workspace root is auto-generated; prompts and agents must not instruct users to interact with it directly
