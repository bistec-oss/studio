#!/bin/sh
# Check the environment, apply pending Prisma migrations, then hand off to the
# container's command.
#
# Why this exists: the image used to boot straight into `node server.js`, and
# nothing in the deploy path ever ran `prisma migrate deploy`. Every migration
# reached prod only because a human remembered to run it by hand — and when
# nobody did (migration 20260726120000_team_name_unique_active, 2026-07-27) the
# app silently ran new code against an old schema. Migrating on boot removes the
# human step: a Coolify redeploy is now sufficient to land a migration.
#
# Both Coolify resources boot through here (app = default CMD, scheduler =
# CMD override `node dist/scheduler/worker.js`). `prisma migrate deploy` takes a
# Postgres advisory lock, so two containers starting at once serialize instead
# of racing; the loser sees "No pending migrations to apply" and continues.
#
# Failing loud is deliberate. A container serving traffic against a schema its
# code doesn't match is worse than one that refuses to start: with `set -e` the
# deploy is marked failed in Coolify and the previous container keeps serving.
# Escape hatch for an emergency boot: set SKIP_MIGRATIONS=1 on the resource.
#
# The env preflight runs FIRST, before any migration (change 022 FR-04). The app
# validates its environment when it starts (src/lib/env.ts), but that used to
# happen only after `migrate deploy` had already changed the schema: a bad value
# (e.g. a CLAUDE_CLI_MODEL the model catalogue no longer accepts) then failed the
# boot on a database the previous container's code no longer matches, so the
# "previous container keeps serving" fallback above stopped being true. The
# preflight runs the same validation up front, so a bad env fails the deploy
# with the schema untouched. It runs on every boot, including SKIP_MIGRATIONS=1
# (an emergency boot still needs an env the app accepts), and it has no skip
# flag: it is fail-closed by design.
set -e

# Suppress the CLI's outbound version check — it adds latency to every boot and
# the container has no business phoning home during startup.
export CHECKPOINT_DISABLE=1

# Bundled from src/scripts/env-preflight.ts by the Dockerfile. Exits non-zero
# (and `set -e` stops the boot) on any env value the app would reject.
node dist/scripts/env-preflight.js

if [ "${SKIP_MIGRATIONS:-}" = "1" ]; then
  echo "[entrypoint] SKIP_MIGRATIONS=1 — skipping prisma migrate deploy"
else
  echo "[entrypoint] applying pending Prisma migrations…"
  # Invoked via the bundled entry point rather than `npx prisma`: the runner
  # image has no npm-installed CLI bin dir on PATH (prisma is a devDependency,
  # copied in from the builder stage — see the Dockerfile), and `npx` would try
  # to download it from the registry on every boot.
  node node_modules/prisma/build/index.js migrate deploy
  echo "[entrypoint] migrations up to date"
fi

exec "$@"
