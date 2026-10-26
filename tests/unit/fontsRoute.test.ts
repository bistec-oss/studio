// 031 AC-17: GET /api/fonts, the kit POST and PATCH routes and MCP create_brand_kit validate fonts.
// Prisma and auth are faked; the real routes, wrapper, validators and catalogue run.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  user: vi.fn(),
  team: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const brandKit = {
    findUnique: h.findUnique,
    create: h.create,
    update: h.update,
    updateMany: h.updateMany,
  }
  return { prisma: { brandKit, $transaction: (fn: (tx: unknown) => unknown) => fn({ brandKit }) } }
})
vi.mock('@/lib/auth', async () => {
  const roles = await import('@/lib/roles')
  return { getCurrentUser: h.user, hasRole: roles.hasRole }
})
vi.mock('@/lib/authz/teamContext', () => ({
  ACTIVE_TEAM_COOKIE: 'bistec-active-team',
  resolveActiveTeam: h.team,
}))

import { GET as getFonts } from '@/app/api/fonts/route'
import { POST as createKit } from '@/app/api/admin/brandkits/route'
import { PATCH as patchKit } from '@/app/api/admin/brandkits/[id]/route'
import { createBrandKit } from '@/mcp/tools/brandkit'
import { googleFontsUrl } from '@/lib/fonts/url'
import { findFamily } from '@/lib/fonts/catalogue'

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const ctx = { params: Promise.resolve({ id: 'k1' }) } as never
const ctxNone = { params: Promise.resolve({}) } as never

const ARTIFACT = { name: 'Brand Sans', url: 'http://minio/brand-kits/k1/brand.woff2' }
const GONE = { name: 'Fredoka One', url: 'https://fonts.googleapis.com/css2?family=Fredoka+One' }
const interUrl = () => googleFontsUrl(['Inter'], findFamily)

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset()
  h.user.mockResolvedValue({ userId: 'u1', role: 'editor' })
  h.team.mockResolvedValue({ kind: 'ok', teamId: 'team1', teamRole: 'ADMIN' })
  h.findUnique.mockResolvedValue({
    id: 'k1',
    teamId: 'team1',
    isDeleted: false,
    fonts: [ARTIFACT, GONE],
  })
  h.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 'new', ...data }))
  h.update.mockImplementation(async ({ data }: { data: object }) => ({ id: 'k1', ...data }))
})

describe('GET /api/fonts', () => {
  it('401 without a session', async () => {
    h.user.mockResolvedValue(null)
    expect((await getFonts(req('/api/fonts'), ctxNone)).status).toBe(401)
  })
  it('any team member gets the snapshot date and at most 20 families, prefix first', async () => {
    h.team.mockResolvedValue({ kind: 'ok', teamId: 'team1', teamRole: 'EDITOR' })
    const res = await getFonts(req('/api/fonts?q=noto'), ctxNone)
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j.snapshotDate).toMatch(/^\d{4}-/)
    expect(j.families.length).toBeLessThanOrEqual(20)
    expect(j.families[0].family.toLowerCase().startsWith('noto')).toBe(true)
  })
  it('script=sinhala returns only Sinhala families; a bad script is 400', async () => {
    const j = await (await getFonts(req('/api/fonts?script=sinhala&q=noto'), ctxNone)).json()
    expect(j.families.length).toBeGreaterThan(0)
    expect(j.families.every((f: { scripts: string[] }) => f.scripts.includes('sinhala'))).toBe(true)
    expect((await getFonts(req('/api/fonts?script=klingon'), ctxNone)).status).toBe(400)
  })
  it('truncates q to 60 characters', async () => {
    const res = await getFonts(req(`/api/fonts?q=${'a'.repeat(200)}`), ctxNone)
    expect(res.status).toBe(200)
  })
})

describe('kit PATCH fonts', () => {
  const patch = (fonts: unknown) => patchKit(req('/api/x', 'PATCH', { fonts }), ctx)

  it('keeps unchanged stored entries (artifact URL, missing family) and computes a new Google url', async () => {
    const res = await patch([ARTIFACT, GONE, { name: 'Inter', url: 'https://evil.example' }])
    expect(res.status).toBe(200)
    expect(h.update.mock.calls[0][0].data.fonts).toEqual([
      ARTIFACT,
      GONE,
      { name: 'Inter', url: interUrl() },
    ])
  })
  it('refuses an unknown new family and more than 6 entries; nothing is written', async () => {
    const r1 = await patch([{ name: 'Nope Sans', url: 'u' }])
    expect(r1.status).toBe(400)
    expect((await r1.json()).error).toBe('Unknown font: Nope Sans')
    const seven = Array.from({ length: 7 }, () => ({ name: 'Inter', url: 'u' }))
    expect((await patch(seven)).status).toBe(400)
    expect(h.update).not.toHaveBeenCalled()
  })
})

describe('kit POST and MCP create_brand_kit', () => {
  it('POST stores computed urls and refuses an unknown family', async () => {
    const ok = await createKit(
      req('/api/x', 'POST', { name: 'K', fonts: [{ name: 'Inter', url: 'u' }] }),
      ctxNone,
    )
    expect(ok.status).toBe(201)
    expect(h.create.mock.calls[0][0].data.fonts).toEqual([{ name: 'Inter', url: interUrl() }])
    h.create.mockClear()
    const bad = await createKit(
      req('/api/x', 'POST', { name: 'K', fonts: [{ name: 'Nope Sans', url: 'u' }] }),
      ctxNone,
    )
    expect(bad.status).toBe(400)
    expect(h.create).not.toHaveBeenCalled()
  })
  it('POST with no fonts still creates', async () => {
    expect((await createKit(req('/api/x', 'POST', { name: 'K' }), ctxNone)).status).toBe(201)
  })
  it('MCP refuses the same, and computes the url otherwise', async () => {
    await expect(
      createBrandKit({ name: 'K', teamId: 't', fonts: [{ name: 'Nope Sans', url: 'u' }] }),
    ).rejects.toThrow('Unknown font: Nope Sans')
    expect(h.create).not.toHaveBeenCalled()
    await createBrandKit({ name: 'K', teamId: 't', fonts: [{ name: 'Inter', url: 'u' }] })
    expect(h.create.mock.calls[0][0].data.fonts).toEqual([{ name: 'Inter', url: interUrl() }])
  })
})

// 031 FR-21 (T7): the kit PATCH takes scriptFonts; null or {} clears it (SQL NULL).
describe('kit PATCH scriptFonts', () => {
  const patch = (scriptFonts: unknown) => patchKit(req('/api/x', 'PATCH', { scriptFonts }), ctx)

  it('stores an offered script mapped to a family that has it', async () => {
    const res = await patch({ sinhala: 'Noto Sans Sinhala' })
    expect(res.status).toBe(200)
    expect(h.update.mock.calls[0][0].data.scriptFonts).toEqual({ sinhala: 'Noto Sans Sinhala' })
  })

  it('null and {} clear it to SQL NULL', async () => {
    const { Prisma } = await import('@prisma/client')
    for (const value of [null, {}]) {
      h.update.mockClear()
      expect((await patch(value)).status).toBe(200)
      expect(h.update.mock.calls[0][0].data.scriptFonts).toBe(Prisma.DbNull)
    }
  })

  it('refuses a non-offered script, an unknown family and a family without the script; nothing is written', async () => {
    for (const value of [{ tamil: 'Noto Sans Tamil' }, { sinhala: 'Nope Sinhala' }, { sinhala: 'Inter' }]) {
      const res = await patch(value)
      expect(res.status, JSON.stringify(value)).toBe(400)
    }
    expect(h.update).not.toHaveBeenCalled()
  })

  it('a malformed value is a 400 from the schema', async () => {
    expect((await patch({ sinhala: 42 })).status).toBe(400)
    expect((await patch(['Noto Sans Sinhala'])).status).toBe(400)
    expect(h.update).not.toHaveBeenCalled()
  })

  it('leaves scriptFonts alone when the field is absent', async () => {
    await patchKit(req('/api/x', 'PATCH', { name: 'Renamed' }), ctx)
    expect(h.update.mock.calls[0][0].data).not.toHaveProperty('scriptFonts')
  })
})
