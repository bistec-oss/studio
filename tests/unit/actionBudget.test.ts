// 008 T9 — AC-09 (FR-12): the per-action time budget is a unit gate.
//
// Every long action writes liveness at fixed points; the time between two of
// them must stay under the 15-minute bound that would otherwise declare the
// work dead (the draft sweep, or the scheduler lease), with a 60 s margin.
// actionBudgetViolations sums each segment with the largest timeout of every
// model eligible for its surface, in both modes. The real catalogue must have
// no violation; a planted slow model must be caught in exactly the segments
// it runs in. No clock is involved.

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({ openAiOptions: [] as unknown[] }))
// The image step's bound must be the one the OpenAI client really gets.
vi.mock('openai', () => ({
  default: class {
    images = { generate: vi.fn() }
    constructor(options: unknown) {
      h.openAiOptions.push(options)
    }
  },
}))

const { CATALOGUE } = await import('@/lib/models/catalogue')
type Catalogue = import('@/lib/models/catalogue').Catalogue
const { STEP_BUDGETS, MARGIN_MS, RENDER_ALLOWANCE_MS, actionSegments, actionBudgetViolations, segmentWorstCase } =
  await import('@/lib/models/budget')
const { STUCK_GENERATION_MS } = await import('@/lib/drafts/recovery')
const { GENERATION_LEASE_MS } = await import('@/lib/scheduler/generationRunner')
const { SET_CONTENT_TIMEOUT_MS, HERO_CHECK_TIMEOUT_MS } = await import('@/lib/renderer/puppeteer')
const { LAYOUT_OBSERVE_TIMEOUT_MS } = await import('@/lib/renderer/layoutFacts')
const { TX_MAX_WAIT_MS } = await import('@/lib/drafts/revisions')
const { IMAGE_GENERATION_TIMEOUT_MS } = await import('@/providers/imageCapabilities')
const { OpenAIImageProvider } = await import('@/providers/implementations/image/openai')

const src = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

/** A copy of the catalogue with one model's surface timeout replaced. */
function planted(key: string, surface: string, seconds: number): Catalogue {
  return CATALOGUE.map((e) =>
    e.key === key ? { ...e, surfaces: { ...e.surfaces, [surface]: { timeoutMs: seconds * 1000 } } } : e,
  )
}

const names = (violations: Array<{ action: string; segment: string }>) =>
  violations.map((v) => `${v.action}: ${v.segment}`).sort()

describe('the real catalogue fits every segment (design §5)', () => {
  it('actionBudgetViolations(CATALOGUE, STEP_BUDGETS) returns []', () => {
    expect(actionBudgetViolations(CATALOGUE, STEP_BUDGETS)).toEqual([])
  })

  // design §5's "worst case at the placeholders" column, in seconds. One
  // departure: the scheduler's last segment is 830 here (design 820 + post-
  // action 0 + the completing write 10), which the table rounds to ≈ 840.
  // 009 T4: a hero image adds its pixel check (20 s) to the two background
  // segments and its layout observation (15 s) to the two design segments;
  // the scheduler's rows are unchanged (its briefs are always classic).
  it('each segment’s worst case is the one design §5 states', () => {
    const worst = Object.fromEntries(
      actionSegments().map((s) => {
        const w = segmentWorstCase(s, CATALOGUE, STEP_BUDGETS)
        return [`${s.action}: ${s.segment}`, `${w.worstMs / 1000} ${w.mode}`]
      }),
    )
    expect(worst).toEqual({
      'Async generation: create → captions saved (headline write)': '240 api',
      'Async generation: captions saved → pre-design touch': '230 api',
      'Async generation: pre-design touch → finalize': '835 api',
      'Regenerate design: claim → pre-design touch': '230 api',
      'Regenerate design: pre-design touch → settle': '835 api',
      'Refine: claim → attempt-1 touch': '210 api',
      'Refine: attempt-1 touch → attempt-2 touch': '810 api',
      'Refine: attempt-2 touch → pre-commit touch': '810 api',
      'Refine: pre-commit touch → settle': '100 api',
      'Regenerate copy: claim → settle': '250 api',
      'Scheduled generation: lease renew at entry start → renew before design': '450 api',
      'Scheduled generation: renew before design → complete': '830 api',
    })
  })

  it('CLI mode is modelled too (in-process render, no tool tail), and sits under API mode', () => {
    const design = actionSegments().find((s) => s.segment === 'pre-design touch → finalize')!
    const cliOnly = { ...design, api: [] }
    expect(segmentWorstCase(cliOnly, CATALOGUE, STEP_BUDGETS)).toEqual({ worstMs: 715_000, mode: 'cli' })
  })
})

describe('a planted slow model is caught where it runs (AC-09)', () => {
  it('Opus DESIGN_FREEFORM at 800 s: the async-generation and regenerate-design design segments, and the scheduler’s', () => {
    expect(names(actionBudgetViolations(planted('OPUS', 'DESIGN_FREEFORM', 800), STEP_BUDGETS))).toEqual([
      'Async generation: pre-design touch → finalize',
      'Regenerate design: pre-design touch → settle',
      'Scheduled generation: renew before design → complete',
    ])
  })

  it('REFINE at 800 s: both refine attempt segments', () => {
    expect(names(actionBudgetViolations(planted('OPUS', 'REFINE', 800), STEP_BUDGETS))).toEqual([
      'Refine: attempt-1 touch → attempt-2 touch',
      'Refine: attempt-2 touch → pre-commit touch',
    ])
  })

  it('Opus REFINE at 600 s is over by the API tool tail (why the catalogue says 540)', () => {
    expect(names(actionBudgetViolations(planted('OPUS', 'REFINE', 600), STEP_BUDGETS))).toHaveLength(2)
  })

  it('a violation names its segment, the worst case, the margin and the limit', () => {
    const [v] = actionBudgetViolations(planted('OPUS', 'CAPTION', 900), STEP_BUDGETS).filter(
      (x) => x.action === 'Regenerate copy',
    )
    expect(v).toMatchObject({
      segment: 'claim → settle',
      mode: 'api',
      worstMs: 910_000,
      marginMs: 60_000,
      limit: 'STUCK_GENERATION_MS',
      limitMs: STUCK_GENERATION_MS,
    })
    expect(v.message).toBe(
      'Regenerate copy: claim → settle (api) worst case 910 s + 60 s margin > STUCK_GENERATION_MS 900 s',
    )
  })

  it('exactly at the limit passes (worst + margin > limit is the rule)', () => {
    // 840 + 60 = 900: the scheduler's last segment with 10 s more design time.
    const steps = { ...STEP_BUDGETS, postActionMs: 10_000 }
    expect(actionBudgetViolations(CATALOGUE, steps)).toEqual([])
    expect(names(actionBudgetViolations(CATALOGUE, { ...steps, postActionMs: 10_001 }))).toEqual([
      'Scheduled generation: renew before design → complete',
    ])
  })

  it('a slower fixed step is caught as well', () => {
    expect(actionBudgetViolations(CATALOGUE, { ...STEP_BUDGETS, imageMs: 700_000 })).not.toEqual([])
  })
})

describe('every bound is imported from where it is enforced, never copied', () => {
  it('the limits are STUCK_GENERATION_MS (draft actions) and GENERATION_LEASE_MS (the scheduler)', () => {
    for (const s of actionSegments()) {
      expect(s.limitMs).toBe(s.action === 'Scheduled generation' ? GENERATION_LEASE_MS : STUCK_GENERATION_MS)
    }
  })

  it('the fixed steps are their homes’ constants', () => {
    expect(STEP_BUDGETS).toEqual({
      imageMs: IMAGE_GENERATION_TIMEOUT_MS,
      renderMs: SET_CONTENT_TIMEOUT_MS + RENDER_ALLOWANCE_MS,
      heroCheckMs: HERO_CHECK_TIMEOUT_MS,
      layoutMeasureMs: LAYOUT_OBSERVE_TIMEOUT_MS,
      txMs: TX_MAX_WAIT_MS,
      apiToolTailDesignMs: IMAGE_GENERATION_TIMEOUT_MS + SET_CONTENT_TIMEOUT_MS + RENDER_ALLOWANCE_MS,
      apiToolTailRefineMs: IMAGE_GENERATION_TIMEOUT_MS,
      postActionMs: 0,
      marginMs: MARGIN_MS,
    })
    expect([IMAGE_GENERATION_TIMEOUT_MS, SET_CONTENT_TIMEOUT_MS, TX_MAX_WAIT_MS, MARGIN_MS]).toEqual([
      120_000, 60_000, 10_000, 60_000,
    ])
    // 009: the two hero steps are bounded by their own timers, not by setContent's cap.
    expect([HERO_CHECK_TIMEOUT_MS, LAYOUT_OBSERVE_TIMEOUT_MS]).toEqual([20_000, 15_000])
  })

  it('budget.ts imports the limits and steps and holds no copy of them (no 15-minute or model-timeout literal)', () => {
    const budget = src('src/lib/models/budget.ts')
    for (const [name, home] of [
      ['STUCK_GENERATION_MS', '@/lib/drafts/recovery'],
      ['GENERATION_LEASE_MS', '@/lib/scheduler/generationRunner'],
      ['HERO_CHECK_TIMEOUT_MS, SET_CONTENT_TIMEOUT_MS', '@/lib/renderer/puppeteer'],
      ['LAYOUT_OBSERVE_TIMEOUT_MS', '@/lib/renderer/layoutFacts'],
      ['TX_MAX_WAIT_MS', '@/lib/drafts/revisions'],
      ['IMAGE_GENERATION_TIMEOUT_MS', '@/providers/imageCapabilities'],
    ]) {
      expect(budget).toMatch(new RegExp(`import \\{ ${name} \\} from '${home}'`))
    }
    const code = budget
      .split(/\r?\n/)
      .filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l))
      .join('\n')
    expect(code).not.toMatch(/15\s*\*\s*60|900_?000/)
    // The only numbers it owns: the margin and the screenshot/upload allowance.
    expect(code.split('\n').filter((l) => /\d+_000/.test(l))).toEqual([
      'export const RENDER_ALLOWANCE_MS = 30_000',
      'export const MARGIN_MS = 60_000',
    ])
  })

  it('the OpenAI image client gets IMAGE_GENERATION_TIMEOUT_MS and no retries; Gemini shares the constant', () => {
    new OpenAIImageProvider('sk-FAKE')
    expect(h.openAiOptions.at(-1)).toEqual({ apiKey: 'sk-FAKE', timeout: IMAGE_GENERATION_TIMEOUT_MS, maxRetries: 0 })
    const gemini = src('src/providers/implementations/image/gemini.ts')
    expect(gemini).toMatch(/import \{ IMAGE_GENERATION_TIMEOUT_MS, type ImageTier \} from "\.\.\/\.\.\/imageCapabilities"/)
    expect(gemini).not.toMatch(/120_000/)
  })
})
