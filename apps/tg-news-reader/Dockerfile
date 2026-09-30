# ─────────────────────────────────────────────────────────────
# Stage 1 — build
#   Full devDependencies so we can run Vite + tsc.
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Build Vite client → dist/client/
# Compile server TypeScript → dist/server/
RUN npm run build && npm run build:server

# ─────────────────────────────────────────────────────────────
# Stage 2 — runtime
#   Only production deps; no devDependencies, no source.
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled artefacts from the build stage
COPY --from=builder /app/dist ./dist

# SQLite data directory — mount a persistent volume here.
# When using Turso, set DATABASE_URL + TURSO_AUTH_TOKEN env vars and omit the volume.
VOLUME /app/data

EXPOSE 3173

# node dist/server/index.js also serves dist/client/ as static files
# --disable-warning=DEP0040: suppress punycode deprecation noise from gramjs/qrcode
CMD ["node", "--disable-warning=DEP0040", "dist/server/index.js"]

