// Boot-time environment preflight (change 022 FR-04).
//
// docker-entrypoint.sh runs the bundled copy of this file
// (dist/scripts/env-preflight.js, built by the Dockerfile's esbuild step) BEFORE
// `prisma migrate deploy`. It loads src/lib/env.ts, which is the exact zod schema
// and production fail-fast checks the app and the scheduler run when they start,
// so any value that would stop the app booting (an unknown CLAUDE_CLI_MODEL, a
// placeholder secret, the default MinIO credentials, …) stops the container
// here instead, before the migration has changed the schema. A bad env value
// then fails the deploy with the previous container still serving against an
// unchanged database.
//
// Fail-closed by design: there is no skip flag. env.ts itself skips its checks
// only during `next build` (NEXT_PHASE), which is never set at container boot.

async function main(): Promise<void> {
  try {
    // A dynamic import, so a throw while env.ts evaluates (zod parse, the
    // CLAUDE_CLI_MODEL transform, the production checks) lands in this catch.
    await import('@/lib/env')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[preflight] environment invalid — refusing to boot (no migration was run):')
    console.error(message)
    process.exit(1)
  }
  console.log('[preflight] environment ok')
}

void main()
