// 012 T6 — the pure caption-action rules (FR-11, FR-19, design §5, AC-07):
// which panels a draft is busy writing, and what a write leaves in a row.

import { describe, it, expect } from 'vitest'
import type { Channel } from '@prisma/client'
import {
  captionActionTargets,
  failedCaptionFields,
  settleCaptionRow,
  type CaptionActionDraft,
  type CaptionRowStatus,
} from '@/lib/captions/actionTargets'

function draft(
  rows: Partial<Record<Channel, CaptionRowStatus>> = {},
  over: Partial<CaptionActionDraft> = {},
): CaptionActionDraft {
  return {
    status: 'EXPORTED',
    pendingAction: null,
    headline: 'Applications are open',
    captions: (['INSTAGRAM', 'LINKEDIN'] as Channel[]).map((channel) => ({
      channel,
      status: rows[channel] ?? 'READY',
    })),
    ...over,
  }
}

describe('captionActionTargets', () => {
  it('is empty on a settled draft', () => {
    expect(captionActionTargets(draft())).toEqual([])
  })

  it('REGENERATE_COPY with PENDING rows → those rows, in registry order', () => {
    expect(
      captionActionTargets(draft({ LINKEDIN: 'PENDING', INSTAGRAM: 'PENDING' }, { pendingAction: 'REGENERATE_COPY' })),
    ).toEqual(['INSTAGRAM', 'LINKEDIN'])
  })

  it('AC-07: REGENERATE_COPY with no PENDING row → the headline', () => {
    expect(captionActionTargets(draft({}, { pendingAction: 'REGENERATE_COPY' }))).toEqual(['HEADLINE'])
  })

  it('another action (design, refine) never makes a caption panel busy', () => {
    expect(captionActionTargets(draft({}, { pendingAction: 'REGENERATE_DESIGN' }))).toEqual([])
    expect(captionActionTargets(draft({}, { pendingAction: 'REFINE' }))).toEqual([])
  })

  it('a generation (IN_PROGRESS) → its PENDING rows, plus the headline while it is null', () => {
    const pending = { INSTAGRAM: 'PENDING', LINKEDIN: 'PENDING' } as const
    expect(captionActionTargets(draft(pending, { status: 'IN_PROGRESS', headline: null }))).toEqual([
      'HEADLINE',
      'INSTAGRAM',
      'LINKEDIN',
    ])
    // Retry over a draft that already has a headline: the headline is not busy.
    expect(captionActionTargets(draft(pending, { status: 'IN_PROGRESS' }))).toEqual([
      'INSTAGRAM',
      'LINKEDIN',
    ])
  })

  it('a generation past the caption step (design rendering) has nothing busy', () => {
    expect(captionActionTargets(draft({}, { status: 'IN_PROGRESS' }))).toEqual([])
    expect(captionActionTargets(draft({}, { status: 'IN_PROGRESS', headline: null }))).toEqual([])
  })
})

describe('settleCaptionRow (design §5 table, A7)', () => {
  it('ok → READY with the new text and the reason cleared, whatever was there', () => {
    expect(settleCaptionRow({ text: 'old' }, { ok: true, text: 'new' })).toEqual({
      status: 'READY',
      text: 'new',
      failureReason: null,
    })
    expect(settleCaptionRow({ text: '' }, { ok: true, text: 'new' }).status).toBe('READY')
  })

  it('AC-07: failed on a row with text → READY, text unchanged, "Regenerate failed: <reason>"', () => {
    expect(settleCaptionRow({ text: 'good text' }, { ok: false, reason: 'missing' })).toEqual({
      status: 'READY',
      text: 'good text',
      failureReason: 'Regenerate failed: missing',
    })
  })

  it('AC-07: failed on an empty row → FAILED with no text (the CHECK FAILED ⇒ text = "")', () => {
    expect(settleCaptionRow({ text: '' }, { ok: false, reason: 'over-limit (2,201 / 2,200)' })).toEqual({
      status: 'FAILED',
      text: '',
      failureReason: 'over-limit (2,201 / 2,200)',
    })
  })

  it('whitespace-only is not usable text → FAILED', () => {
    expect(settleCaptionRow({ text: ' \n ' }, { ok: false, reason: 'empty' })).toMatchObject({
      status: 'FAILED',
      text: '',
    })
  })
})

describe('failedCaptionFields', () => {
  it('fails every target with the one reason', () => {
    expect(failedCaptionFields(['HEADLINE', 'LINKEDIN'], 'timeout')).toEqual({
      HEADLINE: { ok: false, reason: 'timeout' },
      LINKEDIN: { ok: false, reason: 'timeout' },
    })
  })
})
