# ── Development stage ────────────────────────────────────────────────────────
# Pinned to a digest, not just the `20-alpine` tag — the tag is mutable and
# can point to a different image tomorrow than it does today; the digest
# can't. Tradeoff: this now needs a manual bump to pick up new Alpine/Node
# patch releases (rebuilding alone won't do it, since the digest is fixed).
# To update: `docker pull node:20-alpine`, then
# `docker image inspect node:20-alpine --format '{{index .RepoDigests 0}}'`,
# and replace the digest below (in both Dockerfiles that use this image).
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS development

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Same reasoning as the production stage below: create the uploads dir
# (where the named volume mounts) owned by the non-root user before
# switching to it, so a freshly-created volume inherits writable
# ownership instead of defaulting to root.
RUN mkdir -p /app/uploads/avatars && chown -R node:node /app/uploads

USER node

EXPOSE 3001

CMD ["npm", "run", "dev"]


# ── Production stage ─────────────────────────────────────────────────────────
# Only production dependencies (no vitest/supertest) and only the source the
# server actually needs to run — no __tests__, scripts/, seed.js, etc.
# (.dockerignore keeps those out of the build context entirely, so the
# directory COPYs below can't pull them in even implicitly.)
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY app.js server.js ./
COPY db ./db
COPY middleware ./middleware
COPY routes ./routes
COPY services ./services
COPY utils ./utils

# Create the uploads dir owned by the non-root user before switching to it —
# the named volume Docker mounts here on first run inherits this ownership.
RUN mkdir -p /app/uploads/avatars && chown -R node:node /app/uploads

USER node

EXPOSE 3001

CMD ["npm", "start"]
