You are rewriting code examples inside a context module's "## Examples"
section so they conform to this project's execution convention.

The convention is:

  varlock run -- sh -c 'uv run python -c "
  <python code>
  "'

Apply ALL of these rules:

1. Wrap every Python snippet in:
       varlock run -- sh -c 'uv run python -c "..."'
   `<module_name>` is the module being created.

2. Inside the python, read every secret from `os.environ["VAR_NAME"]`.
   Inside the heredoc, escape inner double quotes as `\"` — never use
   single quotes for the `os.environ` key, because the outer `sh -c`
   already uses single quotes.

3. Remove any of the following — they break the model:
   - `from dotenv import load_dotenv` / `load_dotenv()`
   - `python script.py` style invocations (rewrite as inline `python -c`)
   - Hardcoded API keys, tokens, URLs with embedded credentials
   - `os.getenv("X", "default-value")` with a real default
   - `--with` flags on `uv` (deps are pre-installed)
   - Any reference to file-path credential env vars like
     `GOOGLE_APPLICATION_CREDENTIALS`, `KUBECONFIG`, or
     `<SERVICE>_KEYFILE` — varlock cannot manage files on disk.

3a. **File-based credentials → JSON-string secret rewrite.** If the
    original example authenticates via a credentials file, rewrite it
    so the secret is a single env var holding the file's contents:

    - Rename the env var using the convention `<SERVICE>_SA_JSON` for
      JSON service-account blobs (e.g. `GCP_SA_JSON`,
      `FIREBASE_SA_JSON`) or `<SERVICE>_KEY_PEM` for PEM blobs.
    - Update the `## Auth & access` section bullet list accordingly:
      remove the file-path variable, add the JSON/PEM-string variable,
      and add a one-line note: "Paste the full contents of the
      credentials JSON as the secret value."
    - Rewrite the Python to parse the value inline. For Google service
      account JSON:

          import os, json
          from google.oauth2 import service_account
          creds = service_account.Credentials.from_service_account_info(
              json.loads(os.environ["GCP_SA_JSON"])
          )

    - Never write the secret to a temp file unless the target SDK
      strictly requires a filesystem path; prefer in-memory APIs.

    Show BOTH the auth-section change AND the example change in the
    diff you present to the user.

4. For shell-only examples (curl, psql, etc.), wrap as:
       varlock run -- sh -c '<command using $VAR>'
   Do NOT use `varlock run -- echo $VAR` directly — the parent shell
   would expand `$VAR` before varlock injects. Always wrap in
   `sh -c '...'`.

5. If the original example uses a different language (Node, Go, Bash),
   keep the language but still wrap it in
   `varlock run -- sh -c '...'`.

6. Never invent new examples. Only transform what's there. If an example
   references a secret that isn't in the module's "## Auth & access"
   section, flag it in a comment above the rewritten block:
       # NOTE: this example uses STRIPE_WEBHOOK_SECRET which is not
       # declared in Auth & access — add it there or remove this example.

7. Preserve the original example's intent and surrounding prose. Only
   the code blocks change.

When you rewrite a snippet, show both versions so the user can see the
diff:

    Before:
    ```python
    import os
    from dotenv import load_dotenv
    load_dotenv()
    ...
    ```

    After:
    ```bash
    varlock run -- sh -c 'uv run python -c "
    import os
    ...
    "'
    ```
