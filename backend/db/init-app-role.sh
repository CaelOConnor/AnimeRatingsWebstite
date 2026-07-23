#!/bin/bash
set -e

# Dedicated least-privilege role for the running application in production —
# see docker-compose.prod.yml, which points the backend service's DB_USER/
# DB_PASSWORD at this role instead of the database owner (POSTGRES_USER).
# Schema setup (this script, init.sql, any future migrations) still runs as
# the owner, which needs full DDL/ownership — the running app itself only
# ever needs to read and write rows in its own tables.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE ROLE \"${DB_APP_USER}\" WITH LOGIN PASSWORD '${DB_APP_PASSWORD}';"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO "${DB_APP_USER}";
GRANT USAGE ON SCHEMA public TO "${DB_APP_USER}";
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, anime, watchlist, reviews, comments, reports, feedback
  TO "${DB_APP_USER}";

-- Deliberately no CREATE, no ownership, no DDL of any kind, and no
-- ALTER DEFAULT PRIVILEGES for future tables either — extending this
-- role's access to a new table should be a deliberate line added here,
-- not something it inherits automatically the moment a table is created.
SQL
