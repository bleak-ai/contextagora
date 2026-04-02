# Linear API Reference

## Authentication
Use a personal API key via the `LINEAR_API_KEY` environment variable.

## Common Operations

### Get Issue
```bash
curl -H "Authorization: $LINEAR_API_KEY" \
  https://api.linear.app/graphql \
  -d '{"query": "{ issue(id: \"ISSUE-123\") { title state { name } } }"}'
```

### List Team Issues
```bash
curl -H "Authorization: $LINEAR_API_KEY" \
  https://api.linear.app/graphql \
  -d '{"query": "{ team(id: \"TEAM-ID\") { issues { nodes { title } } } }"}'
```
