// Pure parts of the scheduled-generation runner: the backoff curve and the
// generation-failure test sentinel. The claim/lease/post-action flow is
// exercised end-to-end via /api/test/generation-tick in the E2E suite.
//
// Task 14 adds a focused unit test for the per-job team-credential wrap: each
// claimed job must run its generation call inside withClaudeAuth(null,
// entry.teamId, fn), and a team without a Claude credential must land in the
// existing retry/failure path (never crash the worker) rather than a new one.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shouldMockGenerateFail } from '@/lib/testHooks'

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  briefFindUnique: vi.fn(),
  briefCreate: vi.fn(),
  postCreate: vi.fn(),
  findLivePost: vi.fn(),
  generateDraftForBrief: vi.fn(),
  withClaudeAuth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: h.queryRaw,
    scheduledGeneration: { findMany: h.findMany, update: h.update },
    brief: { findUnique: h.briefFindUnique, create: h.briefCreate },
    post: { create: h.postCreate },
  },
}))
vi.mock('@/lib/agent/generateDraft', () => ({ generateDraftForBrief: h.generateDraftForBrief }))
vi.mock('@/lib/publish/publishDraft', () => ({ findLivePost: h.findLivePost }))
vi.mock('@/lib/agent/userToken', () => ({ withClaudeAuth: h.withClaudeAuth }))

const { generationBackoffMs, runGenerationJobs } = await import('@/lib/scheduler/generationRunner')

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sg-1',
    teamId: 'team-1',
    briefId: 'brief-1',
    createdById: 'user-1',
    campaignId: null,
    topic: 'topic',
    description: 'desc',
    goal: null,
    tone: null,
    channels: ['INSTAGRAM'],
    aspectRatio: 'SQUARE',
    designMode: 'FREEFORM',
    templateId: null,
    postAction: 'HOLD',
    publishAt: null,
    retryCount: 0,
    draftId: null,
    ...overrides,
  }
}

describe('runGenerationJobs — per-job team credentials (Task 14)', () => {
  beforeEach(() => {
    h.queryRaw.mockReset()
    h.findMany.mockReset()
    h.update.mockReset().mockResolvedValue({})
    h.briefFindUnique.mockReset()
    h.briefCreate.mockReset()
    h.postCreate.mockReset()
    h.findLivePost.mockReset()
    h.generateDraftForBrief.mockReset()
    h.withClaudeAuth.mockReset().mockImplementation((_userId: unknown, _teamId: unknown, fn: () => unknown) => fn())
  })

  it('a job for a team WITH a token runs its generation inside withClaudeAuth(null, teamId, fn) and completes', async () => {
    const entry = baseEntry({ id: 'sg-1', teamId: 'team-1', briefId: 'brief-1' })
    h.queryRaw.mockResolvedValue([{ id: 'sg-1' }])
    h.findMany.mockResolvedValue([entry])
    h.briefFindUnique.mockResolvedValue({ id: 'brief-1', teamId: 'team-1' })
    h.generateDraftForBrief.mockResolvedValue({ draft: { id: 'draft-1' }, backgroundImageUrl: null })

    await runGenerationJobs()

    expect(h.withClaudeAuth).toHaveBeenCalledWith(null, 'team-1', expect.any(Function))
    expect(h.generateDraftForBrief).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'brief-1' }),
      { userId: null, teamId: 'team-1' },
      { templateId: null }
    )
    expect(h.update).toHaveBeenCalledWith({
      where: { id: 'sg-1' },
      data: {
        status: 'COMPLETED',
        draftId: 'draft-1',
        errorReason: null,
        nextRetryAt: null,
      },
    })
  })

  it('a job for a credential-less team lands in the existing failure path with the no-credential message (no crash)', async () => {
    const entry = baseEntry({ id: 'sg-2', teamId: 'team-2', briefId: 'brief-2', retryCount: 0 })
    h.queryRaw.mockResolvedValue([{ id: 'sg-2' }])
    h.findMany.mockResolvedValue([entry])
    h.briefFindUnique.mockResolvedValue({ id: 'brief-2', teamId: 'team-2' })
    const noCredentialMessage =
      'No Claude credential available — connect a personal token in Settings or set the team token in Team Settings'
    h.generateDraftForBrief.mockRejectedValue(new Error(noCredentialMessage))

    await expect(runGenerationJobs()).resolves.toBeUndefined()

    expect(h.withClaudeAuth).toHaveBeenCalledWith(null, 'team-2', expect.any(Function))
    expect(h.update).toHaveBeenCalledWith({
      where: { id: 'sg-2' },
      data: {
        status: 'PENDING',
        retryCount: 1,
        nextRetryAt: expect.any(Date),
        errorReason: noCredentialMessage,
      },
    })
  })

  it('two jobs for two different teams each resolve their OWN team credential (no cross-team leakage)', async () => {
    const entry1 = baseEntry({ id: 'sg-1', teamId: 'team-1', briefId: 'brief-1' })
    const entry2 = baseEntry({ id: 'sg-2', teamId: 'team-2', briefId: 'brief-2' })
    h.queryRaw.mockResolvedValue([{ id: 'sg-1' }, { id: 'sg-2' }])
    h.findMany.mockResolvedValue([entry1, entry2])
    h.briefFindUnique.mockImplementation(async ({ where: { id } }: { where: { id: string } }) => ({
      id,
      teamId: id === 'brief-1' ? 'team-1' : 'team-2',
    }))
    h.generateDraftForBrief.mockImplementation(async (_brief: unknown, actor: { teamId: string }) => {
      if (actor.teamId === 'team-2') {
        throw new Error('No Claude credential available — connect a personal token in Settings or set the team token in Team Settings')
      }
      return { draft: { id: 'draft-1' }, backgroundImageUrl: null }
    })

    await runGenerationJobs()

    expect(h.withClaudeAuth).toHaveBeenCalledWith(null, 'team-1', expect.any(Function))
    expect(h.withClaudeAuth).toHaveBeenCalledWith(null, 'team-2', expect.any(Function))
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sg-1' }, data: expect.objectContaining({ status: 'COMPLETED' }) })
    )
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sg-2' }, data: expect.objectContaining({ status: 'PENDING' }) })
    )
  })
})

describe('generationBackoffMs', () => {
  it('backs off 20, 40 min then caps at 60', () => {
    expect(generationBackoffMs(1)).toBe(20 * 60_000)
    expect(generationBackoffMs(2)).toBe(40 * 60_000)
    expect(generationBackoffMs(3)).toBe(60 * 60_000)
    expect(generationBackoffMs(10)).toBe(60 * 60_000)
  })
})

describe('shouldMockGenerateFail', () => {
  it('fires only on the __FAIL_GEN_ALWAYS__ sentinel', () => {
    expect(shouldMockGenerateFail('Topic: __FAIL_GEN_ALWAYS__ webinar')).toBe(true)
    expect(shouldMockGenerateFail('Topic: normal webinar')).toBe(false)
    expect(shouldMockGenerateFail('__FAIL_ALWAYS__')).toBe(false)
  })
})
