// The facts check (027 FR-10): types and the stored shape. Pure and client-safe.
// The stored result holds only matched values (a number, date or time as
// written), a kind and a place; never caption text, brief text or a prompt
// (NFR-05).
import { z } from 'zod'

export const FACT_KINDS = ['tel', 'date', 'time', 'cur', 'pct', 'num'] as const
export type FactKind = (typeof FACT_KINDS)[number]

// 'headline' or a registry caption channel (CAPTION_CHANNELS: Instagram and
// LinkedIn; hidden legacy WhatsApp rows are never read).
export const FACT_WHERE = ['headline', 'INSTAGRAM', 'LINKEDIN'] as const
export type FactWhere = (typeof FACT_WHERE)[number]

// Caps (FR-10 "Size" and "Result").
export const MAX_FLAGS = 20
export const MAX_VALUE_CHARS = 40
export const MAX_REASON_CHARS = 120
export const MAX_SOURCES_CHARS = 200_000
export const MAX_TEXT_CHARS = 20_000

export interface CheckText {
  where: FactWhere
  text: string
}

export interface CheckInput {
  texts: CheckText[]
  sources: string[]
  /** The clock for `checkedAt`; tests pass a fixed date. */
  now?: Date
}

export interface Flag {
  kind: FactKind
  /** The matched span as written, at most 40 characters. */
  value: string
  where: FactWhere
}

export interface FactsCheck {
  v: 1
  status: 'clear' | 'flagged' | 'error'
  checkedAt: string
  flagged: Flag[]
  /** Only when status is 'error'; at most 120 characters. */
  reason?: string
}

export const factsCheckSchema = z
  .object({
    v: z.literal(1),
    status: z.enum(['clear', 'flagged', 'error']),
    checkedAt: z.string().min(1),
    flagged: z
      .array(
        z
          .object({
            kind: z.enum(FACT_KINDS),
            value: z.string().max(MAX_VALUE_CHARS),
            where: z.enum(FACT_WHERE),
          })
          .strict(),
      )
      .max(MAX_FLAGS),
    reason: z.string().max(MAX_REASON_CHARS).optional(),
  })
  .strict()

/** Reads a stored `Draft.factsCheck`; null when absent or not this shape. Never throws. */
export function parseFactsCheck(raw: unknown): FactsCheck | null {
  const parsed = factsCheckSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** One extracted value, before the support rule. */
export interface ExtractedValue {
  kind: FactKind
  /** Normalised, lower-case key: `tel:<digits>`, `cur:<amount>`, ... */
  key: string
  /** The matched span as written, trimmed and cut at 40 characters. */
  value: string
  /** Offset in the (length-preserving) cleaned text. */
  index: number
  /** Canonical amount, for cur, pct and num. */
  amount?: string
  /** Named dates: the month (1 to 12), the day and the year ('' when absent). */
  month?: number
  day?: number
  year?: string
}
