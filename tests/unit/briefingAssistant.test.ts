// Briefing assistant pure parts: the ```briefing block extraction the chat UI
// depends on, and the deterministic MOCK_AI seams the E2E suite asserts on.
// 008 T8: the three entry points on the resolver (ASSISTANT_BRIEFING) and the
// shared text call on a ResolvedModel. Prisma, the campaign context, the CLI
// runner and the Anthropic client are faked; the resolver (policy.ts →
// decideModel) runs for real on a faked TeamModelPolicy row.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  cli: false,
  mockAi: false,
  policy: null as null | Record<string, unknown>,
  docImageUrls: [] as string[],
  runClaudeCli: vi.fn(),
  runVisionModel: vi.fn(),
  anthropicCreate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teamModelPolicy: { findUnique: async () => h.policy },
    userClaudeToken: { findFirst: async () => null },
  },
}))
// The mode, deterministically (the local .env may set CLI mode; CI has none).
vi.mock('@/lib/agent/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/config')>()),
  isCliMode: () => h.cli,
  pipelineMode: () => (h.cli ? 'cli' : 'api'),
}))
vi.mock('@/lib/agent/claudeCli', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/claudeCli')>()),
  runClaudeCli: h.runClaudeCli,
}))
vi.mock('@/lib/agent/vision', () => ({ runVisionModel: h.runVisionModel }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: h.anthropicCreate }
  },
}))
vi.mock('@/providers/registry', () => ({ resolveAnthropicApiKey: async () => 'sk-ant-FAKE' }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => null }))
vi.mock('@/lib/campaign/briefing', () => ({ getActiveCampaignBriefing: async () => null }))
vi.mock('@/lib/campaign/documents', () => ({
  collectCampaignDocsContext: async () => ({ text: '', truncated: false }),
  collectCampaignDocImageUrls: async () => h.docImageUrls,
}))
vi.mock('@/lib/testHooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/testHooks')>()),
  get MOCK_AI() {
    return h.mockAi
  },
}))

import {
  AssistantModelError,
  enhanceBriefing,
  enhancePostBrief,
  extractBriefingBlock,
  extractSchedulePlan,
  runBriefingChat,
  runBriefingModel,
} from '@/lib/campaign/briefingAssistant'
import { buildMockBriefingReply, buildMockBriefingEnhance } from '@/lib/testHooks'
import { setModelCallSink, type ModelCallRecord } from '@/lib/models/modelCalls'
import { internalModel } from '@/lib/models/resolve'

describe('extractBriefingBlock', () => {
  it('extracts the fenced briefing content', () => {
    const text = 'Here is my draft:\n```briefing\nGoal: signups.\nAudience: SMBs.\n```\nThoughts?'
    expect(extractBriefingBlock(text)).toBe('Goal: signups.\nAudience: SMBs.')
  })

  it('returns the LAST block when the reply restates the draft', () => {
    const text = [
      '```briefing\nold draft\n```',
      'Updated per your note:',
      '```briefing\nnew draft\n```',
    ].join('\n')
    expect(extractBriefingBlock(text)).toBe('new draft')
  })

  it('returns null when no block or an empty block is present', () => {
    expect(extractBriefingBlock('no fences here')).toBeNull()
    expect(extractBriefingBlock('```briefing\n\n```')).toBeNull()
    // A generic code fence is not a briefing block.
    expect(extractBriefingBlock('```\nsome code\n```')).toBeNull()
  })
})

describe('extractSchedulePlan (F4)', () => {
  it('parses a valid ```schedule block into normalized items', () => {
    const text = [
      'Here is a plan:',
      '```schedule',
      JSON.stringify({
        posts: [
          { topic: 'Launch teaser', goal: 'awareness', tone: 'bold', daysFromNow: 2, postAction: 'HOLD' },
          { topic: 'Feature deep-dive', daysFromNow: 5 },
        ],
      }),
      '```',
    ].join('\n')
    const plan = extractSchedulePlan(text)
    expect(plan).toHaveLength(2)
    expect(plan![0]).toMatchObject({ topic: 'Launch teaser', daysFromNow: 2, postAction: 'HOLD' })
    // Defaults applied where the model omitted fields (031: no goal default).
    expect(plan![1]).toMatchObject({ topic: 'Feature deep-dive', tone: 'professional', postAction: 'HOLD' })
    expect(plan![1].goal).toBeUndefined()
  })

  it('returns null for a missing, empty, or malformed block', () => {
    expect(extractSchedulePlan('no plan here')).toBeNull()
    expect(extractSchedulePlan('```schedule\nnot json\n```')).toBeNull()
    expect(extractSchedulePlan('```schedule\n{"posts":[]}\n```')).toBeNull() // min(1)
  })

  it('takes the LAST block when the plan is restated', () => {
    const text = [
      '```schedule\n{"posts":[{"topic":"old"}]}\n```',
      '```schedule\n{"posts":[{"topic":"new"}]}\n```',
    ].join('\n')
    expect(extractSchedulePlan(text)![0].topic).toBe('new')
  })
})

describe('MOCK_AI briefing seams', () => {
  it('buildMockBriefingReply embeds the last user message and a briefing block', () => {
    const reply = buildMockBriefingReply('Promote the July webinar')
    expect(reply).toContain('[Promote the July webinar]')
    expect(extractBriefingBlock(reply)).toContain('Promote the July webinar')
  })

  it('buildMockBriefingReply emits a schedule plan when asked to schedule a scheme', () => {
    const reply = buildMockBriefingReply('Schedule 2 posts as per this scheme')
    const plan = extractSchedulePlan(reply)
    expect(plan).toHaveLength(2)
    expect(extractBriefingBlock(reply)).toBeNull() // scheduling reply, not a briefing draft
  })

  it('buildMockBriefingEnhance is a deterministic transform', () => {
    expect(buildMockBriefingEnhance('my briefing')).toBe('Enhanced: my briefing')
    expect(buildMockBriefingEnhance('')).toBe(
      'Enhanced: Mock briefing drafted from campaign context.'
    )
  })
})

// ── 008 T8: the entry points on the resolver ─────────────────────────────────

const SONNET = 'claude-sonnet-5-5'
const HAIKU = 'claude-haiku-4-5'
const policyRow = (defaults: Array<{ surface: string; model: string }> = [], allowed = ['HAIKU', 'SONNET', 'OPUS']) => ({
  allowedModels: allowed,
  requirePersonalTokenForGated: false,
  defaults,
})
const messages = [{ role: 'user' as const, content: 'plan the launch' }]
const textReply = (text: string) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' })

// Each entry point, called the way its route calls it.
const entryPoints: Array<[string, () => Promise<unknown>]> = [
  ['runBriefingChat', () => runBriefingChat('c1', messages, 'team1', 'u1')],
  ['enhanceBriefing', () => enhanceBriefing('c1', 'my briefing', 'team1', 'u1')],
  ['enhancePostBrief', () => enhancePostBrief({ topic: 't', content: 'c' }, 'team1', 'u1')],
]

let calls: ModelCallRecord[] = []
beforeEach(() => {
  h.cli = false
  h.mockAi = false
  h.policy = null
  h.docImageUrls = []
  h.runClaudeCli.mockReset().mockResolvedValue('cli reply')
  h.runVisionModel.mockReset().mockResolvedValue('vision reply')
  h.anthropicCreate.mockReset().mockResolvedValue(textReply('api reply'))
  calls = []
  setModelCallSink({ record: (r) => calls.push(r), read: () => calls, clear: () => (calls = []) })
})
afterEach(() => setModelCallSink(null))

describe('008 T8: the briefing entry points resolve ASSISTANT_BRIEFING', () => {
  it.each(entryPoints)('%s: no team default → Sonnet (system), through createMessage', async (_name, call) => {
    await call()
    expect(h.anthropicCreate).toHaveBeenCalledTimes(1)
    const [params, reqOpts] = h.anthropicCreate.mock.calls[0]
    expect(params.model).toBe(SONNET)
    // Sonnet 5.5's floor (open question 4) lifts the 2048 the call asks for.
    expect(params.max_tokens).toBe(16000)
    expect(reqOpts.signal).toBeInstanceOf(AbortSignal)
    expect(calls).toMatchObject([{ surface: 'ASSISTANT_BRIEFING', key: 'SONNET', arg: SONNET, mode: 'api', source: 'system' }])
  })

  it.each(entryPoints)('%s: a team ASSISTANT_BRIEFING default of Haiku → Haiku (team)', async (_name, call) => {
    h.policy = policyRow([{ surface: 'ASSISTANT_BRIEFING', model: 'HAIKU' }])
    await call()
    expect(h.anthropicCreate.mock.calls[0][0].model).toBe(HAIKU)
    expect(calls).toMatchObject([{ surface: 'ASSISTANT_BRIEFING', key: 'HAIKU', source: 'team' }])
  })

  it.each(entryPoints)('%s: CLI mode → runClaudeCli with the ResolvedModel and no timeout literal', async (_name, call) => {
    h.cli = true
    await call()
    expect(h.anthropicCreate).not.toHaveBeenCalled()
    const opts = h.runClaudeCli.mock.calls[0][1]
    expect(opts.model).toMatchObject({ surface: 'ASSISTANT_BRIEFING', key: 'SONNET', arg: SONNET })
    // The bound is the model's surface timeout (design §5), applied at the boundary.
    expect(opts.timeoutMs).toBeUndefined()
  })

  it.each(entryPoints)('%s: MOCK_AI records the resolved model and makes no call', async (_name, call) => {
    h.mockAi = true
    h.policy = policyRow([{ surface: 'ASSISTANT_BRIEFING', model: 'HAIKU' }])
    await call()
    expect(h.anthropicCreate).not.toHaveBeenCalled()
    expect(h.runClaudeCli).not.toHaveBeenCalled()
    expect(h.runVisionModel).not.toHaveBeenCalled()
    expect(calls).toMatchObject([{ surface: 'ASSISTANT_BRIEFING', key: 'HAIKU', arg: HAIKU, source: 'team', label: 'briefing' }])
  })

  it.each(entryPoints)('%s: no model the team can run → AssistantModelError, nothing runs or records', async (_name, call) => {
    h.policy = policyRow([], []) // a hand-edited row: nothing allowed
    for (const mockAi of [false, true]) {
      h.mockAi = mockAi
      const err = await call().catch((e: unknown) => e)
      expect(err).toBeInstanceOf(AssistantModelError)
      expect(err).toMatchObject({ code: 'NO_ALLOWED_MODEL' })
    }
    expect(h.anthropicCreate).not.toHaveBeenCalled()
    expect(h.runClaudeCli).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('the chat with campaign images hands the same ResolvedModel to the vision call', async () => {
    h.docImageUrls = ['https://minio.invalid/docs/ref.png']
    h.policy = policyRow([{ surface: 'ASSISTANT_BRIEFING', model: 'HAIKU' }])
    const result = await runBriefingChat('c1', messages, 'team1', 'u1')
    expect(result.reply).toBe('vision reply')
    expect(h.runVisionModel.mock.calls[0][0]).toMatchObject({
      label: 'briefing',
      teamId: 'team1',
      model: { surface: 'ASSISTANT_BRIEFING', key: 'HAIKU', source: 'team' },
    })
  })
})

describe('008 T8: runBriefingModel on a ResolvedModel', () => {
  const model = internalModel('INTERNAL_TOKEN_PING', 'api') // any ResolvedModel; Haiku has no floor

  it('API: model.arg, the caller max_tokens, the label recorded, and no system key when none is given', async () => {
    await expect(
      runBriefingModel(undefined, messages, 'team1', model, { maxTokens: 1024, label: 'brand-voice' }),
    ).resolves.toBe('api reply')
    const params = h.anthropicCreate.mock.calls[0][0]
    expect(params).toEqual({ model: HAIKU, max_tokens: 1024, messages })
    expect(calls[0]).toMatchObject({ arg: HAIKU, mode: 'api', label: 'brand-voice' })
  })

  it('API: reads only text blocks (a thinking block first is skipped)', async () => {
    h.anthropicCreate.mockResolvedValue({
      content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'the reply' }],
      stop_reason: 'end_turn',
    })
    await expect(runBriefingModel('sys', messages, 'team1', model)).resolves.toBe('the reply')
    expect(h.anthropicCreate.mock.calls[0][0]).toMatchObject({ system: 'sys', max_tokens: 2048 })
  })

  it('CLI: no system → the prompt opens with the transcript, not a blank line', async () => {
    h.cli = true
    await runBriefingModel(undefined, messages, 'team1', model, { label: 'brand-voice' })
    const [prompt, opts] = h.runClaudeCli.mock.calls[0]
    expect(prompt.startsWith('--- Conversation so far ---')).toBe(true)
    expect(prompt).toContain('User: plan the launch')
    expect(opts).toEqual({ label: 'brand-voice', model })
  })
})
