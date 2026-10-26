// The team model policy's rules (008 FR-05): what a team with no saved policy
// reads as, and what a save must satisfy. PUT /api/team/model-policy runs
// validatePolicy before it writes, so a saved policy can never leave a user
// surface with nothing to run.
//
// Pure: imports the catalogue and the resolver's types only. The I/O (load,
// save, the transaction) lives in policy.ts.

import {
  CATALOGUE,
  SURFACE_LABELS,
  USER_SURFACES,
  familyName,
  isEligible,
  isModelKey,
  isUserSurface,
  type Catalogue,
  type ModelKey,
  type UserSurface,
} from './catalogue'
import type { ModelPolicy } from './resolve'

/** A2: a team with no TeamModelPolicy row is allowed the defaultAllowed entries. */
export const DEFAULT_POLICY: ModelPolicy = {
  allowed: CATALOGUE.filter((e) => e.defaultAllowed).map((e) => e.key),
  defaults: {},
  gateOn: false,
}

/** The save body's shape before validation (strings, so rule 1 can name a bad value). */
export interface PolicyInput {
  allowed: readonly string[]
  /** A null default means "use the system default" (no TeamModelDefault row). */
  defaults: Readonly<Record<string, string | null | undefined>>
  requirePersonalTokenForGated: boolean
}

export type PolicyValidation = { ok: true; policy: ModelPolicy } | { ok: false; message: string }

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// "Haiku or Sonnet", "Haiku, Sonnet or Opus".
function orList(names: string[]): string {
  return names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

/**
 * FR-05 rules 1–4, first failure wins. On success returns the normalized
 * policy: allowed deduplicated in catalogue order, null defaults dropped.
 */
export function validatePolicy(
  input: PolicyInput,
  catalogue: Catalogue = CATALOGUE,
): PolicyValidation {
  // Rule 1: closed vocabularies (zod already enforces this at the route).
  const unknownKey = [...input.allowed, ...Object.values(input.defaults)].find(
    (v) => v !== null && v !== undefined && !isModelKey(v),
  )
  if (unknownKey !== undefined) return { ok: false, message: `Unknown model "${unknownKey}"` }
  const unknownSurface = Object.keys(input.defaults).find((s) => !isUserSurface(s))
  if (unknownSurface !== undefined) {
    return { ok: false, message: `Unknown surface "${unknownSurface}"` }
  }

  const allowedKeys = new Set(input.allowed as readonly ModelKey[])
  const allowed = catalogue.filter((e) => allowedKeys.has(e.key))

  // Rule 2.
  if (allowed.length === 0) return { ok: false, message: 'Allow at least one model' }

  // Rule 3: every user surface keeps at least one model it can run.
  for (const surface of USER_SURFACES) {
    if (!allowed.some((e) => isEligible(e, surface))) {
      const eligible = catalogue.filter((e) => isEligible(e, surface)).map((e) => familyName(e.key))
      return {
        ok: false,
        message: `${capitalize(SURFACE_LABELS[surface].phrase)} needs ${orList(eligible)} allowed`,
      }
    }
  }

  // Rule 4: each default is allowed and eligible for its surface.
  const defaults: Partial<Record<UserSurface, ModelKey>> = {}
  for (const [surface, key] of Object.entries(input.defaults) as [
    UserSurface,
    ModelKey | null | undefined,
  ][]) {
    if (key === null || key === undefined) continue
    const entry = catalogue.find((e) => e.key === key)
    const label = SURFACE_LABELS[surface]
    if (!entry || !isEligible(entry, surface)) {
      return {
        ok: false,
        message: `${entry?.displayName ?? key} isn't available for ${label.phrase}`,
      }
    }
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        message: `The ${label.name} default, ${entry.displayName}, isn't in the allowed models`,
      }
    }
    defaults[surface] = key
  }

  return {
    ok: true,
    policy: {
      allowed: allowed.map((e) => e.key),
      defaults,
      gateOn: input.requirePersonalTokenForGated,
    },
  }
}
