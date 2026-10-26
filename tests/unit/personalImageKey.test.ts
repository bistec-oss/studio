// 031 FR-11, FR-12, FR-13: the personal image key route, and the background
// step's fallback to the team's provider when the personal key fails.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'

const h = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  updateMany: vi.fn(),
  resolveWithSource: vi.fn(),
  anthropicCreate: vi.fn(),
  persist: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userOpenAiKey: { upsert: h.upsert, findUnique: h.findUnique, deleteMany: h.deleteMany, updateMany: h.updateMany },
  },
}))
vi.mock('@/lib/crypto', () => ({ encrypt: (s: string) => `enc(${s})`, decrypt: (s: string) => s }))
// The real handler module pulls in auth (needs secrets); the route only needs
// withAuth and parseBody, so both are restated here with the same contract.
vi.mock('@/lib/api/handler', async () => {
  const { NextResponse } = await import('next/server')
  return {
    withAuth: (handler: (...a: unknown[]) => unknown) => (req: unknown) =>
      handler(req, { params: {} }, { userId: 'u1' }),
    parseBody: async (
      req: { json: () => Promise<unknown> },
      schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: { message: string }[] } } },
    ) => {
      const parsed = schema.safeParse(await req.json())
      if (!parsed.success) {
        return { response: NextResponse.json({ error: parsed.error?.issues[0].message }, { status: 400 }) }
      }
      return { data: parsed.data }
    },
  }
})
vi.mock('@/providers/registry', () => ({ resolveImageProviderWithSource: h.resolveWithSource }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: h.anthropicCreate } } }))
vi.mock('@/lib/storage/minio', () => ({ persistDataUrlImage: h.persist }))
vi.mock('@/lib/agent/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/config')>()
  return { ...actual, isCliMode: () => false, pipelineMode: () => 'api' }
})

const { PUT, GET } = (await import('@/app/api/me/openai-key/route')) as unknown as {
  PUT: (req: NextRequest) => Promise<Response>
  GET: (req: NextRequest) => Promise<Response>
}
const { generateBackgroundForBrief } = await import('@/lib/agent/background')
const { isAuthRejection } = await import('@/lib/agent/openAiKey')

const OPENAI = 'sk-' + 'a'.repeat(24)
const GEMINI = 'AIza' + 'b'.repeat(35)

const put = (key: string) =>
  PUT(
    new NextRequest('http://x/api/me/openai-key', {
      method: 'PUT',
      body: JSON.stringify({ key }),
      headers: { 'content-type': 'application/json' },
    }),
  )

const kit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#14377D'],
  fonts: [],
  logoUrl: null,
  logos: [],
  voicePrompt: 'Warm.',
  source: 'system',
} as unknown as ResolvedBrandKit
const brief = {
  topic: 'Launch',
  description: 'd',
  goal: 'g',
  tone: 't',
  aspectRatio: 'SQUARE',
  imageProviderKey: null,
  postStyle: null,
} as unknown as Brief

const gen = (userId: string | null) =>
  generateBackgroundForBrief(brief, kit, 'Headline', null, { userId, teamId: 'team-1' } as never)

function provider(name: 'openai' | 'gemini', impl: () => Promise<{ url: string }>) {
  return { providerName: name, generateImage: vi.fn(impl) }
}

beforeEach(() => {
  for (const m of Object.values(h)) m.mockReset()
  h.anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"needed": true, "prompt": "waves"}' }] })
  h.persist.mockResolvedValue('https://cdn.example.com/bg.png')
})

describe('PUT /api/me/openai-key (AC-09)', () => {
  it('stores openai for an sk- key and returns the provider', async () => {
    h.upsert.mockResolvedValue({ status: 'ACTIVE', keyPrefix: '…aaaa', provider: 'openai' })
    const res = await put(OPENAI)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ connected: true, status: 'ACTIVE', keyPrefix: '…aaaa', provider: 'openai' })
    expect(h.upsert.mock.calls[0][0].create.provider).toBe('openai')
    expect(h.upsert.mock.calls[0][0].update.provider).toBe('openai')
  })

  it('stores gemini for a well-formed AIza key', async () => {
    h.upsert.mockResolvedValue({ status: 'ACTIVE', keyPrefix: '…bbbb', provider: 'gemini' })
    const res = await put(GEMINI)
    expect(res.status).toBe(200)
    expect((await res.json()).provider).toBe('gemini')
    expect(h.upsert.mock.calls[0][0].create.provider).toBe('gemini')
  })

  it.each([
    ['an sk-ant- key', 'sk-ant-' + 'a'.repeat(30)],
    ['a random string', 'not a key at all'],
    ['a malformed AIza key', 'AIza-short'],
  ])('refuses %s with 400 and stores nothing', async (_name, key) => {
    const res = await put(key)
    expect(res.status).toBe(400)
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('GET returns the stored provider; a pre-031 row reads openai', async () => {
    h.findUnique.mockResolvedValue({ status: 'ACTIVE', keyPrefix: '…bbbb', provider: 'gemini' })
    expect((await (await GET({} as NextRequest)).json()).provider).toBe('gemini')
    h.findUnique.mockResolvedValue({ status: 'INVALID', keyPrefix: '…aaaa', provider: 'openai' })
    expect(await (await GET({} as NextRequest)).json()).toMatchObject({ status: 'INVALID', provider: 'openai' })
    h.findUnique.mockResolvedValue(null)
    expect(await (await GET({} as NextRequest)).json()).toEqual({ connected: false })
  })
})

describe('isAuthRejection', () => {
  it('reads status 401 or 403 and the Gemini "(HTTP 401)" message', () => {
    expect(isAuthRejection({ status: 401 })).toBe(true)
    expect(isAuthRejection({ status: 403 })).toBe(true)
    expect(isAuthRejection(new Error('Gemini image generation failed (HTTP 403): denied'))).toBe(true)
    expect(isAuthRejection({ status: 429 })).toBe(false)
    expect(isAuthRejection(new Error('Gemini image generation failed (HTTP 500): x'))).toBe(false)
    expect(isAuthRejection(new Error('ECONNREFUSED'))).toBe(false)
    expect(isAuthRejection(null)).toBe(false)
  })
})

describe('the personal-key fallback (AC-11)', () => {
  it('a personal provider that throws leads to one team call and a personalFailed source', async () => {
    const personal = provider('gemini', async () => {
      throw new Error('Gemini image generation failed (HTTP 500): boom')
    })
    const team = provider('openai', async () => ({ url: 'https://cdn.example.com/team.png' }))
    h.resolveWithSource
      .mockResolvedValueOnce({ provider: personal, tier: 'personal', providerName: 'gemini' })
      .mockResolvedValueOnce({ provider: team, tier: 'team', providerName: 'openai' })

    const result = await gen('u1')
    expect(result).toMatchObject({
      imageSource: { tier: 'team', provider: 'openai', personalFailed: true, personalProvider: 'gemini' },
    })
    expect(personal.generateImage).toHaveBeenCalledTimes(1)
    expect(team.generateImage).toHaveBeenCalledTimes(1)
    // The second resolve is the team tiers only.
    expect(h.resolveWithSource.mock.calls[1][0]).toEqual({ teamId: 'team-1', userId: null })
    // A 500 does not invalidate the key.
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('a 401 also marks the personal row INVALID', async () => {
    const personal = provider('openai', async () => {
      throw Object.assign(new Error('Incorrect API key'), { status: 401 })
    })
    const team = provider('openai', async () => ({ url: 'https://cdn.example.com/team.png' }))
    h.resolveWithSource
      .mockResolvedValueOnce({ provider: personal, tier: 'personal', providerName: 'openai' })
      .mockResolvedValueOnce({ provider: team, tier: 'team', providerName: 'openai' })

    const result = await gen('u1')
    expect(result).toMatchObject({ imageSource: { tier: 'team', personalFailed: true } })
    expect(h.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { status: 'INVALID' } })
  })

  it('with no team provider the skip is PROVIDER_ERROR with the personal key on the source', async () => {
    const personal = provider('gemini', async () => {
      throw new Error('Gemini image generation failed (HTTP 403): no')
    })
    h.resolveWithSource
      .mockResolvedValueOnce({ provider: personal, tier: 'personal', providerName: 'gemini' })
      .mockResolvedValueOnce(null)

    const result = await gen('u1')
    expect(result).toMatchObject({
      url: null,
      skip: 'PROVIDER_ERROR',
      imageSource: { tier: 'personal', provider: 'gemini', personalFailed: true },
    })
    expect(h.updateMany).toHaveBeenCalledTimes(1)
  })

  it('a team-tier failure is not retried and not marked personal', async () => {
    const team = provider('openai', async () => {
      throw new Error('boom')
    })
    h.resolveWithSource.mockResolvedValueOnce({ provider: team, tier: 'team', providerName: 'openai' })

    const result = await gen('u1')
    expect(result).toMatchObject({ url: null, skip: 'PROVIDER_ERROR' })
    expect((result as { imageSource?: unknown }).imageSource).toBeUndefined()
    expect(team.generateImage).toHaveBeenCalledTimes(1)
    expect(h.resolveWithSource).toHaveBeenCalledTimes(1)
    expect(h.updateMany).not.toHaveBeenCalled()
  })

  it('a personal success records the personal source with no failure flag', async () => {
    const personal = provider('gemini', async () => ({ url: 'https://cdn.example.com/p.png' }))
    h.resolveWithSource.mockResolvedValueOnce({ provider: personal, tier: 'personal', providerName: 'gemini' })
    const result = await gen('u1')
    expect(result).toMatchObject({ url: 'https://cdn.example.com/p.png', imageSource: { tier: 'personal', provider: 'gemini' } })
    expect((result as unknown as { imageSource: Record<string, unknown> }).imageSource.personalFailed).toBeUndefined()
  })
})
