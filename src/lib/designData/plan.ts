// Composition planning and settling (009 FR-04, design.md section 8). Both are
// pure and take structural inputs, so nothing here imports the background step.
import type { AspectRatio } from '@prisma/client'
import type { ImageTier } from '@/providers/imageCapabilities'
import { archetypes, getArchetype, type ArchetypeMap, type Contract, type SizeContract } from './composition'
import type { Rect } from './composition'
import { compositionStampSchema, type CompositeEntry, type CompositionStamp } from './stamp'

export interface HeroPlan {
  kind: 'hero'
  // The brief's imageStyle, which is also the archetype key.
  requestedArchetype: string
  label: string
  contractVersion: number
  contract: Contract
  size: AspectRatio
  sizeContract: SizeContract
}
export interface ClassicPlan {
  kind: 'classic'
  requestedArchetype: string
  // Absent for `imageStyle: 'classic'`.
  fallbackReason?: 'unknown-archetype' | 'unsupported-size' | 'composite-source-missing'
}
export type CompositionPlan = HeroPlan | ClassicPlan

// The sampler's outcome for a hero image, as `runBackgroundStep` reports it.
// A kept composite look carries the detected screen (025 A1) in `composites`.
export type HeroCheckResult =
  | { ok: true; composites?: Array<{ region: number; rect: Rect }> }
  | { ok: false; reason: 'busy' | 'contrast' | 'region-invalid' | 'check-error' | 'composite-not-blank' }

// The outcome of placing the author's screenshot (025), passed by the caller
// that did the placing. Only settleComposition writes `composites`: the source
// comes from here, the rect (the screen detected in the image, A1) from the check.
export type CompositeOutcome =
  | { ok: true; source: CompositeEntry['source'] }
  | { ok: false; reason: 'composite-not-rendered' | 'composite-source-missing' }

// What settle needs from the background step. A skip variant has no url.
export interface SettleBackground {
  url?: string | null
  quality?: ImageTier
  check?: HeroCheckResult | null
}

// A classic plan is decided before any image is requested. Absent, blank or
// 'classic' is classic; an unknown or retired key is `unknown-archetype`; a
// size the active archetype's current contract does not declare is
// `unsupported-size`. `source` is injectable for tests only.
// `opts.version` (031 FR-48) plans an explicit contract version instead of the look's `current`.
// Only the super-admin look probe passes it (planOverrideBoundary.test.ts); every served path
// uses `current`.
export function planComposition(
  input: { imageStyle: string | null | undefined; aspectRatio: AspectRatio; hasCompositeSource?: boolean },
  source: ArchetypeMap = archetypes,
  opts?: { version?: number }
): CompositionPlan {
  const requested = typeof input.imageStyle === 'string' && input.imageStyle !== '' ? input.imageStyle : 'classic'
  if (requested === 'classic') return { kind: 'classic', requestedArchetype: 'classic' }
  const archetype = getArchetype(requested, source)
  if (!archetype || archetype.status !== 'active') {
    return { kind: 'classic', requestedArchetype: requested, fallbackReason: 'unknown-archetype' }
  }
  const version = opts?.version ?? archetype.current
  const contract = archetype.versions[version]
  const sizeContract = contract?.sizes[input.aspectRatio]
  if (!contract || !sizeContract) {
    return { kind: 'classic', requestedArchetype: requested, fallbackReason: 'unsupported-size' }
  }
  // A look that needs an input the caller did not supply is classic (025).
  if (archetype.requires && !input.hasCompositeSource) {
    return { kind: 'classic', requestedArchetype: requested, fallbackReason: 'composite-source-missing' }
  }
  return {
    kind: 'hero',
    requestedArchetype: requested,
    label: archetype.label,
    contractVersion: version,
    contract,
    size: input.aspectRatio,
    sizeContract,
  }
}

// Only an explicit, completed pass keeps the archetype; every other exit takes
// the fallback table (design.md section 8). A hero plan with a URL but no
// check result fails closed as check-error.
export function settleComposition(
  plan: CompositionPlan,
  background: SettleBackground | null | undefined,
  composite?: CompositeOutcome
): CompositionStamp {
  const imageQuality = background?.quality ?? 'default'
  const stamp = (
    rest: Pick<CompositionStamp, 'appliedArchetype' | 'contractVersion' | 'fallbackReason' | 'composites'>
  ) =>
    compositionStampSchema.parse({
      requestedArchetype: plan.requestedArchetype,
      imageQuality,
      appliedArchetype: rest.appliedArchetype,
      contractVersion: rest.contractVersion,
      // Omitted, not undefined, when there is no reason.
      ...(rest.fallbackReason ? { fallbackReason: rest.fallbackReason } : {}),
      ...(rest.composites ? { composites: rest.composites } : {}),
    })

  if (plan.kind === 'classic') {
    return stamp({ appliedArchetype: 'classic', contractVersion: null, fallbackReason: plan.fallbackReason })
  }
  if (!background?.url) {
    return stamp({ appliedArchetype: 'classic', contractVersion: null, fallbackReason: 'no-image' })
  }
  const check = background.check
  if (check && check.ok === true) {
    // A kept look that needs a screenshot is kept only with a placed one.
    const needs = !!getArchetype(plan.requestedArchetype)?.requires
    if (composite && composite.ok === false) {
      return stamp({ appliedArchetype: 'classic', contractVersion: null, fallbackReason: composite.reason })
    }
    if (needs && !composite) {
      return stamp({ appliedArchetype: 'classic', contractVersion: null, fallbackReason: 'composite-source-missing' })
    }
    if (composite && composite.ok === true) {
      // A kept look needs the detected rect; a check that kept it without one fails closed.
      const rect = check.composites?.find((c) => c.region === 0)?.rect
      if (!rect) return stamp({ appliedArchetype: 'classic', contractVersion: null, fallbackReason: 'check-error' })
      return stamp({
        appliedArchetype: plan.requestedArchetype,
        contractVersion: plan.contractVersion,
        fallbackReason: undefined,
        composites: [{ region: 0, source: composite.source, rect }],
      })
    }
    return stamp({
      appliedArchetype: plan.requestedArchetype,
      contractVersion: plan.contractVersion,
      fallbackReason: undefined,
    })
  }
  return stamp({
    appliedArchetype: 'classic',
    contractVersion: null,
    fallbackReason: check && check.ok === false ? check.reason : 'check-error',
  })
}
