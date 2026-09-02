# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Prisma needs OpenSSL to download/run the correct query engine on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Prisma schema is copied first so the `postinstall` hook (prisma generate) works
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/package.json ./

EXPOSE 4000

# Apply pending migrations, then boot the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
