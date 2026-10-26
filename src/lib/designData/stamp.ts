// The composition stamp (009 design.md section 7): one JSON value stored on
// Draft and DraftRevision next to promptVersion. Validated in code (the schema
// and its invariants run at every write; a stored value that fails to parse
// reads as null), because a vocabulary that grows needs no migration.
import { z } from 'zod'
import { ASPECT_DIMENSIONS } from '@/lib/aspectRatio'
import { contractVersionOf, getArchetype } from './composition'
import { isScreenAspect, rectInsideCanvas, rectsIntersect } from './composite'

// A stored screenshot object key: screenshots/<teamId>/<userId>/<file> (025).
export const SCREENSHOT_KEY_RE = /^screenshots\/[^/]+\/[^/]+\/[^/]+$/

export const FALLBACK_REASONS = [
  'busy',
  'contrast',
  'region-invalid',
  'check-error',
  'no-image',
  'unknown-archetype',
  'unsupported-size',
  'refine-replaced-image',
  'composite-not-blank',
  'composite-not-rendered',
  'composite-source-missing',
] as const
export const OBSERVATIONS = ['layout-violation'] as const
export const IMAGE_QUALITIES = ['default', 'standard', 'high'] as const

export type FallbackReason = (typeof FALLBACK_REASONS)[number]

// A percent of the canvas, two decimals at most is what the detector writes.
const pct = z.number().finite().min(0).max(100)
const compositeEntry = z
  .object({
    region: z.literal(0),
    // The screen the detector found in the image (025 A1), in canvas percent.
    rect: z.object({ x: pct, y: pct, w: pct, h: pct }).strict(),
    source: z
      .object({ kind: z.literal('brief-upload'), key: z.string().regex(SCREENSHOT_KEY_RE) })
      .strict(),
  })
  .strict()
export type CompositeEntry = z.infer<typeof compositeEntry>

export const compositionStampSchema = z
  .object({
    requestedArchetype: z.string().min(1), // 'classic' | a key
    appliedArchetype: z.string().min(1), // 'classic' | a key
    contractVersion: z.number().int().positive().nullable(),
    fallbackReason: z.enum(FALLBACK_REASONS).optional(),
    observations: z.array(z.enum(OBSERVATIONS)).optional(),
    imageQuality: z.enum(IMAGE_QUALITIES),
    composites: z.array(compositeEntry).length(1).optional(),
  })
  .superRefine((s, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })
    if (s.appliedArchetype !== 'classic') {
      if (s.contractVersion === null) issue('a non-classic applied archetype needs a contractVersion')
      if (s.fallbackReason !== undefined) issue('a non-classic applied archetype has no fallbackReason')
      if (s.requestedArchetype !== s.appliedArchetype) issue('requestedArchetype must equal appliedArchetype')
    } else {
      if (s.contractVersion !== null) issue('a classic applied archetype has a null contractVersion')
      if (s.observations && s.observations.length > 0) issue('observations need a non-classic applied archetype')
      if (s.requestedArchetype === 'classic' && s.fallbackReason !== undefined) {
        issue('a classic request has no fallbackReason')
      }
      if (s.composites !== undefined) issue('a classic applied archetype has no composites')
    }
    const requires = s.appliedArchetype === 'classic' ? undefined : getArchetype(s.appliedArchetype)?.requires
    if (s.appliedArchetype !== 'classic') {
      if (s.composites !== undefined && !requires) issue('composites need a look that requires a composite source')
      if (s.composites === undefined && requires) issue('a look that requires a composite source needs composites')
    }
    // The rect invariants (025 A1). The stamp does not record the size, so the
    // rect must hold at one of the stamped contract's declared sizes.
    const rect = s.composites?.[0]?.rect
    if (rect && s.appliedArchetype !== 'classic' && s.contractVersion !== null) {
      if (!rectInsideCanvas(rect)) {
        issue('the composite rect must lie inside the canvas')
      } else {
        const sizes = contractVersionOf(s.appliedArchetype, s.contractVersion)?.sizes ?? {}
        const fits = (Object.keys(sizes) as Array<keyof typeof ASPECT_DIMENSIONS>).map((size) => {
          const regions = sizes[size]?.regions ?? []
          return {
            aspect: isScreenAspect(rect, ASPECT_DIMENSIONS[size]),
            clear: !regions.some((r) => r.purpose === 'text' && rectsIntersect(rect, r.rect)),
          }
        })
        if (!fits.some((f) => f.aspect)) issue('the composite rect must be 16:10 within 5%')
        else if (!fits.some((f) => f.aspect && f.clear)) issue('the composite rect must not intersect a text region')
      }
    }
  })

export type CompositionStamp = z.infer<typeof compositionStampSchema>

// Tolerant read: null on any failure, never a throw.
export function parseCompositionStamp(raw: unknown): CompositionStamp | null {
  const r = compositionStampSchema.safeParse(raw)
  return r.success ? r.data : null
}

// A classic request that stayed classic (also a Path A draft's stamp, so the
// evidence has a denominator).
export function classicStamp(imageQuality: CompositionStamp['imageQuality'] = 'default'): CompositionStamp {
  return compositionStampSchema.parse({
    requestedArchetype: 'classic',
    appliedArchetype: 'classic',
    contractVersion: null,
    imageQuality,
  })
}

// A refine that generated a new background replaces the hero image, so a
// non-classic draft becomes classic and says why. Requested and quality are
// kept. A draft that is already classic keeps its stamp unchanged.
export function refineReplacedStamp(prev: CompositionStamp): CompositionStamp {
  if (prev.appliedArchetype === 'classic') return prev
  return compositionStampSchema.parse({
    requestedArchetype: prev.requestedArchetype,
    appliedArchetype: 'classic',
    contractVersion: null,
    fallbackReason: 'refine-replaced-image',
    imageQuality: prev.imageQuality,
  })
}
