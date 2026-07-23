# ── Development stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]


# ── Production stage ─────────────────────────────────────────────────────────
# Only production dependencies (no vitest/supertest) and only the source the
# server actually needs to run — no __tests__, scripts/, seed.js, etc.
# (.dockerignore keeps those out of the build context entirely, so the
# directory COPYs below can't pull them in even implicitly.)
FROM node:20-alpine AS production

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
