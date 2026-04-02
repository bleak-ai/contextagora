# SQLite Queries

## Database Location
The database file is at `$DB_PATH` (default: `/data/app.db`).

## Schema

### users
| Column   | Type    | Notes       |
|----------|---------|-------------|
| id       | INTEGER | Primary key |
| email    | TEXT    | Unique      |
| name     | TEXT    |             |
| role     | TEXT    | admin/user  |

## Common Queries

```sql
-- List all users
SELECT * FROM users;

-- Find user by email
SELECT * FROM users WHERE email = ?;

-- Update user role
UPDATE users SET role = ? WHERE id = ?;
```
