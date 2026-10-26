import { describe, it, expect } from 'vitest'
import { AspectRatio, Channel, DraftAction } from '@prisma/client'
import { CATALOGUE, CLIENT_EVENTS, EVENT_NAMES, INSTRUCTION_MAX, FAILURE_REASON_MAX } from '@/lib/analytics/catalogue'

type Out = Record<string, string>
const parse = (name: keyof typeof CATALOGUE, payload: unknown) => {
  const r = CATALOGUE[name].schema.safeParse(payload)
  return r.success ? { success: true as const, data: r.data as Out } : { success: false as const, data: null }
}

describe('analytics catalogue (006 FR-02, FR-03)', () => {
  it('gives every event a positive schemaVersion and at least one source', () => {
    for (const name of EVENT_NAMES) {
      expect(CATALOGUE[name].schemaVersion).toBeGreaterThanOrEqual(1)
      expect(CATALOGUE[name].source.length).toBeGreaterThan(0)
    }
  })

  it('keeps the client list inside the catalogue and inside web', () => {
    for (const name of CLIENT_EVENTS) {
      expect(EVENT_NAMES).toContain(name)
      expect(CATALOGUE[name].source).toContain('web')
    }
  })

  it('cuts an instruction of 5 000 characters to 2 000 (AC-04)', () => {
    const r = parse('draft_action.settled', { action: 'REFINE', instruction: 'x'.repeat(5000) })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.instruction).toHaveLength(INSTRUCTION_MAX)
  })

  it('redacts a failure reason before it is cut (AC-04)', () => {
    const reason = `call to https://api.example.com/v1?key=zzz failed with sk-abc123 ${'y'.repeat(900)}`
    const r = parse('generation.finished', { failureReason: reason })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.failureReason.length).toBeLessThanOrEqual(FAILURE_REASON_MAX)
      expect(r.data.failureReason).toContain('<url>')
      expect(r.data.failureReason).toContain('<redacted>')
      expect(r.data.failureReason).not.toContain('sk-abc123')
      expect(r.data.failureReason).not.toContain('example.com')
    }
  })

  it('cuts a long redacted reason to exactly 500', () => {
    const r = parse('generation.finished', { failureReason: 'z'.repeat(900) })
    expect(r.success && r.data.failureReason).toHaveLength(FAILURE_REASON_MAX)
  })

  it('redacts publish and scheduled-generation reasons too', () => {
    const p = parse('publish.settled', { channel: 'LINKEDIN', terminal: true, errorReason: 'sk-secret999 rejected' })
    const s = parse('scheduled_generation.settled', { errorReason: 'http://10.0.0.1:9000/x' })
    expect(p.success && p.data.errorReason).toBe('<redacted> rejected')
    expect(s.success && s.data.errorReason).toBe('<url>')
  })

  it('strips unknown keys, so stray text never reaches a row (NFR-04)', () => {
    const r = parse('revision.restored', { from: 1, to: 2, description: 'a brief', html: '<p>x</p>' })
    expect(r.success && r.data).toEqual({ from: 1, to: 2 })
  })

  it('rejects a value outside an imported vocabulary', () => {
    expect(parse('draft_action.settled', { action: 'DELETE_EVERYTHING' }).success).toBe(false)
    expect(parse('publish.settled', { channel: 'TELEGRAM', terminal: true }).success).toBe(false)
    expect(parse('wizard.step', { step: 9 }).success).toBe(false)
  })

  it('accepts every imported action, channel and aspect ratio', () => {
    for (const action of Object.values(DraftAction)) {
      expect(parse('draft_action.settled', { action }).success).toBe(true)
    }
    for (const channel of Object.values(Channel)) {
      expect(parse('publish.settled', { channel, terminal: false }).success).toBe(true)
    }
    for (const aspectRatio of Object.values(AspectRatio)) {
      expect(parse('generation.finished', { aspectRatio }).success).toBe(true)
    }
  })

  it('accepts the 024 route stamps and the archetype keys', () => {
    for (const captionRoute of ['CLI', 'API_KEY', 'SERVER_KEY', 'OTHER', null]) {
      expect(parse('generation.finished', { captionRoute }).success).toBe(true)
    }
    expect(parse('generation.finished', { appliedArchetype: 'editorial-split' }).success).toBe(true)
    expect(parse('generation.finished', { appliedArchetype: 'classic' }).success).toBe(true)
    expect(parse('generation.finished', { appliedArchetype: 'made-up' }).success).toBe(false)
  })

  it('keeps the largest valid payload under 4 KB (NFR-06)', () => {
    const attempt = {
      classes: ['add', 'replace', 'remove', 'constrain'],
      effectiveClasses: ['add', 'replace', 'remove', 'constrain'],
      verdict: 'unavailable',
      reasons: 99,
    }
    const model = { model: 'SONNET', modelId: 'm'.repeat(80), substitutedFrom: 's'.repeat(80) }
    const refine = parse('draft_action.settled', {
      action: 'REFINE',
      model,
      instruction: 'i'.repeat(9000),
      attempts: [attempt, attempt],
      refineCalls: 2,
      verifierCalls: 2,
      verifierModelId: 'v'.repeat(80),
      verifierPromptVersion: 'p'.repeat(40),
      failureReason: 'f'.repeat(900),
      inputTokens: 999999999,
      outputTokens: 999999999,
    })
    const generation = parse('generation.finished', {
      path: 'B',
      aspectRatio: 'PORTRAIT',
      captionModel: model,
      captionRoute: 'SERVER_KEY',
      designModel: model,
      promptVersion: 'p'.repeat(40),
      requestedArchetype: 'r'.repeat(60),
      appliedArchetype: 'classic',
      fallbackReason: 'refine-replaced-image',
      backgroundSkipped: true,
      failureReason: 'f'.repeat(900),
      inputTokens: 999999999,
      outputTokens: 999999999,
    })
    for (const r of [refine, generation]) {
      expect(r.success).toBe(true)
      if (r.success) expect(JSON.stringify(r.data).length).toBeLessThan(4096)
    }
  })
})
