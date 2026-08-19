FROM node:22-slim AS base
# exiftool-vendored's Linux build (exiftool-vendored.pl) is the real Perl exiftool
# script, not a self-contained binary like its Windows counterpart -- it needs a
# system Perl on PATH. Only the worker actually calls exiftool, but this is cheap
# enough to keep in the shared base rather than forking the runner/builder split further.
RUN apt-get update && apt-get install -y --no-install-recommends perl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` turned out to be more trouble than it's worth here: its lockfile-v3
# completeness check disagreed between npm patch versions (dev machine vs. whatever
# node:22-slim's npm happens to be) over optional platform packages vitest pulls in
# transitively (rolldown's native bindings) that aren't even needed at runtime. This
# project doesn't need npm ci's stricter reproducibility guarantee badly enough to
# keep fighting that; npm install is more tolerant and just works.
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL etc. are not needed at build time (no static DB access in Server
# Components at build); if that changes, pass build args here rather than baking secrets
# into the image.
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
