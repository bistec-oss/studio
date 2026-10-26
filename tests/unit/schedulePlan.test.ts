// 031 FR-30, FR-31 (AC-29): the briefing assistant's schedule grammar. The
// parser keeps an active post style, replaces a missing/unknown/retired key with
// the campaign default (or general), maps a legacy goal, and the prompt lists
// the styles of the source it is given.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import {
  extractSchedulePlan,
  normalisePlan,
  scheduleGrammarText,
  type RawSchedulePlanItem,
} from '@/lib/campaign/briefingAssistant'
import { activeStyles, type PostStyle } from '@/lib/postStyles'

const item = (over: Partial<RawSchedulePlanItem> = {}): RawSchedulePlanItem => ({
  topic: 't',
  tone: 'professional',
  daysFromNow: 1,
  postAction: 'HOLD',
  ...over,
})

const real = activeStyles()
const retired: PostStyle = { ...real.find((s) => s.key === 'tip')!, key: 'tip' as PostStyle['key'], status: 'retired' }
const withoutTip = real.filter((s) => s.key !== 'tip')

describe('normalisePlan (AC-29)', () => {
  it('keeps an active key and sets no styleReplaced', () => {
    const [r] = normalisePlan([item({ postStyle: 'launch' })], { defaultStyle: 'event' })
    expect(r.postStyle).toBe('launch')
    expect(r.styleReplaced).toBeUndefined()
  })

  it('replaces an unknown key with the campaign default and records the proposal', () => {
    const [r] = normalisePlan([item({ postStyle: 'flash-sale' })], { defaultStyle: 'event' })
    expect(r.postStyle).toBe('event')
    expect(r.styleReplaced).toEqual({ proposed: 'flash-sale' })
  })

  it('falls to general when there is no campaign default', () => {
    const [r] = normalisePlan([item({ postStyle: 'flash-sale' })], { defaultStyle: null })
    expect(r.postStyle).toBe('general')
  })

  it('replaces a retired key (not in the active list)', () => {
    expect(retired.status).toBe('retired')
    const [r] = normalisePlan([item({ postStyle: 'tip' })], { defaultStyle: null, styles: withoutTip })
    expect(r.postStyle).toBe('general')
    expect(r.styleReplaced).toEqual({ proposed: 'tip' })
  })

  it('does not trust a retired campaign default', () => {
    const [r] = normalisePlan([item({ postStyle: 'x' })], { defaultStyle: 'tip', styles: withoutTip })
    expect(r.postStyle).toBe('general')
  })

  it('a missing key takes the default without a styleReplaced', () => {
    const [r] = normalisePlan([item()], { defaultStyle: 'event' })
    expect(r.postStyle).toBe('event')
    expect(r.styleReplaced).toBeUndefined()
  })

  it('maps a legacy goal when postStyle is absent, and ignores it when present', () => {
    const [a, b] = normalisePlan(
      [item({ goal: 'hiring' }), item({ goal: 'hiring', postStyle: 'launch' })],
      { defaultStyle: null },
    )
    expect(a.postStyle).toBe('hiring')
    expect(b.postStyle).toBe('launch')
    expect('goal' in a).toBe(false)
  })

  it('the parser itself no longer defaults a goal and passes postStyle through', () => {
    const plan = extractSchedulePlan('```schedule\n{"posts":[{"topic":"a","postStyle":"launch"}]}\n```')
    expect(plan![0].postStyle).toBe('launch')
    expect(plan![0].goal).toBeUndefined()
  })

  it('a non-string or over-long postStyle does not drop the plan; the long key is replaced and capped', () => {
    const long = 'x'.repeat(60)
    const raw = extractSchedulePlan(
      `\`\`\`schedule\n{"posts":[{"topic":"a","postStyle":7},{"topic":"b","postStyle":"${long}"}]}\n\`\`\``,
    )
    expect(raw).toHaveLength(2)
    const [a, b] = normalisePlan(raw!, { defaultStyle: null })
    expect(a.postStyle).toBe('general')
    expect(a.styleReplaced).toBeUndefined()
    expect(b.postStyle).toBe('general')
    expect(b.styleReplaced).toEqual({ proposed: 'x'.repeat(40) })
  })
})

describe('scheduleGrammarText (FR-31)', () => {
  it('lists the active styles with key, label and summary', () => {
    const text = scheduleGrammarText()
    for (const s of real) expect(text).toContain(`- ${s.key}: ${s.label}. ${s.summary}`)
  })

  it('lists the styles of the source it is given, not a literal list', () => {
    const fake: PostStyle = { ...real[0], key: 'zz-fake' as PostStyle['key'], label: 'Zed fake', summary: 'A fake summary.' }
    const text = scheduleGrammarText(activeStyles({ 'zz-fake': fake }))
    expect(text).toContain('- zz-fake: Zed fake. A fake summary.')
    expect(text).not.toContain('- launch:')
  })
})
