// The model catalogue (008 FR-01, FR-02): every Claude model the app can run,
// the surfaces each one may serve, and the system default per surface.
//
// This is the ONLY file under src/ that may contain a model ID or a quoted bare
// family name (FR-15; tests/unit/modelLiteralGuard.test.ts enforces it). Every
// other module names a model by its ModelKey and reaches a string only through
// a ResolvedModel's `arg` (src/lib/models/resolve.ts).
//
// Pure and client-safe, with NO imports at all: src/lib/env.ts validates
// CLAUDE_CLI_MODEL against it (and config.ts imports env.ts, so any import here
// risks a cycle), and wave 2's picker imports it on the client.
//
// ── Prod boot depends on this file (change 022 FR-05) ────────────────────────
// The container's env preflight (src/scripts/env-preflight.ts, run by
// docker-entrypoint.sh before `migrate deploy`) validates CLAUDE_CLI_MODEL
// against MODEL_KEYS and the CURRENT apiIds below. If prod's CLAUDE_CLI_MODEL
// names a key or apiId this file no longer accepts, the preflight blocks prod's
// boot and the deploy fails. So before you remove or rename a key, or retire an
// apiId into previousApiIds, check the CLAUDE_CLI_MODEL value set on prod's
// Coolify resources (app and scheduler) and change it there first if needed.
//
// ── Adding a model (design §2) ───────────────────────────────────────────────
//   1. Add one CATALOGUE entry: key, apiId, cliArg, prices with a dated
//      priceSource, speed, the eligible `surfaces` with their timeouts, and the
//      two decisions `defaultAllowed` and `personalTokenGated`. Keep the array
//      cheapest first (the resolver's fallback tier takes the first entry).
//   2. If the key is new (a new family, e.g. FABLE), add a migration holding
//      `ALTER TYPE "ModelKey" ADD VALUE 'FABLE';` ALONE in its file: Postgres
//      can't use a new enum value inside the transaction that adds it.
//   3. `npm run test:unit`. The catalogue invariants (catalogueProblems), the
//      action budget and the boundary tests all re-run against the new entry;
//      a timeout that breaks a 15-minute sweep fails there.
//   4. Teams with a SAVED policy don't get the model until an admin ticks it at
//      /team, where it shows as "New" (A2). Teams with no saved policy get it
//      if it is `defaultAllowed`.
//   Upgrading a family (Sonnet 5.5 → 6) is step 1 alone: change apiId and
//   cliArg, and push the old ID onto previousApiIds. Old stamps keep the exact
//   ID that ran; a regenerate from one is recorded as a substitution.
//
// ── Splitting a user surface (FR-02) ─────────────────────────────────────────
// User surfaces are a persisted vocabulary (the Prisma enum ModelSurface, used
// by TeamModelDefault). Splitting one, e.g. CAPTION into CAPTION + HEADLINE:
//   1. `ALTER TYPE "ModelSurface" ADD VALUE 'HEADLINE';`, alone in its migration;
//   2. a second migration that copies every team's parent TeamModelDefault row
//      to the new surface, so the child inherits the parent's choice;
//   3. move the call site onto the new surface (and add it here).
// Stamps need nothing: they are per field already (DraftCaption.model and
// Draft.headlineModel are separate columns).

export const MODEL_KEYS = ['HAIKU', 'SONNET', 'OPUS'] as const
/** A catalogue key: a model family (A1). Persisted as the Prisma enum ModelKey. */
export type ModelKey = (typeof MODEL_KEYS)[number]

/** Surfaces a user or team admin can choose a model for. Persisted as ModelSurface. */
export const USER_SURFACES = [
  'CAPTION',
  'DESIGN_TEMPLATE',
  'DESIGN_FREEFORM',
  'REFINE',
  'ASSISTANT_BRIEFING',
  'ASSISTANT_BRANDKIT',
] as const
export type UserSurface = (typeof USER_SURFACES)[number]

/** Fixed system steps on the cheapest model (A14). Never persisted, never selectable. */
export const INTERNAL_SURFACES = [
  'INTERNAL_BACKGROUND',
  'INTERNAL_VERIFIER',
  'INTERNAL_TOKEN_PING',
] as const
export type InternalSurface = (typeof INTERNAL_SURFACES)[number]

export type Surface = UserSurface | InternalSurface

export type ModelSpeed = 'fast' | 'medium' | 'slow'
export type ModelTier = '$' | '$$' | '$$$'

export interface CatalogueEntry {
  key: ModelKey
  /** Shown everywhere a model is named, e.g. 'Haiku 4.5'. */
  displayName: string
  /** The full API ID, passed in API mode. */
  apiId: string
  /** Passed to `claude -p --model`; = apiId unless T2 falls back to an alias. */
  cliArg: string
  /** Retired IDs of this family. A stamp matching one is a substitution (FR-09). */
  previousApiIds: readonly string[]
  /** USD per million input tokens. */
  priceInputPerMTok: number
  /** USD per million output tokens. */
  priceOutputPerMTok: number
  /** Where the prices came from, with the date they were read. */
  priceSource: string
  /** Hand-set hint; not derivable from the prices. */
  speed: ModelSpeed
  /** Allowed for a team with no saved policy (A2). */
  defaultAllowed: boolean
  /** Gated by the /team "requires a personal token" switch in CLI mode (A3). */
  personalTokenGated: boolean
  /** API-mode max_tokens floor for thinking models (open question 4); null = none. */
  apiMaxTokensFloor: number | null
  /** Eligibility is presence. timeoutMs is design §5's measured placeholder (AC-32). */
  surfaces: Partial<Record<Surface, { timeoutMs: number }>>
}

export type Catalogue = readonly CatalogueEntry[]

const PRICE_SOURCE =
  'Anthropic first-party API rates, claude-api skill model table (cached 2026-09-25), read 2026-10-12'

const s = (seconds: number) => ({ timeoutMs: seconds * 1000 })

// Cheapest first. Timeouts: design §5 (placeholders until a real Opus run, AC-32).
export const CATALOGUE: Catalogue = [
  {
    key: 'HAIKU',
    displayName: 'Haiku 4.5',
    apiId: 'claude-haiku-4-5',
    cliArg: 'claude-haiku-4-5',
    previousApiIds: ['claude-haiku-4-5-20251001'],
    priceInputPerMTok: 1,
    priceOutputPerMTok: 5,
    priceSource: PRICE_SOURCE,
    speed: 'fast',
    defaultAllowed: true,
    personalTokenGated: false,
    apiMaxTokensFloor: null,
    surfaces: {
      CAPTION: s(120),
      DESIGN_TEMPLATE: s(300),
      DESIGN_FREEFORM: s(300),
      REFINE: s(300),
      ASSISTANT_BRIEFING: s(180),
      ASSISTANT_BRANDKIT: s(180),
      INTERNAL_BACKGROUND: s(90),
      INTERNAL_VERIFIER: s(60),
      INTERNAL_TOKEN_PING: s(60),
    },
  },
  {
    key: 'SONNET',
    displayName: 'Sonnet 5.5',
    apiId: 'claude-sonnet-5-5',
    cliArg: 'claude-sonnet-5-5',
    previousApiIds: ['claude-sonnet-4-6'],
    priceInputPerMTok: 2,
    priceOutputPerMTok: 10,
    priceSource: PRICE_SOURCE,
    speed: 'medium',
    defaultAllowed: true,
    personalTokenGated: false,
    apiMaxTokensFloor: 16000,
    surfaces: {
      CAPTION: s(180),
      DESIGN_TEMPLATE: s(360),
      DESIGN_FREEFORM: s(360),
      REFINE: s(360),
      ASSISTANT_BRIEFING: s(180),
      ASSISTANT_BRANDKIT: s(180),
    },
  },
  {
    key: 'OPUS',
    displayName: 'Opus 5.5',
    apiId: 'claude-opus-5-5',
    cliArg: 'claude-opus-5-5',
    previousApiIds: [],
    priceInputPerMTok: 4,
    priceOutputPerMTok: 20,
    priceSource: PRICE_SOURCE,
    speed: 'slow',
    defaultAllowed: true,
    personalTokenGated: true,
    apiMaxTokensFloor: 16000,
    // No DESIGN_TEMPLATE: template fill stays on Haiku or Sonnet (binding decision).
    surfaces: {
      CAPTION: s(240),
      DESIGN_FREEFORM: s(600),
      REFINE: s(540), // not 600: the API-mode refine segment would pass the 15-min sweep
      ASSISTANT_BRIEFING: s(300),
      ASSISTANT_BRANDKIT: s(300),
    },
  },
]

/**
 * FR-04's table: today's split on current IDs. REFINE here is the Path B (and
 * unknown-path) default; a Path A draft refines on REFINE_PATH_A_SYSTEM_DEFAULT (A8).
 */
export const SYSTEM_DEFAULTS: Readonly<Record<UserSurface, ModelKey>> = {
  CAPTION: 'HAIKU',
  DESIGN_TEMPLATE: 'HAIKU',
  DESIGN_FREEFORM: 'SONNET',
  REFINE: 'SONNET',
  ASSISTANT_BRIEFING: 'SONNET',
  ASSISTANT_BRANDKIT: 'SONNET',
}

/** A8: refine on a TEMPLATE (Path A) draft keeps template fill's model. */
export const REFINE_PATH_A_SYSTEM_DEFAULT: ModelKey = 'HAIKU'

export type DesignPath = 'A' | 'B'

/** The table default for a surface, before CLAUDE_CLI_MODEL (FR-04). */
export function tableDefault(surface: UserSurface, designPath?: DesignPath): ModelKey {
  if (surface === 'REFINE' && designPath === 'A') return REFINE_PATH_A_SYSTEM_DEFAULT
  return SYSTEM_DEFAULTS[surface]
}

/** Plain names (FR-14 labels) and the phrase used inside sentences ("isn't available for …"). */
export const SURFACE_LABELS: Readonly<Record<UserSurface, { name: string; phrase: string }>> = {
  CAPTION: { name: 'Captions', phrase: 'caption writing' },
  DESIGN_TEMPLATE: { name: 'Template fill', phrase: 'template fill' },
  DESIGN_FREEFORM: { name: 'Freeform design', phrase: 'freeform design' },
  REFINE: { name: 'Refine', phrase: 'refine' },
  ASSISTANT_BRIEFING: {
    name: 'Campaign briefing assistant',
    phrase: 'the campaign briefing assistant',
  },
  ASSISTANT_BRANDKIT: { name: 'Brand kit assistant', phrase: 'the brand kit assistant' },
}

/** The family's short name ('Haiku'), for sentences that name families rather than versions. */
export function familyName(key: ModelKey): string {
  return key.charAt(0) + key.slice(1).toLowerCase()
}

export function isModelKey(value: unknown): value is ModelKey {
  return typeof value === 'string' && (MODEL_KEYS as readonly string[]).includes(value)
}

export function isUserSurface(value: unknown): value is UserSurface {
  return typeof value === 'string' && (USER_SURFACES as readonly string[]).includes(value)
}

export function entryFor(key: ModelKey, catalogue: Catalogue = CATALOGUE): CatalogueEntry | null {
  return catalogue.find((e) => e.key === key) ?? null
}

export function isEligible(entry: CatalogueEntry, surface: Surface): boolean {
  return entry.surfaces[surface] !== undefined
}

const blended = (e: CatalogueEntry) => (e.priceInputPerMTok + 3 * e.priceOutputPerMTok) / 4

/**
 * The cost tier is computed from the prices, never written (FR-01):
 * blended = (in + 3 × out) / 4; tier = min(3, 1 + round(log2(blended / cheapest))).
 */
export function modelTier(entry: CatalogueEntry, catalogue: Catalogue = CATALOGUE): ModelTier {
  const minBlended = Math.min(...catalogue.map(blended))
  const tier = Math.min(3, Math.max(1, 1 + Math.round(Math.log2(blended(entry) / minBlended))))
  return tier === 1 ? '$' : tier === 2 ? '$$' : '$$$'
}

/**
 * Maps a stamp (what crossed the boundary: an apiId, a cliArg or a retired ID)
 * to its entry. `previous` is true for a previousApiIds match, which the
 * resolver records as a substitution. Exact match; null when nothing matches
 * (e.g. an OpenAI caption provider's 'gpt-4o').
 */
export function entryForStamp(
  stamp: string,
  catalogue: Catalogue = CATALOGUE,
): { entry: CatalogueEntry; previous: boolean } | null {
  const current = catalogue.find((e) => e.apiId === stamp || e.cliArg === stamp)
  if (current) return { entry: current, previous: false }
  const retired = catalogue.find((e) => e.previousApiIds.includes(stamp))
  return retired ? { entry: retired, previous: true } : null
}

const DATE_RE = /\d{4}-\d{2}-\d{2}/

/**
 * FR-01's invariants, plus the ones the resolver relies on. Returns every
 * problem found ([] for a sound catalogue); the unit test runs it on the real
 * catalogue and on planted bad ones.
 */
export function catalogueProblems(catalogue: Catalogue): string[] {
  const problems: string[] = []

  const keys = new Set<string>()
  for (const e of catalogue) {
    if (keys.has(e.key)) problems.push(`duplicate key ${e.key}`)
    keys.add(e.key)
  }

  // An ID names exactly one family, once: across every apiId and previousApiId.
  const ids = new Map<string, string>()
  for (const e of catalogue) {
    for (const id of [e.apiId, ...e.previousApiIds]) {
      if (ids.has(id)) problems.push(`model ID ${id} appears twice (${ids.get(id)}, ${e.key})`)
      else ids.set(id, e.key)
    }
  }
  // A cliArg alias must not be another family's ID, or a stamp maps two ways.
  for (const e of catalogue) {
    const owner = ids.get(e.cliArg)
    if (owner !== undefined && owner !== e.key) {
      problems.push(`${e.key} cliArg ${e.cliArg} is ${owner}'s ID`)
    }
  }

  for (const e of catalogue) {
    for (const [field, price] of [
      ['priceInputPerMTok', e.priceInputPerMTok],
      ['priceOutputPerMTok', e.priceOutputPerMTok],
    ] as const) {
      if (!Number.isFinite(price) || price <= 0) problems.push(`${e.key} lacks ${field}`)
    }
    if (!e.priceSource?.trim()) problems.push(`${e.key} lacks a priceSource`)
    else if (!DATE_RE.test(e.priceSource)) problems.push(`${e.key} priceSource has no date`)
    for (const [surface, spec] of Object.entries(e.surfaces)) {
      if (!spec || !Number.isInteger(spec.timeoutMs) || spec.timeoutMs <= 0) {
        problems.push(`${e.key} ${surface} has no valid timeout`)
      }
    }
  }

  for (const surface of USER_SURFACES) {
    if (!catalogue.some((e) => isEligible(e, surface))) {
      problems.push(`user surface ${surface} has no eligible model`)
    }
  }
  if (catalogue.some((e) => e.key === 'OPUS' && isEligible(e, 'DESIGN_TEMPLATE'))) {
    problems.push('DESIGN_TEMPLATE lists OPUS')
  }

  // A14: each internal surface resolves to exactly one entry, Haiku.
  for (const surface of INTERNAL_SURFACES) {
    const eligible = catalogue.filter((e) => isEligible(e, surface)).map((e) => e.key)
    if (eligible.length !== 1 || eligible[0] !== 'HAIKU') {
      problems.push(
        `internal surface ${surface} must be Haiku only (got ${eligible.join(', ') || 'none'})`,
      )
    }
  }

  // The fallback tier takes the first entry of the effective set: cheapest first.
  for (let i = 1; i < catalogue.length; i++) {
    if (blended(catalogue[i]) < blended(catalogue[i - 1])) {
      problems.push(
        `catalogue is not cheapest first (${catalogue[i - 1].key} is listed before the cheaper ${catalogue[i].key})`,
      )
    }
  }

  return problems
}
