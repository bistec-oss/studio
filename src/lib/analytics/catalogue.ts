// The analytics event catalogue (006 FR-02): every event name, the sources and
// outcomes it may carry, its zod payload schema and its schemaVersion. Pure
// (zod, Prisma enums and the shared vocabularies; no I/O), so the coverage test
// can read it without a database.
//
// Rules for changing this file (006 FR-02, FR-13):
//   - A payload change only ADDS optional fields. Renaming or removing a field,
//     or changing what one means, bumps that event's schemaVersion, and the
//     queries read by version.
//   - Vocabularies are IMPORTED (Prisma enums, MODEL_KEYS, the instruction
//     classes, the 009 archetypes and fallback reasons), never copied, so a new
//     value cannot drift silently (tests/unit/analyticsCoverage.test.ts).
//   - A change that adds a draft action, a channel, a generation path or a
//     publish path OWNS its events: it adds them here, in the same change.
//   - No payload field holds prompt text, model output, a caption, the headline
//     or HTML (NFR-04). The one user text is `instruction`, capped. Unknown
//     keys are stripped by the schemas, so a stray field never reaches the row.
import { z } from 'zod'
import { AspectRatio, CaptionRoute, Channel, DraftAction } from '@prisma/client'
import type { AnalyticsSource } from '@prisma/client'
import { MODEL_KEYS } from '@/lib/models/catalogue'
import type { CaptionRoute as CaptionRouteStamp, RouteSetting } from '@/lib/models/route'
import { INSTRUCTION_CLASS_KEYS } from '@/lib/agent/instructionClasses'
import { archetypes, FALLBACK_REASONS, type ArchetypeKey } from '@/lib/designData'
import { POST_STYLE_KEYS } from '@/lib/postStyles'
import { redactText } from '@/lib/text/redact'
import { HEADLINE_CHECKS, HEADLINE_STATES } from '@/lib/renderedText/vocab'
import { APPLY_FAILURES, APPLY_FIELDS, APPLY_METHODS } from '@/lib/applyText/vocab'

export const INSTRUCTION_MAX = 2000
export const FAILURE_REASON_MAX = 500

// ── Vocabularies ───────────────────────────────────────────────────────────

// The dataset's own keys (the stamp's `classic` is the no-hero case).
const ARCHETYPE_KEYS = Object.keys(archetypes) as [ArchetypeKey, ...ArchetypeKey[]]
const APPLIED_ARCHETYPES = [...ARCHETYPE_KEYS, 'classic'] as [
  ArchetypeKey | 'classic',
  ...(ArchetypeKey | 'classic')[],
]

// 024's stamp strings that are not a setting. The type check keeps this list a
// subset of the stamp type; the runtime schema is CaptionRoute plus these.
const STAMP_ONLY_ROUTES = ['SERVER_KEY', 'OTHER'] as const satisfies readonly Exclude<
  CaptionRouteStamp,
  RouteSetting
>[]
const routeSchema = z.union([z.nativeEnum(CaptionRoute), z.enum(STAMP_ONLY_ROUTES)])

// ── Shared fragments ───────────────────────────────────────────────────────

// Cut, never rejected (FR-03).
const capped = (max: number) => z.string().transform((s) => s.slice(0, max))
// redactText runs first, so a credential cut in half by the cap cannot survive.
const failureReason = z.string().transform((s) => redactText(s).slice(0, FAILURE_REASON_MAX))
const tokens = z.number().int().min(0).nullable()

// What a model call resolved to: the catalogue key, the full id that ran (a
// stamp may hold a retired id, so the id is a bounded string, not an enum) and
// the id it was substituted from.
const modelFragment = z.object({
  model: z.enum(MODEL_KEYS).nullable().optional(),
  modelId: z.string().max(80).nullable().optional(),
  substitutedFrom: z.string().max(80).nullable().optional(),
})

const refineAttempt = z.object({
  classes: z.array(z.enum(INSTRUCTION_CLASS_KEYS)).max(4),
  effectiveClasses: z.array(z.enum(INSTRUCTION_CLASS_KEYS)).max(4),
  verdict: z.string().max(20),
  reasons: z.number().int().min(0),
})

// 027: the facts check's statuses, as stored on Draft.factsCheck.
export const FACTS_STATUSES = ['clear', 'flagged', 'error'] as const
const wizardStep = z.number().int().min(0).max(4)

// ── The events ─────────────────────────────────────────────────────────────

interface EventDef {
  schemaVersion: number
  source: readonly AnalyticsSource[]
  /** The values `outcome` may take; empty means the event has no outcome. */
  outcomes: readonly string[]
  schema: z.ZodTypeAny
}

export const CATALOGUE = {
  'generation.finished': {
    schemaVersion: 1,
    source: ['web', 'scheduler', 'mcp'],
    outcomes: ['ok', 'failed'],
    schema: z.object({
      path: z.enum(['A', 'B']).optional(),
      aspectRatio: z.nativeEnum(AspectRatio).optional(),
      captionModel: modelFragment.optional(),
      captionRoute: routeSchema.nullable().optional(),
      designModel: modelFragment.optional(),
      promptVersion: z.string().max(40).optional(),
      requestedArchetype: z.string().max(60).optional(),
      appliedArchetype: z.enum(APPLIED_ARCHETYPES).optional(),
      fallbackReason: z.enum(FALLBACK_REASONS).optional(),
      backgroundSkipped: z.boolean().optional(),
      failureReason: failureReason.optional(),
      inputTokens: tokens.optional(),
      outputTokens: tokens.optional(),
      postStyle: z.enum(POST_STYLE_KEYS).nullable().optional(),
      factsStatus: z.enum(FACTS_STATUSES).nullable().optional(),
      factsFlagCount: z.number().int().min(0).max(20).optional(),
      // 030 FR-17: the outcome of the final render's headline check.
      headlineCheck: z.enum(HEADLINE_CHECKS).optional(),
    }),
  },
  'generation.swept': {
    schemaVersion: 1,
    source: ['web'],
    outcomes: ['failed'],
    schema: z.object({ ageMs: z.number().int().min(0) }),
  },
  'draft_action.settled': {
    schemaVersion: 1,
    source: ['web'],
    outcomes: ['ok', 'not-applied', 'conflict', 'failed'],
    schema: z.object({
      action: z.nativeEnum(DraftAction),
      model: modelFragment.optional(),
      instruction: capped(INSTRUCTION_MAX).optional(),
      attempts: z.array(refineAttempt).max(2).optional(),
      refineCalls: z.number().int().min(0).max(2).optional(),
      verifierCalls: z.number().int().min(0).max(2).optional(),
      verifierModelId: z.string().max(80).optional(),
      verifierPromptVersion: z.string().max(40).optional(),
      failureReason: failureReason.optional(),
      inputTokens: tokens.optional(),
      outputTokens: tokens.optional(),
    }),
  },
  'draft_action.swept': {
    schemaVersion: 1,
    source: ['web'],
    outcomes: ['failed'],
    schema: z.object({ action: z.nativeEnum(DraftAction) }),
  },
  'revision.edited': {
    schemaVersion: 1,
    source: ['web'],
    outcomes: ['ok'],
    schema: z.object({ mode: z.enum(['document', 'element']) }),
  },
  'revision.override': { schemaVersion: 1, source: ['web'], outcomes: ['ok'], schema: z.object({}) },
  'revision.adopted': { schemaVersion: 1, source: ['web'], outcomes: ['ok'], schema: z.object({}) },
  'revision.restored': {
    schemaVersion: 1,
    source: ['web'],
    outcomes: ['ok'],
    schema: z.object({ from: z.number().int().min(0), to: z.number().int().min(0) }),
  },
  // 030 FR-15: a headline change, with how the image stands afterwards. No text.
  'draft.headline_edited': {
    schemaVersion: 1,
    source: ['web'],
    outcomes: [],
    schema: z.object({
      // 031 FR-43: 'apply' is additive; the schemaVersion stays.
      via: z.enum(['edit', 'regenerate', 'apply']),
      state: z.enum(HEADLINE_STATES),
      scheduledPending: z.boolean(),
    }),
  },
  // 031 FR-43: an Apply to image that reached a verdict. No text.
  'draft.text_applied': {
    schemaVersion: 1,
    source: ['web'],
    outcomes: ['ok', 'failed'],
    schema: z.object({
      field: z.enum(APPLY_FIELDS),
      method: z.enum(APPLY_METHODS),
      failure: z.enum(APPLY_FAILURES).optional(),
    }),
  },
  'publish.settled': {
    schemaVersion: 1,
    source: ['web', 'mcp', 'scheduler'],
    outcomes: ['published', 'failed', 'retry-scheduled'],
    schema: z.object({
      channel: z.nativeEnum(Channel),
      terminal: z.boolean(),
      retryCount: z.number().int().min(0).optional(),
      errorReason: failureReason.optional(),
      // 030 FR-16: what the image showed of the headline at the attempt.
      headlineState: z.enum(HEADLINE_STATES).optional(),
    }),
  },
  'scheduled_generation.settled': {
    schemaVersion: 1,
    source: ['scheduler'],
    outcomes: ['completed', 'retry', 'failed'],
    schema: z.object({
      retryCount: z.number().int().min(0).optional(),
      errorReason: failureReason.optional(),
      postStyle: z.enum(POST_STYLE_KEYS).nullable().optional(),
      held: z.boolean().optional(),
    }),
  },
  'wizard.step': {
    schemaVersion: 1,
    source: ['web'],
    outcomes: [],
    schema: z.object({ step: wizardStep, briefDraftId: z.string().max(64).nullable().optional() }),
  },
  'brief.submitted': {
    schemaVersion: 1,
    source: ['web'],
    outcomes: [],
    schema: z.object({
      path: z.enum(['A', 'B']).optional(),
      aspectRatio: z.nativeEnum(AspectRatio).optional(),
      imageStyle: z.enum(APPLIED_ARCHETYPES).optional(),
      resumed: z.boolean().optional(),
      postStyle: z.enum(POST_STYLE_KEYS).nullable().optional(),
    }),
  },
  'brief.abandoned': {
    schemaVersion: 1,
    source: ['web'],
    outcomes: [],
    schema: z.object({ reason: z.enum(['expired', 'discarded']), step: wizardStep.nullable().optional() }),
  },
} as const satisfies Record<string, EventDef>

export type EventName = keyof typeof CATALOGUE
export const EVENT_NAMES = Object.keys(CATALOGUE) as EventName[]

/** What a caller passes (before the schema's caps and redaction run). */
export type EventPayloadInput<N extends EventName> = z.input<(typeof CATALOGUE)[N]['schema']>

/** The events the browser may send through POST /api/events (006 FR-08). */
export const CLIENT_EVENTS = ['wizard.step'] as const satisfies readonly EventName[]
