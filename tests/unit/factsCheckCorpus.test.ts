// 027 FR-10 / AC-10 / AC-19: the seeded acceptance bar. For every case the
// flagged set equals the expected set exactly, and the check is fast on the
// largest allowed input.
import { describe, it, expect } from 'vitest'
import { checkFactsWithKeys } from '@/lib/factsCheck'
import { FACTS_CORPUS } from './fixtures/factsCorpus'

const NOW = new Date('2026-10-24T00:00:00.000Z')

describe('AC-10: the seeded corpus', () => {
  it('has at least 24 cases with unique names', () => {
    expect(FACTS_CORPUS.length).toBeGreaterThanOrEqual(24)
    expect(new Set(FACTS_CORPUS.map((c) => c.name)).size).toBe(FACTS_CORPUS.length)
  })

  it.each(FACTS_CORPUS.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const { check, keys } = checkFactsWithKeys({ texts: c.texts, sources: c.sources, now: NOW })
    const got = keys.map((k) => `${k.where}|${k.key}`).sort()
    const want = c.expected.map((k) => `${k.where}|${k.key}`).sort()
    expect(got).toEqual(want)
    expect(check.status).toBe(want.length > 0 ? 'flagged' : 'clear')
    expect(check.flagged).toHaveLength(want.length)
    for (const f of check.flagged) expect(f.value.length).toBeLessThanOrEqual(40)
  })

  it('covers every kind in the headline and in each caption', () => {
    const flagged = FACTS_CORPUS.flatMap((c) => c.expected)
    const kinds = new Set(flagged.map((f) => f.key.split(':')[0]))
    for (const k of ['tel', 'date', 'time', 'cur', 'pct', 'num']) expect(kinds.has(k), k).toBe(true)
    for (const w of ['headline', 'INSTAGRAM', 'LINKEDIN'])
      expect(
        flagged.some((f) => f.where === w),
        w,
      ).toBe(true)
  })

  it('every flag stores the matched value only, never caption text', () => {
    for (const c of FACTS_CORPUS) {
      const { check } = checkFactsWithKeys({ texts: c.texts, sources: c.sources, now: NOW })
      const json = JSON.stringify(check)
      for (const t of c.texts) if (t.text.length > 45) expect(json).not.toContain(t.text)
      expect(Object.keys(check).sort()).toEqual(
        check.status === 'error'
          ? ['checkedAt', 'flagged', 'reason', 'status', 'v']
          : ['checkedAt', 'flagged', 'status', 'v'],
      )
    }
  })
})

describe('AC-19 / NFR-06: the check is fast on the maximum input', () => {
  const pathological = (n: number) =>
    [
      '1,1,1,',
      '((((((',
      '+1 1 1 1 ',
      '1.1.1.1.',
      '$1$1$1',
      '15 March ',
      'a@b.c.',
      '#1#1',
      '１٣௩ ',
    ].map((unit) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n))

  it('200 000 characters of sources and three texts of 20 000 finish well inside the bound', () => {
    const texts = pathological(20_000)
    const input = {
      sources: [...pathological(22_222)].slice(0, 9),
      texts: [
        { where: 'headline' as const, text: texts[0] },
        { where: 'INSTAGRAM' as const, text: texts[1] + texts[3] },
        { where: 'LINKEDIN' as const, text: texts[2] + texts[5] },
      ],
      now: NOW,
    }
    expect(input.sources.join('').length).toBeGreaterThan(190_000)
    // Warm the regexes, then measure.
    checkFactsWithKeys(input)
    // ~50 ms is the local measurement; the bound is generous for CI noise, and a
    // quadratic regression lands near 250 ms+ at 20k chars. Minimum of 3 runs.
    let check = checkFactsWithKeys(input).check
    let ms = Infinity
    for (let i = 0; i < 3; i++) {
      const start = performance.now()
      check = checkFactsWithKeys(input).check
      ms = Math.min(ms, performance.now() - start)
    }
    expect(ms).toBeLessThan(250)
    expect(check.status).not.toBe('error')
    expect(check.flagged.length).toBeLessThanOrEqual(20)
  })

  it('a worst-case single repeated run per pattern stays linear', () => {
    for (const unit of ['1,', '((', '+1 ', '1.', '$', '15 ', '@', '#1', '9:', '5 ', '\n1.'])
      for (const text of [unit.repeat(10_000), unit.repeat(20_000).slice(0, 20_000)]) {
        // Minimum of 3 runs; see the bound note above.
        let ms = Infinity
        for (let i = 0; i < 3; i++) {
          const start = performance.now()
          checkFactsWithKeys({ texts: [{ where: 'headline', text }], sources: [text] })
          ms = Math.min(ms, performance.now() - start)
        }
        expect(ms, JSON.stringify(unit)).toBeLessThan(250)
      }
  })
})
