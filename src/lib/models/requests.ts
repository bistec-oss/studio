// The `model` request fields (008 FR-17): how a route reads an explicit model
// pick from its body, and the 400 it answers when the pick is refused.
//
// The order every route follows (design §3): parse → resolve → claim. The body
// is parsed here (an unknown key → 400 now); the pick is then resolved as tier 1
// of decideModel (resolveModel's `requested`), and a refusal is a 400 BEFORE
// any claim, so a refused pick claims nothing. A stored value, a stamp or a
// default that misses is never this path: those fall through as substitutions.
//
// Pure and client-safe (zod + the catalogue): the brief-draft autosave schema
// (brief/briefDraftPayload.ts), which the wizard imports, reuses modelKeySchema.

import { z } from 'zod'
import { MODEL_KEYS, type ModelKey } from './catalogue'

/** The `code` of every model-pick 400 (FR-17). */
export const MODEL_NOT_ALLOWED = 'MODEL_NOT_ALLOWED' as const

const orList = (values: readonly string[]) =>
  values.length > 1
    ? `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`
    : values[0]

/** FR-17 UNKNOWN_MODEL: the enum message, naming the field ("model must be HAIKU, SONNET or OPUS"). */
export const modelKeyMessage = (field = 'model') => `${field} must be ${orList(MODEL_KEYS)}`

const keySchema = (field: string) =>
  z.enum(MODEL_KEYS, { errorMap: () => ({ message: modelKeyMessage(field) }) })

/** A closed ModelKey, case-sensitive: 'opus' and 'gpt-4o' are refused. */
export const modelKeySchema = keySchema('model')

/**
 * Which pick a POST /api/briefs refusal is about: that route takes two, so its
 * 400 names the field and the wizard shows the message on that picker (T15).
 * Routes with a single `model` field leave it out.
 */
export type ModelErrorField = 'captionModel' | 'designModel'

/** The 400 body of a refused pick. */
export interface ModelErrorBody {
  error: string
  code: typeof MODEL_NOT_ALLOWED
  field?: ModelErrorField
}

/**
 * A failed decideModel (or an AssistantModelError, or a bad key) → FR-17's 400
 * body: `{ error: <message>, code: 'MODEL_NOT_ALLOWED' }`, plus `field` when
 * given. The messages are decideModel's own (resolve.ts refuseRequest). Callers
 * send it with status 400, and only for an EXPLICIT pick — a resolution that
 * fails without one keeps its 422 (NO_ALLOWED_MODEL, wave 1).
 */
export function modelError(failure: { message: string }, field?: ModelErrorField): ModelErrorBody {
  return { error: failure.message, code: MODEL_NOT_ALLOWED, ...(field ? { field } : {}) }
}

/**
 * Spec open question 1 (the approved default): a team whose caption provider
 * isn't Claude (an OpenAI COPY provider) can't choose the caption model, so an
 * explicit caption pick is refused — before resolution and before any claim.
 * Whether the provider is Claude comes from providers/registry.ts
 * copyProviderIsClaude, the same lookup the caption run uses.
 */
export const CAPTION_PROVIDER_NOT_CLAUDE_MESSAGE =
  "This team's caption provider is not Claude, so the caption model can't be chosen"

export const captionProviderNotClaudeError = (field?: ModelErrorField): ModelErrorBody =>
  modelError({ message: CAPTION_PROVIDER_NOT_CLAUDE_MESSAGE }, field)

export type ModelFieldResult =
  { ok: true; value: ModelKey | undefined } | { ok: false; body: ModelErrorBody }

/**
 * One optional model field of a body: absent → undefined (no pick, so the
 * server resolves the default — A5); a closed key → that key; anything else,
 * null included → the 400 body.
 */
export function parseModelField(value: unknown, field = 'model'): ModelFieldResult {
  if (value === undefined) return { ok: true, value: undefined }
  const parsed = keySchema(field).safeParse(value)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, body: modelError({ message: parsed.error.issues[0].message }) }
}

// ── POST /api/drafts/[id]/regenerate-design ─────────────────────────────────

export const REGENERATE_DESIGN_SHAPE_MESSAGE = 'Send {} or { model }'

const regenerateDesignSchema = z
  .object(
    { model: z.unknown().optional() },
    {
      errorMap: (issue, ctx) =>
        issue.code === 'invalid_type'
          ? { message: REGENERATE_DESIGN_SHAPE_MESSAGE }
          : { message: ctx.defaultError },
    },
  )
  .strict(REGENERATE_DESIGN_SHAPE_MESSAGE)

/**
 * The regenerate-design body: {} (an empty body reads as {}) or { model }.
 * Strict, like regenerate-copy's: any other key, or a non-object, is a 400.
 */
export function parseRegenerateDesignBody(
  raw: unknown,
):
  | { ok: true; model: ModelKey | undefined }
  | { ok: false; body: { error: string } | ModelErrorBody } {
  const shape = regenerateDesignSchema.safeParse(raw)
  if (!shape.success) return { ok: false, body: { error: shape.error.issues[0].message } }
  const pick = parseModelField(shape.data.model)
  return pick.ok ? { ok: true, model: pick.value } : pick
}
