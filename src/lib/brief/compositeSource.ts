// 025 FR-08 and FR-11: a brief's product screenshot. The pairing rule between
// an image style and its screenshot, the stored shape, and the private key
// prefix. Pure and client-safe (zod only); storage lives in the routes.
import { z } from 'zod'
import { getArchetype } from '@/lib/designData'

// The private key prefix of one team's and one user's screenshots in BUCKET_DOCS.
export function screenshotKeyPrefix(teamId: string, userId: string): string {
  return `screenshots/${teamId}/${userId}/`
}

// True only when the key sits directly under this team's and user's prefix: one
// further segment, no traversal, no encoded or backslash separators.
export function isOwnScreenshotKey(key: unknown, teamId: string, userId: string): key is string {
  if (typeof key !== 'string') return false
  const prefix = screenshotKeyPrefix(teamId, userId)
  if (!key.startsWith(prefix)) return false
  const rest = key.slice(prefix.length)
  return rest.length > 0 && !rest.includes('/') && !rest.includes('..') && !rest.includes('\\') && !rest.includes('%')
}

export const compositeSourceSchema = z
  .object({
    kind: z.literal('brief-upload'),
    key: z.string().min(1).max(300),
    width: z.number().int().positive().max(8000),
    height: z.number().int().positive().max(8000),
  })
  .strict()
export type CompositeSource = z.infer<typeof compositeSourceSchema>

// A stored value read back for a reader; null when absent or not this shape.
export function parseCompositeSource(raw: unknown): CompositeSource | null {
  const r = compositeSourceSchema.safeParse(raw)
  return r.success ? r.data : null
}

export type CompositePairingError = 'IMAGE_STYLE_NEEDS_SCREENSHOT' | 'SCREENSHOT_NEEDS_IMAGE_STYLE'

// A look that `requires` a screenshot needs one; a screenshot on any other look
// (or on classic) is refused. null when the pair is consistent.
export function compositePairingError(
  imageStyle: string | null | undefined,
  compositeSource: unknown,
): CompositePairingError | null {
  const needs = !!imageStyle && !!getArchetype(imageStyle)?.requires
  const has = compositeSource !== undefined && compositeSource !== null
  if (needs && !has) return 'IMAGE_STYLE_NEEDS_SCREENSHOT'
  if (has && !needs) return 'SCREENSHOT_NEEDS_IMAGE_STYLE'
  return null
}
