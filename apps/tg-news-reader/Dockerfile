FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/tg-news-reader/package.json apps/tg-news-reader/package.json
COPY apps/czech-learning/package.json apps/czech-learning/package.json
COPY packages/auth-server/package.json packages/auth-server/package.json
COPY packages/browser/package.json packages/browser/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:shared && npm run build --workspace tg-news-reader && npm run build:server --workspace tg-news-reader

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/tg-news-reader/package.json apps/tg-news-reader/package.json
COPY apps/czech-learning/package.json apps/czech-learning/package.json
COPY packages/auth-server/package.json packages/auth-server/package.json
COPY packages/browser/package.json packages/browser/package.json
RUN npm ci --omit=dev --workspace tg-news-reader --include-workspace-root=false --no-audit --no-fund && npm cache clean --force
COPY --from=builder /app/packages/auth-server/dist packages/auth-server/dist
COPY --from=builder /app/packages/browser/dist packages/browser/dist
COPY --from=builder /app/apps/tg-news-reader/dist apps/tg-news-reader/dist
WORKDIR /app/apps/tg-news-reader
VOLUME /app/apps/tg-news-reader/data
EXPOSE 3173
CMD ["node", "--disable-warning=DEP0040", "dist/server/index.js"]
