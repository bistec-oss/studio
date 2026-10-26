// The per-action time budget (008 FR-12, design §5).
//
// Two lazy 15-minute bounds decide that work is dead: the draft sweep
// (STUCK_GENERATION_MS, drafts/recovery.ts) fails a generation, or clears an
// action, whose Draft.updatedAt has not moved for that long; the scheduler
// reclaims a RUNNING entry whose lease (GENERATION_LEASE_MS) has lapsed. Every
// long action therefore writes liveness at fixed points (the heartbeats and
// lease renewals), and the time between two of those writes is a SEGMENT. This
// module models each segment as the sum of its steps' bounds, with every model
// call at the LARGEST timeout of any model eligible for its surface, in both
// modes, and reports every segment whose worst case plus MARGIN_MS could reach
// its limit. tests/unit/actionBudget.test.ts asserts that the real catalogue
// has none, so a timeout edit (or a new model) that could let a sweep fire on
// live work fails at the unit gate.
//
// Every bound is imported from where it is enforced, never copied: the model
// timeouts come from the catalogue passed in, the fixed steps from their homes.
// Not bounded, as before: the renderer queue wait under
// PUPPETEER_MAX_CONCURRENCY. The margin absorbs a short wait.

import type { Catalogue, Surface } from '@/lib/models/catalogue'
import { IMAGE_GENERATION_TIMEOUT_MS } from '@/providers/imageCapabilities'
import { HERO_CHECK_TIMEOUT_MS, SET_CONTENT_TIMEOUT_MS } from '@/lib/renderer/puppeteer'
import { LAYOUT_OBSERVE_TIMEOUT_MS } from '@/lib/renderer/layoutFacts'
import { TX_MAX_WAIT_MS } from '@/lib/drafts/revisions'
import { STUCK_GENERATION_MS } from '@/lib/drafts/recovery'
import { GENERATION_LEASE_MS } from '@/lib/scheduler/generationRunner'

/** Screenshot + upload, beyond setContent's own bound. */
export const RENDER_ALLOWANCE_MS = 30_000
/** Headroom every segment must leave under its limit. */
export const MARGIN_MS = 60_000

/** The fixed (non-model) steps. Model steps (the background decision, the verifier) are catalogue surfaces. */
export interface StepBudgets {
  /** One image call: the OpenAI client timeout with no retries; Gemini's abort timer. */
  imageMs: number
  /** setContent + screenshot + upload. */
  renderMs: number
  /** 009: a hero image's pixel check (the sampler's own Promise.race bound). Classic skips it. */
  heroCheckMs: number
  /**
   * 009: the layout observation of a kept hero archetype, one more page load of
   * the final HTML, bounded by observeLayout's own timer (it records nothing on
   * expiry). It could not be sized like a render (setContent's 60 s plus the 30 s
   * allowance): that pushed the API-mode design segment to 910 s, over the
   * 900 s limit once the 60 s margin is kept. Classic skips it.
   */
  layoutMeasureMs: number
  /** A transaction's connection wait. */
  txMs: number
  /** API design loop: the tool work a turn can start just before its deadline (generateImage + renderHtml). */
  apiToolTailDesignMs: number
  /** API refine loop: image only (the refine tool list has no renderHtml). */
  apiToolTailRefineMs: number
  /** The scheduler's executePostAction: up to 3 Post inserts, DB only (design §5 decision: 0). */
  postActionMs: number
  marginMs: number
}

export const STEP_BUDGETS: StepBudgets = {
  imageMs: IMAGE_GENERATION_TIMEOUT_MS,
  renderMs: SET_CONTENT_TIMEOUT_MS + RENDER_ALLOWANCE_MS,
  heroCheckMs: HERO_CHECK_TIMEOUT_MS,
  layoutMeasureMs: LAYOUT_OBSERVE_TIMEOUT_MS,
  txMs: TX_MAX_WAIT_MS,
  apiToolTailDesignMs: IMAGE_GENERATION_TIMEOUT_MS + SET_CONTENT_TIMEOUT_MS + RENDER_ALLOWANCE_MS,
  apiToolTailRefineMs: IMAGE_GENERATION_TIMEOUT_MS,
  postActionMs: 0,
  marginMs: MARGIN_MS,
}

/** A model call (the largest timeout among the models eligible for any listed surface) or a fixed step. */
export type BudgetTerm = { model: readonly Surface[] } | { step: Exclude<keyof StepBudgets, 'marginMs'> }

export type BudgetLimit = 'STUCK_GENERATION_MS' | 'GENERATION_LEASE_MS'

export interface ActionSegment {
  action: string
  /** Between which two liveness writes. */
  segment: string
  limit: BudgetLimit
  limitMs: number
  /** The steps in each mode: CLI renders in-process, API carries a tool tail. */
  api: readonly BudgetTerm[]
  cli: readonly BudgetTerm[]
}

export interface BudgetViolation {
  action: string
  segment: string
  /** The mode whose sum is the worst case. */
  mode: 'api' | 'cli'
  worstMs: number
  marginMs: number
  limit: BudgetLimit
  limitMs: number
  message: string
}

const LIMIT_MS: Record<BudgetLimit, number> = {
  STUCK_GENERATION_MS,
  GENERATION_LEASE_MS,
}

const caption = { model: ['CAPTION'] } as const
const design = { model: ['DESIGN_TEMPLATE', 'DESIGN_FREEFORM'] } as const
const freeform = { model: ['DESIGN_FREEFORM'] } as const
const refine = { model: ['REFINE'] } as const
const backgroundDecision = { model: ['INTERNAL_BACKGROUND'] } as const
const verifier = { model: ['INTERNAL_VERIFIER'] } as const
const image = { step: 'imageMs' } as const
const render = { step: 'renderMs' } as const
const heroCheck = { step: 'heroCheckMs' } as const
const layoutMeasure = { step: 'layoutMeasureMs' } as const
const tx = { step: 'txMs' } as const
const toolTailDesign = { step: 'apiToolTailDesignMs' } as const
const toolTailRefine = { step: 'apiToolTailRefineMs' } as const
const postAction = { step: 'postActionMs' } as const

function seg(
  action: string,
  segment: string,
  limit: BudgetLimit,
  api: readonly BudgetTerm[],
  cli: readonly BudgetTerm[] = api,
): ActionSegment {
  return { action, segment, limit, limitMs: LIMIT_MS[limit], api, cli }
}

/**
 * Every row of design §5's liveness-segment table. Refine's "attempt touch →
 * next touch" row is listed once per attempt: attempt 1 → attempt 2, and
 * attempt 2 → the pre-settle touch (the same steps, two segments). Path A has
 * no background step, so the generation design segments cover both design
 * surfaces from the pre-design write on.
 */
export function actionSegments(): ActionSegment[] {
  const STUCK = 'STUCK_GENERATION_MS'
  const LEASE = 'GENERATION_LEASE_MS'
  const refineAttempt = {
    api: [refine, toolTailRefine, render, verifier],
    cli: [refine, render, verifier],
  }
  return [
    seg('Async generation', 'create → captions saved (headline write)', STUCK, [caption]),
    seg('Async generation', 'captions saved → pre-design touch', STUCK, [backgroundDecision, image, heroCheck]),
    seg(
      'Async generation',
      'pre-design touch → finalize',
      STUCK,
      [design, toolTailDesign, layoutMeasure, tx],
      [design, render, layoutMeasure, tx],
    ),
    seg('Regenerate design', 'claim → pre-design touch', STUCK, [backgroundDecision, image, heroCheck]),
    seg(
      'Regenerate design',
      'pre-design touch → settle',
      STUCK,
      [freeform, toolTailDesign, layoutMeasure, tx],
      [freeform, render, layoutMeasure, tx],
    ),
    seg('Refine', 'claim → attempt-1 touch', STUCK, [backgroundDecision, image]),
    seg('Refine', 'attempt-1 touch → attempt-2 touch', STUCK, refineAttempt.api, refineAttempt.cli),
    seg('Refine', 'attempt-2 touch → pre-commit touch', STUCK, refineAttempt.api, refineAttempt.cli),
    seg('Refine', 'pre-commit touch → settle', STUCK, [render, tx]),
    seg('Regenerate copy', 'claim → settle', STUCK, [caption, tx]),
    seg('Scheduled generation', 'lease renew at entry start → renew before design', LEASE, [
      caption,
      backgroundDecision,
      image,
    ]),
    seg(
      'Scheduled generation',
      'renew before design → complete',
      LEASE,
      [design, toolTailDesign, tx, postAction, tx],
      [design, render, tx, postAction, tx],
    ),
  ]
}

function termMs(term: BudgetTerm, catalogue: Catalogue, steps: StepBudgets): number {
  if ('step' in term) return steps[term.step]
  let worst = 0
  for (const entry of catalogue) {
    for (const surface of term.model) {
      worst = Math.max(worst, entry.surfaces[surface]?.timeoutMs ?? 0)
    }
  }
  return worst
}

/** A segment's worst case: the larger of its two modes' sums. */
export function segmentWorstCase(
  segment: ActionSegment,
  catalogue: Catalogue,
  steps: StepBudgets,
): { worstMs: number; mode: 'api' | 'cli' } {
  const sum = (terms: readonly BudgetTerm[]) => terms.reduce((n, t) => n + termMs(t, catalogue, steps), 0)
  const api = sum(segment.api)
  const cli = sum(segment.cli)
  return api >= cli ? { worstMs: api, mode: 'api' } : { worstMs: cli, mode: 'cli' }
}

const sec = (ms: number) => `${ms / 1000} s`

/** Every segment where worst + margin > limit ([] = the budget holds). Pure: no clock, no I/O. */
export function actionBudgetViolations(
  catalogue: Catalogue,
  steps: StepBudgets,
  segments: readonly ActionSegment[] = actionSegments(),
): BudgetViolation[] {
  const violations: BudgetViolation[] = []
  for (const s of segments) {
    const { worstMs, mode } = segmentWorstCase(s, catalogue, steps)
    if (worstMs + steps.marginMs <= s.limitMs) continue
    violations.push({
      action: s.action,
      segment: s.segment,
      mode,
      worstMs,
      marginMs: steps.marginMs,
      limit: s.limit,
      limitMs: s.limitMs,
      message:
        `${s.action}: ${s.segment} (${mode}) worst case ${sec(worstMs)} + ${sec(steps.marginMs)} margin ` +
        `> ${s.limit} ${sec(s.limitMs)}`,
    })
  }
  return violations
}
