// 025 FR-09 / AC-07: POST /api/admin/look-probe, with the background step, the
// brand kit and storage faked. 404 in production (before anything else), 403 for
// a non-super-admin, a verdict with threshold and promptHash under MOCK_AI, a
// non-hero key is 400, no row is written, and the IMAGES object is deleted.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ZodType } from 'zod'

const h = vi.hoisted(() => ({
  isSuperAdmin: true,
  generate: vi.fn(),
  deleteObject: vi.fn(),
  resolveKit: vi.fn(),
  prismaWrite: vi.fn(),
  claudeAuth: vi.fn(),
}))

vi.mock('@/lib/agent/userToken', () => ({
  withClaudeAuth: async (userId: string | null, teamId: string, fn: () => Promise<unknown>) => {
    h.claudeAuth(userId, teamId)
    return fn()
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: () => new Proxy({}, { get: () => h.prismaWrite }) }),
}))
vi.mock('@/lib/testHooks', () => ({ MOCK_AI: true }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: h.resolveKit }))
vi.mock('@/lib/agent/background', () => ({ generateBackgroundForBrief: h.generate }))
vi.mock('@/lib/storage/minio', () => ({ BUCKET_IMAGES: 'images', deleteObject: h.deleteObject }))
vi.mock('@/lib/api/handler', async () => {
  const { NextResponse } = await import('next/server')
  const parseBody = async (req: Request, schema: ZodType) => {
    const parsed = schema.safeParse(await req.json())
    if (parsed.success) return { data: parsed.data }
    return { response: NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 }) }
  }
  const withTeamAuth =
    (handler: (req: unknown, ctx: unknown, user: unknown) => unknown) => (req: unknown) =>
      handler(req, { params: {} }, { userId: 'u1', teamId: 'team-A', teamRole: 'ADMIN', isSuperAdmin: h.isSuperAdmin })
  return { parseBody, withTeamAuth }
})

import { POST } from '@/app/api/admin/look-probe/route'

const call = (body: unknown) =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request('http://localhost/api/admin/look-probe', { method: 'POST', body: JSON.stringify(body) }),
  )

const IMG_URL = 'http://localhost:9000/images/background-1-abc.png'

describe('POST /api/admin/look-probe', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => {
    h.isSuperAdmin = true
    h.generate.mockReset()
    h.deleteObject.mockReset().mockResolvedValue(undefined)
    h.prismaWrite.mockReset()
    h.claudeAuth.mockReset()
    h.resolveKit.mockReset().mockResolvedValue({ id: 'kit-1' })
    h.generate.mockImplementation(async (_b, _k, _h, _c, _a, _plan, onPrompt) => {
      onPrompt?.('the image prompt')
      return { url: IMG_URL, check: { ok: true } }
    })
    globalThis.fetch = vi.fn(
      async () => new Response(Buffer.from('png-bytes'), { status: 200, headers: { 'content-type': 'image/png' } }),
    ) as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    vi.unstubAllEnvs()
  })

  it('is 404 in production, before the role check or any call', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    h.isSuperAdmin = false
    const res = await call({ key: 'device-screen', size: 'SQUARE' })
    expect(res.status).toBe(404)
    expect(h.generate).not.toHaveBeenCalled()
  })

  it('runs the background step inside the acting user’s Claude auth context', async () => {
    let ranInside = false
    h.claudeAuth.mockImplementation(() => {
      h.generate.mockImplementationOnce(async () => {
        ranInside = true
        return { url: IMG_URL, check: { ok: true } }
      })
    })
    const res = await call({ key: 'device-screen', size: 'SQUARE' })
    expect(res.status).toBe(200)
    expect(h.claudeAuth).toHaveBeenCalledWith('u1', 'team-A')
    expect(ranInside).toBe(true)
  })

  it('is 403 for a non-super-admin', async () => {
    h.isSuperAdmin = false
    const res = await call({ key: 'device-screen', size: 'SQUARE' })
    expect(res.status).toBe(403)
    expect(h.generate).not.toHaveBeenCalled()
  })

  it('is 400 for a non-hero key, a bad size and an unknown field', async () => {
    expect((await call({ key: 'classic', size: 'SQUARE' })).status).toBe(400)
    expect((await call({ key: 'no-such-look', size: 'SQUARE' })).status).toBe(400)
    expect((await call({ key: 'device-screen', size: 'WIDE' })).status).toBe(400)
    expect((await call({ key: 'device-screen', size: 'SQUARE', extra: 1 })).status).toBe(400)
    expect(h.generate).not.toHaveBeenCalled()
  })

  it('031 FR-48: a super admin plans an explicit contract version (spotlight v2), and the default is `current`', async () => {
    const res = await call({ key: 'spotlight', size: 'SQUARE', version: 2 })
    expect(res.status).toBe(200)
    expect(h.generate.mock.calls[0][5]).toMatchObject({ kind: 'hero', requestedArchetype: 'spotlight', contractVersion: 2 })
    expect(h.generate.mock.calls[0][5].sizeContract.regions[0].rect).toEqual({ x: 0, y: 0, w: 100, h: 20 })
    h.generate.mockClear()
    await call({ key: 'spotlight', size: 'SQUARE' })
    expect(h.generate.mock.calls[0][5]).toMatchObject({ contractVersion: 2 })
    h.generate.mockClear()
    await call({ key: 'spotlight', size: 'SQUARE', version: 1 })
    expect(h.generate.mock.calls[0][5]).toMatchObject({ contractVersion: 1 })
  })

  it('031 FR-48: refuses a version over the latest, a non-integer, zero and a non-super-admin', async () => {
    expect((await call({ key: 'spotlight', size: 'SQUARE', version: 3 })).status).toBe(400)
    expect((await call({ key: 'spotlight', size: 'SQUARE', version: 1.5 })).status).toBe(400)
    expect((await call({ key: 'spotlight', size: 'SQUARE', version: 0 })).status).toBe(400)
    expect((await call({ key: 'spotlight', size: 'SQUARE', version: '2' })).status).toBe(400)
    expect((await call({ key: 'no-such-look', size: 'SQUARE', version: 1 })).status).toBe(400)
    expect(h.generate).not.toHaveBeenCalled()
    h.isSuperAdmin = false
    expect((await call({ key: 'spotlight', size: 'SQUARE', version: 2 })).status).toBe(403)
    expect(h.generate).not.toHaveBeenCalled()
  })

  it('under MOCK_AI returns a verdict with threshold and promptHash, and writes no row', async () => {
    const res = await call({ key: 'device-screen', size: 'PORTRAIT' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.verdict).toEqual({ ok: true })
    expect(body.fallbackReason).toBeNull()
    expect(body.threshold).toBe(0.04)
    expect(body.promptHash).toMatch(/^[0-9a-f]{64}$/)
    expect(body.image).toBe(`data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`)
    expect(h.prismaWrite).not.toHaveBeenCalled()
    // One hero plan at the asked size, the mock sentinel in the topic, the probe's own callback.
    const [brief, , , , actor, plan] = h.generate.mock.calls[0]
    expect(brief.topic).toContain('Product screen probe')
    expect(brief.topic).toContain('__MOCK_BG__')
    expect(actor).toEqual({ userId: 'u1', teamId: 'team-A' })
    expect(plan).toMatchObject({ kind: 'hero', requestedArchetype: 'device-screen', size: 'PORTRAIT' })
  })

  it('returns the failed check reason as fallbackReason', async () => {
    h.generate.mockImplementation(async () => ({ url: IMG_URL, check: { ok: false, reason: 'composite-not-blank' } }))
    const body = await (await call({ key: 'device-screen', size: 'STORY' })).json()
    expect(body.verdict).toEqual({ ok: false, reason: 'composite-not-blank' })
    expect(body.fallbackReason).toBe('composite-not-blank')
  })

  it('025 A1: the response carries the detected rect (null when the check kept no screen or failed)', async () => {
    const rect = { x: 17.41, y: 44.12, w: 71.2, h: 44.5 }
    h.generate.mockImplementation(async () => ({ url: IMG_URL, check: { ok: true, composites: [{ region: 0, rect }] } }))
    const kept = await (await call({ key: 'device-screen', size: 'SQUARE' })).json()
    expect(kept.rect).toEqual(rect)
    expect(kept.verdict).toEqual({ ok: true, composites: [{ region: 0, rect }] })
    h.generate.mockImplementation(async () => ({ url: IMG_URL, check: { ok: true } }))
    expect((await (await call({ key: 'device-screen', size: 'SQUARE' })).json()).rect).toBeNull()
    h.generate.mockImplementation(async () => ({ url: IMG_URL, check: { ok: false, reason: 'composite-not-blank' } }))
    expect((await (await call({ key: 'device-screen', size: 'SQUARE' })).json()).rect).toBeNull()
  })

  it('deletes the persisted IMAGES object after building the response', async () => {
    await call({ key: 'device-screen', size: 'SQUARE' })
    expect(h.deleteObject).toHaveBeenCalledTimes(1)
    expect(h.deleteObject).toHaveBeenCalledWith('images', 'background-1-abc.png')
  })

  it('still deletes the object when the image cannot be read back', async () => {
    globalThis.fetch = vi.fn(async () => new Response('x', { status: 500 })) as typeof fetch
    const res = await call({ key: 'device-screen', size: 'SQUARE' })
    expect(res.status).toBe(502)
    expect(h.deleteObject).toHaveBeenCalledWith('images', 'background-1-abc.png')
  })

  it('is 502 with the skip reason when no image was produced', async () => {
    h.generate.mockImplementation(async () => ({ url: null, skip: 'NO_PROVIDER' }))
    const res = await call({ key: 'device-screen', size: 'SQUARE' })
    expect(res.status).toBe(502)
    expect((await res.json()).skip).toBe('NO_PROVIDER')
    expect(h.deleteObject).not.toHaveBeenCalled()
  })
})
