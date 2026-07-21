// toolGenerateImage (the Path B API-mode design-agent's `generateImage` tool,
// src/lib/agent/tools.ts) is the second call site the reviewer flagged: it
// used to resolve the image provider from a `briefId` lookup, which means a
// teammate B refining/regenerating teammate A's shared brief would resolve
// A's personal OpenAI key, not B's. It now takes an explicit `actor` param
// (threaded from designAgent.ts's DesignAgentOptions, itself threaded from
// pathA.ts/pathB.ts) and only falls back to the brief-owner lookup when no
// caller supplies one.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  briefFindUnique: vi.fn(),
  resolveImageProvider: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { brief: { findUnique: h.briefFindUnique } } }))
vi.mock('@/providers/registry', () => ({ resolveImageProvider: h.resolveImageProvider }))
// Not exercised by toolGenerateImage in these tests (the fake provider never
// returns a data: URL) — stubbed only so the module import doesn't pull in
// the real S3 client / puppeteer.
vi.mock('@/lib/storage/minio', () => ({
  persistDataUrlImage: vi.fn(),
  uploadObject: vi.fn(),
  resolveExportUrl: vi.fn(),
  exportKey: vi.fn(),
  BUCKET_EXPORTS: 'exports',
}))
vi.mock('@/lib/renderer/puppeteer', () => ({ renderHtmlToPng: vi.fn() }))

const { toolGenerateImage } = await import('@/lib/agent/tools')

beforeEach(() => {
  h.briefFindUnique.mockReset()
  h.resolveImageProvider.mockReset()
})

describe('toolGenerateImage — actor vs. brief owner', () => {
  const OWNER_ID = 'user-owner'
  const ACTOR_ID = 'user-actor'
  const TEAM_ID = 'team-1'

  it('an explicit actor is used directly — the brief is never looked up', async () => {
    h.resolveImageProvider.mockResolvedValue({
      generateImage: async () => ({ url: 'https://cdn.example.com/actor.png' }),
    })

    const result = await toolGenerateImage('a prompt', 'kit-1', 'brief-1', {
      userId: ACTOR_ID,
      teamId: TEAM_ID,
    })

    expect(result).toEqual({ url: 'https://cdn.example.com/actor.png' })
    expect(h.resolveImageProvider).toHaveBeenCalledWith({ teamId: TEAM_ID, userId: ACTOR_ID })
    // No DB round-trip needed when the caller already supplied who is acting.
    expect(h.briefFindUnique).not.toHaveBeenCalled()
  })

  it('an actor scoped to a DIFFERENT team/user than the brief owner still wins (regression guard)', async () => {
    // The brief row, if it were looked up, belongs to a different owner/team —
    // proves the resolution doesn't fall back to it when an actor is given.
    h.briefFindUnique.mockResolvedValue({ teamId: 'owner-team', userId: OWNER_ID })
    h.resolveImageProvider.mockImplementation(async (ctx: { teamId: string; userId?: string | null }) => {
      if (ctx.userId === ACTOR_ID && ctx.teamId === TEAM_ID) {
        return { generateImage: async () => ({ url: 'https://cdn.example.com/actor.png' }) }
      }
      throw new Error(`unexpected ctx: ${JSON.stringify(ctx)}`)
    })

    await toolGenerateImage('a prompt', 'kit-1', 'brief-1', { userId: ACTOR_ID, teamId: TEAM_ID })

    expect(h.briefFindUnique).not.toHaveBeenCalled()
  })

  it('no actor supplied ⇒ falls back to the brief-owner lookup (documented fallback for callers with none)', async () => {
    h.briefFindUnique.mockResolvedValue({ teamId: 'owner-team', userId: OWNER_ID })
    h.resolveImageProvider.mockResolvedValue({
      generateImage: async () => ({ url: 'https://cdn.example.com/owner.png' }),
    })

    const result = await toolGenerateImage('a prompt', 'kit-1', 'brief-1')

    expect(result).toEqual({ url: 'https://cdn.example.com/owner.png' })
    expect(h.briefFindUnique).toHaveBeenCalledWith({
      where: { id: 'brief-1' },
      select: { teamId: true, userId: true },
    })
    expect(h.resolveImageProvider).toHaveBeenCalledWith({ teamId: 'owner-team', userId: OWNER_ID })
  })

  it('a null resolveImageProvider result throws (no image provider configured)', async () => {
    h.resolveImageProvider.mockResolvedValue(null)
    await expect(
      toolGenerateImage('a prompt', 'kit-1', 'brief-1', { userId: ACTOR_ID, teamId: TEAM_ID })
    ).rejects.toThrow('No image provider configured for this team')
  })
})
