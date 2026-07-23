#!/bin/bash
set -e

# Dedicated role for the test database — never the same credentials as the
# main app's POSTGRES_USER/POSTGRES_PASSWORD. Matches DB_USER/DB_PASSWORD in
# the project root's .env.test, which is what the test suite itself connects
# with (see backend/vitest.config.js).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE ROLE \"${DB_USER_TEST}\" WITH LOGIN PASSWORD '${DB_PASSWORD_TEST}';"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE DATABASE ${DB_NAME_TEST} OWNER \"${DB_USER_TEST}\";"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${DB_NAME_TEST}" \
  -f /docker-entrypoint-initdb.d/01_init.sql

# init.sql above runs as POSTGRES_USER, so the tables/sequences/functions it
# creates are owned by that role even though DB_USER_TEST owns the database
# itself — grant DB_USER_TEST what it actually needs to run the test suite.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${DB_NAME_TEST}" <<SQL
GRANT USAGE, CREATE ON SCHEMA public TO "${DB_USER_TEST}";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${DB_USER_TEST}";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "${DB_USER_TEST}";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "${DB_USER_TEST}";
ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${DB_USER_TEST}";
ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${DB_USER_TEST}";
SQL
