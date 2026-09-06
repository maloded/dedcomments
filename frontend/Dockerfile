# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time, not read
# at container start — so this has to be a build arg, not a runtime env var.
# Default matches docker-compose.yml: the browser (not this container) is what
# calls the backend, over the port docker-compose publishes to the host.
ARG NEXT_PUBLIC_GRAPHQL_URL=http://localhost:4000/graphql
ENV NEXT_PUBLIC_GRAPHQL_URL=$NEXT_PUBLIC_GRAPHQL_URL

# Only the Docker build wants `output: "standalone"` (next.config.ts reads
# this) — Vercel's build doesn't set it and gets Next's normal output instead.
ENV BUILD_STANDALONE=true
RUN npm run build

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# `output: "standalone"` (next.config.ts) traces the minimal server + deps —
# no full node_modules copy needed.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
