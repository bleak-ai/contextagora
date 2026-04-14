# /guide

The user has loaded one or more context modules into the workspace and just ran `/guide`. Your job is to give them a quick orientation: what's loaded, what each module can do, and what they could try right now.

| Phase | Trigger | Agent does | Ends with |
|-------|---------|------------|-----------|
| 1 | user runs `/guide` | Read `llms.txt` and each module's `info.md` + `module.yaml` | — |
| 2 | data gathered | Write orientation message with module summaries + TRY markers | Done |

═══════════════════════════════════════════════════════════════
WHAT TO DO
═══════════════════════════════════════════════════════════════

1. **Read what's loaded.** Use the `Read` tool to read `llms.txt` — this is the ONLY authoritative list of loaded modules. Do NOT glob for `*/info.md` or `*/module.yaml` files; that approach silently misses modules. The file lists every loaded module with a one-line description. For each module listed, read its `info.md` (at `<module_name>/info.md`) and its `module.yaml` (at `<module_name>/module.yaml`, if present) to understand what it does and whether it is fully configured (i.e., all required secrets have been added to Infisical).

2. **Write a single orientation message** with this structure:

   ```
   You have **N module(s)** loaded:

   - **<module_name>** — <one-sentence summary of what it can do>
   - **<module_name>** — <one-sentence summary>

   ## Try one of these

   <<TRY: <a concrete prompt that exercises one of these modules>>>
   <<TRY: <another concrete prompt>>>
   <<TRY: <a third concrete prompt>>>
   ```

3. Format TRY markers according to the conventions below.

═══════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════

- Suggest only what the loaded modules can actually do RIGHT NOW. If a module's `module.yaml` lists secrets but those secrets are not yet added to Infisical, note that the module needs secrets configured and do NOT suggest prompts that require those secrets.
- If only one module is loaded, suggest 2 prompts (not 3).
- If no modules are loaded (empty workspace), respond with: "No modules are currently loaded. Pick one in the sidebar to get started." and emit no markers.
- Be concise. The whole response should fit on one screen.

═══════════════════════════════════════════════════════════════
CONVENTIONS
═══════════════════════════════════════════════════════════════

{conventions}
