// 006 T5 (FR-09, AC-10): the token-usage accumulator. createMessage adds the
// response's usage only inside withUsage; an API-mode draft action whose two
// calls report usage records the sum; a CLI-mode action (no createMessage)
// records null; the insights query sums reported events only. No model call.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'

const h = vi.hoisted(() => ({
  draftUpdateMany: vi.fn(),
  revisionUpdateMany: vi.fn(),
  eventCreate: vi.fn(),
  dropUpsert: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
    draft: { updateMany: h.draftUpdateMany },
    draftRevision: { updateMany: h.revisionUpdateMany },
    analyticsEvent: { create: h.eventCreate },
    analyticsDrop: { upsert: h.dropUpsert },
  },
}))
vi.mock('@/lib/agent/userToken', () => ({ resolveClaudeAuth: async () => null }))
vi.mock('@/lib/agent/claudeAuth', () => ({
  runWithClaudeAuth: (_a: unknown, fn: () => unknown) => fn(),
}))

const { addUsage, newUsage, usageFields, withUsage, newActionTrace } = await import('@/lib/analytics/trace')
const { startDraftAction } = await import('@/lib/drafts/draftActions')
const { createMessage } = await import('@/lib/models/anthropicCall')
const { decideModel } = await import('@/lib/models/resolve')

const decided = decideModel('CAPTION', {
  requested: 'HAIKU',
  policy: { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false },
  credential: 'n/a',
  mode: 'api',
})
if (!decided.ok) throw new Error(decided.message)
const MODEL = decided.resolved

function client(usages: Array<{ input_tokens: number; output_tokens: number } | undefined>) {
  const create = vi.fn()
  for (const usage of usages) {
    create.mockResolvedValueOnce({ content: [{ type: 'text', text: 'x' }], stop_reason: 'end_turn', usage })
  }
  return { messages: { create } } as unknown as Anthropic
}
const params = { max_tokens: 100, messages: [{ role: 'user' as const, content: 'hi' }] }

const CLAIM = { action: 'REFINE', claimId: 'tok-1' } as const
const events = () => h.eventCreate.mock.calls.map((c) => (c[0] as { data: { payload: Record<string, unknown> } }).data)

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.draftUpdateMany.mockResolvedValue({ count: 1 })
  h.revisionUpdateMany.mockResolvedValue({ count: 1 })
  h.eventCreate.mockResolvedValue({})
  h.dropUpsert.mockResolvedValue({})
})

async function settled() {
  await vi.waitFor(() => expect(h.draftUpdateMany).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 20))
}

describe('usage accumulator (FR-09)', () => {
  it('addUsage outside withUsage is a no-op and createMessage still returns the message', async () => {
    const msg = await createMessage(client([{ input_tokens: 5, output_tokens: 7 }]), params, MODEL)
    expect(msg.stop_reason).toBe('end_turn')
    const store = newUsage()
    addUsage({ input_tokens: 1, output_tokens: 1 })
    expect(store).toEqual({ input: 0, output: 0, calls: 0 })
  })

  it('inside withUsage, two createMessage calls sum and survive a later throw', async () => {
    const store = newUsage()
    const c = client([
      { input_tokens: 100, output_tokens: 20 },
      { input_tokens: 50, output_tokens: 5 },
    ])
    await expect(
      withUsage(store, async () => {
        await createMessage(c, params, MODEL)
        await createMessage(c, params, MODEL)
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(usageFields(store)).toEqual({ inputTokens: 150, outputTokens: 25 })
  })

  it('a store with no reported call reports null, not zero', () => {
    expect(usageFields(newUsage())).toEqual({ inputTokens: null, outputTokens: null })
  })

  it('stores of concurrent runs do not mix', async () => {
    const a = newUsage()
    const b = newUsage()
    const c = client([
      { input_tokens: 1, output_tokens: 1 },
      { input_tokens: 10, output_tokens: 10 },
    ])
    await Promise.all([
      withUsage(a, () => createMessage(c, params, MODEL)),
      withUsage(b, async () => {
        await new Promise((r) => setTimeout(r, 5))
        await createMessage(c, params, MODEL)
      }),
    ])
    expect(usageFields(a)).toEqual({ inputTokens: 1, outputTokens: 1 })
    expect(usageFields(b)).toEqual({ inputTokens: 10, outputTokens: 10 })
  })
})

describe('draft_action.settled tokens (AC-10)', () => {
  it('API mode: two reporting calls record the summed tokens', async () => {
    const c = client([
      { input_tokens: 300, output_tokens: 40 },
      { input_tokens: 120, output_tokens: 10 },
    ])
    await startDraftAction(
      'd1', 'u1', 'team1', CLAIM,
      async () => {
        await createMessage(c, params, MODEL)
        await createMessage(c, params, MODEL)
      },
      undefined,
      newActionTrace(),
    )
    await settled()
    expect(events()[0].payload).toMatchObject({ inputTokens: 420, outputTokens: 50 })
  })

  it('CLI mode: no createMessage call records null tokens', async () => {
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => {}, undefined, newActionTrace())
    await settled()
    expect(events()[0].payload).toMatchObject({ inputTokens: null, outputTokens: null })
  })

  it('a failed action still reports the tokens it spent', async () => {
    const c = client([{ input_tokens: 9, output_tokens: 3 }])
    await startDraftAction(
      'd1', 'u1', 'team1', CLAIM,
      async () => {
        await createMessage(c, params, MODEL)
        throw new Error('then it failed')
      },
      undefined,
      newActionTrace(),
    )
    await settled()
    expect(events()[0].payload).toMatchObject({ inputTokens: 9, outputTokens: 3 })
  })
})
