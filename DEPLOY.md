Deploying ShowRater to production

Current prod host: a DigitalOcean droplet (AnimeShowRater, Ubuntu 24.04, 1 vCPU / 1GB), serving animeratings.dev. Code lives at /opt/showrater on the host, run via Docker Compose.

Server access
SSH is key-only — password authentication is disabled in /etc/ssh/sshd_config (PasswordAuthentication no, PermitRootLogin prohibit-password).
A DigitalOcean Cloud Firewall is attached to the droplet, allowing inbound traffic only on 22 (SSH), 80 (HTTP), 443 (HTTPS). Everything else is dropped at the network level.
Backups are manual: take a droplet snapshot from the DO dashboard periodically (Droplet → Snapshots). No automated schedule is configured — this was a deliberate call given the project's stage and low-stakes data.
One-time server setup (already done, documented for reference)
Create the droplet, add your SSH public key at creation time (no password auth).
Install Docker: curl -fsSL https://get.docker.com | sh
Clone the repo: git clone https://github.com/CaelOConnor/AnimeRatingsWebstite.git /opt/showrater
Create /opt/showrater/.env on the host directly (never copy this from a dev machine) — see .env.example for the full variable list. DB_PASSWORD, DB_APP_PASSWORD, JWT_SECRET, and REDIS_PASSWORD should be freshly generated on the host itself, e.g.:
   openssl rand -hex 24   # for password-style values
   openssl rand -hex 32   # for JWT_SECRET

CORS_ORIGIN and PROD_API_URL should both be the real public origin (https://animeratings.dev). 5. Point DNS at the droplet (A records for @ and www), and in nginx/nginx.prod.conf, replace your-domain-here.com with the real domain (sed -i 's/your-domain-here.com/animeratings.dev/g' nginx/nginx.prod.conf). 6. Bootstrap the first TLS certificate (chicken-and-egg: nginx won't start with nginx.prod.conf as-is because the SSL cert files it references don't exist yet):

Temporarily swap in an HTTP-only nginx config (port 80 only, serving /.well-known/acme-challenge/ from the certbot webroot).
Bring up postgres redis backend frontend nginx with that temporary config.
Run a one-off cert request, bypassing the certbot service's built-in renewal-loop entrypoint:
     docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint certbot certbot certonly \
       --webroot -w /var/www/certbot \
       -d animeratings.dev -d www.animeratings.dev \
       --email <your-email> --agree-tos --no-eff-email -n
Restore the real nginx.prod.conf (with the SSL server block) and restart nginx: docker compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx
Start the certbot renewal-loop service: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d certbot (it checks for renewal every 12h; Let's Encrypt certs last 90 days).
Set up a DigitalOcean Cloud Firewall (22/80/443 only) and attach it to the droplet.
Redeploying manually
cd /opt/showrater
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend frontend nginx

postgres and redis are left out of --build since they don't change with app code.

Automatic deploys (GitHub Actions)

Every push to main triggers .github/workflows/deploy.yml, which SSHes into the droplet and runs the same pull/rebuild steps above.

This uses a dedicated deploy key (github-actions-deploy), separate from any personal SSH key, authorized only in the droplet's ~/.ssh/authorized_keys. Three repo secrets back this (Settings → Secrets and variables → Actions on GitHub):

DEPLOY_HOST — droplet IP
DEPLOY_USER — SSH user (root)
DEPLOY_SSH_KEY — the deploy key's private key

If the deploy key is ever compromised: remove its line from ~/.ssh/authorized_keys on the droplet, generate a new key pair, re-add the new public key to authorized_keys, and update the DEPLOY_SSH_KEY secret on GitHub. It has no access beyond SSH to this one droplet.

Secret rotation

See SECURITY.md for the incident runbook (TMDB key, DB passwords, JWT secret leaks).
