# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# libc compat for Prisma's OpenSSL engine on Alpine; chromium for Puppeteer rendering.
RUN apk add --no-cache libc6-compat chromium

COPY package.json package-lock.json* ./
# --ignore-scripts: the `prepare` script (husky install) needs devDependencies
# that aren't installed here; the generated Prisma client is copied in from the
# builder stage, so no postinstall output from this stage is needed.
RUN npm ci --omit=dev --ignore-scripts

# ─── Stage 2: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# openssl: required for `prisma generate` to detect OpenSSL 3 and download the
# linux-musl-openssl-3.0.x query engine — without it detection falls back to
# the openssl-1.1.x engine, which cannot load at runtime on this base image.
RUN apk add --no-cache libc6-compat chromium openssl

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Generate Prisma client before build
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1

# Build-time-only dummy env. `next build` imports server modules while collecting
# page data, and src/lib/env.ts fails fast under NODE_ENV=production unless these
# are validly shaped (64-char hex key, non-placeholder secret, non-"minioadmin"
# MinIO creds). Not secrets, and not baked into the runner stage — real values
# are injected at runtime via docker-compose `env_file: .env`.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    TOKEN_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
    BETTER_AUTH_SECRET=docker-build-dummy-secret-not-used-at-runtime \
    MINIO_ACCESS_KEY=docker-build-dummy \
    MINIO_SECRET_KEY=docker-build-dummy \
    npm run build

# Bundle the scheduler worker (src/scheduler/worker.ts is TypeScript, never
# compiled by `next build`, and src/ isn't copied into the runner image) into a
# single CJS file the runner can execute directly with plain `node`. esbuild
# resolves the "@/*" path alias itself via tsconfig.json's compilerOptions.paths
# (no --alias flag needed — verified against this repo's tsconfig). @prisma/client
# is kept external: the runner gets the generated client + native query engine
# copied in separately (see below), and bundling it would strand the engine binary.
RUN npx esbuild src/scheduler/worker.ts \
    --bundle \
    --platform=node \
    --format=cjs \
    --outfile=dist/scheduler/worker.js \
    --external:@prisma/client

# ─── Stage 3: runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# openssl: Prisma's runtime OpenSSL detection needs it (see builder stage note).
# font-noto-sinhala: Sinhala (සිංහල) glyphs for rendered posts. Alpine's chromium
# ships only Latin-capable fonts, so without this Sinhala copy rasterizes as tofu
# boxes. Installed OS-wide so Chromium's fontconfig fallback picks it up for any
# Sinhala codepoint automatically — no CSS/@import required in the generated HTML.
# font-noto-symbols: same mechanism, for symbol codepoints. Noto Sans Symbols +
# Symbols 2 cover the Miscellaneous Symbols / Dingbats / arrow / geometric-shape
# ranges a design agent reaches for (★ U+2605, ✓, →, ▶…), which Alpine's
# Latin-only default set rasterizes as tofu. Deliberately MONOCHROME (FR-21):
# this is glyph coverage, not a colour emoji set — narrowest fix for the
# reported defect, and it keeps the visual delta on already-approved drafts small.
RUN apk add --no-cache libc6-compat chromium openssl font-noto-sinhala font-noto-symbols

# Claude Code CLI — CLI-mode generation (DESIGN_PROVIDER=cli) spawns `claude -p`
# per call, authenticated by CLAUDE_CODE_OAUTH_TOKEN env (the shared server
# token, or a user's personal token injected per-call by claudeCli.ts). Installed
# as root so `claude` lands on PATH at /usr/local/bin.
RUN npm install -g @anthropic-ai/claude-code

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# The Claude CLI writes config/cache under ~/.claude* — the system user needs a
# real, writable home for headless `claude -p` to work.
RUN mkdir -p /home/nextjs && chown nextjs:nodejs /home/nextjs
ENV HOME=/home/nextjs

# Copy production deps and built output
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema + migrations + generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# The Prisma CLI, for `migrate deploy` on boot (see docker-entrypoint.sh). It is
# a devDependency, so the deps stage's `npm ci --omit=dev` skips it — and that
# stage's `--ignore-scripts` would in any case leave @prisma/engines without its
# downloaded engine binaries. Taking it from the builder (full `npm ci`, scripts
# run) gets a CLI whose schema-engine binary is already present: the @prisma
# scope copied above carries the linux-musl engines this image needs.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Copy the bundled scheduler worker (see the esbuild step in the builder stage).
COPY --from=builder /app/dist ./dist

# Applies pending migrations, then execs CMD. chmod here rather than relying on
# the committed file mode — this repo is developed on Windows, where git does not
# track the executable bit.
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Migrations run on every boot, for both resources — the scheduler's CMD override
# still passes through the entrypoint. See docker-entrypoint.sh for the advisory
# lock / fail-loud reasoning and the SKIP_MIGRATIONS escape hatch.
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Default: Next.js server.
# The docker-compose scheduler service overrides CMD to run the scheduler worker.
CMD ["node", "server.js"]
