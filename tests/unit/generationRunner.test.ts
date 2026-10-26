// Pure parts of the scheduled-generation runner: the backoff curve and the
// generation-failure test sentinel. The claim/lease/post-action flow is
// exercised end-to-end via /api/test/generation-tick in the E2E suite.
//
// Task 14 adds a focused unit test for the per-job team-credential wrap: each
// claimed job must run its generation call inside withClaudeAuth(null,
// entry.teamId, fn), and a team without a Claude credential must land in the
// existing retry/failure path (never crash the worker) rather than a new one.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shouldMockGenerateFail } from '@/lib/testHooks'

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
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
    scheduledGeneration: { findMany: h.findMany, update: h.update, updateMany: h.updateMany },
    brief: { findUnique: h.briefFindUnique, create: h.briefCreate },
    post: { create: h.postCreate },
  },
}))
vi.mock('@/lib/agent/generateDraft', () => ({ generateDraftForBrief: h.generateDraftForBrief }))
vi.mock('@/lib/publish/publishDraft', () => ({ findLivePost: h.findLivePost }))
vi.mock('@/lib/agent/userToken', () => ({ withClaudeAuth: h.withClaudeAuth }))

const { generationBackoffMs, runGenerationJobs, GENERATION_LEASE_MS } = await import('@/lib/scheduler/generationRunner')
const { ClaudeCliError } = await import('@/lib/agent/claudeCli')

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
    h.updateMany.mockReset().mockResolvedValue({ count: 1 })
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
      { userId: null, teamId: 'team-1', source: 'scheduler' },
      { templateId: null, onBeforeDesign: expect.any(Function) }
    )
    expect(h.update).toHaveBeenCalledWith({
      where: { id: 'sg-1' },
      data: {
        status: 'COMPLETED',
        draftId: 'draft-1',
        errorReason: null,
        nextRetryAt: null,
        heldReason: null,
      },
    })
  })

  it('a job for a credential-less team lands in the existing failure path with the no-credential message (no crash)', async () => {
    const entry = baseEntry({ id: 'sg-2', teamId: 'team-2', briefId: 'brief-2', retryCount: 0 })
    h.queryRaw.mockResolvedValue([{ id: 'sg-2' }])
    h.findMany.mockResolvedValue([entry])
    h.briefFindUnique.mockResolvedValue({ id: 'brief-2', teamId: 'team-2' })
    const noCredentialMessage =
      'No Claude credential available — connect a personal token in Settings or set the team token in Team settings'
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
        throw new Error('No Claude credential available — connect a personal token in Settings or set the team token in Team settings')
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

// 008 FR-12 / AC-10: the claim computes one lease per tick for both entries it
// claims, and they run one after the other, so each entry renews its own
// lease at its start and again before its design (the onBeforeDesign hook).
// Shown by the order of the mocked Prisma calls; Date.now is pinned, no timers.
describe('runGenerationJobs — lease renewal (008 AC-10)', () => {
  const NOW = 1_800_000_000_000
  afterEach(() => vi.restoreAllMocks())
  let log: string[]

  beforeEach(() => {
    h.queryRaw.mockReset()
    h.findMany.mockReset()
    h.briefFindUnique.mockReset().mockImplementation(async ({ where: { id } }: { where: { id: string } }) => ({ id }))
    h.postCreate.mockReset()
    h.findLivePost.mockReset()
    h.withClaudeAuth.mockReset().mockImplementation((_userId: unknown, _teamId: unknown, fn: () => unknown) => fn())
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    log = []
    h.updateMany.mockReset().mockImplementation(async ({ where }: { where: { id: string } }) => {
      log.push(`renew ${where.id}`)
      return { count: 1 }
    })
    h.update.mockReset().mockImplementation(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
      log.push(`${data.status} ${where.id}`)
      return {}
    })
    // The hook is what the real generateDraftForBrief runs before its design
    // (tests/unit/actionHeartbeats.test.ts shows that half).
    h.generateDraftForBrief
      .mockReset()
      .mockImplementation(async (brief: { id: string }, _actor: unknown, opts: { onBeforeDesign: () => Promise<void> }) => {
        log.push(`captions ${brief.id}`)
        await opts.onBeforeDesign()
        log.push(`design ${brief.id}`)
        return { draft: { id: `draft-${brief.id}` }, backgroundImageUrl: null }
      })
  })

  it('renews each entry at its start and before its design; the second entry is renewed before it starts', async () => {
    h.queryRaw.mockResolvedValue([{ id: 'sg-1' }, { id: 'sg-2' }])
    h.findMany.mockResolvedValue([
      baseEntry({ id: 'sg-1', briefId: 'brief-1' }),
      baseEntry({ id: 'sg-2', briefId: 'brief-2' }),
    ])

    await runGenerationJobs()

    expect(log).toEqual([
      'renew sg-1',
      'captions brief-1',
      'renew sg-1',
      'design brief-1',
      'COMPLETED sg-1',
      'renew sg-2',
      'captions brief-2',
      'renew sg-2',
      'design brief-2',
      'COMPLETED sg-2',
    ])
    // Each renewal is guarded on RUNNING and pushes the lease a full term from now.
    for (const [args] of h.updateMany.mock.calls) {
      expect(args).toEqual({
        where: { id: expect.stringMatching(/^sg-[12]$/), status: 'RUNNING' },
        data: { nextRetryAt: new Date(NOW + GENERATION_LEASE_MS) },
      })
    }
  })
})

// 008 FR-11 / AC-08 (the runner half): a usage-limit failure says so in
// errorReason, and is retried exactly like any other failure.
describe('runGenerationJobs — usage-limit errorReason (008 AC-08)', () => {
  const NOW = 1_800_000_000_000
  afterEach(() => vi.restoreAllMocks())
  const PREFIX = "Claude usage limit reached on the team's credential — "

  beforeEach(() => {
    h.queryRaw.mockReset().mockResolvedValue([{ id: 'sg-1' }])
    h.update.mockReset().mockResolvedValue({})
    h.updateMany.mockReset().mockResolvedValue({ count: 1 })
    h.briefFindUnique.mockReset().mockResolvedValue({ id: 'brief-1', teamId: 'team-1' })
    h.withClaudeAuth.mockReset().mockImplementation((_userId: unknown, _teamId: unknown, fn: () => unknown) => fn())
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  async function failWith(err: unknown, retryCount = 0) {
    h.findMany.mockReset().mockResolvedValue([baseEntry({ retryCount })])
    h.generateDraftForBrief.mockReset().mockRejectedValue(err)
    h.update.mockClear()
    await runGenerationJobs()
    expect(h.update).toHaveBeenCalledTimes(1)
    return h.update.mock.calls[0][0].data as Record<string, unknown>
  }

  const usageLimit = () =>
    new ClaudeCliError('claude -p failed (exit 1)', 1, '', '', { apiErrorStatus: 429 })

  it('prefixes errorReason; retryCount and nextRetryAt match a non-usage failure', async () => {
    const limited = await failWith(usageLimit())
    const other = await failWith(new ClaudeCliError('claude -p failed (exit 1)', 1, 'boom', ''))
    expect(limited.errorReason).toBe(PREFIX + 'claude -p failed (exit 1)')
    expect(other.errorReason).toBe('claude -p failed (exit 1)')
    expect({ ...limited, errorReason: null }).toEqual({ ...other, errorReason: null })
    expect(limited).toMatchObject({ status: 'PENDING', retryCount: 1, nextRetryAt: new Date(NOW + generationBackoffMs(1)) })
  })

  it('a CLI-written usage-limit phrase is prefixed too, and so is the final FAILED reason', async () => {
    const failed = await failWith(new ClaudeCliError('claude -p failed (exit 1)', 1, 'Claude AI usage limit reached|1760000000', ''), 3)
    expect(failed).toEqual({ status: 'FAILED', errorReason: PREFIX + 'claude -p failed (exit 1)', nextRetryAt: null })
  })

  it('model-written text that mentions a usage limit is not prefixed (L8)', async () => {
    const hostile = new ClaudeCliError('claude -p failed (exit 1)', 1, '', '', {
      diagnostic: 'assistant said: usage limit reached 429',
    })
    expect((await failWith(hostile)).errorReason).toBe('claude -p failed (exit 1)')
    expect((await failWith(new Error('usage limit reached 429'))).errorReason).toBe('usage limit reached 429')
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
