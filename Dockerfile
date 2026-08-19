FROM node:22-slim AS base
# exiftool-vendored's Linux build (exiftool-vendored.pl) is the real Perl exiftool
# script, not a self-contained binary like its Windows counterpart -- it needs a
# system Perl on PATH. Only the worker actually calls exiftool, but this is cheap
# enough to keep in the shared base rather than forking the runner/builder split further.
RUN apt-get update && apt-get install -y --no-install-recommends perl \
    && rm -rf /var/lib/apt/lists/*
# node:22-slim ships an older npm than this repo's package-lock.json was generated
# with; `npm ci` between major npm versions can disagree on lockfile-v3 strictness
# around optional platform packages (hit this for real: esbuild's per-OS optional
# deps). Pin to match the local dev npm version so `npm ci` sees what generated the lock.
RUN npm install -g npm@11

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

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
