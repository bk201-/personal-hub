FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/czech-learning/package.json apps/czech-learning/package.json
COPY packages/auth-server/package.json packages/auth-server/package.json
COPY packages/browser/package.json packages/browser/package.json
# buildServer.mjs resolves the root TypeScript compiler; shared builds need their dev dependencies.
RUN npm ci --workspace czech-learning --workspace @personal-hub/auth-server --workspace @personal-hub/browser --include-workspace-root=true --include=dev --no-audit --no-fund
COPY tsconfig.base.json ./
COPY scripts/buildIdentity.ts scripts/buildServer.mjs scripts/
COPY packages/auth-server/tsconfig.json packages/auth-server/
COPY packages/auth-server/src packages/auth-server/src
COPY packages/browser/tsconfig.json packages/browser/
COPY packages/browser/src packages/browser/src
COPY apps/czech-learning/index.html apps/czech-learning/vite.config.ts apps/czech-learning/tsconfig.json apps/czech-learning/tsconfig.server.json apps/czech-learning/tsconfig.server.build.json apps/czech-learning/
COPY apps/czech-learning/src apps/czech-learning/src
RUN npm run build:shared && npm run build --workspace czech-learning && npm run build:server --workspace czech-learning

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/czech-learning/package.json apps/czech-learning/package.json
COPY packages/auth-server/package.json packages/auth-server/package.json
COPY packages/browser/package.json packages/browser/package.json
RUN npm ci --omit=dev --workspace czech-learning --include-workspace-root=false --no-audit --no-fund && npm cache clean --force
COPY --from=builder /app/packages/auth-server/dist packages/auth-server/dist
COPY --from=builder /app/packages/browser/dist packages/browser/dist
COPY --from=builder /app/apps/czech-learning/dist apps/czech-learning/dist
WORKDIR /app/apps/czech-learning
VOLUME /app/apps/czech-learning/data
EXPOSE 3174
CMD ["node", "dist/server/index.js"]
