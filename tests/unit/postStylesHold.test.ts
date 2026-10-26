// 027 T5 — the HOLD downgrade (FR-12): the pure reason builder, and the runner's
// gate and run-time key failure with Prisma, the generator and the post action
// mocked. The end-to-end half is E2E section AE (POST /api/test/generation-tick).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FactsCheck, Flag } from '@/lib/factsCheck/types'

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  briefFindUnique: vi.fn(),
  briefCreate: vi.fn(),
  campaignFindUnique: vi.fn(),
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
    campaign: { findUnique: h.campaignFindUnique },
    post: { create: h.postCreate },
  },
}))
vi.mock('@/lib/agent/generateDraft', () => ({ generateDraftForBrief: h.generateDraftForBrief }))
vi.mock('@/lib/publish/publishDraft', () => ({ findLivePost: h.findLivePost }))
vi.mock('@/lib/agent/userToken', () => ({ withClaudeAuth: h.withClaudeAuth }))

const { heldReasonFor, checkHoldsPublish, HELD_REASON_COULD_NOT_RUN, HELD_REASON_MAX } = await import(
  '@/lib/scheduler/heldReason'
)
const { runGenerationJobs } = await import('@/lib/scheduler/generationRunner')

function flag(value: string, where: Flag['where'] = 'INSTAGRAM'): Flag {
  return { kind: 'cur', value, where }
}
function check(status: FactsCheck['status'], flagged: Flag[] = []): FactsCheck {
  return {
    v: 1,
    status,
    checkedAt: '2026-10-25T00:00:00.000Z',
    flagged,
    ...(status === 'error' ? { reason: 'boom' } : {}),
  }
}

describe('heldReasonFor (pure)', () => {
  it('names the flagged values in a fixed sentence', () => {
    expect(heldReasonFor(check('flagged', [flag('$49'), flag('35%')]))).toBe(
      'Not published: the facts check flagged $49, 35%. Review the draft, then publish it by hand.',
    )
  })

  it('lists one value once, even if it is flagged in two places', () => {
    const r = heldReasonFor(check('flagged', [flag('$49', 'headline'), flag('$49', 'LINKEDIN')]))
    expect(r.match(/\$49/g)).toHaveLength(1)
  })

  it('shows at most five values and counts the rest', () => {
    const r = heldReasonFor(check('flagged', ['$1', '$2', '$3', '$4', '$5', '$6', '$7'].map((v) => flag(v))))
    expect(r).toContain('$1, $2, $3, $4, $5 and 2 more.')
    expect(r).not.toContain('$6')
  })

  it('never exceeds 300 characters', () => {
    const values = [1, 2, 3, 4, 5, 6].map((n) => flag(`${n}${'x'.repeat(39)}`))
    expect(heldReasonFor(check('flagged', values)).length).toBeLessThanOrEqual(HELD_REASON_MAX)
  })

  it('an errored or missing check reads "could not run"', () => {
    expect(heldReasonFor(check('error'))).toBe(HELD_REASON_COULD_NOT_RUN)
    expect(heldReasonFor(null)).toBe(HELD_REASON_COULD_NOT_RUN)
    expect(HELD_REASON_COULD_NOT_RUN).toBe(
      'Not published: the facts check could not run. Review the draft, then publish it by hand.',
    )
  })

  it('holds on everything but a clear check, a missing check included (fail closed)', () => {
    expect(checkHoldsPublish(check('clear'))).toBe(false)
    expect(checkHoldsPublish(check('flagged', [flag('$1')]))).toBe(true)
    expect(checkHoldsPublish(check('error'))).toBe(true)
    expect(checkHoldsPublish(null)).toBe(true)
  })
})

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sg-1',
    teamId: 'team-1',
    briefId: null,
    createdById: 'user-1',
    campaignId: 'camp-1',
    topic: 'topic',
    description: null,
    postStyle: 'promotion',
    goal: 'promotion',
    tone: 'bold',
    channels: ['INSTAGRAM'],
    aspectRatio: 'SQUARE',
    designMode: 'GENERATE',
    templateId: null,
    postAction: 'SCHEDULE_PUBLISH',
    publishAt: new Date('2026-12-01T00:00:00Z'),
    retryCount: 0,
    draftId: null,
    ...overrides,
  }
}

function runWith(e: Record<string, unknown>, draft: Record<string, unknown>) {
  h.queryRaw.mockResolvedValue([{ id: 'sg-1' }])
  h.findMany.mockResolvedValue([e])
  h.generateDraftForBrief.mockResolvedValue({ draft: { id: 'draft-1', ...draft }, backgroundImageUrl: null })
  return runGenerationJobs()
}

const lastUpdate = () => h.update.mock.calls.filter((c) => c[0].data.status).at(-1)![0].data

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  h.update.mockResolvedValue({})
  h.updateMany.mockResolvedValue({ count: 1 })
  h.briefCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'brief-1',
    ...data,
  }))
  h.postCreate.mockResolvedValue({})
  h.findLivePost.mockResolvedValue(null)
  h.withClaudeAuth.mockImplementation((_u: unknown, _t: unknown, fn: () => unknown) => fn())
})

describe('the gate (FR-12)', () => {
  it.each(['SCHEDULE_PUBLISH', 'PUBLISH_NOW'])(
    '%s with a flagged check: no Post row, COMPLETED with heldReason',
    async (postAction) => {
      await runWith(entry({ postAction }), { factsCheck: check('flagged', [flag('$49')]) })
      expect(h.postCreate).not.toHaveBeenCalled()
      expect(lastUpdate()).toMatchObject({
        status: 'COMPLETED',
        draftId: 'draft-1',
        heldReason: 'Not published: the facts check flagged $49. Review the draft, then publish it by hand.',
      })
    },
  )

  it('an errored check holds with the "could not run" reason', async () => {
    await runWith(entry(), { factsCheck: check('error') })
    expect(h.postCreate).not.toHaveBeenCalled()
    expect(lastUpdate().heldReason).toBe(HELD_REASON_COULD_NOT_RUN)
  })

  it('a missing or unreadable check holds (fail closed)', async () => {
    await runWith(entry(), {})
    expect(h.postCreate).not.toHaveBeenCalled()
    expect(lastUpdate().heldReason).toBe(HELD_REASON_COULD_NOT_RUN)
    h.update.mockClear()
    await runWith(entry(), { factsCheck: { status: 'weird' } })
    expect(h.postCreate).not.toHaveBeenCalled()
    expect(lastUpdate().heldReason).toBe(HELD_REASON_COULD_NOT_RUN)
  })

  it('a clear check runs the post action as before and holds nothing', async () => {
    await runWith(entry(), { factsCheck: check('clear') })
    expect(h.postCreate).toHaveBeenCalledTimes(1)
    expect(lastUpdate()).toMatchObject({ status: 'COMPLETED', heldReason: null })
  })

  it('a HOLD entry is unaffected, flagged or not', async () => {
    await runWith(entry({ postAction: 'HOLD' }), { factsCheck: check('flagged', [flag('$49')]) })
    expect(h.postCreate).not.toHaveBeenCalled()
    expect(lastUpdate()).toMatchObject({ status: 'COMPLETED', heldReason: null })
  })

  it('leaves postAction alone (the table still shows what was intended)', async () => {
    await runWith(entry(), { factsCheck: check('flagged', [flag('$49')]) })
    expect(lastUpdate()).not.toHaveProperty('postAction')
  })
})

describe('ensureBrief (FR-12, FR-16)', () => {
  it('a stored key is resolved and written to the brief (goal from the style, the entry tone, classic)', async () => {
    await runWith(entry({ postStyle: 'hiring', goal: 'whatever', tone: 'casual' }), {
      factsCheck: check('clear'),
    })
    const data = h.briefCreate.mock.calls[0][0].data
    expect(data).toMatchObject({ postStyle: 'hiring', tone: 'casual', imageStyle: 'classic' })
    expect(data.goal).not.toBe('whatever')
  })

  it('a stored key that does not resolve fails the entry with the named reason: no brief, no draft, no Post', async () => {
    await runWith(entry({ postStyle: 'nope' }), { factsCheck: check('clear') })
    expect(h.briefCreate).not.toHaveBeenCalled()
    expect(h.generateDraftForBrief).not.toHaveBeenCalled()
    expect(h.postCreate).not.toHaveBeenCalled()
    expect(lastUpdate()).toMatchObject({
      status: 'PENDING',
      retryCount: 1,
      errorReason: 'Post style "nope" is not available',
    })
  })

  it('the entry fails closed on the last retry too', async () => {
    await runWith(entry({ postStyle: 'nope', retryCount: 3 }), {})
    expect(lastUpdate()).toMatchObject({ status: 'FAILED', errorReason: 'Post style "nope" is not available' })
  })

  it('a null stored key is a pre-027 entry: its own goal and tone, no style, still gated by the check', async () => {
    await runWith(entry({ postStyle: null, goal: 'Awareness', tone: 'Friendly' }), {
      factsCheck: check('flagged', [flag('$9')]),
    })
    expect(h.briefCreate.mock.calls[0][0].data).toMatchObject({
      postStyle: null,
      goal: 'Awareness',
      tone: 'Friendly',
    })
    expect(h.postCreate).not.toHaveBeenCalled()
    expect(lastUpdate().heldReason).toContain('$9')
  })

  it("the campaign's tone default is read only when the entry stored no tone", async () => {
    h.campaignFindUnique.mockResolvedValue({ defaultPostStyle: null, defaultTone: 'empathetic care' })
    await runWith(entry({ tone: '' }), { factsCheck: check('clear') })
    expect(h.campaignFindUnique).toHaveBeenCalledTimes(1)
    expect(h.briefCreate.mock.calls[0][0].data.tone).toBe('empathetic')
    h.campaignFindUnique.mockClear()
    await runWith(entry({ tone: 'bold' }), { factsCheck: check('clear') })
    expect(h.campaignFindUnique).not.toHaveBeenCalled()
  })

  it('a retry reuses the stored brief and does not resolve again', async () => {
    h.briefFindUnique.mockResolvedValue({ id: 'brief-9' })
    await runWith(entry({ briefId: 'brief-9', postStyle: 'nope' }), { factsCheck: check('clear') })
    expect(h.briefCreate).not.toHaveBeenCalled()
    expect(lastUpdate().status).toBe('COMPLETED')
  })
})
