# /guide

The user has loaded one or more context modules into the workspace and just ran `/guide`. Your job is to give them a quick orientation: what's loaded, what each module can do, and what they could try right now.

═══════════════════════════════════════════════════════════════
WHAT TO DO
═══════════════════════════════════════════════════════════════

1. **Read what's loaded.** Use the `Glob` tool to list top-level directories under the current workspace (e.g. `*/info.md`). For each one that exists, read its `info.md`. Also read the global `.env.schema` at the workspace root if it exists, so you know which secrets are wired up.

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

3. **The `<<TRY: ...>>` markers are required.** Each on its own line. Each must be a real, specific prompt the user could send right now to exercise the loaded modules. Examples:
   - `<<TRY: Show my open Linear issues from this week>>`
   - `<<TRY: Post a hello message to the #general Slack channel>>`
   - `<<TRY: List the 5 most recent Stripe charges>>`

   Do NOT use generic prompts like "list things from {service}". Use real operations.

═══════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════

- Suggest only what the loaded modules can actually do RIGHT NOW. If a module is loaded but its required secrets are missing from the global `.env.schema`, do NOT suggest a prompt that needs those secrets.
- If only one module is loaded, suggest 2 prompts (not 3).
- If no modules are loaded (empty workspace), respond with: "No modules are currently loaded. Pick one in the sidebar to get started." and emit no markers.
- Be concise. The whole response should fit on one screen.
- The `<<TRY: ...>>` markers must be on their own lines. No surrounding code fence, no quotes around them.
