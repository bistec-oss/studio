// 027 FR-10 / NFR-05: the support rule, the result shape and its caps.
import { describe, it, expect } from 'vitest'
import {
  checkFacts,
  checkFactsWithKeys,
  factsCheckError,
  parseFactsCheck,
  type CheckText,
} from '@/lib/factsCheck'

const NOW = new Date('2026-10-24T10:00:00.000Z')
const H = (text: string): CheckText[] => [{ where: 'headline', text }]
const IG = (text: string): CheckText[] => [{ where: 'INSTAGRAM', text }]
const flaggedKeys = (texts: CheckText[], sources: string[]) =>
  checkFactsWithKeys({ texts, sources, now: NOW }).keys.map((k) => k.key)

describe('the support rule', () => {
  it('kind-strict for money, percent, phones, times and numeric dates', () => {
    expect(flaggedKeys(IG('$49'), ['49 days'])).toEqual(['cur:49'])
    expect(flaggedKeys(IG('49%'), ['$49'])).toEqual(['pct:49'])
    expect(flaggedKeys(IG('$49'), ['49%'])).toEqual(['cur:49'])
    expect(flaggedKeys(H('From $49'), ['49 days'])).toEqual(['cur:49'])
    expect(flaggedKeys(IG('6:30 pm'), ['630'])).toEqual(['time:1110'])
    expect(flaggedKeys(IG('15/03/2027'), ['03/15/2027'])).toEqual(['date:n:15-3-2027'])
  })

  it('a bare number is widened by a currency, percent or number source of the same value', () => {
    expect(flaggedKeys(IG('50 students'), ['Price $50'])).toEqual([])
    expect(flaggedKeys(IG('50 students'), ['Save 50%'])).toEqual([])
    expect(flaggedKeys(IG('50 students'), ['50 places'])).toEqual([])
    expect(flaggedKeys(IG('51 students'), ['Price $50'])).toEqual(['num:51'])
  })

  it('a year outside a copyright line is flagged unless a source states it (A4)', () => {
    expect(flaggedKeys(IG('Join us in 2027'), ['No year here'])).toEqual(['num:2027'])
    expect(flaggedKeys(IG('Join us in 2027'), ['The 2027 intake'])).toEqual([])
    expect(flaggedKeys(IG('Join us in 2027'), ['Starts 15 March 2027'])).toEqual([])
  })

  it('a named date needs the source year to match when the source carries one', () => {
    expect(flaggedKeys(IG('15 March 2027'), ['15 March 2026'])).toEqual(['date:3-15-2027'])
    expect(flaggedKeys(IG('15 March 2027'), ['15 March'])).toEqual([])
    expect(flaggedKeys(IG('15 March'), ['March 15, 2027'])).toEqual([])
    expect(flaggedKeys(IG('16 March'), ['March 15, 2027'])).toEqual(['date:3-16'])
    expect(flaggedKeys(IG('15 March 2027'), ['15 March 2026', '15 March 2027'])).toEqual([])
  })

  it('sources are not stripped and not exempted', () => {
    expect(flaggedKeys(IG('Call 0768030944'), ['https://x.com/call/0768030944'])).toEqual([])
    expect(flaggedKeys(IG('We run 24 hours'), ['Open 24/7'])).toEqual([])
  })

  it('a bare 0 to 10 integer is exempt, 11 is not', () => {
    expect(flaggedKeys(IG('3 tips, 10 steps'), [])).toEqual([])
    expect(flaggedKeys(IG('11 tips'), [])).toEqual(['num:11'])
  })

  it('a multiplied small number is not exempt', () => {
    expect(flaggedKeys(IG('2k learners'), [])).toEqual(['num:2000'])
  })

  it('tolerates junk sources and texts', () => {
    const out = checkFacts({
      texts: [{ where: 'headline', text: undefined as unknown as string }],
      sources: [undefined as unknown as string, '', 'a'],
      now: NOW,
    })
    expect(out.status).toBe('clear')
  })
})

describe('the result', () => {
  it('is clear with no flags and flagged with them; stores value, kind and where only', () => {
    const clear = checkFacts({ texts: IG('Join us'), sources: [], now: NOW })
    expect(clear).toEqual({ v: 1, status: 'clear', checkedAt: NOW.toISOString(), flagged: [] })
    const flagged = checkFacts({ texts: IG('Pay $49 for a seat'), sources: [], now: NOW })
    expect(flagged.status).toBe('flagged')
    expect(flagged.flagged).toEqual([{ kind: 'cur', value: '$49', where: 'INSTAGRAM' }])
    expect(JSON.stringify(flagged)).not.toContain('seat')
  })

  it('validates against the stored schema', () => {
    const c = checkFacts({ texts: IG('Pay $49'), sources: [], now: NOW })
    expect(parseFactsCheck(c)).toEqual(c)
    expect(parseFactsCheck({ ...c, extra: 1 })).toBeNull()
    expect(parseFactsCheck(null)).toBeNull()
    expect(
      parseFactsCheck({ ...c, flagged: [{ kind: 'x', value: 'a', where: 'headline' }] }),
    ).toBeNull()
  })

  it('de-duplicates on (where, key) and keeps order by where then position', () => {
    const out = checkFactsWithKeys({
      texts: [
        { where: 'LINKEDIN', text: '$50' },
        { where: 'INSTAGRAM', text: '$40 then $30 then $40' },
        { where: 'headline', text: '$20' },
      ],
      sources: [],
      now: NOW,
    })
    expect(out.keys.map((k) => `${k.where}|${k.key}`)).toEqual([
      'headline|cur:20',
      'INSTAGRAM|cur:40',
      'INSTAGRAM|cur:30',
      'LINKEDIN|cur:50',
    ])
  })

  it('caps the flags at 20 and the value at 40 characters', () => {
    const many = Array.from({ length: 50 }, (_, i) => `$${100 + i}`).join(' ')
    const out = checkFacts({ texts: IG(many), sources: [], now: NOW })
    expect(out.flagged).toHaveLength(20)
    expect(out.flagged[0].value).toBe('$100')
    const long = checkFacts({ texts: IG('1'.repeat(100)), sources: [], now: NOW })
    expect(long.flagged[0].value).toHaveLength(40)
    expect(parseFactsCheck(out)).not.toBeNull()
    expect(parseFactsCheck(long)).not.toBeNull()
  })

  it('cuts a text at 20 000 characters and the sources at 200 000', () => {
    const late = 'x '.repeat(10_001) + '$77'
    expect(checkFacts({ texts: IG(late), sources: [], now: NOW }).status).toBe('clear')
    const src = ' '.repeat(200_000) + 'Price $77'
    expect(checkFacts({ texts: IG('$77'), sources: [src], now: NOW }).status).toBe('flagged')
  })

  it('an error inside the check returns status error, never throws, with a redacted reason', () => {
    const boom = {
      where: 'headline' as const,
      get text(): string {
        throw new Error('failed at https://secret.example/x?key=abc sk-123456')
      },
    }
    const out = checkFacts({ texts: [boom], sources: [], now: NOW })
    expect(out.status).toBe('error')
    expect(out.flagged).toEqual([])
    expect(out.reason).not.toMatch(/secret\.example|sk-123456/)
    expect(out.reason!.length).toBeLessThanOrEqual(120)
    expect(parseFactsCheck(out)).not.toBeNull()
  })

  it('factsCheckError builds the same shape and cuts the reason at 120', () => {
    const e = factsCheckError('z'.repeat(500), NOW)
    expect(e).toMatchObject({ v: 1, status: 'error', flagged: [], checkedAt: NOW.toISOString() })
    expect(e.reason).toHaveLength(120)
  })
})
