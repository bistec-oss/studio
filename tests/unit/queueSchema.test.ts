// Scheduled-generation queue entry schema — the cross-field refinements
// (TEMPLATE ⇒ templateId, SCHEDULE_PUBLISH ⇒ publishAt > generateAt) and the
// admin gate rule.

import { describe, it, expect } from 'vitest'
import { queueEntrySchema, requiresAdmin } from '@/lib/campaign/queue'

const base = {
  topic: 'Webinar reminder',
  goal: 'Signups',
  tone: 'Friendly',
  channels: ['INSTAGRAM'],
  designMode: 'GENERATE',
  generateAt: '2026-08-01T09:00:00.000Z',
}

describe('queueEntrySchema', () => {
  it('accepts a minimal GENERATE + HOLD entry and applies defaults', () => {
    const parsed = queueEntrySchema.parse(base)
    expect(parsed.aspectRatio).toBe('SQUARE')
    expect(parsed.postAction).toBe('HOLD')
    expect(parsed.generateAt).toBeInstanceOf(Date)
  })

  it('rejects TEMPLATE mode without a templateId; accepts with one', () => {
    expect(queueEntrySchema.safeParse({ ...base, designMode: 'TEMPLATE' }).success).toBe(false)
    expect(
      queueEntrySchema.safeParse({ ...base, designMode: 'TEMPLATE', templateId: 'tmpl_1' }).success
    ).toBe(true)
  })

  it('rejects SCHEDULE_PUBLISH without publishAt', () => {
    const result = queueEntrySchema.safeParse({ ...base, postAction: 'SCHEDULE_PUBLISH' })
    expect(result.success).toBe(false)
  })

  it('rejects publishAt at or before generateAt', () => {
    expect(
      queueEntrySchema.safeParse({
        ...base,
        postAction: 'SCHEDULE_PUBLISH',
        publishAt: base.generateAt,
      }).success
    ).toBe(false)
    expect(
      queueEntrySchema.safeParse({
        ...base,
        postAction: 'SCHEDULE_PUBLISH',
        publishAt: '2026-07-01T09:00:00.000Z',
      }).success
    ).toBe(false)
  })

  it('accepts SCHEDULE_PUBLISH with publishAt after generateAt', () => {
    const result = queueEntrySchema.safeParse({
      ...base,
      postAction: 'SCHEDULE_PUBLISH',
      publishAt: '2026-08-02T09:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })

  it('PUBLISH_NOW needs no publishAt', () => {
    expect(queueEntrySchema.safeParse({ ...base, postAction: 'PUBLISH_NOW' }).success).toBe(true)
  })

  it('rejects empty channels and unknown enum values', () => {
    expect(queueEntrySchema.safeParse({ ...base, channels: [] }).success).toBe(false)
    expect(queueEntrySchema.safeParse({ ...base, channels: ['TIKTOK'] }).success).toBe(false)
    expect(queueEntrySchema.safeParse({ ...base, postAction: 'YOLO' }).success).toBe(false)
  })
})

describe('requiresAdmin', () => {
  it('only HOLD is editor-plannable', () => {
    expect(requiresAdmin('HOLD')).toBe(false)
    expect(requiresAdmin('SCHEDULE_PUBLISH')).toBe(true)
    expect(requiresAdmin('PUBLISH_NOW')).toBe(true)
  })
})
