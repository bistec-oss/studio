// The /team → Models form (008 FR-14) as pure functions: the form's state from
// GET /api/team/model-policy, the option lists, and the PUT body. The component
// (src/components/team/ModelsCard.tsx) only renders what these return.
//
// Pure and client-safe: the catalogue, the resolver and API types only.

import type { ModelsView, TeamModelPolicyInfo } from '@/lib/api-types'
import {
  MODEL_KEYS,
  USER_SURFACES,
  type DesignPath,
  type ModelKey,
  type UserSurface,
} from './catalogue'
import { decideModel, type PipelineMode } from './resolve'

export interface PolicyForm {
  /** In catalogue order. */
  allowed: ModelKey[]
  /** null = the system default (no TeamModelDefault row). */
  defaults: Record<UserSurface, ModelKey | null>
  gateOn: boolean
}

/** The PUT /api/team/model-policy body (FR-13). */
export interface PolicyBody {
  allowed: ModelKey[]
  defaults: Record<UserSurface, ModelKey | null>
  requirePersonalTokenForGated: boolean
}

const inCatalogueOrder = (keys: Iterable<ModelKey>): ModelKey[] => {
  const set = new Set(keys)
  return MODEL_KEYS.filter((k) => set.has(k))
}

/** The form as the server last saved it. A default outside the allowed list reads as the system default. */
export function formFromPolicy(info: TeamModelPolicyInfo): PolicyForm {
  const allowed = inCatalogueOrder(info.allowed)
  const defaults = Object.fromEntries(
    USER_SURFACES.map((s) => {
      const key = info.defaults[s] ?? null
      return [s, key && allowed.includes(key) ? key : null]
    }),
  ) as Record<UserSurface, ModelKey | null>
  return { allowed, defaults, gateOn: info.requirePersonalTokenForGated }
}

/**
 * Ticks or unticks a model. Unticking also resets every default that named it
 * to the system default, so a Select never holds a value it doesn't offer.
 */
export function toggleAllowed(form: PolicyForm, key: ModelKey, checked: boolean): PolicyForm {
  if (checked) return { ...form, allowed: inCatalogueOrder([...form.allowed, key]) }
  const defaults = Object.fromEntries(
    USER_SURFACES.map((s) => [s, form.defaults[s] === key ? null : form.defaults[s]]),
  ) as Record<UserSurface, ModelKey | null>
  return { ...form, allowed: form.allowed.filter((k) => k !== key), defaults }
}

/**
 * The name of what a surface runs with no team default, given the ticked
 * models: decideModel's own tiers 4–5 (CLAUDE_CLI_MODEL where it applies, the
 * table default, then the cheapest allowed), so the label can't disagree with
 * the server. null when nothing ticked can run the surface (the save will 400).
 *
 * REFINE depends on the draft's design path (A8): when the Path B and Path A
 * defaults differ, both are named — "Sonnet 5.5; Haiku 4.5 on template drafts"
 * (018 FR-02). When they agree, one name, as for every other surface.
 */
export function systemDefaultName(
  surface: UserSurface,
  allowed: readonly ModelKey[],
  mode: PipelineMode,
  envDefault: ModelKey | null,
): string | null {
  const nameFor = (designPath?: DesignPath): string | null => {
    const result = decideModel(surface, {
      policy: { allowed, defaults: {}, gateOn: false },
      credential: 'n/a',
      mode,
      envDefault,
      designPath,
    })
    return result.ok ? result.resolved.entry.displayName : null
  }
  if (surface !== 'REFINE') return nameFor()
  const pathB = nameFor('B')
  const pathA = nameFor('A')
  if (!pathB || !pathA || pathA === pathB) return pathB
  return `${pathB}; ${pathA} on template drafts`
}

/** A surface's Select options: "System default (<name>)", then each ticked, eligible model. */
export function defaultOptions(
  surface: UserSurface,
  form: PolicyForm,
  view: Pick<ModelsView, 'catalogue' | 'mode' | 'envDefault'>,
): { value: string; label: string }[] {
  const name = systemDefaultName(surface, form.allowed, view.mode, view.envDefault)
  return [
    { value: '', label: `System default (${name ?? 'none allowed'})` },
    ...view.catalogue
      .filter((e) => form.allowed.includes(e.key) && e.surfaces.includes(surface))
      .map((e) => ({ value: e.key, label: e.displayName })),
  ]
}

export function policyBody(form: PolicyForm): PolicyBody {
  return {
    allowed: inCatalogueOrder(form.allowed),
    defaults: { ...form.defaults },
    requirePersonalTokenForGated: form.gateOn,
  }
}
