import { z } from 'zod'
import { postFontFamiliesFromHtml } from './inject'

// The render note (031 FR-24): what a render found about the post fonts it was asked to load.
// Pure: zod only, so the stamp, the mock renderer and the notice can all import it. The Prisma
// column writer lives with the other stamp columns in src/lib/drafts/revisions.ts.

/** The MOCK_PUPPETEER sentinel: a requested family whose name contains it is reported missing. */
export const MOCK_FONT_MISSING = '__MOCK_FONT_MISSING__'

/** Bound on the in-page font check (design 5.6). */
export const FONT_CHECK_TIMEOUT_MS = 3000

const MAX_FAMILIES = 20
const MAX_NAME = 120

export const renderNotesSchema = z
  .object({ fontsMissing: z.array(z.string().min(1).max(MAX_NAME)).min(1).max(MAX_FAMILIES) })
  .strict()

export type RenderNotes = z.infer<typeof renderNotesSchema>

/** The stamp from a render's `fontsMissing`: null when nothing is missing (or no check ran). */
export function renderNotesFrom(fontsMissing: readonly string[] | null | undefined): RenderNotes | null {
  const list = [...new Set((fontsMissing ?? []).filter((f) => typeof f === 'string' && f.trim()))]
    .map((f) => f.slice(0, MAX_NAME))
    .slice(0, MAX_FAMILIES)
  return list.length > 0 ? { fontsMissing: list } : null
}

/** The tolerant reader: a stored value that does not parse reads as null. */
export function parseRenderNotes(value: unknown): RenderNotes | null {
  const parsed = renderNotesSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** The mock renderer's check: the requested families whose names carry the sentinel. */
export function mockFontsMissing(html: string): string[] {
  return postFontFamiliesFromHtml(html).filter((f) => f.includes(MOCK_FONT_MISSING))
}
