AnimeRatings

A full-stack web app for rating and reviewing anime — both per-season and for a show as a whole. Users can track shows on a watchlist, leave reviews and comments, and browse ratings pulled from TMDB.

Live site: animeratings.dev

Features
Rate and review anime at both the season level and the whole-series level
Watchlist to track shows you're following
Comments on reviews
User accounts with avatar uploads
Admin tools for content moderation, including a reporting system for flagged content
Show/season data sourced live from TMDB
Tech stack

Backend: Node.js, Express, PostgreSQL, Redis Frontend: React, Vite Infra: Docker Compose (multi-stage dev/production builds), nginx (reverse proxy + TLS termination), Let's Encrypt/certbot, DigitalOcean, GitHub Actions (CI + auto-deploy)

Security

This project went through a full production-readiness and OWASP-style security pass. Highlights:

JWT auth with a Redis-backed denylist for instant logout/ban revocation
Least-privilege database role in production, separate from the schema-owning role — a SQL-injection-class bug can't DROP/CREATE anything
Per-IP and per-user rate limiting
Security headers via Helmet (CSP, HSTS, frame options, etc.)
CORS explicitly locked to the deployed frontend origin — the app refuses to start in production if this isn't set
All containers run as a non-root user
TLS via Let's Encrypt, auto-renewing
Secrets generated fresh on the production host, never copied from a dev environment

See SECURITY.md for the incident-response runbook (key rotation steps for each secret this app depends on).

Local development
bash
docker compose up --build

Copy .env.example to .env first and fill in your own values (a TMDB API key is required — get one free at themoviedb.org).

Take the stack down with:

bash
docker compose down
Seeding sample data

To load ~75 anime (plus season-specific entries) into a fresh dev database:

Create an admin account:
bash
   docker compose exec backend node scripts/createAdmin.js
Log in as that admin to get a token:
powershell
   $response = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -ContentType "application/json" -Body '{"identifier": "EMAIL", "password": "PASSWORD"}'
   $token = $response.token
Run the seed script with that token:
bash
   docker compose exec -e SEED_TOKEN=$token backend node seed.js
Testing
bash
docker compose exec backend npx vitest run
docker compose exec frontend npx vitest run
Deployment

Production runs on a DigitalOcean droplet behind nginx, with GitHub Actions handling CI (test suite) and auto-deploy on every push to main. Full setup steps and architecture notes are in DEPLOY.md.