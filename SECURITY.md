# Security incident runbook

Short, actionable steps for the three secrets this app depends on. If one leaks, follow the matching section — don't improvise under pressure.

## TMDB API key leaked

1. Log into the [TMDB dashboard](https://www.themoviedb.org/settings/api) and regenerate the API key (this immediately invalidates the old one).
2. Update `TMDB_API_KEY` in the prod host's `.env`.
3. Restart the backend: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend`.
4. No user-facing impact — this key is server-side only (see `routes/anime.js`), never shipped to the frontend.

## Database password leaked

Prod has two separate DB credentials — rotate whichever one actually leaked (if unsure which, rotate both):

- **`DB_USER`/`DB_PASSWORD`** — the database owner, used to bootstrap the postgres container and run schema changes.
- **`DB_APP_USER`/`DB_APP_PASSWORD`** — the least-privilege role (`backend/db/init-app-role.sh`) the running backend actually connects as in prod. This is the one that matters day-to-day.

Steps:

1. On the prod Postgres instance: `ALTER ROLE "<the_role_name>" WITH PASSWORD '<new_random_password>';` (generate a new long random value — don't reuse the old one, don't hand-pick something memorable).
2. Update the matching variable in the prod host's `.env`.
3. Restart the backend: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend`.
4. Confirm the backend reconnects successfully — check `docker compose logs backend` for `[db] Connecting to database "..." as user "..."` with no connection errors immediately after.

## JWT signing secret leaked

This is the most disruptive of the three — rotating it logs out every user immediately, with no way to do it gradually.

1. Generate a new long random value for `JWT_SECRET` and update it in the prod host's `.env`.
2. Restart the backend: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend`.
3. That's it for containment — every token issued under the old secret fails `jwt.verify()` in `middleware/auth.js` from that moment on, since tokens are stateless and signature-checked on every request. There's no separate step needed to "invalidate" old sessions the way a single-user ban does.
4. Context: the existing Redis denylist (`services/redis.js`) is what makes a single-user ban or logout instant today — it blocklists specific `jti`s. A secret rotation doesn't need it: every old token is rejected at the signature-check step, before the denylist is even consulted. The denylist itself doesn't need clearing and keeps working normally for logouts/bans that happen after rotation.
5. All users will need to log in again. If the leak looks serious enough that some accounts may be compromised (not just the secret itself), consider also forcing a password reset for affected users — that's a separate action from the token rotation above.
