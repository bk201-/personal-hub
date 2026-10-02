FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/tg-news-reader/package.json apps/tg-news-reader/package.json
COPY packages/auth-server/package.json packages/auth-server/package.json
COPY packages/browser/package.json packages/browser/package.json
# buildServer.mjs resolves the root TypeScript compiler; shared builds need their dev dependencies.
RUN npm ci --workspace tg-news-reader --workspace @personal-hub/auth-server --workspace @personal-hub/browser --include-workspace-root=true --include=dev --no-audit --no-fund
COPY tsconfig.base.json ./
COPY scripts/buildIdentity.ts scripts/buildServer.mjs scripts/
COPY packages/auth-server/tsconfig.json packages/auth-server/
COPY packages/auth-server/src packages/auth-server/src
COPY packages/browser/tsconfig.json packages/browser/
COPY packages/browser/src packages/browser/src
COPY apps/tg-news-reader/index.html apps/tg-news-reader/vite.config.ts apps/tg-news-reader/tsconfig.json apps/tg-news-reader/tsconfig.server.json apps/tg-news-reader/tsconfig.server.build.json apps/tg-news-reader/
COPY apps/tg-news-reader/src apps/tg-news-reader/src
COPY apps/tg-news-reader/public apps/tg-news-reader/public
RUN npm run build:shared && npm run build --workspace tg-news-reader && npm run build:server --workspace tg-news-reader

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/tg-news-reader/package.json apps/tg-news-reader/package.json
COPY packages/auth-server/package.json packages/auth-server/package.json
COPY packages/browser/package.json packages/browser/package.json
RUN npm ci --omit=dev --workspace tg-news-reader --include-workspace-root=false --no-audit --no-fund && npm cache clean --force
COPY --from=builder /app/packages/auth-server/dist packages/auth-server/dist
COPY --from=builder /app/packages/browser/dist packages/browser/dist
COPY --from=builder /app/apps/tg-news-reader/dist apps/tg-news-reader/dist
# Preserve npm's workspace resolution while exposing the original runtime entry point.
COPY apps/tg-news-reader/package.json ./package.json
RUN ln -s apps/tg-news-reader/dist dist
VOLUME /app/data
EXPOSE 3173
CMD ["node", "--disable-warning=DEP0040", "dist/server/index.js"]
