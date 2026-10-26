// The brief wizard's model picks (008 FR-19): which design surface a path
// serves, what a path change does to a design pick, the name a Review summary
// row shows, and which picker a refused pick's 400 belongs to.
//
// Pure and client-safe: the catalogue, the resolver and the picker helpers
// only. Every rule is theirs; this module only applies them to the wizard.

import {
  MODEL_KEYS,
  entryFor,
  isEligible,
  type DesignPath,
  type ModelKey,
  type UserSurface,
} from '@/lib/models/catalogue'
import { decideModel } from '@/lib/models/resolve'
import {
  isStalePick,
  pickerState,
  type PickerContext,
  type PickerModels,
} from '@/lib/models/pickerState'
import type { ModelErrorField } from '@/lib/models/requests'

export type BriefDesignMode = 'TEMPLATE' | 'GENERATE'

/** The surface the brief's design runs on: the same mapping as POST /api/briefs. */
export function designSurface(mode: BriefDesignMode): UserSurface {
  return mode === 'TEMPLATE' ? 'DESIGN_TEMPLATE' : 'DESIGN_FREEFORM'
}

export function designPath(mode: BriefDesignMode): DesignPath {
  return mode === 'TEMPLATE' ? 'A' : 'B'
}

/**
 * FR-19: a design pick the new path can't run (Opus → template fill) resets to
 * undefined, so the server resolves the default (A5), and the note says why in
 * the resolver's own words ("Opus 5.5 isn't available for template fill").
 * Only eligibility is a path question; a pick the team's policy refuses is the
 * picker's own stale-pick reset.
 */
export function designPickForPath(
  pick: ModelKey | undefined,
  mode: BriefDesignMode,
): { pick: ModelKey | undefined; note: string | null } {
  const entry = pick ? entryFor(pick) : null
  const surface = designSurface(mode)
  if (!pick || (entry && isEligible(entry, surface))) return { pick, note: null }
  // Every model allowed and no gate, so the refusal can only be eligibility.
  const refused = decideModel(surface, {
    requested: pick,
    policy: { allowed: MODEL_KEYS, defaults: {}, gateOn: false },
    credential: 'n/a',
    mode: 'api',
  })
  return { pick: undefined, note: refused.ok ? null : refused.message }
}

/**
 * The Review summary row's model: the user's pick while the picker offers it,
 * else the pre-selection the server will run. Null when the picker is hidden
 * (no Claude caption provider, or nothing can run the surface).
 */
export function reviewModelName(
  surface: UserSurface,
  models: PickerModels,
  context: PickerContext,
  pick: ModelKey | undefined,
): string | null {
  const state = pickerState(surface, models, context)
  if (state.kind === 'hidden') return null
  const chosen = pick && !isStalePick(state, pick) ? entryFor(pick) : null
  return (chosen ?? state.preselected.entry).displayName
}

export type BriefModelField = ModelErrorField

/**
 * Which picker a POST /api/briefs 400 MODEL_NOT_ALLOWED belongs to: the body's
 * own `field` (every refusal site in the route sets it). Null when it is absent
 * or unknown, so the wizard shows the message as the step's general error.
 */
export function refusedModelField(field: unknown): BriefModelField | null {
  return field === 'captionModel' || field === 'designModel' ? field : null
}
