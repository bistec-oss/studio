// The rendered-text stamp (030 FR-02, D4): which text the real render painted,
// keyed by field so a later on-image field is one more optional key with no
// migration. Pure: zod, HEADLINE_MAX and the Prisma namespace only.
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { HEADLINE_MAX } from '@/lib/captions/headline'
import { UNVERIFIED_REASONS, type HeadlineCheck } from './vocab'

const headlineEntry = z.discriminatedUnion('verified', [
  z.object({ text: z.string().max(HEADLINE_MAX), verified: z.literal(true) }).strict(),
  z
    .object({
      text: z.string().max(HEADLINE_MAX),
      verified: z.literal(false),
      reason: z.enum(UNVERIFIED_REASONS),
    })
    .strict(),
])

export const renderedTextSchema = z.object({ headline: headlineEntry.optional() }).strict()

export type RenderedText = z.infer<typeof renderedTextSchema>

// The tolerant reader: a stored value that does not parse reads as null.
export function parseRenderedText(value: unknown): RenderedText | null {
  const parsed = renderedTextSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

// The strict writer: a bad stamp fails loudly here, never in a row.
export function renderedTextColumn(
  stamp: RenderedText | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return stamp ? (renderedTextSchema.parse(stamp) as Prisma.InputJsonValue) : Prisma.DbNull
}

// The check's result becomes the stamp. `text` is cut defensively: a brief topic
// used as the fallback headline can be longer than HEADLINE_MAX.
export function stampFromCheck(text: string, check: HeadlineCheck): RenderedText {
  const cut = text.slice(0, HEADLINE_MAX)
  return check === 'painted'
    ? { headline: { text: cut, verified: true } }
    : { headline: { text: cut, verified: false, reason: check } }
}
