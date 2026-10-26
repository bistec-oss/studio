// The caption call (012 FR-07/FR-08/FR-10, design §3): one provider call for
// the requested targets, then the pure extractor. Every writer — the async and
// sync generation, regenerate-copy and generate/copy — goes through
// writeCaptions, so the logging and the whole-reply failure mapping live once.
//
// The provider returns the RAW reply and never parses it; extractCaptionReply
// decides what is usable, field by field. A provider error (auth, timeout,
// network) is not a reply and propagates to the caller unchanged.

import type { BriefInput, CopyProvider } from '@/providers/interfaces/CopyProvider'
import { CAPTION_CHANNELS, type CaptionTarget } from '@/lib/channels'
import { extractCaptionReply, type FieldResult } from '@/lib/captions/extract'
import { CAPTION_PROMPT_VERSION } from '@/lib/agent/prompts/caption'
import type { ResolvedModel } from '@/lib/models/resolve'
import type { CaptionStamp } from '@/lib/captions/store'

export type CaptionFields = Partial<Record<CaptionTarget, FieldResult>>

// What a generation asks for: the headline and every registry channel (A5).
export const GENERATION_TARGETS: readonly CaptionTarget[] = [
  'HEADLINE',
  ...CAPTION_CHANNELS.map((s) => s.channel),
]

// How much discarded model text a log line carries.
const DISCARDED_LOG_MAX = 500

// One caption call's outcome: the per-field results, and the stamp (008 FR-08)
// the writers put on the fields that validated — never on a failed one.
export interface CaptionWrite {
  fields: CaptionFields
  stamp: CaptionStamp
}

// The stamp of one reply: the model ID that wrote it. substitutedFrom belongs
// to the resolved CAPTION model, so it is carried only when that model is the
// one that ran: a non-Claude provider (open question 1) ignored it, and
// recording a Claude substitution against gpt-4o's text would misattribute it.
function captionStamp(model: ResolvedModel, modelId: string, route: string | null): CaptionStamp {
  return { model: modelId, substitutedFrom: modelId === model.arg ? model.substitutedFrom : null, route }
}

export async function writeCaptions(
  provider: CopyProvider,
  brief: BriefInput,
  targets: readonly CaptionTarget[],
  // 008 FR-07: the CAPTION model, resolved by the caller (before any claim).
  model: ResolvedModel,
): Promise<CaptionWrite> {
  console.info(`[captions] caption call (prompt ${CAPTION_PROMPT_VERSION}) for ${targets.join(', ')}`)
  const reply = await provider.generateCaptions(brief, targets, model)
  const stamp = captionStamp(model, reply.modelId, reply.route)
  console.info(`[captions] route=${reply.route} model=${reply.modelId}`)
  const result = extractCaptionReply(reply.raw, targets)

  // JSON-quoted so a newline in model text can't forge a log line.
  if (result.discarded) {
    console.warn(`[captions] discarded reply text: ${JSON.stringify(result.discarded.slice(0, DISCARDED_LOG_MAX))}`)
  }
  if (result.ok) return { fields: result.fields, stamp }

  // A whole-reply failure fails every target, so callers handle one shape.
  console.warn(`[captions] reply rejected (${result.reason})`)
  return {
    fields: Object.fromEntries(targets.map((t) => [t, { ok: false, reason: result.reason }])),
    stamp,
  }
}

// A new generation never designs on nothing (A6): no valid headline fails the
// draft. The message is the user-facing FR-09 sentence, so
// humanizeGenerationError passes it through as the draft's failureReason.
export class HeadlineMissingError extends Error {
  constructor(public reason: string) {
    super(`The caption reply had no usable headline (${reason}). Retry to generate again.`)
    this.name = 'HeadlineMissingError'
  }
}

export function requireHeadline(fields: CaptionFields): string {
  const headline = fields.HEADLINE
  if (headline?.ok) return headline.text
  throw new HeadlineMissingError(headline?.reason ?? 'missing')
}
