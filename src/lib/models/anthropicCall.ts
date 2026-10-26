// The one SDK boundary (008 FR-07, design §6): every Anthropic Messages call
// goes through createMessage with a ResolvedModel, so the model string, the
// max_tokens floor, the wall-clock bound and the refusal check can't drift
// between call sites.
//
// SDK 0.30.1 (A12: no upgrade) predates adaptive thinking and the `refusal`
// stop reason, so both are handled by reading content blocks by type and by
// comparing stop_reason as a string.

import type Anthropic from '@anthropic-ai/sdk'
import type {
  Message,
  MessageCreateParamsNonStreaming,
  TextBlock,
} from '@anthropic-ai/sdk/resources/messages'
import type { ResolvedModel } from './resolve'
import { modelCallFor, recordModelCall } from './modelCalls'
import { addUsage } from '@/lib/analytics/trace'

/**
 * The model declined the request (stop_reason "refusal"). There is no
 * server-side fallback to another model (A13): that would run a model nobody
 * chose. humanizeGenerationError passes this message through unchanged.
 */
export class ModelRefusalError extends Error {
  constructor(public category: string | null) {
    super(`The model declined this request (${category ?? 'no category'}).`)
    this.name = 'ModelRefusalError'
  }
}

export interface CreateMessageOptions {
  /**
   * An absolute epoch-ms deadline (a multi-call loop's shared budget). When
   * set it replaces the entry's surface timeout; clamped to at least 1 ms.
   */
  deadlineAt?: number
  /** Diagnostic tag for the recorder. */
  label?: string
}

/**
 * One Messages call on a ResolvedModel:
 *   1. records the call (before the request);
 *   2. `model` is model.arg — the only model string this boundary passes;
 *   3. `max_tokens` is raised to the entry's apiMaxTokensFloor (thinking
 *      models spend thinking from the same cap, open question 4);
 *   4. an AbortSignal fires at the deadline, so the SDK's default retries all
 *      fit inside it (open question 3); a request still running then fails as
 *      a timeout;
 *   5. stop_reason "refusal" throws ModelRefusalError.
 */
export async function createMessage(
  client: Anthropic,
  params: Omit<MessageCreateParamsNonStreaming, 'model'>,
  model: ResolvedModel,
  opts: CreateMessageOptions = {},
): Promise<Message> {
  recordModelCall(modelCallFor(model, 'api', opts.label))

  const ms =
    opts.deadlineAt !== undefined ? Math.max(1, opts.deadlineAt - Date.now()) : model.timeoutMs
  // A controller + setTimeout rather than AbortSignal.timeout(): the latter
  // runs on Node's internal timers, which no fake timer can drive (AC-13).
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  let message: Message
  try {
    message = await client.messages.create(
      {
        ...params,
        model: model.arg,
        max_tokens: Math.max(params.max_tokens, model.entry.apiMaxTokensFloor ?? 0),
      },
      { signal: controller.signal },
    )
  } catch (err) {
    // The SDK reports our abort as "Request was aborted."; say what happened,
    // in the words humanizeGenerationError already maps to its timeout message.
    if (controller.signal.aborted) {
      throw new Error(`Claude API request timed out after ${ms}ms`, { cause: err })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if ((message.stop_reason as string | null) === 'refusal') {
    // stop_details is newer than 0.30.1's types: read it defensively.
    const category = (message as unknown as { stop_details?: { category?: unknown } | null })
      .stop_details?.category
    throw new ModelRefusalError(typeof category === 'string' && category ? category : null)
  }
  // 006 FR-09: counted only inside an emitter's accumulator; a no-op otherwise.
  addUsage(message.usage)
  return message
}

/**
 * The reply text: every `text` block, joined. A thinking model's first block is
 * a `thinking` block, so never read content[0].
 */
export function textOf(message: Pick<Message, 'content'>): string {
  return message.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}
