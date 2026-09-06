# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Prisma needs OpenSSL to download/run the correct query engine on Alpine.
# build-base/python3/pkgconfig/vips-dev let `sharp` compile from source against
# a system libvips instead of using its prebuilt native binary — sharp's
# prebuilt linux-x64/linuxmusl-x64 binaries require the x86-64-v2 CPU
# microarchitecture level (SSE4.2/POPCNT/etc.), which some VPS hosts don't
# expose to guests (e.g. an older/generic QEMU virtual CPU model) — on such a
# host the prebuilt binary fails to load at runtime. Building from source has
# no such requirement.
# vips-dev is pinned to Alpine's edge repo: sharp 0.35.x requires libvips
# >= 8.18.6, but Alpine 3.23's stable branch only ships 8.17.3. `@edge` pins
# just this one package to edge (via the repository alias below), letting apk
# resolve everything else from the stable branch already baked into this
# image — avoids the dependency conflicts that come from switching the whole
# image to edge.
RUN echo '@edge https://dl-cdn.alpinelinux.org/alpine/edge/community' >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache openssl build-base python3 pkgconfig glib-dev 'vips-dev@edge'

WORKDIR /app

# Prisma schema is copied first so the `postinstall` hook (prisma generate) works
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# `npm_config_build_from_source` has NO effect on sharp >= 0.33: it no longer
# has an install/postinstall lifecycle script, it just picks whichever
# prebuilt `@img/sharp-<platform>` optional dependency npm resolved (that's
# what fails at runtime above). Its actual from-source path is a separate,
# opt-in script — `sharp/install/build.js` — that isn't wired into any npm
# lifecycle hook, so it has to be invoked explicitly; it needs node-gyp and
# node-addon-api present too, which sharp deliberately doesn't bundle (see
# that script's own error messages). This produces
# src/build/Release/sharp-<platform>-<version>.node, which sharp's runtime
# require() tries BEFORE any @img/* package, so no need to also remove those.
RUN npm install --no-save node-gyp node-addon-api
ENV PATH="/app/node_modules/.bin:${PATH}"
ENV CPPFLAGS="-I/usr/include/glib-2.0 -I/usr/lib/glib-2.0/include"
RUN cd node_modules/sharp && node install/build.js

COPY . .
RUN npm run build && npm prune --omit=dev

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# `vips`/`vips-cpp` (runtime shared libs, not `-dev`) are required here
# because the builder stage's sharp.node above is dynamically linked against
# libvips-cpp.so — a separate package from `vips` (which only ships the
# plain C API, libvips.so; sharp needs the C++ bindings). Pinned to edge to
# match the edge vips-dev (8.18.6) used to compile it.
RUN echo '@edge https://dl-cdn.alpinelinux.org/alpine/edge/community' >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache openssl 'vips@edge' 'vips-cpp@edge'

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
