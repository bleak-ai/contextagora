# Writing Efficient Scripts

> Cross-cutting tips for the agent when generating scripts that talk to
> external systems (Firestore, Linear, Stripe, Postgres, anything else
> behind a network call). These are not module-specific — they apply to any
> script the agent writes inside a `varlock run` invocation.

**For the agent reading this:** these tips exist because of mistakes that
have actually happened in this project, not as theoretical best practices.
Each rule traces back to a real failure mode that wasted real time. Follow
them by default. Deviate only if you can name the specific reason a rule
does not apply to the situation in front of you.

---

## The cardinal rule: minimize round-trips

Every request to an external system is a network call. Network calls are
~100-1000× slower than anything happening in memory. **The single biggest
performance lever in any script is reducing the number of network calls**,
not optimizing the code that runs between them.

Concretely: if you have a list of N IDs and the API has a batch endpoint,
use the batch endpoint. If you have 1000 documents to write and the API
supports batched writes, use the batched write. If you can answer a question
with one query plus in-memory filtering, do that instead of N filtered
queries.

Everything below is a specific case of this rule.

---

## Anti-patterns and their fixes

### 1. The N+1 pattern (the most expensive mistake you can make)

**Wrong:**

    for member in db.collection("gyms").document(gym_id).collection("members").stream():
        user = db.collection("users").document(member.id).get()   # one network call PER iteration
        ...

For a 1000-member collection, this is 1000 sequential network round-trips.
At ~100ms each that is **~100 seconds**. The Bash tool timeout is 120s. You
will hit it.

**Right:**

    # 1. Stream once. Collect ids in memory.
    members = [(m.id, m.to_dict() or {}) for m in
               db.collection("gyms").document(gym_id).collection("members").stream()]

    # 2. Batch-fetch the related collection in one call.
    user_refs = [db.collection("users").document(uid) for uid, _ in members]
    users_by_id = {u.id: (u.to_dict() or {}) for u in db.get_all(user_refs) if u.exists}

    # 3. Stitch in memory.
    rows = [{"uid": uid, "name": users_by_id.get(uid, {}).get("name", ""), **md}
            for uid, md in members]

For very large fan-outs (>500 ids), chunk the batch call into groups of 500
to avoid degraded performance. Most APIs have an undocumented sweet spot;
500 is a safe default for Firestore.

**The rule:** *if you find yourself writing a network call inside a `for`
loop that iterates over results from another network call, stop and rewrite
it as collect → batch-fetch → stitch.*

### 2. Unbounded queries

**Wrong:**

    for doc in db.collection("gyms").stream():     # how many gyms? you don't know
        process(doc)

**Right (exploratory):**

    for doc in db.collection("gyms").limit(20).stream():
        print(doc.id, doc.to_dict().get("name"))

**Right (production):**

    # Either you have a bounded `where` query that you know is small...
    for doc in db.collection("gyms").where("active", "==", True).stream():
        ...

    # ...or you paginate explicitly and report progress.
    last = None
    while True:
        q = db.collection("gyms").order_by("__name__").limit(500)
        if last is not None:
            q = q.start_after({"__name__": last})
        batch = list(q.stream())
        if not batch:
            break
        for doc in batch:
            process(doc)
        last = batch[-1].id
        print(f"processed up to {last}", flush=True)

**The rule:** *if you can't say out loud how many items the loop will
iterate over, you're writing an unbounded query. Add a `.limit()` or a
`where()` or a pagination loop with progress prints. Never just stream and
hope.*

### 3. No progress output on long-running scripts

**Wrong:**

    rows = []
    for x in big_collection.stream():
        rows.append(do_work(x))
    print(f"done, {len(rows)} rows")

If `do_work` is slow or `big_collection` is huge, the script appears to hang
for minutes. There is no way to tell "running normally, just slow" from
"deadlocked." When the Bash tool timeout fires, you have no information.

**Right:**

    rows = []
    for i, x in enumerate(big_collection.stream()):
        rows.append(do_work(x))
        if i % 50 == 0:
            print(f"... {i} processed", flush=True)
    print(f"done, {len(rows)} rows")

The `flush=True` matters — without it, Python buffers stdout when not
attached to a terminal and you see nothing until the process exits.

**The rule:** *if a script might run more than 5 seconds, it must emit
progress output at least every 5 seconds. Use `flush=True`. The cost is one
line of code; the benefit is the difference between "I can debug this" and
"I have no idea what's happening."*

### 4. Reusing search terms as identifiers

**Wrong:**

    # Earlier in the script, you found the gym whose name contains "aranha":
    for d in db.collection("gyms").where(...).stream():
        if "aranha" in d.to_dict().get("name", "").lower():
            print(d.id, d.to_dict().get("name"))   # prints e.g. "gym_xY12 | Aranha BJJ"

    # Later:
    gym_id = "aranha"   # WRONG — the actual id is "gym_xY12"
    for m in db.collection("gyms").document(gym_id).collection("members").stream():
        ...

This silently returns zero results (or, in the worst case, *also* matches a
real document by coincidence). Either way you get a wrong answer that looks
right, which is the worst kind of bug.

**Right:** when chaining queries, always copy the exact `doc.id` from the
prior step. If you need to write a multi-step script in one go and you don't
have the id yet, parameterize it and run the lookup script first.

**The rule:** *a search term and a document id are different things, even
when they happen to look the same.*

### 5. Reading more data than you need

**Wrong:**

    for doc in big_collection.stream():
        d = doc.to_dict()
        print(d["email"])

This pulls every field of every document over the network just to read one.
For wide documents (Firestore docs with image blobs, JSON arrays, etc.) this
can be 10× the bandwidth you actually need.

**Right:** ask the API for only the fields you need.

    # Firestore: use select()
    for doc in big_collection.select(["email"]).stream():
        print(doc.to_dict()["email"])

    # GraphQL APIs: only request the fields in the query
    # SQL: SELECT only the columns you need

**The rule:** *don't pull bytes you're going to throw away.*

### 6. Sequential where parallel works

**Wrong:**

    for org_id in org_ids:
        result = api.fetch(org_id)         # blocking, one at a time
        process(result)

If the API supports concurrent requests and the work for each org is
independent, this leaves a lot of time on the table.

**Right (Python, simple):**

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(api.fetch, org_ids))
    for r in results:
        process(r)

**Caveats:**
- Respect the API's rate limit. 10 concurrent threads against an API that
  allows 5 req/sec is a great way to get banned.
- Threads are fine for I/O-bound work (network calls). For CPU-bound work
  use processes, not threads.
- Don't parallelize for the sake of it. Two sequential calls is fine; ten is
  the breaking point where parallelism starts paying off.

**The rule:** *if work items are independent and the bottleneck is network
latency, run them in parallel with a small thread pool. If they share state
or order matters, keep them sequential.*

### 7. Loading whole result sets when you only need a count

**Wrong:**

    members = list(db.collection("gyms").document(gym_id).collection("members").stream())
    print(f"{len(members)} members")

You just streamed every member document over the network to count them.

**Right:**

    # Firestore aggregation queries
    agg = db.collection("gyms").document(gym_id).collection("members").count().get()
    print(f"{agg[0][0].value} members")

Most APIs have a count or aggregation endpoint. Use it.

**The rule:** *if the question is "how many," ask the API for a count. Don't
fetch the rows.*

---

## Defensive defaults for any script

These should be in every script you write that talks to a remote system,
not just the ones you think might be slow.

1. **Bounded by default.** Add `.limit(100)` or equivalent unless you can
   justify the unbounded form.
2. **Progress output.** `print(..., flush=True)` at least every 50
   iterations or every 5 seconds.
3. **Explicit failure handling for the call you care about.** Wrap the main
   network call in `try/except` with a specific exception type, not bare
   `except`. Print the error and the input that caused it.
4. **Print the inputs at the top.** A script that starts with
   `print(f"querying gym_id={gym_id}, since={since}")` lets future-you (or
   the agent debugging it) confirm the script is doing what you expect.
5. **No silent fallbacks.** If a related fetch fails, don't substitute an
   empty dict and pretend it succeeded — print which lookup failed.

---

## When you genuinely don't know how big something is

The honest move is to find out *first*, with a small probe:

    varlock run --path ./firestore -- uv run python <<'PYEOF'
    import json, os
    from google.cloud import firestore
    from google.oauth2 import service_account
    creds = service_account.Credentials.from_service_account_info(
        json.loads(os.environ["FIRESTORE_MAAT_SA_JSON_RO"])
    )
    db = firestore.Client(project=os.environ["FIRESTORE_MAAT_PROJECT_ID"], credentials=creds)

    # Probe: how many members in this gym?
    n = db.collection("gyms").document("REAL_GYM_ID").collection("members").count().get()[0][0].value
    print(f"members: {n}")
    PYEOF

Then write the real script with the right pattern based on what you found:

- **< 100 items:** simple loop is fine, even with naive joins.
- **100–5000 items:** use batched joins (`get_all`, batch endpoints), add
  progress output.
- **> 5000 items:** paginate, parallelize batches, write incrementally to
  disk, expect the script to take minutes — and consider whether the user
  actually wants every row, or just an aggregate.

The probe takes 1-2 seconds. The wrong pattern takes >120 seconds and
fails. **The probe always pays for itself.**

---

## Cross-references

- Workspace `CLAUDE.md` "Secrets" — the `varlock run` heredoc form every
  script must use.
- `docs/varlock.md` — why secret handling looks the way it does in this
  project.
- `docs/debugging-claude-timing.md` — how to measure where a slow script is
  actually spending its time.
- Each module's `info.md` (firestore, linear, stripe, …) — module-specific
  examples that already follow these patterns. When in doubt, copy from
  there rather than from your training data.

---

## The meta-rule

**Spend 30 seconds thinking about the shape of the data before you write
the script.** How big is the collection? Is the join 1:1 or 1:N? Does the
API have a batch form? Can a `count()` answer the question instead of a
`list()`?

The agent's failure mode is jumping straight to "for each item, fetch
related thing." That pattern is wrong by default and right only by accident.
The opposite default — "collect first, batch second, stitch third" — is
right by default and wrong only when the collection is tiny (in which case
either approach works and it doesn't matter).

When in doubt, prefer the batched shape. The cost of over-batching a small
collection is essentially zero. The cost of under-batching a large
collection is a 2-minute timeout and a wasted session.
