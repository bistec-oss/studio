import { z } from 'zod'
// The catalogue has no imports at all, so this can't form a cycle (config.ts
// imports env.ts).
import { CATALOGUE, MODEL_KEYS, type ModelKey } from './models/catalogue'
import { parseImageTier } from '@/providers/imageCapabilities'

// Centralized, zod-validated environment configuration. Server-only — never
// import from client components ("use client" files): non-NEXT_PUBLIC_ vars
// don't exist in the browser bundle.
//
// Parsed ONCE at module load into the typed `env` export. Dev-friendly
// defaults mirror the previous per-module reads exactly (minio.ts, claudeCli.ts,
// config.ts, …). Placeholder values that were tolerated in dev remain tolerated
// in dev; production fails fast below with an error naming the variable.
//
// Intentionally NOT migrated to this module:
//   - src/lib/testHooks.ts — the MOCK_* seams read process.env at their own
//     module load; they stay self-contained so test-seam timing never depends
//     on this module. The vars are still declared here for documentation.
//   - src/lib/auth-client.ts — NEXT_PUBLIC_APP_URL is inlined into the client
//     bundle by Next.js at build time and must remain a literal
//     process.env.NEXT_PUBLIC_APP_URL expression.

// `next build` runs with NODE_ENV=production and imports every route while
// collecting page data — but produces no runtime state, so a dev machine
// building with dev credentials must not be rejected. Runtime (server start)
// still enforces the checks: NEXT_PHASE is only set during the build.
const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build'

// The values CLAUDE_CLI_MODEL accepts (008 FR-04, A4): a catalogue key in any
// case, or a CURRENT apiId. A retired ID (previousApiIds) is rejected: the
// system default must name a model the catalogue still runs.
const CLI_MODEL_ACCEPTED: readonly string[] = [
  ...MODEL_KEYS.map((k) => k.toLowerCase()),
  ...CATALOGUE.map((e) => e.apiId),
]

/**
 * Parses CLAUDE_CLI_MODEL to a ModelKey (008 FR-04). Unset or blank is
 * undefined; anything else that is not a key or a current apiId throws —
 * including today's `default`, which used to omit --model and run the costly
 * account default. Pure, so tests/unit/envModel.test.ts calls it directly.
 */
export function parseCliModelEnv(raw: string | undefined): ModelKey | undefined {
  const value = raw?.trim().toLowerCase() ?? ''
  if (value === '') return undefined
  const key = MODEL_KEYS.find((k) => k.toLowerCase() === value)
  if (key) return key
  const entry = CATALOGUE.find((e) => e.apiId === value)
  if (entry) return entry.key
  throw new Error(
    `CLAUDE_CLI_MODEL must be one of ${CLI_MODEL_ACCEPTED.join(', ')} ` +
      `(got "${(raw ?? '').slice(0, 80)}"). It is now the system default, not a global override.`,
  )
}

const envSchema = z.object({
  NODE_ENV: z.string().optional(),

  // --- Database (Prisma also reads DATABASE_URL itself via schema.prisma) ---
  DATABASE_URL: z.string().optional(),

  // --- Auth / crypto (fail-closed in production, see assertions below) ---
  // crypto.ts keeps its lazy placeholder/length validation for dev, so a dev
  // server without a real key still boots until encrypt/decrypt is first used.
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  // auth.ts keeps its own module-load placeholder check (dev + prod), matching
  // the previous behavior where importing auth.ts without a secret throws.
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),

  // --- MinIO (7 vars; defaults mirror src/lib/storage/minio.ts) ---
  MINIO_ENDPOINT: z.string().default('http://localhost:9000'),
  // Browser-facing base URL for public objects; minio.ts falls back to
  // MINIO_ENDPOINT when unset.
  MINIO_PUBLIC_ENDPOINT: z.string().optional(),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET_IMAGES: z.string().default('generated-images'),
  MINIO_BUCKET_EXPORTS: z.string().default('exported-designs'),
  MINIO_BUCKET_BRANDKITS: z.string().default('brand-kits'),
  // Campaign source documents (briefing assistant) — private bucket.
  MINIO_BUCKET_DOCS: z.string().default('campaign-docs'),

  // --- AI providers ---
  // "claude-html" (API path) or "cli" (local Claude Code CLI, keyless).
  DESIGN_PROVIDER: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().optional(),

  // --- Claude Code CLI mode (DESIGN_PROVIDER=cli) ---
  CLAUDE_CLI_PATH: z.string().optional(),
  // The system default model in CLI mode (008 FR-04): below team defaults and
  // explicit picks, no longer a global override. A key or current apiId,
  // validated to a ModelKey; an invalid value fails the load in every NODE_ENV
  // (a config bug in dev too), but not during `next build`.
  CLAUDE_CLI_MODEL: z
    .string()
    .optional()
    .transform((raw) => {
      if (!IS_BUILD_PHASE) return parseCliModelEnv(raw)
      try {
        return parseCliModelEnv(raw)
      } catch {
        return undefined
      }
    }),
  // Diagnostics on by default; "0" silences (claudeCli.ts compares !== "0").
  CLAUDE_CLI_DEBUG: z.string().default('1'),

  // --- Hero image quality (009 FR-16) ---
  // standard | high (any case). Applied only to the hero image styles' image
  // call, never to a classic post. Unset, blank or unknown is treated as unset:
  // a tuning knob must never fail the boot (unlike CLAUDE_CLI_MODEL).
  IMAGE_QUALITY: z.string().optional().transform((raw) => parseImageTier(raw)),

  // --- Puppeteer renderer ---
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  // Raw string; puppeteer.ts keeps its parseInt-with-fallback-2, min-1 logic.
  PUPPETEER_MAX_CONCURRENCY: z.string().optional(),

  // --- MCP server (presented credential; team-level keys live in the DB) ---
  MCP_API_KEY: z.string().optional(),

  // --- Test seams (dormant unless exactly "true"; NEVER set in production) ---
  // Declared for completeness/typing only — the canonical reads live in
  // src/lib/testHooks.ts (see the note at the top of this file).
  MOCK_AI: z.string().optional(),
  MOCK_PUPPETEER: z.string().optional(),
  MOCK_SOCIAL: z.string().optional(),
  MOCK_SOCIAL_FAIL: z.string().optional(),

  // --- App (server-side reads only; the client bundle inlines its own copy) ---
  NEXT_PUBLIC_APP_URL: z.string().optional(),

  // --- Build metadata (FR-P0-3) --- Baked into the runner image as ENV by the
  // Dockerfile from --build-arg GIT_SHA=<sha>, passed by whoever builds the
  // image (e.g. a future deploy workflow); read by /api/health. Without it the
  // route reports commit "unknown".
  GIT_SHA: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export const env: Env = envSchema.parse(process.env)

// ---------------------------------------------------------------------------
// Production fail-fast checks (fail closed, naming the variable).
// These mirror — and centralize — the pre-existing checks:
//   - TOKEN_ENCRYPTION_KEY placeholder/length rejection (src/lib/crypto.ts)
//   - BETTER_AUTH_SECRET placeholder rejection (src/lib/auth.ts)
//   - MinIO "minioadmin" default rejection (src/lib/storage/minio.ts)
// Dev keeps the convenient defaults and lazy failures exactly as before.
// (IS_BUILD_PHASE is defined at the top of this file.)
// ---------------------------------------------------------------------------
if (env.NODE_ENV === 'production' && !IS_BUILD_PHASE) {
  const problems: string[] = []

  if (!env.TOKEN_ENCRYPTION_KEY || env.TOKEN_ENCRYPTION_KEY === 'your-32-byte-hex-key') {
    problems.push('TOKEN_ENCRYPTION_KEY is not set or still uses the placeholder value')
  } else if (Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex').length !== 32) {
    problems.push('TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }

  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET === 'your-32-byte-hex-secret') {
    problems.push('BETTER_AUTH_SECRET is not set or still uses the placeholder value')
  }

  // The "minioadmin/minioadmin" default grants full read/write/policy control
  // of object storage to anyone who can reach MinIO.
  if (env.MINIO_ACCESS_KEY === 'minioadmin' || env.MINIO_SECRET_KEY === 'minioadmin') {
    problems.push(
      'MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set to non-default values ' +
        "(the built-in 'minioadmin' default must not be used)",
    )
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production — invalid environment configuration:\n- ${problems.join('\n- ')}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Cross-variable sanity checks (all environments).
// ---------------------------------------------------------------------------
// The MOCK_AI seam lives in the API pipeline (copy provider + design agent).
// DESIGN_PROVIDER=cli routes generation through the local `claude -p` CLI,
// which never consults the seam — so tests would silently burn real credits
// and time out instead of hitting the mock. Fail fast at startup.
// (testHooks.ts activates the seam only when MOCK_AI is exactly "true", but any
// truthy-looking value signals intent to mock, so reject those too.)
if (
  env.DESIGN_PROVIDER === 'cli' &&
  env.MOCK_AI &&
  env.MOCK_AI !== '0' &&
  env.MOCK_AI.toLowerCase() !== 'false'
) {
  throw new Error(
    'MOCK_AI is incompatible with DESIGN_PROVIDER=cli — the CLI path bypasses the mock seam. ' +
      "Use DESIGN_PROVIDER=claude-html for mocked runs (see .env.test / docs/e2e-test-plan.md).",
  )
}
