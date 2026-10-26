// 008 T5 — AC-13: the one SDK boundary, createMessage (FR-07, design §6).
//
//   - a thinking-first response returns its text block (textOf);
//   - stop_reason "refusal" throws ModelRefusalError, whose message
//     humanizeGenerationError passes through;
//   - max_tokens 2048 becomes 16000 on Sonnet (the thinking floor) and stays
//     2048 on Haiku;
//   - a request still running at the deadline is aborted — fake timers drive
//     the signal, there is no wall clock;
//   - the recorder gets exactly one record, before the request.
//
// The client is a fake: no real model call is ever made.
// AC-13's "the caption provider no longer reads content[0]" (T6) is the
// AnthropicCopyProvider block at the end.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { createMessage, textOf, ModelRefusalError } from '@/lib/models/anthropicCall'
import { setModelCallSink, type ModelCallRecord } from '@/lib/models/modelCalls'
import { decideModel, internalModel, type ResolvedModel } from '@/lib/models/resolve'
import { humanizeGenerationError } from '@/lib/agent/generationErrors'
import type { ModelKey, UserSurface } from '@/lib/models/catalogue'

function resolvedFor(surface: UserSurface, key: ModelKey): ResolvedModel {
  const r = decideModel(surface, {
    requested: key,
    policy: { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false },
    credential: 'n/a',
    mode: 'api',
  })
  if (!r.ok) throw new Error(r.message)
  return r.resolved
}

const SONNET = resolvedFor('CAPTION', 'SONNET')
const HAIKU = resolvedFor('CAPTION', 'HAIKU')

type CreateArgs = [Record<string, unknown>, { signal?: AbortSignal } | undefined]

// A fake client whose messages.create returns `reply` (or runs `impl`).
function fakeClient(impl: (...args: CreateArgs) => Promise<unknown>) {
  const create = vi.fn(impl)
  return { client: { messages: { create } } as unknown as Anthropic, create }
}
const reply = (message: Record<string, unknown>) => async () => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'x',
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
  content: [{ type: 'text', text: 'hello' }],
  ...message,
})

const params = { max_tokens: 2048, messages: [{ role: 'user' as const, content: 'hi' }] }

let records: ModelCallRecord[]
beforeEach(() => {
  records = []
  setModelCallSink({
    record: (r) => records.push(r),
    read: () => records,
    clear: () => (records = []),
  })
})
afterEach(() => {
  setModelCallSink(null)
  vi.useRealTimers()
})

describe('AC-13: createMessage', () => {
  it('a response whose first block is `thinking` returns its text block', async () => {
    const { client } = fakeClient(
      reply({
        content: [
          { type: 'thinking', thinking: 'let me think', signature: 'sig' },
          { type: 'text', text: 'the answer' },
        ],
      }),
    )
    const message = await createMessage(client, params, SONNET)
    expect(textOf(message)).toBe('the answer')
  })

  it('textOf joins every text block and skips the rest', () => {
    expect(
      textOf({
        content: [
          { type: 'text', text: 'a' },
          { type: 'thinking', thinking: 't' },
          { type: 'tool_use', id: 'x', name: 'n', input: {} },
          { type: 'text', text: 'b' },
        ] as never,
      }),
    ).toBe('ab')
    expect(textOf({ content: [] })).toBe('')
  })

  it('stop_reason "refusal" throws ModelRefusalError with the category', async () => {
    const { client } = fakeClient(
      reply({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] }),
    )
    const err = await createMessage(client, params, SONNET).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ModelRefusalError)
    expect((err as Error).message).toBe('The model declined this request (cyber).')
    // humanizeGenerationError passes the readable message through unchanged.
    expect(humanizeGenerationError(err)).toBe('The model declined this request (cyber).')
  })

  it('a refusal with no stop_details still throws, naming no category', async () => {
    const { client } = fakeClient(reply({ stop_reason: 'refusal', content: [] }))
    await expect(createMessage(client, params, HAIKU)).rejects.toThrow(
      'The model declined this request (no category).',
    )
  })

  it('max_tokens 2048 becomes 16000 on Sonnet; on Haiku it stays 2048', async () => {
    const { client, create } = fakeClient(reply({}))
    await createMessage(client, params, SONNET)
    await createMessage(client, params, HAIKU)
    expect(create.mock.calls[0][0]).toMatchObject({ model: SONNET.arg, max_tokens: 16000 })
    expect(create.mock.calls[1][0]).toMatchObject({ model: HAIKU.arg, max_tokens: 2048 })
    // A caller's larger cap is kept.
    await createMessage(client, { ...params, max_tokens: 20000 }, SONNET)
    expect(create.mock.calls[2][0]).toMatchObject({ max_tokens: 20000 })
  })

  it('model is the ResolvedModel arg, and every other param passes through', async () => {
    const { client, create } = fakeClient(reply({}))
    await createMessage(client, { ...params, system: 'sys', temperature: 0 }, HAIKU)
    expect(create.mock.calls[0][0]).toEqual({ ...params, system: 'sys', temperature: 0, model: HAIKU.arg })
    expect(create.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  // The fake create waits on the signal it was handed, as the SDK's fetch does.
  const hangsUntilAborted = async (_body: Record<string, unknown>, opts?: { signal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      opts?.signal?.addEventListener('abort', () => reject(new Error('Request was aborted.')))
    })

  it('a request still running at the surface timeout is aborted (fake timers)', async () => {
    vi.useFakeTimers()
    const { client, create } = fakeClient(hangsUntilAborted)
    const pending = createMessage(client, params, HAIKU).catch((e: unknown) => e)
    const signal = create.mock.calls[0][1]!.signal!
    await vi.advanceTimersByTimeAsync(HAIKU.timeoutMs - 1)
    expect(signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signal.aborted).toBe(true)
    const err = await pending
    expect((err as Error).message).toBe(`Claude API request timed out after ${HAIKU.timeoutMs}ms`)
    expect(humanizeGenerationError(err)).toMatch(/timed out/i)
  })

  it('deadlineAt replaces the surface timeout, and is clamped to at least 1 ms', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const { client, create } = fakeClient(hangsUntilAborted)
    const pending = createMessage(client, params, SONNET, { deadlineAt: 1_000_000 + 5_000 }).catch(
      (e: unknown) => e,
    )
    await vi.advanceTimersByTimeAsync(4_999)
    expect(create.mock.calls[0][1]!.signal!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(((await pending) as Error).message).toBe('Claude API request timed out after 5000ms')

    // A deadline already passed still gives the request a 1 ms bound.
    const late = createMessage(client, params, SONNET, { deadlineAt: 0 }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1)
    expect(((await late) as Error).message).toBe('Claude API request timed out after 1ms')
  })

  it('a non-abort SDK error is rethrown as-is, and a finished call leaves no timer behind', async () => {
    vi.useFakeTimers()
    const boom = new Error('500 overloaded')
    const { client } = fakeClient(async () => {
      throw boom
    })
    await expect(createMessage(client, params, HAIKU)).rejects.toBe(boom)
    const ok = fakeClient(reply({}))
    await createMessage(ok.client, params, HAIKU)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('records exactly one call, before the request', async () => {
    let recordedBeforeRequest = -1
    const { client } = fakeClient(async () => {
      recordedBeforeRequest = records.length
      return reply({})()
    })
    await createMessage(client, params, SONNET, { label: 'caption' })
    expect(recordedBeforeRequest).toBe(1)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      surface: 'CAPTION',
      key: 'SONNET',
      arg: SONNET.arg,
      mode: 'api',
      source: 'request',
      substitutedFrom: null,
      label: 'caption',
    })
    expect(typeof records[0].at).toBe('number')
  })

  it('an internal surface records its fixed model', async () => {
    const verifier = internalModel('INTERNAL_VERIFIER', 'api')
    const { client } = fakeClient(reply({}))
    await createMessage(client, params, verifier)
    expect(records).toEqual([expect.objectContaining({ surface: 'INTERNAL_VERIFIER', arg: verifier.arg, label: null })])
  })
})

// AC-13's last bullet (T6): the Anthropic caption provider goes through
// createMessage and reads the reply by block type, never content[0].
describe('AC-13: AnthropicCopyProvider', () => {
  const brief = { topic: 't', description: '', goal: 'g', tone: 'x', channels: [] }

  async function providerWith(client: Anthropic) {
    const { AnthropicCopyProvider } = await import('@/providers/implementations/copy/anthropic')
    const provider = new AnthropicCopyProvider('sk-ant-FAKE-unit-test')
    // The constructor builds a real (never-called) SDK client; swap in the fake.
    ;(provider as unknown as { client: Anthropic }).client = client
    return provider
  }

  it('a thinking-first reply still yields the caption text, stamped with the arg that ran', async () => {
    const { client, create } = fakeClient(
      reply({
        content: [
          { type: 'thinking', thinking: 'plan the captions', signature: 'sig' },
          { type: 'text', text: '{"linkedin":"LI"}' },
        ],
      }),
    )
    const provider = await providerWith(client)
    await expect(provider.generateCaptions(brief, ['LINKEDIN'], SONNET)).resolves.toEqual({
      raw: '{"linkedin":"LI"}',
      modelId: 'claude-sonnet-5-5',
      route: 'API_KEY',
    })
    // Through the boundary: the resolved arg, the thinking floor, one record.
    expect(create.mock.calls[0][0]).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 16000 })
    expect(records).toEqual([expect.objectContaining({ surface: 'CAPTION', key: 'SONNET', label: 'copy' })])
  })

  it('a reply with no text block is an empty response, not a crash on content[0]', async () => {
    const { client } = fakeClient(reply({ content: [{ type: 'thinking', thinking: 'hm', signature: 's' }] }))
    const provider = await providerWith(client)
    await expect(provider.generateCaptions(brief, ['LINKEDIN'], HAIKU)).rejects.toThrow(
      'Anthropic returned an empty response',
    )
  })
})

describe('the recorder default sink', () => {
  it('keeps nothing without MOCK_AI, and a 200-entry ring (newest last) with it', async () => {
    setModelCallSink(null)
    const { recordModelCall, readModelCalls, clearModelCalls, modelCallFor, MODEL_CALL_RING_SIZE } =
      await import('@/lib/models/modelCalls')
    const saved = process.env.MOCK_AI
    try {
      delete process.env.MOCK_AI
      recordModelCall(modelCallFor(HAIKU, 'api'))
      expect(readModelCalls()).toEqual([])

      process.env.MOCK_AI = 'true'
      clearModelCalls()
      for (let i = 0; i < MODEL_CALL_RING_SIZE + 5; i++) recordModelCall(modelCallFor(HAIKU, 'api', `call-${i}`))
      const calls = readModelCalls()
      expect(calls).toHaveLength(MODEL_CALL_RING_SIZE)
      expect(calls[0].label).toBe('call-5')
      expect(calls.at(-1)!.label).toBe(`call-${MODEL_CALL_RING_SIZE + 4}`)
      // Shared through globalThis, like the Prisma client.
      expect(globalThis.__bistecModelCalls).toHaveLength(MODEL_CALL_RING_SIZE)
      clearModelCalls()
      expect(readModelCalls()).toEqual([])
    } finally {
      if (saved === undefined) delete process.env.MOCK_AI
      else process.env.MOCK_AI = saved
      globalThis.__bistecModelCalls = undefined
    }
  })
})
