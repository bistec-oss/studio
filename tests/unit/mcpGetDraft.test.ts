// Reviewer follow-up to Task 13: get_draft (src/mcp/tools/generate.ts,
// dispatched by the stdio MCP server) was the one team/generate/publish tool
// still missing a team-scope guard — any resolved key could read any team's
// draft by id. This is a focused unit test on the tool function itself
// (mocked prisma + storage), not a new stdio-server test harness.
//
// Task 14b adds generatePost coverage: the reviewer flagged that MCP/ACP
// generation (this same file's generatePost) called generateDraftForBrief
// completely unwrapped — a CLI-mode call had no ALS auth context and would
// hard-fail with the no-credential ClaudeCliError. Fixed by wrapping the call
// in withClaudeAuth(null, teamId, ...), mirroring the Task 14 scheduler fix in
// generationRunner.ts. This test asserts the wrap, using the same
// mock-withClaudeAuth-as-passthrough pattern as generationRunner.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  briefCreate: vi.fn(),
  campaignFindFirst: vi.fn(),
  getSystemUserId: vi.fn(),
  generateDraftForBrief: vi.fn(),
  withClaudeAuth: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: { findUnique: mocks.findUnique },
    brief: { create: mocks.briefCreate },
    campaign: { findFirst: mocks.campaignFindFirst },
  },
}))
vi.mock('@/lib/storage/minio', () => ({
  resolveExportUrl: vi.fn(async (key: string | null) => (key ? `https://signed/${key}` : null)),
}))
vi.mock('@/mcp/systemUser', () => ({ getSystemUserId: mocks.getSystemUserId }))
vi.mock('@/lib/agent/generateDraft', () => ({
  generateDraftForBrief: mocks.generateDraftForBrief,
  NoBrandKitError: class NoBrandKitError extends Error {},
}))
vi.mock('@/lib/agent/userToken', () => ({ withClaudeAuth: mocks.withClaudeAuth }))

import { getDraft, generatePost } from '@/mcp/tools/generate'

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

describe('generatePost (MCP/ACP) — runs under the team Claude credential (Task 14b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.briefCreate.mockResolvedValue({ id: 'brief-1', teamId: 'team-1' })
    mocks.getSystemUserId.mockResolvedValue('system-user-1')
    mocks.withClaudeAuth.mockImplementation((_userId: unknown, _teamId: unknown, fn: () => unknown) => fn())
  })

  const args = {
    topic: 'topic',
    goal: 'goal',
    tone: 'tone',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE' as const,
    teamId: 'team-1',
  }

  it('wraps generateDraftForBrief in withClaudeAuth(null, teamId, fn) and returns the draft', async () => {
    mocks.generateDraftForBrief.mockResolvedValue({
      draft: { id: 'draft-1', exportUrl: 'exports/foo.png', htmlContent: '<html/>' },
      backgroundImageUrl: null,
    })

    const result = await generatePost(args)

    expect(mocks.withClaudeAuth).toHaveBeenCalledWith(null, 'team-1', expect.any(Function))
    expect(mocks.generateDraftForBrief).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'brief-1' }),
      { userId: null, teamId: 'team-1' }
    )
    expect(result).toEqual({
      draftId: 'draft-1',
      exportUrl: 'https://signed/exports/foo.png',
      htmlContent: '<html/>',
    })
  })

  it('a team with no Claude credential surfaces the no-credential error (generation runs inside the wrap, not around it)', async () => {
    const noCredentialMessage =
      'No Claude credential available — connect a personal token in Settings or set the team token in Team Settings'
    mocks.generateDraftForBrief.mockRejectedValue(new Error(noCredentialMessage))

    await expect(generatePost(args)).rejects.toThrow(noCredentialMessage)

    expect(mocks.withClaudeAuth).toHaveBeenCalledWith(null, 'team-1', expect.any(Function))
  })
})
