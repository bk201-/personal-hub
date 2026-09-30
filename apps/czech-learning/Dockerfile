FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/tg-news-reader/package.json apps/tg-news-reader/package.json
COPY apps/czech-learning/package.json apps/czech-learning/package.json
COPY packages/auth-server/package.json packages/auth-server/package.json
COPY packages/browser/package.json packages/browser/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:shared && npm run build --workspace czech-learning && npm run build:server --workspace czech-learning

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/tg-news-reader/package.json apps/tg-news-reader/package.json
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
