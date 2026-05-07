# Multi-stage build: dev for local, production for hosting

# ── Development stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS development

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
FROM node:20-alpine AS build

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
FROM nginx:alpine AS production

# Copy built React app
COPY --from=build /app/dist /usr/share/nginx/html

# Custom Nginx config for React Router (handles client-side routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]