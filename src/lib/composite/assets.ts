// 025 FR-13: the screenshot bytes for one render call, as a data: URI. The
// stored HTML only ever holds the token; the bytes are read here, once per
// call (NFR-07), and a key outside the team's prefix is refused.
import type { AspectRatio } from '@prisma/client'
import { dimensionsFor } from '@/lib/aspectRatio'
import { BUCKET_DOCS, getObjectBytes } from '@/lib/storage/minio'
import type { Rect } from '@/lib/designData/composition'
import type { CompositionStamp } from '@/lib/designData/stamp'
import { readImageHeader, SCREENSHOT_MIME } from './imageHeader'
import { compositeRectPx } from './insert'
import { COMPOSITE_TOKEN, CompositeRenderError, type CompositeRender } from './render'

export { CompositeRenderError }
export type { CompositeRender }

// A key is only readable under the render's own team (tenancy).
export function isTeamScreenshotKey(key: string, teamId: string): boolean {
  if (!teamId || !key.startsWith(`screenshots/${teamId}/`)) return false
  return !key.includes('..') && !key.includes('\\') && !key.includes('%')
}

// Reads the object and builds the render argument. Throws
// CompositeRenderError('composite-source-missing') for a foreign key, bytes
// that cannot be read, or bytes that are not a PNG, JPEG or WebP.
export async function compositeRenderForSource(
  key: string,
  rect: Rect,
  teamId: string,
  canvas: { width: number; height: number },
): Promise<CompositeRender> {
  if (!isTeamScreenshotKey(key, teamId)) {
    throw new CompositeRenderError('composite-source-missing', 'the screenshot key is outside this team')
  }
  let bytes: Buffer
  try {
    bytes = await getObjectBytes(BUCKET_DOCS, key)
  } catch (err) {
    throw new CompositeRenderError(
      'composite-source-missing',
      `the screenshot could not be read (${err instanceof Error ? err.message : String(err)})`,
    )
  }
  const header = readImageHeader(bytes)
  if (!header.ok) throw new CompositeRenderError('composite-source-missing', header.error)
  return {
    token: COMPOSITE_TOKEN,
    dataUri: `data:${SCREENSHOT_MIME[header.type]};base64,${bytes.toString('base64')}`,
    rectPx: compositeRectPx(rect, canvas),
  }
}

// The render argument for a stamped draft: its first composite's key and rect,
// at the canvas the caller renders. null when the stamp has no composites (a
// classic or pre-025 draft).
export async function compositeRenderForCanvas(
  stamp: CompositionStamp | null | undefined,
  teamId: string,
  canvas: { width: number; height: number },
): Promise<CompositeRender | null> {
  const entry = stamp?.composites?.[0]
  if (!entry) return null
  return compositeRenderForSource(entry.source.key, entry.rect, teamId, canvas)
}

export async function compositeRenderFor(
  stamp: CompositionStamp | null | undefined,
  teamId: string,
  size: AspectRatio,
): Promise<CompositeRender | null> {
  return compositeRenderForCanvas(stamp, teamId, dimensionsFor(size))
}
