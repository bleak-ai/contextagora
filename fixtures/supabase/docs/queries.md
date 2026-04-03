# Supabase Queries

## Connection

Use the Supabase REST API (PostgREST) at `$SUPABASE_URL/rest/v1/`.
Authenticate with header: `apikey: $SUPABASE_SERVICE_KEY` and `Authorization: Bearer $SUPABASE_SERVICE_KEY`.

## Schema

### users
| Column       | Type        | Notes                    |
|--------------|-------------|--------------------------|
| id           | uuid        | Primary key, auto-gen    |
| email        | text        | Unique                   |
| name         | text        |                          |
| role         | text        | admin / user             |
| subscription | text        | free / pro / enterprise  |
| created_at   | timestamptz | Default now()            |

### orders
| Column     | Type        | Notes                         |
|------------|-------------|-------------------------------|
| id         | uuid        | Primary key, auto-gen         |
| user_id    | uuid        | FK → users.id                 |
| status     | text        | pending / paid / refunded     |
| amount     | integer     | Cents                         |
| created_at | timestamptz | Default now()                 |

## Common Queries (REST API)

```bash
# List all users
curl "$SUPABASE_URL/rest/v1/users?select=*" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"

# Find user by email
curl "$SUPABASE_URL/rest/v1/users?email=eq.john@example.com&select=*" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"

# Update user role
curl -X PATCH "$SUPABASE_URL/rest/v1/users?id=eq.<user_id>" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'

# Get orders for a user
curl "$SUPABASE_URL/rest/v1/orders?user_id=eq.<user_id>&select=*" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"

# Refund an order
curl -X PATCH "$SUPABASE_URL/rest/v1/orders?id=eq.<order_id>" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "refunded"}'
```
