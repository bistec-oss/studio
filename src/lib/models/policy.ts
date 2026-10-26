// The server half of model selection (008 FR-03 I/O wrapper, FR-04 boot line,
// FR-05 store, FR-13 views). Every server-side model choice on a user surface
// goes through resolveModel here: it loads the team's policy and the caller's
// credential tier, then hands them to the pure decideModel (resolve.ts) — the
// same function wave 2's pickers run on the client, fed by loadModelsView.
//
// Server-only (Prisma, env). Never import it from a "use client" file; the
// client imports catalogue.ts / resolve.ts / policyRules.ts directly.

import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { pipelineMode } from '@/lib/agent/config'
import type { ModelsView, TeamModelPolicyInfo } from '@/lib/api-types'
import { copyProviderIsClaude } from '@/providers/registry'
import { captionCredentialFor } from '@/providers/captionRoute'
import {
  CATALOGUE,
  USER_SURFACES,
  entryFor,
  entryForStamp,
  isEligible,
  isModelKey,
  isUserSurface,
  modelTier,
  type DesignPath,
  type ModelKey,
  type UserSurface,
} from './catalogue'
import {
  decideModel,
  type CredentialTier,
  type DecideResult,
  type ModelPolicy,
  type PipelineMode,
  type ResolvedModel,
} from './resolve'
import { DEFAULT_POLICY, validatePolicy, type PolicyInput } from './policyRules'

/** A team's policy as the resolver reads it, plus whether a row is stored. */
export interface LoadedPolicy extends ModelPolicy {
  allowed: ModelKey[]
  /** false = no TeamModelPolicy row: the A2 defaults apply. */
  saved: boolean
}

/**
 * The team's policy (FR-05). No row reads as DEFAULT_POLICY (A2). A stored row
 * whose allowedModels is NULL or empty reads as [] — never as "all allowed" —
 * so the resolver fails closed with NO_ALLOWED_MODEL (a hand-edited row; the
 * API can't save one). Values outside the closed vocabularies are dropped.
 */
export async function loadTeamPolicy(teamId: string): Promise<LoadedPolicy> {
  const row = await prisma.teamModelPolicy.findUnique({
    where: { teamId },
    select: {
      allowedModels: true,
      requirePersonalTokenForGated: true,
      defaults: { select: { surface: true, model: true } },
    },
  })
  if (!row) {
    return {
      allowed: [...DEFAULT_POLICY.allowed],
      defaults: { ...DEFAULT_POLICY.defaults },
      gateOn: DEFAULT_POLICY.gateOn,
      saved: false,
    }
  }
  const stored: readonly unknown[] = row.allowedModels ?? []
  const allowed = CATALOGUE.map((e) => e.key).filter((k) => stored.includes(k))
  const defaults: Partial<Record<UserSurface, ModelKey>> = {}
  for (const d of row.defaults ?? []) {
    if (isUserSurface(d.surface) && isModelKey(d.model)) defaults[d.surface] = d.model
  }
  return { allowed, defaults, gateOn: row.requirePersonalTokenForGated === true, saved: true }
}

/** GET /api/team/model-policy's shape (FR-13). */
export function policyInfo(policy: LoadedPolicy): TeamModelPolicyInfo {
  const defaults = Object.fromEntries(
    USER_SURFACES.map((s) => [s, policy.defaults[s] ?? null]),
  ) as Record<UserSurface, ModelKey | null>
  return {
    allowed: [...policy.allowed],
    defaults,
    requirePersonalTokenForGated: policy.gateOn,
    saved: policy.saved,
    // A2: only a SAVED list can be missing an entry; an unsaved team gets them all.
    newModels: policy.saved
      ? CATALOGUE.filter((e) => e.defaultAllowed && !policy.allowed.includes(e.key)).map(
          (e) => e.key,
        )
      : [],
  }
}

export type SavePolicyResult = { ok: true; policy: LoadedPolicy } | { ok: false; message: string }

/**
 * Saves a team's policy (FR-05): validatePolicy first (rules 1–4, nothing is
 * written on a failure), then one transaction that upserts the policy row and
 * replaces its default rows. A null or absent default = no row = the system
 * default.
 */
export async function saveTeamPolicy(
  teamId: string,
  input: PolicyInput,
): Promise<SavePolicyResult> {
  const v = validatePolicy(input)
  if (!v.ok) return v
  const { policy } = v
  const allowedModels = [...policy.allowed]
  const defaults = Object.entries(policy.defaults) as [UserSurface, ModelKey][]

  await prisma.$transaction(async (tx) => {
    await tx.teamModelPolicy.upsert({
      where: { teamId },
      create: { teamId, allowedModels, requirePersonalTokenForGated: policy.gateOn },
      update: { allowedModels, requirePersonalTokenForGated: policy.gateOn },
    })
    await tx.teamModelDefault.deleteMany({ where: { teamId } })
    if (defaults.length > 0) {
      await tx.teamModelDefault.createMany({
        data: defaults.map(([surface, model]) => ({ teamId, surface, model })),
      })
    }
  })

  return {
    ok: true,
    policy: {
      allowed: allowedModels,
      defaults: policy.defaults,
      gateOn: policy.gateOn,
      saved: true,
    },
  }
}

/**
 * The caller's Claude credential tier (design §3), which the gate reads (A3).
 * API mode → 'n/a' with no query (there is no personal Claude credential).
 * userId null (scheduler, MCP, ACP) → 'team'. Otherwise one query: an ACTIVE
 * UserClaudeToken whose user is not disabled → 'personal', else 'team' — the
 * same test resolveClaudeAuth (agent/userToken.ts) applies before billing it.
 */
export async function credentialTier(
  userId: string | null,
  mode: PipelineMode = pipelineMode(),
): Promise<CredentialTier> {
  if (mode === 'api') return 'n/a'
  if (!userId) return 'team'
  const row = await prisma.userClaudeToken.findFirst({
    where: { userId, status: 'ACTIVE', user: { disabled: false } },
    select: { id: true },
  })
  return row ? 'personal' : 'team'
}

/** CLAUDE_CLI_MODEL as decideModel's envDefault: CLI mode only (A4). */
function envDefaultFor(mode: PipelineMode): ModelKey | null {
  return mode === 'cli' ? (env.CLAUDE_CLI_MODEL ?? null) : null
}

// FR-04: said once per process, at the first resolveModel call, so the change
// in meaning (system default, no longer a global override) is in every log.
let bootLineLogged = false

function logBootLineOnce(mode: PipelineMode): void {
  if (bootLineLogged) return
  bootLineLogged = true
  const value = env.CLAUDE_CLI_MODEL
  if (!value) return
  if (mode === 'cli') {
    console.info(
      `[models] CLAUDE_CLI_MODEL=${value} is the system default (below team defaults and explicit picks); it no longer overrides them`,
    )
  } else {
    console.warn('[models] CLAUDE_CLI_MODEL is set but ignored in API mode')
  }
}

// Why a refused value (a key, or a stamp string) wasn't available — the
// "(<reason>)" of FR-03's substitution line. Most specific first.
function substitutionReason(
  surface: UserSurface,
  value: string,
  policy: ModelPolicy,
  credential: CredentialTier,
  mode: PipelineMode,
): string {
  const match = isModelKey(value)
    ? { entry: entryFor(value), previous: false }
    : entryForStamp(value)
  const entry = match?.entry
  if (!match || !entry) return 'unknown model'
  if (!isEligible(entry, surface)) return 'not eligible for this surface'
  if (!policy.allowed.includes(entry.key)) return 'not allowed on this team'
  if (entry.personalTokenGated && policy.gateOn && credential === 'team' && mode === 'cli') {
    return 'needs a personal token'
  }
  if (match.previous) return `retired ID of ${entry.displayName}`
  return 'not available'
}

function logSubstitution(
  resolved: ResolvedModel,
  surface: UserSurface,
  policy: ModelPolicy,
  credential: CredentialTier,
  mode: PipelineMode,
  interactive: boolean,
): void {
  const from = resolved.substitutedFrom
  if (from === null) return
  const reason = substitutionReason(surface, from, policy, credential, mode)
  // The refused value may come from a stored row or a stamp: JSON-quoted, capped.
  const line = `[models] ${surface}: ${JSON.stringify(from.slice(0, 80))} not available (${reason}) → ${resolved.key} (${resolved.source})`
  // Non-interactive callers (scheduler, MCP, ACP) have no user watching: warn.
  if (interactive) console.info(line)
  else console.warn(line)
}

export interface ResolveModelOptions {
  /** Tier 1: an explicit request. A miss is refused (the caller's 400). */
  requested?: ModelKey | null
  /** A stored request (Brief.captionModel / designModel, FR-10): a miss falls through, recorded. */
  storedRequest?: ModelKey | null
  /** Tier 2: a regenerate's stamp (FR-09). */
  stamp?: string | null
  /** The acting user; null for the scheduler, MCP and ACP (always 'team'). */
  userId: string | null
  teamId: string
  /** REFINE's system default follows the draft's path (A8). */
  designPath?: DesignPath
}

/**
 * FR-03's I/O wrapper: the team's policy + the caller's credential tier + the
 * mode + CLAUDE_CLI_MODEL (CLI mode only) → decideModel. The result union is
 * returned unchanged: a route turns an `ok: false` from an explicit request
 * into a 400; every other caller fails closed with its message. Substitutions
 * are logged on every run (warn when userId is null, info otherwise).
 */
export async function resolveModel(
  surface: UserSurface,
  opts: ResolveModelOptions,
): Promise<DecideResult> {
  const mode = pipelineMode()
  logBootLineOnce(mode)
  // 024 FR-06: a CAPTION run on a team that chose the API key route is 'team'
  // whoever calls. Every other surface keeps the caller's own tier.
  const [policy, credential] = await Promise.all([
    loadTeamPolicy(opts.teamId),
    surface === 'CAPTION'
      ? captionCredentialFor(opts.teamId).then((c) => c ?? credentialTier(opts.userId, mode))
      : credentialTier(opts.userId, mode),
  ])
  const result = decideModel(surface, {
    requested: opts.requested,
    storedRequest: opts.storedRequest,
    stamp: opts.stamp,
    policy,
    credential,
    mode,
    envDefault: envDefaultFor(mode),
    designPath: opts.designPath,
  })
  if (result.ok) {
    logSubstitution(result.resolved, surface, policy, credential, mode, opts.userId !== null)
  }
  return result
}

/**
 * GET /api/models's payload (FR-13): the catalogue as a picker sees it (no
 * price, no apiId), the team's effective policy inputs, and the caller's mode,
 * credential and envDefault — exactly what the client-side decideModel needs —
 * plus whether the team's default caption provider is Claude (spec open
 * question 1: the CAPTION picker is hidden when it isn't, FR-18).
 */
export async function loadModelsView(user: {
  userId: string | null
  teamId: string
}): Promise<ModelsView> {
  const mode = pipelineMode()
  const [policy, credential, captionProviderIsClaude, captionOverride] = await Promise.all([
    loadTeamPolicy(user.teamId),
    credentialTier(user.userId, mode),
    copyProviderIsClaude(user.teamId),
    captionCredentialFor(user.teamId),
  ])
  return {
    catalogue: CATALOGUE.map((e) => ({
      key: e.key,
      displayName: e.displayName,
      tier: modelTier(e),
      speed: e.speed,
      surfaces: USER_SURFACES.filter((s) => isEligible(e, s)),
      personalTokenGated: e.personalTokenGated,
    })),
    allowed: [...policy.allowed],
    defaults: { ...policy.defaults },
    gateOn: policy.gateOn,
    mode,
    credential,
    envDefault: envDefaultFor(mode),
    captionProviderIsClaude,
    captionCredential: captionOverride ?? credential,
  }
}
