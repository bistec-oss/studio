// The model picker's pure half (008 FR-18, FR-22): what a picker offers, what
// it pre-selects, the hint line under it, and when it shows the team-token
// notice. The component (src/components/ui/ModelPicker.tsx) only renders what
// these return.
//
// Pure and client-safe: the catalogue, the resolver and API types only. Every
// answer comes from decideModel / effectiveSet over GET /api/models, so a
// picker pre-selects exactly what the server will run when it is left alone
// (A5) and adds no rule of its own.

import type { ModelsView } from '@/lib/api-types'
import {
  entryFor,
  familyName,
  modelTier,
  type DesignPath,
  type ModelKey,
  type ModelSpeed,
  type UserSurface,
} from './catalogue'
import {
  decideModel,
  effectiveSet,
  type DecideInput,
  type DecideResult,
  type ResolvedModel,
} from './resolve'
// A stamp as a person reads it: the current entry's name, or the raw ID for a
// retired or foreign one ('claude-sonnet-4-6', 'gpt-4o').
import { stampName } from './stampLabel'

/** The slice of GET /api/models a picker reads. */
export type PickerModels = Pick<
  ModelsView,
  | 'allowed'
  | 'defaults'
  | 'gateOn'
  | 'mode'
  | 'credential'
  | 'envDefault'
  | 'captionProviderIsClaude'
> &
  // Absent reads as `credential` (024 FR-06).
  Partial<Pick<ModelsView, 'captionCredential'>>

/** What the stamp hint names: "Same model as the current <caption | headline | design>". */
export type StampNoun = 'caption' | 'headline' | 'design'

export interface PickerContext {
  /** The regenerate's stamp (FR-09): a row's model, headlineModel or designModel. */
  stamp?: string | null
  /** REFINE's system default follows the draft's path (A8). */
  designPath?: DesignPath
  /** Defaults to 'caption' on CAPTION and 'design' elsewhere; the headline panel passes 'headline'. */
  stampNoun?: StampNoun
}

export interface PickerOption {
  value: ModelKey
  /** "<displayName> · <tier>" (FR-18). */
  label: string
  /** The speed hint, FR-18's secondary text. */
  speed: ModelSpeed
}

export const TEAM_TOKEN_NOTICE =
  "This run uses your team's Claude allowance. Connect your own token in Settings to use yours."

// 024 FR-06: the CAPTION surface reads captionCredential (a team on the API key
// route bills the team's key whoever the caller is); every other surface reads
// the caller's own credential.
function credentialFor(
  surface: UserSurface | undefined,
  models: Pick<PickerModels, 'credential' | 'captionCredential'>,
): ModelsView['credential'] {
  return (surface === 'CAPTION' ? models.captionCredential : undefined) ?? models.credential
}

function decideInput(surface: UserSurface, models: PickerModels, context: PickerContext): DecideInput {
  return {
    policy: { allowed: models.allowed, defaults: models.defaults, gateOn: models.gateOn },
    credential: credentialFor(surface, models),
    mode: models.mode,
    envDefault: models.envDefault,
    stamp: context.stamp ?? null,
    designPath: context.designPath,
  }
}

/** The effective set for this user and surface, cheapest first. A gated entry is absent (FR-22). */
export function pickerOptions(surface: UserSurface, models: PickerModels): PickerOption[] {
  return effectiveSet(surface, decideInput(surface, models, {})).map((e) => ({
    value: e.key,
    label: `${e.displayName} · ${modelTier(e)}`,
    speed: e.speed,
  }))
}

/** decideModel with no `requested`: the model the server runs if the picker is left alone. */
export function preselection(
  surface: UserSurface,
  models: PickerModels,
  context: PickerContext = {},
): DecideResult {
  return decideModel(surface, decideInput(surface, models, context))
}

/** The hint line for a pre-selection (FR-18). A refused stamp names itself first. */
export function hintText(
  surface: UserSurface,
  resolved: ResolvedModel,
  context: PickerContext = {},
): string {
  if (context.stamp && resolved.substitutedFrom === context.stamp) {
    return `${stampName(context.stamp)} is no longer available on this team — using ${resolved.entry.displayName}`
  }
  switch (resolved.source) {
    case 'stamp':
      return `Same model as the current ${context.stampNoun ?? (surface === 'CAPTION' ? 'caption' : 'design')}`
    case 'team':
      return 'Team default'
    case 'fallback':
      return "Default (the team's choice isn't available)"
    default:
      return 'Default'
  }
}

/**
 * FR-22's gated state: the switch is on and this run would use the team token
 * in CLI mode, so the gated models this surface could otherwise offer are left
 * out. Names them and points at Settings; null when nothing was left out.
 */
export function gatedHint(surface: UserSurface, models: PickerModels): string | null {
  // The resolver's own set, with and without the switch: no gate rule of our own.
  const input = decideInput(surface, models, {})
  const offered = new Set(effectiveSet(surface, input).map((e) => e.key))
  const hidden = effectiveSet(surface, { ...input, policy: { ...input.policy, gateOn: false } })
    .filter((e) => !offered.has(e.key))
    .map((e) => familyName(e.key))
  if (hidden.length === 0) return null
  const verb = hidden.length === 1 ? 'requires' : 'require'
  return `${hidden.join(' and ')} ${verb} a personal Claude token on this team — connect one in Settings`
}

/**
 * FR-22's notice: true only in CLI mode, for a personalTokenGated model, when
 * the run would use the team's token. Non-blocking; the run is allowed.
 */
export function teamTokenNotice(
  models: Pick<PickerModels, 'mode' | 'credential' | 'captionCredential'>,
  key: ModelKey | null | undefined,
  surface?: UserSurface,
): boolean {
  const credential = credentialFor(surface, models)
  if (!key || models.mode !== 'cli' || credential !== 'team') return false
  return entryFor(key)?.personalTokenGated === true
}

/**
 * A5: the picker reports a value only when it differs from the pre-selection.
 * Choosing the pre-selected model (again) reports undefined, so the caller
 * omits `model` and the server resolves the default itself.
 */
export function reportedValue(chosen: ModelKey, preselected: ModelKey): ModelKey | undefined {
  return chosen === preselected ? undefined : chosen
}

export type PickerState =
  /** Not rendered: CAPTION with a non-Claude caption provider, or nothing can run the surface. */
  | { kind: 'hidden' }
  | {
      /** 'single': one model, shown as plain text ("Model: Haiku 4.5"). 'select': a choice. */
      kind: 'single' | 'select'
      options: PickerOption[]
      preselected: ResolvedModel
      /** The pre-selection's hint (FR-18). */
      hint: string
      /** FR-22's gated hint, or null. */
      gated: string | null
    }

/**
 * Everything a picker renders. `captionProviderIsClaude` overrides the view's
 * team-default answer, for a caller that knows the draft's own provider.
 */
export function pickerState(
  surface: UserSurface,
  models: PickerModels,
  context: PickerContext = {},
  captionProviderIsClaude: boolean = models.captionProviderIsClaude,
): PickerState {
  if (surface === 'CAPTION' && !captionProviderIsClaude) return { kind: 'hidden' }
  const result = preselection(surface, models, context)
  if (!result.ok) return { kind: 'hidden' }
  const options = pickerOptions(surface, models)
  return {
    kind: options.length === 1 ? 'single' : 'select',
    options,
    preselected: result.resolved,
    hint: hintText(surface, result.resolved, context),
    gated: gatedHint(surface, models),
  }
}

/**
 * A pick the picker no longer offers: the policy changed under an open picker
 * (an admin unticked the model, or switched the gate on), or the picker is now
 * hidden. The caller would send it and get a 400, so the picker resets it to
 * undefined and the server resolves the default (A5).
 */
export function isStalePick(state: PickerState, value: ModelKey | undefined): boolean {
  if (value === undefined) return false
  return state.kind === 'hidden' || !state.options.some((o) => o.value === value)
}
