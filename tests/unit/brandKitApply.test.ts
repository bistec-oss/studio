// 031 T12 (AC-31, FR-34): POST /api/admin/brandkits/[id]/assistant/apply. Prisma and auth are
// faked; the real route wrapper, validators and font lookup run.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  txPromptFindFirst: vi.fn(),
  txPromptUpdateMany: vi.fn(),
  txPromptCreate: vi.fn(),
  txKitUpdate: vi.fn(),
  transaction: vi.fn(),
  user: vi.fn(),
  team: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { brandKit: { findFirst: h.findFirst }, $transaction: h.transaction },
}))
vi.mock('@/lib/auth', async () => {
  const roles = await import('@/lib/roles')
  return { getCurrentUser: h.user, hasRole: roles.hasRole }
})
vi.mock('@/lib/authz/teamContext', () => ({
  ACTIVE_TEAM_COOKIE: 'bistec-active-team',
  resolveActiveTeam: h.team,
}))

import { POST } from '@/app/api/admin/brandkits/[id]/assistant/apply/route'

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
const post = (body: unknown, id = 'k1') =>
  (POST as unknown as Handler)(
    new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  )

const kit = (over: Record<string, unknown> = {}) => ({
  id: 'k1',
  teamId: 'team1',
  fonts: [
    { name: 'Roboto', url: 'u-roboto' },
    { name: 'Lora', url: 'u-lora' },
    { name: 'Oswald', url: 'u-oswald' },
  ],
  scriptFonts: null,
  ...over,
})

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset()
  h.user.mockResolvedValue({ userId: 'u1', role: 'editor' })
  h.team.mockResolvedValue({ kind: 'ok', teamId: 'team1', teamRole: 'ADMIN' })
  h.findFirst.mockResolvedValue(kit())
  // createPromptVersion reads the latest version first; a fonts-only apply then reads the active content.
  h.txPromptFindFirst.mockImplementation(async (args: { orderBy?: unknown }) =>
    args.orderBy ? { version: 2 } : { content: 'active voice' },
  )
  h.txPromptCreate.mockImplementation(async ({ data }) => ({ id: 'p3', ...data }))
  h.txKitUpdate.mockImplementation(async ({ data }) => ({ id: 'k1', ...data }))
  h.transaction.mockImplementation(async (fn) =>
    fn({
      brandKitPrompt: { findFirst: h.txPromptFindFirst, updateMany: h.txPromptUpdateMany, create: h.txPromptCreate },
      brandKit: { update: h.txKitUpdate },
    }),
  )
})

describe('assistant apply route', () => {
  it('writes voice, colors, fonts and scriptFonts in ONE transaction with previousFonts set', async () => {
    const res = await post({
      voice: 'New voice',
      colors: ['#112233'],
      fonts: { heading: 'Playfair Display', body: 'Inter' },
      scriptFonts: { sinhala: 'Noto Sans Sinhala' },
    })
    expect(res.status).toBe(200)
    expect(h.transaction).toHaveBeenCalledTimes(1)
    const created = h.txPromptCreate.mock.calls[0][0].data
    expect(created).toMatchObject({ content: 'New voice', version: 3, isActive: true, createdBy: 'u1' })
    expect(created.previousFonts).toEqual({ fonts: kit().fonts, scriptFonts: null })
    const data = h.txKitUpdate.mock.calls[0][0].data
    expect(data.colors).toEqual(['#112233'])
    // Positions 0 and 1 are replaced (urls computed); the rest is kept.
    expect(data.fonts.map((f: { name: string }) => f.name)).toEqual(['Playfair Display', 'Inter', 'Oswald'])
    expect(data.fonts[0].url).toContain('fonts.googleapis.com')
    expect(data.scriptFonts).toEqual({ sinhala: 'Noto Sans Sinhala' })
  })

  it('fonts only: the new version reuses the active content and carries previousFonts', async () => {
    const res = await post({ fonts: { heading: 'Inter' } })
    expect(res.status).toBe(200)
    const created = h.txPromptCreate.mock.calls[0][0].data
    expect(created.content).toBe('active voice')
    expect(created.previousFonts).toBeTruthy()
  })

  it('voice only: a new version with NO previousFonts, and the kit fonts are untouched', async () => {
    const res = await post({ voice: 'Only voice' })
    expect(res.status).toBe(200)
    expect(h.txPromptCreate.mock.calls[0][0].data).not.toHaveProperty('previousFonts')
    expect(h.txKitUpdate.mock.calls[0][0].data).not.toHaveProperty('fonts')
  })

  it('colors only: no new voice version', async () => {
    const res = await post({ colors: ['#fff'] })
    expect(res.status).toBe(200)
    expect(h.txPromptCreate).not.toHaveBeenCalled()
  })

  it('an unknown font is a 400 and NOTHING is written', async () => {
    const res = await post({ voice: 'v', colors: ['#fff'], fonts: { heading: 'Inter', body: 'Zzyzx Mock Sans' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Unknown font: Zzyzx Mock Sans')
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('a script font that does not support the script is a 400 and nothing is written', async () => {
    const res = await post({ voice: 'v', scriptFonts: { sinhala: 'Inter' } })
    expect(res.status).toBe(400)
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('a script that is not offered, an unknown body key and an empty body are 400', async () => {
    expect((await post({ scriptFonts: { tamil: 'Noto Sans Sinhala' } })).status).toBe(400)
    expect((await post({ voice: 'v', extra: 1 })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('P2002 from a concurrent version is a 409', async () => {
    const { Prisma } = await import('@prisma/client')
    h.transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    )
    expect((await post({ voice: 'v' })).status).toBe(409)
  })

  it('another team kit and a missing kit are 404 (never 403)', async () => {
    h.findFirst.mockResolvedValue(kit({ teamId: 'other' }))
    expect((await post({ voice: 'v' })).status).toBe(404)
    h.findFirst.mockResolvedValue(null)
    expect((await post({ voice: 'v' })).status).toBe(404)
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it('a team editor is 403 and no session is 401', async () => {
    h.team.mockResolvedValue({ kind: 'ok', teamId: 'team1', teamRole: 'EDITOR' })
    expect((await post({ voice: 'v' })).status).toBe(403)
    h.user.mockResolvedValue(null)
    expect((await post({ voice: 'v' })).status).toBe(401)
    expect(h.transaction).not.toHaveBeenCalled()
  })
})
