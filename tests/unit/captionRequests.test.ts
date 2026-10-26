// 012 T6 — the caption request bodies (FR-11, FR-12): the PATCH union and the
// regenerate-copy body, with their 400 messages.

import { describe, it, expect } from 'vitest'
import {
  CAPTION_TEXT_MAX,
  CHANNEL_MESSAGE,
  PATCH_SHAPE_MESSAGE,
  REGENERATE_BOTH_MESSAGE,
  REGENERATE_SHAPE_MESSAGE,
  parseCaptionPatch,
  parseRegenerateBody,
} from '@/lib/captions/requests'
import { modelKeyMessage } from '@/lib/models/requests'

describe('parseCaptionPatch (FR-12)', () => {
  it('accepts { channel, text } for every registry channel, text as typed', () => {
    for (const channel of ['INSTAGRAM', 'LINKEDIN'] as const) {
      expect(parseCaptionPatch({ channel, text: '  **kept** ' })).toEqual({
        ok: true,
        value: { channel, text: '  **kept** ' },
      })
    }
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: '' })).toEqual({
      ok: true,
      value: { channel: 'INSTAGRAM', text: '' },
    })
  })

  it('accepts { headline } (validated later by validateHeadline)', () => {
    expect(parseCaptionPatch({ headline: 'Applications are open' })).toEqual({
      ok: true,
      value: { headline: 'Applications are open' },
    })
  })

  it('caps text at 10,000 characters; over a channel hard limit is allowed', () => {
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: 'x'.repeat(CAPTION_TEXT_MAX) }).ok).toBe(true)
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: 'x'.repeat(CAPTION_TEXT_MAX + 1) })).toEqual({
      ok: false,
      error: 'text must be at most 10,000 characters',
    })
  })

  it('a legacy { copyText } body → "Send { channel, text } or { headline }"', () => {
    expect(parseCaptionPatch({ copyText: 'old' })).toEqual({ ok: false, error: PATCH_SHAPE_MESSAGE })
    expect(PATCH_SHAPE_MESSAGE).toBe('Send { channel, text } or { headline }')
  })

  it.each([
    ['empty object', {}],
    ['channel without text', { channel: 'INSTAGRAM' }],
    ['text without channel', { text: 'x' }],
    ['both forms', { channel: 'INSTAGRAM', text: 'x', headline: 'h' }],
    ['null', null],
    ['an array', [1]],
    ['a string', 'text'],
  ])('the wrong shape (%s) → the shape message', (_name, body) => {
    expect(parseCaptionPatch(body)).toEqual({ ok: false, error: PATCH_SHAPE_MESSAGE })
  })

  it('an unknown channel names the registry channels', () => {
    expect(parseCaptionPatch({ channel: 'TIKTOK', text: 'x' })).toEqual({ ok: false, error: CHANNEL_MESSAGE })
    expect(CHANNEL_MESSAGE).toBe('channel must be INSTAGRAM or LINKEDIN')
  })

  it('WHATSAPP is refused on PATCH and on regenerate (026 AC-03)', () => {
    expect(parseCaptionPatch({ channel: 'WHATSAPP', text: 'x' })).toEqual({ ok: false, error: CHANNEL_MESSAGE })
    expect(parseRegenerateBody({ channel: 'WHATSAPP' })).toMatchObject({ ok: false, error: CHANNEL_MESSAGE })
  })

  it('non-string values get their own message', () => {
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: 5 })).toEqual({ ok: false, error: 'text must be a string' })
    expect(parseCaptionPatch({ headline: 5 })).toEqual({ ok: false, error: 'headline must be a string' })
  })
})

describe('parseRegenerateBody (FR-11)', () => {
  it('{} → "Regenerate all": the two captions, never the headline (A9)', () => {
    expect(parseRegenerateBody({})).toStrictEqual({ ok: true, value: { targets: ['INSTAGRAM', 'LINKEDIN'] } })
  })

  it('{ channel } → that caption only', () => {
    expect(parseRegenerateBody({ channel: 'LINKEDIN' })).toStrictEqual({ ok: true, value: { targets: ['LINKEDIN'] } })
  })

  it('{ headline: true } → the headline only', () => {
    expect(parseRegenerateBody({ headline: true })).toStrictEqual({ ok: true, value: { targets: ['HEADLINE'] } })
  })

  it('both channel and headline → 400', () => {
    expect(parseRegenerateBody({ channel: 'LINKEDIN', headline: true })).toEqual({
      ok: false,
      error: REGENERATE_BOTH_MESSAGE,
    })
  })

  it('an unknown channel → 400 naming the channels', () => {
    expect(parseRegenerateBody({ channel: 'TIKTOK' })).toEqual({ ok: false, error: CHANNEL_MESSAGE })
  })

  it('headline other than true, an unknown key, or a non-object → 400', () => {
    expect(parseRegenerateBody({ headline: false })).toEqual({ ok: false, error: 'headline must be true' })
    expect(parseRegenerateBody({ copy: true })).toEqual({ ok: false, error: REGENERATE_SHAPE_MESSAGE })
    expect(parseRegenerateBody(null)).toEqual({ ok: false, error: REGENERATE_SHAPE_MESSAGE })
  })

  // 008 FR-17: `model` is optional on all three forms; the body stays strict.
  it('each form takes an optional model, returned beside the targets', () => {
    expect(parseRegenerateBody({ model: 'OPUS' })).toStrictEqual({
      ok: true,
      value: { targets: ['INSTAGRAM', 'LINKEDIN'], model: 'OPUS' },
    })
    expect(parseRegenerateBody({ channel: 'LINKEDIN', model: 'HAIKU' })).toStrictEqual({
      ok: true,
      value: { targets: ['LINKEDIN'], model: 'HAIKU' },
    })
    expect(parseRegenerateBody({ headline: true, model: 'SONNET' })).toStrictEqual({
      ok: true,
      value: { targets: ['HEADLINE'], model: 'SONNET' },
    })
  })

  it('{ channel, headline, model } is still a 400, and so is an unknown extra key beside model', () => {
    expect(parseRegenerateBody({ channel: 'LINKEDIN', headline: true, model: 'HAIKU' })).toEqual({
      ok: false,
      error: REGENERATE_BOTH_MESSAGE,
    })
    expect(parseRegenerateBody({ model: 'HAIKU', copy: true })).toEqual({ ok: false, error: REGENERATE_SHAPE_MESSAGE })
  })

  it('a model outside the closed keys is a 400 carrying MODEL_NOT_ALLOWED', () => {
    for (const model of ['gpt-4o', 'opus', null, 3]) {
      expect(parseRegenerateBody({ channel: 'LINKEDIN', model })).toEqual({
        ok: false,
        error: modelKeyMessage(),
        code: 'MODEL_NOT_ALLOWED',
      })
    }
  })
})
