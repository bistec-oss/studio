// 027 T5 — the inputs on the queue surfaces (FR-06, NFR-11): the legacy-tolerant
// entry schema and the one shared style resolution. The briefs route, the
// campaign routes, MCP and ACP are covered by E2E section AE and mcpGetDraft.

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const { queueEntrySchema, resolveEntryStyle, toEntryCreateData } = await import('@/lib/campaign/queue')

const base = {
  topic: 'Webinar reminder',
  channels: ['INSTAGRAM'],
  designMode: 'GENERATE',
  generateAt: '2026-08-01T09:00:00.000Z',
}

function parse(over: Record<string, unknown> = {}) {
  return queueEntrySchema.parse({ ...base, ...over })
}

async function bodyOf(res: Response) {
  return { status: res.status, json: await res.json() }
}

describe('queueEntrySchema (FR-06, NFR-11)', () => {
  it('accepts an entry with no goal, no tone and no style', () => {
    const e = parse()
    expect(e.goal).toBeUndefined()
    expect(e.tone).toBeUndefined()
    expect(e.postStyle).toBeUndefined()
  })

  it('accepts a pre-027 body (goal and tone, no style)', () => {
    expect(queueEntrySchema.safeParse({ ...base, goal: 'Signups', tone: 'Friendly' }).success).toBe(true)
  })

  it('accepts a style key, null, and rejects an over-long or non-string one', () => {
    expect(parse({ postStyle: 'hiring' }).postStyle).toBe('hiring')
    expect(parse({ postStyle: null }).postStyle).toBeNull()
    expect(queueEntrySchema.safeParse({ ...base, postStyle: 'x'.repeat(41) }).success).toBe(false)
    expect(queueEntrySchema.safeParse({ ...base, postStyle: 7 }).success).toBe(false)
  })
})

describe('resolveEntryStyle (FR-06)', () => {
  const defaults = (key: string | null, tone: string | null = null) => ({ defaultPostStyle: key, defaultTone: tone })

  it('an explicit key wins and stores its own goal; the goal sent is ignored', () => {
    const r = resolveEntryStyle(defaults(null), parse({ postStyle: 'promotion', goal: 'hiring' }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.style.postStyle).toBe('promotion')
      expect(r.style.goal).not.toBe('hiring')
    }
  })

  it('no key: a legacy goal of hiring or announcement picks that style, anything else falls through', () => {
    const pick = (goal: string, d = defaults(null)) => {
      const r = resolveEntryStyle(d, parse({ goal }))
      return r.ok ? r.style.postStyle : null
    }
    expect(pick('hiring')).toBe('hiring')
    expect(pick('Announcement')).toBe('announcement')
    expect(pick('conversion')).toBe('general')
    expect(pick('conversion', defaults('event'))).toBe('event')
  })

  it('no key and no goal: the campaign default, else General', () => {
    const k = (d: ReturnType<typeof defaults> | null) => {
      const r = resolveEntryStyle(d, parse())
      return r.ok ? r.style.postStyle : null
    }
    expect(k(defaults('tip'))).toBe('tip')
    expect(k(defaults(null))).toBe('general')
    expect(k(null)).toBe('general')
  })

  it('an explicit tone is kept as given; otherwise it comes from the campaign tone, then the style', () => {
    const tone = (over: Record<string, unknown>, d = defaults(null)) => {
      const r = resolveEntryStyle(d, parse(over))
      return r.ok ? r.style.tone : null
    }
    expect(tone({ tone: 'Friendly' })).toBe('Friendly')
    expect(tone({}, defaults(null, 'a bold voice'))).toBe('bold')
    expect(tone({ postStyle: 'general' })).toBe('professional')
  })

  it('a blank key is absent, not unknown', () => {
    const r = resolveEntryStyle(defaults(null), parse({ postStyle: '  ' }))
    expect(r.ok && r.style.postStyle).toBe('general')
  })

  it('an unknown key is a 400 UNKNOWN_POST_STYLE and never "no style"', async () => {
    const r = resolveEntryStyle(defaults('event'), parse({ postStyle: 'nope' }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const { status, json } = await bodyOf(r.response)
      expect(status).toBe(400)
      expect(json).toEqual({ error: "Unknown post style 'nope'", code: 'UNKNOWN_POST_STYLE' })
    }
  })

  it('an unknown campaign default is also refused', () => {
    expect(resolveEntryStyle(defaults('retired-away'), parse()).ok).toBe(false)
  })

  it('the batch route names the failing entry (1-based)', async () => {
    const r = resolveEntryStyle(defaults(null), parse({ postStyle: 'nope' }), 3)
    expect(r.ok).toBe(false)
    if (!r.ok) expect((await bodyOf(r.response)).json.error).toBe("Entry 3: Unknown post style 'nope'")
  })

  it('Prototype keys such as constructor are unknown', () => {
    expect(resolveEntryStyle(defaults(null), parse({ postStyle: 'constructor' })).ok).toBe(false)
    expect(resolveEntryStyle(defaults(null), parse({ postStyle: '__proto__' })).ok).toBe(false)
  })
})

describe('toEntryCreateData (FR-06)', () => {
  it('writes the resolved style, goal and tone, never the raw body values', () => {
    const entry = parse({ postStyle: 'hiring', goal: 'x', tone: 'y' })
    const data = toEntryCreateData('c1', 'u1', entry, 't1', { postStyle: 'hiring', goal: 'G', tone: 'T' })
    expect(data).toMatchObject({ postStyle: 'hiring', goal: 'G', tone: 'T', campaignId: 'c1', teamId: 't1' })
  })
})
