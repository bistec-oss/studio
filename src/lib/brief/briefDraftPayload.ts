import { z } from 'zod'
import { modelKeySchema } from '@/lib/models/requests'
import { compositeSourceSchema } from '@/lib/brief/compositeSource'

// ─── BriefDraft payload — pure, client-safe ─────────────────────────────────
// The wizard-shaped working state autosaved to a BriefDraft row. This module
// deliberately imports nothing server-side (no prisma/minio/env) so the brief
// wizard can share the schema and helpers; the prisma/MinIO lifecycle lives in
// briefDrafts.ts. Unknown/extra keys are stripped by zod, and a payload that
// fails to parse is treated as missing by the service (row swept) — schema
// drift across releases never half-rehydrates a wizard.

// The shape only (the client cannot know the team); the owner check is the service's.
const SCREENSHOT_KEY_SHAPE = /^screenshots\/[^/]+\/[^/]+\/[^/]+$/

export const BRIEF_DRAFT_CAP = 5
export const BRIEF_DRAFT_TTL_MS = 7 * 24 * 60 * 60_000
// Images are URLs, not data — a real payload is a few KB. Anything near this
// cap is malformed or abusive.
export const MAX_BRIEF_DRAFT_PAYLOAD_BYTES = 64 * 1024

export const briefDraftPayloadSchema = z.object({
  step: z.number().int().min(0).max(4),
  campaignId: z.string(),
  aspectRatio: z.enum(['SQUARE', 'PORTRAIT', 'STORY']),
  brandKitId: z.string(),
  designMode: z.enum(['TEMPLATE', 'GENERATE']),
  templateId: z.string(),
  referenceTemplateId: z.string(),
  topic: z.string().max(500),
  prompt: z.string().max(20_000),
  // 027 FR-07: the Goal picker is gone; the goal follows the post style. A row
  // saved before 027 still carries one (it parses and is ignored); a new
  // autosave leaves it out, and a resumed brief with no style opens as General.
  goal: z.string().max(100).optional(),
  tone: z.string().max(100),
  images: z
    .array(
      z.object({
        id: z.string(),
        url: z.string(),
        filename: z.string(),
        intent: z.enum(['embed', 'reference']),
      }),
    )
    .max(20),
  // 008 FR-17: the Review step's model picks, so a resumed brief restores them.
  // Absent = untouched picker (A5): the server resolves the default.
  captionModel: modelKeySchema.optional(),
  designModel: modelKeySchema.optional(),
  // 009 FR-03: the image style; absent = classic. An unknown stored value is
  // read back as classic by the wizard (resumeImageStyle), never a parse failure.
  imageStyle: z.string().max(40).optional(),
  // 027 FR-07: the post style key; absent (an old row) or unknown = General.
  postStyle: z.string().max(40).optional(),
  // 025 FR-11: the product screenshot; absent = none. Its private object is
  // deleted with the draft on Discard, eviction and expiry.
  compositeSource: compositeSourceSchema
    .refine((s) => SCREENSHOT_KEY_SHAPE.test(s.key) && !s.key.includes('..'), {
      message: 'compositeSource key must be screenshots/<team>/<user>/<file>',
    })
    .optional(),
})

export type BriefDraftPayload = z.infer<typeof briefDraftPayloadSchema>

// A draft with nothing worth recovering must never create/keep a row (FR-1/AC-7).
export function isTrivialBriefDraft(p: BriefDraftPayload): boolean {
  return p.topic.trim() === '' && p.prompt.trim() === '' && p.images.length === 0
}

export function briefDraftPayloadTooLarge(p: BriefDraftPayload): boolean {
  return JSON.stringify(p).length > MAX_BRIEF_DRAFT_PAYLOAD_BYTES
}

// Extracts the object key from a brief-image public URL, but ONLY when it
// lives under this owner's briefs/<userId>/ prefix in the given bucket —
// image cleanup must never be steerable at other objects via a crafted URL.
// Returns null for foreign/unparsable URLs (callers skip those).
export function briefImageKeyFromUrl(
  url: string,
  bucket: string,
  userId: string,
): string | null {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return null
  }
  const prefix = `/${bucket}/briefs/${userId}/`
  if (!pathname.startsWith(prefix)) return null
  const key = decodeURIComponent(pathname.slice(`/${bucket}/`.length))
  // Re-check after decoding: %2E%2E-style traversal must not escape the prefix.
  if (!key.startsWith(`briefs/${userId}/`) || key.includes('..')) return null
  return key
}
