// Reviewer follow-up to Task 13: get_draft (src/mcp/tools/generate.ts,
// dispatched by the stdio MCP server) was the one team/generate/publish tool
// still missing a team-scope guard — any resolved key could read any team's
// draft by id. This is a focused unit test on the tool function itself
// (mocked prisma + storage), not a new stdio-server test harness.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: { findUnique: mocks.findUnique },
  },
}))
vi.mock('@/lib/storage/minio', () => ({
  resolveExportUrl: vi.fn(async (key: string | null) => (key ? `https://signed/${key}` : null)),
}))

import { getDraft } from '@/mcp/tools/generate'

describe('getDraft (MCP/ACP)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the draft when it belongs to the caller\'s team', async () => {
    mocks.findUnique.mockResolvedValue({
      copyText: 'hello',
      imageUrl: null,
      exportUrl: 'exports/foo.png',
      status: 'EXPORTED',
      teamId: 'team-1',
    })
    await expect(getDraft({ id: 'draft-1', teamId: 'team-1' })).resolves.toEqual({
      copyText: 'hello',
      imageUrl: null,
      status: 'EXPORTED',
      exportUrl: 'https://signed/exports/foo.png',
    })
  })

  it('rejects a draft owned by a different team with a generic not-found error (no existence leak)', async () => {
    mocks.findUnique.mockResolvedValue({
      copyText: 'secret',
      imageUrl: null,
      exportUrl: 'exports/foo.png',
      status: 'EXPORTED',
      teamId: 'team-2',
    })
    await expect(getDraft({ id: 'draft-1', teamId: 'team-1' })).rejects.toThrow('Draft draft-1 not found')
  })

  it('rejects an unknown draft id the same way', async () => {
    mocks.findUnique.mockResolvedValue(null)
    await expect(getDraft({ id: 'nope', teamId: 'team-1' })).rejects.toThrow('Draft nope not found')
  })

  it('rejects a pre-tenancy draft with a null teamId', async () => {
    mocks.findUnique.mockResolvedValue({
      copyText: 'legacy',
      imageUrl: null,
      exportUrl: null,
      status: 'EXPORTED',
      teamId: null,
    })
    await expect(getDraft({ id: 'draft-legacy', teamId: 'team-1' })).rejects.toThrow('Draft draft-legacy not found')
  })
})
