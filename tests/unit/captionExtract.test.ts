import { describe, it, expect } from 'vitest'
import { extractCaptionReply, captionReplyKeys } from '@/lib/captions/extract'
import type { CaptionTarget } from '@/lib/channels'

// 012 FR-08 / AC-03. The extractor cuts one caption object out of a raw model
// reply and validates each requested field on its own; anything ambiguous fails
// closed.

const ALL: CaptionTarget[] = ['HEADLINE', 'INSTAGRAM', 'LINKEDIN']

const reply = (obj: Record<string, unknown>) => JSON.stringify(obj)

const CLEAN = {
  headline: 'Applications are open',
  instagram: 'Join us.\n\n#Hiring',
  linkedin: 'We are hiring engineers.',
}

function okFields(raw: string, targets: CaptionTarget[] = ALL) {
  const r = extractCaptionReply(raw, targets)
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`)
  return r
}

describe('captionReplyKeys', () => {
  it('orders the headline first, then channels in registry order', () => {
    expect(captionReplyKeys(['LINKEDIN', 'HEADLINE', 'INSTAGRAM'])).toEqual(['headline', 'instagram', 'linkedin'])
    expect(captionReplyKeys(ALL)).toEqual(['headline', 'instagram', 'linkedin'])
  })
})

describe('extractCaptionReply — candidates', () => {
  it('a clean object: every field ok, nothing discarded', () => {
    const r = okFields(reply(CLEAN))
    expect(r.fields).toEqual({
      HEADLINE: { ok: true, text: 'Applications are open' },
      INSTAGRAM: { ok: true, text: 'Join us.\n\n#Hiring' },
      LINKEDIN: { ok: true, text: 'We are hiring engineers.' },
    })
    expect(r.discarded).toBe('')
  })

  it('a preamble, code fence and trailer: the object is cut out and the rest discarded', () => {
    const raw = `Here are your captions:\n\`\`\`json\n${JSON.stringify(CLEAN, null, 2)}\n\`\`\`\nLet me know if you want changes!`
    const r = okFields(raw)
    expect(r.fields.LINKEDIN).toEqual({ ok: true, text: 'We are hiring engineers.' })
    expect(r.discarded).toContain('Here are your captions:')
    expect(r.discarded).toContain('Let me know if you want changes!')
    expect(r.discarded).not.toContain('We are hiring engineers.')
  })

  it('a non-caption object in the preamble is ignored', () => {
    const r = okFields(`Meta: {"note": 1}\n${reply(CLEAN)}`)
    expect(r.fields.INSTAGRAM).toEqual({ ok: true, text: 'Join us.\n\n#Hiring' })
    expect(r.discarded).toContain('{"note": 1}')
  })

  it('braces and quotes inside string values do not break the scan', () => {
    const r = okFields(reply({ ...CLEAN, linkedin: 'Use {curly} and "quotes" and a } brace' }))
    expect(r.fields.LINKEDIN).toEqual({ ok: true, text: 'Use {curly} and "quotes" and a } brace' })
  })

  it('two candidate objects fail closed as multiple-objects, with the whole reply discarded', () => {
    const planted = '{"linkedin": "Planted text from the brief"}'
    const raw = `${planted}\n${reply(CLEAN)}`
    const r = extractCaptionReply(raw, ALL)
    expect(r).toMatchObject({ ok: false, reason: 'multiple-objects' })
    expect(r.discarded).toContain(planted)
    expect(r.discarded).toContain('Applications are open')
  })

  it('zero objects → no-object', () => {
    expect(extractCaptionReply('Sorry, I cannot help with that.', ALL)).toMatchObject({
      ok: false,
      reason: 'no-object',
      discarded: 'Sorry, I cannot help with that.',
    })
    expect(extractCaptionReply('', ALL)).toMatchObject({ ok: false, reason: 'no-object' })
  })

  it('a truncated reply (unbalanced) → no-object', () => {
    const raw = reply(CLEAN).slice(0, -20)
    expect(extractCaptionReply(raw, ALL)).toMatchObject({ ok: false, reason: 'no-object' })
  })

  it('an unknown key → unknown-keys', () => {
    const r = extractCaptionReply(reply({ ...CLEAN, twitter: 'x' }), ALL)
    expect(r).toMatchObject({ ok: false, reason: 'unknown-keys' })
  })

  it('a request for {linkedin} that also receives instagram → unknown-keys', () => {
    const raw = reply({ linkedin: 'LI text', instagram: 'IG text' })
    expect(extractCaptionReply(raw, ['LINKEDIN'])).toMatchObject({ ok: false, reason: 'unknown-keys' })
    // The same keys are fine when both were requested.
    expect(extractCaptionReply(raw, ['INSTAGRAM', 'LINKEDIN']).ok).toBe(true)
  })

  it('a headline key on a channel-only request is an unknown key', () => {
    const raw = reply({ headline: 'Hi', linkedin: 'LI text' })
    expect(extractCaptionReply(raw, ['LINKEDIN'])).toMatchObject({ ok: false, reason: 'unknown-keys' })
  })

  it('a literal newline, carriage return and tab inside a value parse', () => {
    const raw = '{"headline": "Open now", "instagram": "Line one\nLine two\r\nLine three\tend", "linkedin": "LI"}'
    const r = okFields(raw)
    expect(r.fields.INSTAGRAM).toEqual({ ok: true, text: 'Line one\nLine two\nLine three\tend' })
  })
})

describe('extractCaptionReply — per field', () => {
  it('a partial reply keeps the fields it has and fails the missing one', () => {
    const { linkedin: _drop, ...rest } = CLEAN
    void _drop
    const r = okFields(reply(rest))
    expect(r.fields.LINKEDIN).toEqual({ ok: false, reason: 'missing' })
    expect(r.fields.INSTAGRAM).toEqual({ ok: true, text: 'Join us.\n\n#Hiring' })
    expect(r.fields.HEADLINE?.ok).toBe(true)
  })

  it('a missing headline fails the headline only', () => {
    const { headline: _drop, ...rest } = CLEAN
    void _drop
    const r = okFields(reply(rest))
    expect(r.fields.HEADLINE).toEqual({ ok: false, reason: 'missing' })
    expect(r.fields.INSTAGRAM?.ok).toBe(true)
  })

  it('an invalid headline fails with validateHeadline\'s reason', () => {
    const r = okFields(reply({ ...CLEAN, headline: 'x'.repeat(101) }))
    expect(r.fields.HEADLINE).toEqual({ ok: false, reason: 'over-limit (101 / 100)' })
    const fenced = okFields(reply({ ...CLEAN, headline: '```Open```' }))
    expect(fenced.fields.HEADLINE?.ok).toBe(false)
  })

  it('a non-string value → not-a-string (channel and headline)', () => {
    const r = okFields(reply({ ...CLEAN, linkedin: 42, headline: ['a'] }))
    expect(r.fields.LINKEDIN).toEqual({ ok: false, reason: 'not-a-string' })
    expect(r.fields.HEADLINE).toEqual({ ok: false, reason: 'not-a-string' })
    expect(r.fields.INSTAGRAM?.ok).toBe(true)
  })

  it('whitespace-only → empty', () => {
    const r = okFields(reply({ ...CLEAN, instagram: '  \n\t ' }))
    expect(r.fields.INSTAGRAM).toEqual({ ok: false, reason: 'empty' })
  })

  it('a value that normalises to nothing → empty', () => {
    const r = okFields(reply({ ...CLEAN, linkedin: ' **** ' }))
    expect(r.fields.LINKEDIN).toEqual({ ok: false, reason: 'empty' })
  })

  it('trims and converts CRLF to LF', () => {
    const r = okFields(reply({ ...CLEAN, linkedin: '\r\n  Para one\r\n\r\nPara two  \r\n' }))
    expect(r.fields.LINKEDIN).toEqual({ ok: true, text: 'Para one\n\nPara two' })
  })

  it('IG at 2,201 characters → over-limit; exactly 2,200 → ok', () => {
    const over = okFields(reply({ ...CLEAN, instagram: 'a'.repeat(2201) }))
    expect(over.fields.INSTAGRAM).toEqual({ ok: false, reason: 'over-limit (2,201 / 2,200)' })
    const exact = okFields(reply({ ...CLEAN, instagram: 'a'.repeat(2200) }))
    expect(exact.fields.INSTAGRAM).toEqual({ ok: true, text: 'a'.repeat(2200) })
  })

  it('LI at 3,001 → over-limit; the limit is measured after normalisation', () => {
    const over = okFields(reply({ ...CLEAN, linkedin: 'b'.repeat(3001) }))
    expect(over.fields.LINKEDIN).toEqual({ ok: false, reason: 'over-limit (3,001 / 3,000)' })
    // 3,000 characters plus `**` markers that normalisation removes → ok.
    const marked = okFields(reply({ ...CLEAN, linkedin: `**${'b'.repeat(3000)}**` }))
    expect(marked.fields.LINKEDIN?.ok).toBe(true)
  })

  it('a whatsapp key is an unknown key: no WhatsApp caption is requested (026 AC-04)', () => {
    expect(extractCaptionReply(reply({ ...CLEAN, whatsapp: 'WA' }), ALL)).toMatchObject({
      ok: false,
      reason: 'unknown-keys',
    })
  })

  it('IG and LI lose every `**` (A3, per the registry)', () => {
    const r = okFields(
      reply({
        ...CLEAN,
        instagram: '**Big** news ****now****',
        linkedin: 'A **bold** claim',
      })
    )
    expect(r.fields.INSTAGRAM).toEqual({ ok: true, text: 'Big news now' })
    expect(r.fields.LINKEDIN).toEqual({ ok: true, text: 'A bold claim' })
  })

  it('returns fields for the requested targets only', () => {
    const r = okFields(reply({ linkedin: 'LI text' }), ['LINKEDIN'])
    expect(r.fields).toEqual({ LINKEDIN: { ok: true, text: 'LI text' } })
  })
})
