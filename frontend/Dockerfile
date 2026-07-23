# Multi-stage build: dev for local, production for hosting

# Base images pinned to a digest, not just a floating tag (`20-alpine`,
# `alpine`) — a tag is mutable and can resolve to a different image
# tomorrow; the digest can't. Tradeoff: picking up new Alpine/Node/nginx
# patch releases now needs a manual bump instead of happening automatically
# on rebuild. To update: `docker pull <image>:<tag>`, then
# `docker image inspect <image>:<tag> --format '{{index .RepoDigests 0}}'`,
# and replace the digest below.

# ── Development stage ────────────────────────────────────────────────────────
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS development

WORKDIR /app

# Copy package files first for better layer caching
# (only re-runs npm install if package.json changes)
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# Vite dev server — host 0.0.0.0 so Docker can expose it
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]


# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Inject the production API URL at build time
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build


# ── Production stage ──────────────────────────────────────────────────────────
# Serve built assets via Nginx — tiny final image (~25MB)
FROM nginx:alpine@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752 AS production

# Copy built React app
COPY --from=build /app/dist /usr/share/nginx/html

# Custom Nginx config for React Router (handles client-side routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]