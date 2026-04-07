You are helping me create a context module for "{{module_name}}" so that
future AI agents working on this project know how to use it correctly.
The module will be loaded into a separate workspace where agents read it
without seeing my actual codebase or workspace, so everything they need
must be in the file you produce.

Look at how {{module_name}} is actually used {{source_phrase}}. Be specific
to this project — do NOT write generic API documentation. Capture the real
entities, the real conventions, the real gotchas.

Produce a single markdown file with EXACTLY these top-level sections, in
this order, using these exact headings:

  # {{module_name}}
  ## Purpose
  ## Where it lives
  ## Auth & access
  ## Key entities
  ## Operations
  ## Examples
  ### Python packages

Rules:

1. "Auth & access" lists ENVIRONMENT VARIABLE NAMES ONLY. Never paste
   values, tokens, or secrets. One line per variable explaining what it
   is and where it comes from.

   IMPORTANT — file-based credentials: varlock injects string VALUES into
   environment variables; it does NOT manage files on disk. Any third
   party that normally authenticates via a credentials FILE (Google
   service account JSON, Firebase admin SDK JSON, kubeconfig YAML, PEM
   private keys, etc.) must be reshaped into a single string secret
   whose VALUE is the file's contents (typically JSON).

   Convention: name such secrets `<SERVICE>_SA_JSON` (e.g.
   `GCP_SA_JSON`, `FIREBASE_SA_JSON`) or `<SERVICE>_KEY_PEM` for PEM
   blobs. Do NOT declare `GOOGLE_APPLICATION_CREDENTIALS` or any other
   "path to a file" variable — it cannot be resolved by varlock.

   In the "Key entities" or "Auth & access" prose, briefly explain to
   the user how to populate the secret in their vault: paste the entire
   contents of the JSON / PEM file as the secret value (single-line or
   multi-line, both work).

   In the "Examples" section, code that consumes such a secret must
   parse it inline. For Google service-account JSON:

       import os, json
       from google.oauth2 import service_account
       creds = service_account.Credentials.from_service_account_info(
           json.loads(os.environ["GCP_SA_JSON"])
       )

   For PEM blobs, write the value to a temp file inside the snippet
   only if the SDK strictly requires a path — prefer in-memory APIs
   when available.

2. "Key entities" must reflect THIS project's usage — real table names,
   real metadata fields, real plan names, real status values. If you
   don't know, inspect the code/workspace; do not invent.

3. "Operations" must include explicit "Never" items where there's risk
   (deleting customers, mutating prod data, etc.).

4. "Examples" must use the project's execution convention. Every
   runnable Python snippet MUST be wrapped as:

       varlock run --path ./{{module_name}} -- sh -c 'uv run python -c "
       <python code that reads secrets from os.environ>
       "'

   Do NOT use `python` directly. Do NOT call `load_dotenv()`. Do NOT
   hardcode secrets. Do NOT use `--with` flags on `uv` (deps are
   pre-installed by the host). The agent loading this module will
   execute commands this exact way — anything else will fail or be
   ignored.

   For shell-only examples (curl, psql, etc.), wrap as:

       varlock run --path ./{{module_name}} -- sh -c '<command using $VAR>'

   Always use `sh -c '...'` so that `$VAR` is expanded AFTER varlock
   injects the values. Never `varlock run -- echo $VAR` directly.

5. "Python packages" lists packages the examples import. One per line,
   no versions unless required.

6. Be concrete. Prefer one real example over three abstract ones.

Output the markdown file and nothing else.
