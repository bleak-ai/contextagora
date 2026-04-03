# Linear Module

- **type**: integration
- **description**: Access Linear issues, projects, and teams via the GraphQL API. Used for reading and managing support tickets.
- **secrets**: `LINEAR_API_KEY`

## Authentication

All requests go to `https://api.linear.app/graphql` as POST with header `Authorization: $LINEAR_API_KEY`.

## Common Operations

### Get a single issue by identifier

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issue(id: \"DEMO-1\") { id identifier title description state { name } priority labels { nodes { name } } assignee { name } } }"}'
```

### List all issues for the team

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issues(filter: { team: { key: { eq: \"DEMO\" } } }) { nodes { id identifier title state { name } priority } } }"}'
```

### List open issues only

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issues(filter: { team: { key: { eq: \"DEMO\" } }, state: { type: { nin: [\"completed\", \"canceled\"] } } }) { nodes { id identifier title description } } }"}'
```

### Add a comment to an issue

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { commentCreate(input: { issueId: \"<issue-uuid>\", body: \"Resolution comment here.\" }) { success } }"}'
```

### Close an issue

First get the "Done" state ID, then update:

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ workflowStates(filter: { team: { key: { eq: \"DEMO\" } } }) { nodes { id name type } } }"}'
```

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { issueUpdate(id: \"<issue-uuid>\", input: { stateId: \"<done-state-uuid>\" }) { success } }"}'
```

## Notes

- `id` is a UUID (used in mutations). `identifier` is the key like `DEMO-1`.
- `issue(id: "DEMO-1")` accepts both UUID and identifier.
- Priority: 0 = None, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low.
