import { describe, it, expect } from 'vitest'
import { resolveCaptionForPublish, type CaptionRowLike } from '@/lib/captions/resolve'

// 012 FR-14 / AC-05. The reason strings are exact: T10's E2E asserts on them.

const row = (over: Partial<CaptionRowLike> = {}): CaptionRowLike => ({
  status: 'READY',
  text: 'A caption',
  failureReason: null,
  ...over,
})

describe('resolveCaptionForPublish — ready', () => {
  it('returns a READY Instagram row’s text unchanged, surrounding whitespace and `**` included', () => {
    const text = '  **Hook** line\n\n#IRP  '
    expect(resolveCaptionForPublish('INSTAGRAM', row({ text }))).toEqual({ ok: true, text })
  })

  it('publishes LinkedIn at exactly 3,000 characters and Instagram at exactly 2,200', () => {
    expect(resolveCaptionForPublish('LINKEDIN', row({ text: 'l'.repeat(3000) })).ok).toBe(true)
    expect(resolveCaptionForPublish('INSTAGRAM', row({ text: 'i'.repeat(2200) })).ok).toBe(true)
  })

  it('a READY row with a leftover failureReason (A7: a failed regenerate kept good text) still publishes', () => {
    expect(
      resolveCaptionForPublish('LINKEDIN', row({ text: 'Good text', failureReason: 'empty' })),
    ).toEqual({ ok: true, text: 'Good text' })
  })
})

describe('resolveCaptionForPublish — each refusal rule', () => {
  it('rule 1: WhatsApp is refused even with READY text', () => {
    expect(resolveCaptionForPublish('WHATSAPP', row({ text: 'Ready to go' }))).toEqual({
      ok: false,
      reason: "WhatsApp publishing isn't available.",
    })
  })

  it('rule 2: no row', () => {
    expect(resolveCaptionForPublish('LINKEDIN', null)).toEqual({
      ok: false,
      reason: 'This draft has no LinkedIn caption.',
    })
    expect(resolveCaptionForPublish('INSTAGRAM', undefined)).toEqual({
      ok: false,
      reason: 'This draft has no Instagram caption.',
    })
  })

  it('rule 3: PENDING', () => {
    expect(resolveCaptionForPublish('INSTAGRAM', row({ status: 'PENDING', text: '' }))).toEqual({
      ok: false,
      reason: 'The Instagram caption is being generated. Publish again when it finishes.',
    })
  })

  it('rule 4: FAILED, with the failure reason', () => {
    expect(
      resolveCaptionForPublish(
        'LINKEDIN',
        row({ status: 'FAILED', text: '', failureReason: 'over-limit (3,104 / 3,000)' }),
      ),
    ).toEqual({
      ok: false,
      reason:
        'The LinkedIn caption failed to generate (over-limit (3,104 / 3,000)). Regenerate or edit it, then publish again.',
    })
  })

  it('rule 4: FAILED without a recorded reason omits the parenthesis', () => {
    expect(resolveCaptionForPublish('INSTAGRAM', row({ status: 'FAILED', text: '' }))).toEqual({
      ok: false,
      reason:
        'The Instagram caption failed to generate. Regenerate or edit it, then publish again.',
    })
  })

  it.each(['', '   ', ' \n\t\n '])('rule 5: empty after trimming (%j)', (text) => {
    expect(resolveCaptionForPublish('INSTAGRAM', row({ text }))).toEqual({
      ok: false,
      reason: 'The Instagram caption is empty. Write or regenerate it, then publish again.',
    })
  })

  it('rule 6: LinkedIn at 3,001 characters', () => {
    expect(resolveCaptionForPublish('LINKEDIN', row({ text: 'l'.repeat(3001) }))).toEqual({
      ok: false,
      reason: 'The LinkedIn caption is 3,001 characters; LinkedIn allows 3,000.',
    })
  })

  it('rule 6: Instagram at 2,201 characters', () => {
    expect(resolveCaptionForPublish('INSTAGRAM', row({ text: 'i'.repeat(2201) }))).toEqual({
      ok: false,
      reason: 'The Instagram caption is 2,201 characters; Instagram allows 2,200.',
    })
  })

  it('rule 6 measures the stored text, surrounding whitespace included', () => {
    const text = ` ${'l'.repeat(3000)} `
    expect(resolveCaptionForPublish('LINKEDIN', row({ text })).ok).toBe(false)
  })
})

describe('resolveCaptionForPublish — order of precedence', () => {
  it('rule 1 beats a missing row', () => {
    const r = resolveCaptionForPublish('WHATSAPP', null)
    expect(r.ok === false && r.reason).toMatch(/^WhatsApp publishing isn't available\./)
  })

  it('rule 1 beats PENDING and FAILED', () => {
    for (const status of ['PENDING', 'FAILED'] as const) {
      const r = resolveCaptionForPublish('WHATSAPP', row({ status, text: '' }))
      expect(r.ok === false && r.reason).toMatch(/^WhatsApp publishing/)
    }
  })

  it('PENDING beats empty text', () => {
    const r = resolveCaptionForPublish('LINKEDIN', row({ status: 'PENDING', text: '' }))
    expect(r.ok === false && r.reason).toMatch(/being generated/)
  })

  it('PENDING beats over-limit text', () => {
    const r = resolveCaptionForPublish(
      'LINKEDIN',
      row({ status: 'PENDING', text: 'l'.repeat(4000) }),
    )
    expect(r.ok === false && r.reason).toMatch(/being generated/)
  })

  it('FAILED beats empty text', () => {
    const r = resolveCaptionForPublish(
      'LINKEDIN',
      row({ status: 'FAILED', text: '', failureReason: 'empty' }),
    )
    expect(r.ok === false && r.reason).toMatch(/failed to generate \(empty\)/)
  })

  it('FAILED is refused even if text somehow survived (defence in depth behind the CHECK)', () => {
    const r = resolveCaptionForPublish(
      'INSTAGRAM',
      row({ status: 'FAILED', text: 'leftover', failureReason: 'no-object' }),
    )
    expect(r.ok === false && r.reason).toMatch(/failed to generate \(no-object\)/)
  })
})
