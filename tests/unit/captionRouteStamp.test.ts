// 024 FR-04 / AC-05: the route that ran is recorded where the caption is
// written, beside the model, and only with validated text.

import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({
  createMessage: vi.fn(),
  runClaudeCli: vi.fn(),
  openaiCreate: vi.fn(),
}))

vi.mock('@/lib/models/anthropicCall', () => ({
  createMessage: h.createMessage,
  textOf: (r: { text: string }) => r.text,
}))
vi.mock('@/lib/agent/claudeCli', () => ({ runClaudeCli: h.runClaudeCli }))
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: h.openaiCreate } }
  },
}))
vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }))

const { AnthropicCopyProvider } = await import('@/providers/implementations/copy/anthropic')
const { ClaudeCliCopyProvider } = await import('@/providers/implementations/copy/claude-cli')
const { OpenAICopyProvider } = await import('@/providers/implementations/copy/openai')
const { writeCaptions } = await import('@/lib/captions/generate')
const { captionRowsFromFields, headlineStampFields } = await import('@/lib/captions/store')
const { settleCaptionRow } = await import('@/lib/captions/actionTargets')
const { decideModel } = await import('@/lib/models/resolve')

const decided = decideModel('CAPTION', {
  policy: { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false },
  credential: 'n/a',
  mode: 'api',
})
if (!decided.ok) throw new Error(decided.message)
const MODEL = decided.resolved
const brief = { topic: 't', description: '', goal: 'g', tone: 'x', channels: [] }

describe('each provider reports its route in CaptionReply.route', () => {
  it('Anthropic: API_KEY by default, SERVER_KEY when built for the server key', async () => {
    h.createMessage.mockResolvedValue({ text: '{"headline":"h"}' })
    const team = await new AnthropicCopyProvider('k').generateCaptions(brief, ['HEADLINE'], MODEL)
    const server = await new AnthropicCopyProvider('k', 'SERVER_KEY').generateCaptions(brief, ['HEADLINE'], MODEL)
    expect(team.route).toBe('API_KEY')
    expect(server.route).toBe('SERVER_KEY')
  })

  it('the Claude CLI provider: CLI', async () => {
    h.runClaudeCli.mockResolvedValue('{"headline":"h"}')
    expect((await new ClaudeCliCopyProvider().generateCaptions(brief, ['HEADLINE'], MODEL)).route).toBe('CLI')
  })

  it('the OpenAI provider: OTHER', async () => {
    h.openaiCreate.mockResolvedValue({ choices: [{ message: { content: '{"headline":"h"}' } }] })
    expect((await new OpenAICopyProvider('k').generateCaptions(brief, ['HEADLINE'])).route).toBe('OTHER')
  })
})

describe('writeCaptions carries the reply route into the stamp, and logs it', () => {
  it('stamps route beside model and logs both', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const provider = {
      generateCaptions: async () => ({ raw: '{"headline":"h"}', modelId: 'claude-haiku-4-5', route: 'API_KEY' as const }),
    }
    const { stamp } = await writeCaptions(provider, brief, ['HEADLINE'], MODEL)
    expect(stamp).toMatchObject({ model: 'claude-haiku-4-5', route: 'API_KEY' })
    expect(info.mock.calls.map((c) => String(c[0]))).toContain('[captions] route=API_KEY model=claude-haiku-4-5')
    info.mockRestore()
  })

  it('an unknown route (null) is stamped null', async () => {
    const provider = { generateCaptions: async () => ({ raw: '{}', modelId: 'm', route: null }) }
    const { stamp } = await writeCaptions(provider, brief, ['HEADLINE'], MODEL)
    expect(stamp.route).toBeNull()
  })
})

describe('the writers put route beside model, and only with validated text', () => {
  const stamp = { model: 'claude-haiku-4-5', substitutedFrom: null, route: 'CLI' }

  it('captionRowsFromFields: a validated row has both, a failed row neither', () => {
    const rows = captionRowsFromFields(
      { LINKEDIN: { ok: true, text: 'x' }, INSTAGRAM: { ok: false, reason: 'empty' } },
      stamp,
    )
    expect(rows.find((r) => r.channel === 'LINKEDIN')).toMatchObject({ model: stamp.model, route: 'CLI' })
    expect(rows.find((r) => r.channel === 'INSTAGRAM')).toMatchObject({ model: null, route: null })
  })

  it('settleCaptionRow: a stamp writes both; no stamp writes neither', () => {
    expect(settleCaptionRow({ text: '' }, { ok: true, text: 'new' }, stamp)).toMatchObject({
      model: stamp.model,
      route: 'CLI',
    })
    const bare = settleCaptionRow({ text: '' }, { ok: true, text: 'new' })
    expect(bare).not.toHaveProperty('model')
    expect(bare).not.toHaveProperty('route')
  })

  it('a failed regenerate keeps the route of the text it keeps (writes no route key)', () => {
    const kept = settleCaptionRow({ text: 'old' }, { ok: false, reason: 'empty' }, stamp)
    expect(kept).toMatchObject({ status: 'READY', text: 'old' })
    expect(kept).not.toHaveProperty('route')
    const failed = settleCaptionRow({ text: '' }, { ok: false, reason: 'empty' }, stamp)
    expect(failed).not.toHaveProperty('route')
  })

  it('headlineStampFields carries headlineRoute beside headlineModel', () => {
    expect(headlineStampFields(stamp)).toEqual({
      headlineModel: 'claude-haiku-4-5',
      headlineModelSubstitutedFrom: null,
      headlineRoute: 'CLI',
    })
  })
})
