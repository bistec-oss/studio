// The one model decision (008 FR-03): which catalogue entry runs a call on a
// surface, and what string crosses the boundary. Every model call resolves here
// — the server through policy.ts's resolveModel wrapper, wave 2's pickers
// directly, so a picker pre-selects exactly what the server will run.
//
// Pure and client-safe: imports the catalogue only. No I/O, no clock, no env
// read — the policy, the credential tier, the mode and CLAUDE_CLI_MODEL are
// inputs (the recovery.ts / captions/resolve.ts split).
//
// Tiers, first match wins, each checked against the effective set at call time:
//   1. the explicit request — a miss is refused (the route's 400);
//      1b. a STORED request (Brief.*Model, FR-10) — a miss falls through;
//   2. the regenerate stamp  ┐
//   3. the team default      ├ a miss falls through: stored values are history,
//   4. the system default    ┘ substituted and recorded, never thrown;
//   5. the fallback — the cheapest entry of the effective set.

import {
  CATALOGUE,
  SURFACE_LABELS,
  entryFor,
  entryForStamp,
  isEligible,
  isModelKey,
  tableDefault,
  type Catalogue,
  type CatalogueEntry,
  type DesignPath,
  type InternalSurface,
  type ModelKey,
  type Surface,
  type UserSurface,
} from './catalogue'

export type PipelineMode = 'api' | 'cli'
/** 'n/a' in API mode, where there is no personal Claude credential (A3). */
export type CredentialTier = 'personal' | 'team' | 'n/a'

export interface ModelPolicy {
  allowed: readonly ModelKey[]
  defaults: Partial<Record<UserSurface, ModelKey>>
  /** The /team "Opus requires a personal token" switch (A3). */
  gateOn: boolean
}

export interface DecideInput {
  /** Tier 1: an explicit request (a wave-2 body field). Never a stored value. */
  requested?: ModelKey | null
  /**
   * A STORED request (Brief.captionModel / designModel, FR-10): the initial
   * request as it was saved, read by the generation and its retry. Tried right
   * after tier 1, but a miss falls through and is recorded as a substitution —
   * a stored value is history, never a 400 (FR-10, design §3).
   */
  storedRequest?: ModelKey | null
  /** Tier 2: a regenerate's stamp (an apiId / cliArg / retired ID), FR-09. */
  stamp?: string | null
  policy: ModelPolicy
  credential: CredentialTier
  mode: PipelineMode
  /** CLAUDE_CLI_MODEL, already validated (FR-04). Read in CLI mode only. */
  envDefault?: ModelKey | null
  /** REFINE's system default follows the draft's path (A8). */
  designPath?: DesignPath
}

export type ModelSource = 'request' | 'stamp' | 'team' | 'system' | 'fallback'

export interface ResolvedModel {
  surface: Surface
  key: ModelKey
  entry: CatalogueEntry
  source: ModelSource
  /** The first refused value (a key or a stamp string), or null. */
  substitutedFrom: string | null
  /** apiId in API mode, cliArg in CLI mode: the ONLY string a boundary may pass. */
  arg: string
  timeoutMs: number
}

export type DecideErrorCode =
  'UNKNOWN_MODEL' | 'NOT_ELIGIBLE' | 'NOT_ALLOWED' | 'NEEDS_PERSONAL_TOKEN' | 'NO_ALLOWED_MODEL'

export type DecideResult =
  { ok: true; resolved: ResolvedModel } | { ok: false; code: DecideErrorCode; message: string }

/** The gated entries leave the set only for a team-credential run in CLI mode (A3). */
function gateApplies(input: Pick<DecideInput, 'policy' | 'credential' | 'mode'>): boolean {
  return input.policy.gateOn && input.credential === 'team' && input.mode === 'cli'
}

/**
 * eligible(surface) ∩ policy.allowed, minus every personalTokenGated entry when
 * the gate applies. In catalogue order, so cheapest first.
 */
export function effectiveSet(
  surface: UserSurface,
  input: Pick<DecideInput, 'policy' | 'credential' | 'mode'>,
  catalogue: Catalogue = CATALOGUE,
): CatalogueEntry[] {
  const gated = gateApplies(input)
  return catalogue.filter(
    (e) =>
      isEligible(e, surface) &&
      input.policy.allowed.includes(e.key) &&
      !(gated && e.personalTokenGated),
  )
}

function resolved(
  surface: Surface,
  entry: CatalogueEntry,
  mode: PipelineMode,
  source: ModelSource,
  substitutedFrom: string | null,
): ResolvedModel {
  return {
    surface,
    key: entry.key,
    entry,
    source,
    substitutedFrom,
    arg: mode === 'api' ? entry.apiId : entry.cliArg,
    timeoutMs: entry.surfaces[surface]!.timeoutMs,
  }
}

// Tier 1's refusal, most specific reason first. FR-17's messages.
function refuseRequest(
  surface: UserSurface,
  requested: unknown,
  input: DecideInput,
  catalogue: Catalogue,
): DecideResult & { ok: false } {
  const entry = isModelKey(requested) ? entryFor(requested, catalogue) : null
  if (!entry) {
    return {
      ok: false,
      code: 'UNKNOWN_MODEL',
      message: `Unknown model ${JSON.stringify(String(requested).slice(0, 80))}`,
    }
  }
  const name = entry.displayName
  if (!isEligible(entry, surface)) {
    return {
      ok: false,
      code: 'NOT_ELIGIBLE',
      message: `${name} isn't available for ${SURFACE_LABELS[surface].phrase}`,
    }
  }
  if (!input.policy.allowed.includes(entry.key)) {
    return { ok: false, code: 'NOT_ALLOWED', message: `${name} isn't allowed on this team` }
  }
  return {
    ok: false,
    code: 'NEEDS_PERSONAL_TOKEN',
    message: `Your team requires a personal Claude token for ${name} — connect one in Settings`,
  }
}

// CLAUDE_CLI_MODEL as it applies to a surface: CLI mode only, and only where the
// model is eligible. FR-04: an env model the surface can't run (Opus on template
// fill) is not applicable there, so the surface keeps its table default with no
// substitution recorded.
function applicableEnvDefault(
  surface: UserSurface,
  input: Pick<DecideInput, 'mode' | 'envDefault'>,
  catalogue: Catalogue,
): ModelKey | null {
  const env = input.mode === 'cli' ? input.envDefault : null
  if (!env) return null
  const entry = entryFor(env, catalogue)
  return entry && isEligible(entry, surface) ? env : null
}

export function decideModel(
  surface: UserSurface,
  input: DecideInput,
  catalogue: Catalogue = CATALOGUE,
): DecideResult {
  const set = effectiveSet(surface, input, catalogue)
  const inSet = (key: ModelKey | null | undefined) =>
    key ? (set.find((e) => e.key === key) ?? null) : null

  // Tier 1: an explicit request is the caller's live intent — refused, not substituted.
  if (input.requested !== undefined && input.requested !== null) {
    const hit = inSet(input.requested)
    if (hit) return { ok: true, resolved: resolved(surface, hit, input.mode, 'request', null) }
    return refuseRequest(surface, input.requested, input, catalogue)
  }

  if (set.length === 0) {
    return {
      ok: false,
      code: 'NO_ALLOWED_MODEL',
      message: `No model is allowed for ${SURFACE_LABELS[surface].phrase} on this team. A team admin can allow one under Team settings > Models.`,
    }
  }

  // The first refused value, so the stamp names what the user or admin expected.
  let substitutedFrom: string | null = null
  const refuse = (value: string) => {
    substitutedFrom ??= value
  }

  // Tier 1b: a stored request (FR-10). A hit is the request it was; a miss (a
  // model since disallowed, gated or not eligible) falls through, recorded.
  if (input.storedRequest) {
    const hit = inSet(input.storedRequest)
    if (hit) return { ok: true, resolved: resolved(surface, hit, input.mode, 'request', null) }
    refuse(String(input.storedRequest))
  }

  // Tier 2: the stamp. A retired ID maps to its family but is itself a substitution.
  if (input.stamp) {
    const match = entryForStamp(input.stamp, catalogue)
    const hit = match ? inSet(match.entry.key) : null
    if (!hit || match!.previous) refuse(input.stamp)
    if (hit) {
      return { ok: true, resolved: resolved(surface, hit, input.mode, 'stamp', substitutedFrom) }
    }
  }

  // Tier 3: the team default.
  const team = input.policy.defaults[surface]
  if (team) {
    const hit = inSet(team)
    if (hit)
      return { ok: true, resolved: resolved(surface, hit, input.mode, 'team', substitutedFrom) }
    refuse(team)
  }

  // Tier 4: the system default — CLAUDE_CLI_MODEL where it applies, then the
  // surface's table default. A refused env model is a substitution (orchestrator
  // ruling, T1 fix round 1), and the table default is still tried before the fallback.
  const env = applicableEnvDefault(surface, input, catalogue)
  const table = tableDefault(surface, input.designPath)
  for (const system of env && env !== table ? [env, table] : [table]) {
    const hit = inSet(system)
    if (hit)
      return { ok: true, resolved: resolved(surface, hit, input.mode, 'system', substitutedFrom) }
    refuse(system)
  }

  // Tier 5: the cheapest entry the team can run.
  return { ok: true, resolved: resolved(surface, set[0], input.mode, 'fallback', substitutedFrom) }
}

/**
 * The fixed model of an internal surface (A14): never reads a policy, so
 * removing Haiku at /team does not stop the background decision, the verifier
 * or the token ping. catalogueProblems guarantees exactly one eligible entry.
 */
export function internalModel(
  surface: InternalSurface,
  mode: PipelineMode,
  catalogue: Catalogue = CATALOGUE,
): ResolvedModel {
  const entry = catalogue.find((e) => isEligible(e, surface))
  if (!entry) throw new Error(`No catalogue entry serves ${surface}`)
  return resolved(surface, entry, mode, 'system', null)
}

/**
 * FR-09: the stamp tier of a regenerate-copy, from its parsed targets
 * (captions/requests.ts parseRegenerateBody): ['HEADLINE'] → headlineModel;
 * [channel] → that row's stamp; every channel ("Regenerate all") → the common
 * stamp only when every target row has one and they are all equal. Otherwise
 * null: no stamp tier, and — since no single stamp was refused — no substitution.
 */
export function regenerateStampTier<C extends string>(
  targets: readonly (C | 'HEADLINE')[],
  draft: {
    captions: readonly { channel: C; model: string | null }[]
    headlineModel: string | null
  },
): string | null {
  if (targets.length === 0) return null
  if (targets.includes('HEADLINE')) {
    return targets.length === 1 ? draft.headlineModel : null
  }
  let common: string | null = null
  for (const channel of targets) {
    const stamp = draft.captions.find((row) => row.channel === channel)?.model ?? null
    if (stamp === null || (common !== null && stamp !== common)) return null
    common = stamp
  }
  return common
}
