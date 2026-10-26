// 027 FR-10 / AC-09: the extractor, per family and per exemption.
import { describe, it, expect } from 'vitest'
import { extractValues, toAsciiDigits, parseNumber } from '@/lib/factsCheck'

const keys = (text: string, o = { strip: true, exempt: true }) =>
  extractValues(text, o).map((v) => v.key)
const plain = (text: string) => keys(text, { strip: false, exempt: false })

describe('digit normalisation', () => {
  it.each([
    ['٠١٢٣٤٥٦٧٨٩', '0123456789'],
    ['۰۱۲۳۴۵۶۷۸۹', '0123456789'],
    ['०१२३४५६७८९', '0123456789'],
    ['௦௧௨௩௪௫௬௭௮௯', '0123456789'],
    ['෦෧෨෩෪෫෬෭෮෯', '0123456789'],
    ['０１２３４５６７８９', '0123456789'],
  ])('%s maps to ASCII', (input, out) => {
    expect(toAsciiDigits(input)).toBe(out)
    expect(toAsciiDigits(input)).toHaveLength(input.length)
  })

  it('leaves other characters and other digit blocks alone', () => {
    expect(toAsciiDigits('abc ១២៣ x')).toBe('abc ១២៣ x') // Khmer is not mapped (limit L2)
  })

  it('parseNumber removes commas and applies multipliers', () => {
    expect(parseNumber('5,000')).toBe('5000')
    expect(parseNumber('5000.0')).toBe('5000')
    expect(parseNumber('2.5', 'k')).toBe('2500')
    expect(parseNumber('1.2', 'm')).toBe('1200000')
    expect(parseNumber('3', 'bn')).toBe('3000000000')
    expect(parseNumber('2', 'Thousand')).toBe('2000')
    expect(parseNumber('abc')).toBeNull()
  })

  it('digits in each script extract the same key as ASCII', () => {
    for (const s of ['٣٥٠', '۳۵۰', '३५०', '௩௫௦', '෩෫෦', '３５０'])
      expect(plain(s), s).toEqual(['num:350'])
  })
})

describe('the families', () => {
  it.each([
    ['0768030944', ['tel:0768030944']],
    ['+94 76 803 0944', ['tel:94768030944']],
    ['076-8030-944', ['tel:0768030944']],
    ['(011) 234 5678', ['tel:0112345678']],
    ['076.803.0944', ['tel:0768030944']],
  ])('tel %s', (text, expected) => expect(plain(text)).toEqual(expected))

  it('a short run of digits is not a phone number', () => {
    expect(plain('123456')).toEqual(['num:123456'])
    expect(plain('5 10 15')).toEqual(['num:5', 'num:10', 'num:15'])
    expect(plain('2025-2027')).toEqual(['num:2025', 'num:2027'])
  })

  it.each([
    ['15 March', ['date:3-15']],
    ['15th of March 2027', ['date:3-15-2027']],
    ['March 15', ['date:3-15']],
    ['Mar 15, 2027', ['date:3-15-2027']],
    ['Sept 3', ['date:9-3']],
    ['1 Jan.', ['date:1-1']],
    ['December 25th', ['date:12-25']],
    ['15/03/2027', ['date:n:15-3-2027']],
    ['15.3.27', ['date:n:15-3-27']],
    ['2027-03-15', ['date:n:2027-3-15']],
  ])('date %s', (text, expected) => expect(plain(text)).toEqual(expected))

  it('a day outside 1 to 31 and a non-date are not dates', () => {
    expect(plain('32 March')).toEqual(['num:32'])
    expect(plain('You may attend')).toEqual([])
    expect(plain('May 2027')).toEqual(['num:2027'])
    expect(plain('13/25/2027')).toEqual(['num:13', 'num:25', 'num:2027'])
  })

  it.each([
    ['10:30', ['time:630']],
    ['10:30am', ['time:630']],
    ['10:30 PM', ['time:1350']],
    ['5 pm', ['time:1020']],
    ['12am', ['time:0']],
    ['12 pm', ['time:720']],
    ['17:00', ['time:1020']],
    ['9:05:30', ['time:545']],
  ])('time %s', (text, expected) => expect(plain(text)).toEqual(expected))

  it.each([
    ['$50', ['cur:50']],
    ['US$50', ['cur:50']],
    ['€1,250.50', ['cur:1250.5']],
    ['£5k', ['cur:5000']],
    ['Rs. 5,000', ['cur:5000']],
    ['LKR 2,500', ['cur:2500']],
    ['USD 50', ['cur:50']],
    ['50 USD', ['cur:50']],
    ['50 dollars', ['cur:50']],
    ['2 million euros', ['cur:2000000']],
    ['₹300', ['cur:300']],
    ['¥1000', ['cur:1000']],
    ['5 rupees', ['cur:5']],
  ])('currency %s', (text, expected) => expect(plain(text)).toEqual(expected))

  it.each([
    ['35%', ['pct:35']],
    ['35 %', ['pct:35']],
    ['35 percent', ['pct:35']],
    ['35 per cent', ['pct:35']],
    ['12.5%', ['pct:12.5']],
  ])('pct %s', (text, expected) => expect(plain(text)).toEqual(expected))

  it.each([
    ['1,250', ['num:1250']],
    ['1250', ['num:1250']],
    ['4.50', ['num:4.5']],
    ['2.5k', ['num:2500']],
    ['1.2m', ['num:1200000']],
    ['3bn', ['num:3000000000']],
    ['5 million', ['num:5000000']],
    ['2 thousand', ['num:2000']],
    ['100th', ['num:100']],
  ])('num %s', (text, expected) => expect(plain(text)).toEqual(expected))

  it('each match is consumed: a price is not also a number, a date is not also three', () => {
    expect(plain('$50 and 15 March 2027 at 6:30pm, 35%')).toEqual([
      'cur:50',
      'date:3-15-2027',
      'time:1110',
      'pct:35',
    ])
  })

  it('an ordinary run reports each value once, in text order', () => {
    const v = extractValues('Pay $49 by 15 March, call 0768030944', {})
    expect(v.map((x) => x.value)).toEqual(['$49', '15 March', '0768030944'])
    expect(v.map((x) => x.index)).toEqual([...v.map((x) => x.index)].sort((a, b) => a - b))
  })

  it('value is the span as written, cut at 40 characters', () => {
    const v = extractValues('෧෫෦ and ' + '1'.repeat(60))
    expect(v[0].value).toBe('෧෫෦')
    expect(Math.max(...v.map((x) => x.value.length))).toBeLessThanOrEqual(40)
  })
})

describe('the exemptions', () => {
  it.each([
    ['3 tips in 2 minutes, 0 stress, 10 steps'],
    ['Support 24/7 and 24x7 and 24/365'],
    ['Sizes 1:1 4:5 3:4 9:16 16:9, 1080x1080 and 1080 × 1920'],
    ['1. one\n2) two\n(3) three\n12. twelve'],
    ['Step 15, tip 20, Part 30'],
    ['© 2026 Bistec'],
    ['Q3 results and COVID19 and Top10'],
    ['#Top10 #2027goals https://x.com/a/2027 mail a1@x.com @user2027'],
  ])('extracts nothing from the exempt tokens: %s', (text) => {
    // The bare 0 to 10 integers are exempt at comparison time, so allow num 0 to 10 here.
    const left = keys(text).filter((k) => !/^num:([0-9]|10)$/.test(k))
    expect(left).toEqual([])
  })

  it.each(['Copyright 2025', '(c) 2024', '© 2024-2026'])('copyright line: %s', (text) =>
    expect(keys(text)).toEqual([]),
  )

  it('exemptions apply to checked texts only: a source keeps its numbers', () => {
    expect(plain('Support 24/7')).toEqual(['num:24', 'num:7'])
    expect(plain('© 2026')).toEqual(['num:2026'])
  })

  it('a year outside a copyright line is extracted (assumption A4)', () => {
    expect(keys('Join us in 2027')).toEqual(['num:2027'])
    expect(keys('© 2026 and 2027')).toEqual(['num:2027'])
  })

  it('a list marker only counts at the start of a line', () => {
    expect(keys('We have 12. more')).toEqual(['num:12'])
    expect(keys('1.5 million users')).toEqual(['num:1500000'])
  })

  it('a currency, percent, date or time of any size is never exempt', () => {
    expect(keys('$5, 3%, 2 March, 5 pm')).toEqual(['cur:5', 'pct:3', 'date:3-2', 'time:1020'])
  })
})

describe('robustness (never throws)', () => {
  it('empty, whitespace and binary-looking input', () => {
    for (const s of ['', '   ', '\0\0\0', '\uD800 lone surrogate', 'ÿþ\x01\x02\x03', '🙂🙂🙂 5 🙂'])
      expect(() => extractValues(s, { strip: true, exempt: true })).not.toThrow()
    expect(extractValues('')).toEqual([])
  })

  it('a very long input and pathological repeats', () => {
    for (const u of ['1,', '((', '+1 ', '1.', '$', '15 ', '@', '#1', '9:', '\n1.']) {
      const t = u.repeat(15_000)
      expect(() => extractValues(t, { strip: true, exempt: true })).not.toThrow()
    }
  })
})
