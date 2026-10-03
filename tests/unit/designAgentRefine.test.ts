// T17 — the runners' opt-in refine mode (change 004 Phase 2). Both return the
// model's RAW reply and render nothing (Ruling D: a missed attempt leaves no
// orphaned export); the default runners are untouched (AC-20). The API mock
// branch returns buildMockRefineReply — identical to the old mock document when
// the instruction carries no sentinel — and keeps the conflict_test and
// __FAIL_GEN_ALWAYS__ behaviours.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  mockAi: false,
  runClaudeCli: vi.fn(),
  toolRenderHtml: vi.fn(),
  toolGenerateImage: vi.fn(),
  create: vi.fn(),
  tools: [] as unknown[],
}))

vi.mock('@/lib/testHooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/testHooks')>()
  return {
    ...actual,
    get MOCK_AI() {
      return h.mockAi
    },
  }
})
vi.mock('@/lib/agent/claudeCli', () => ({ runClaudeCli: h.runClaudeCli }))
vi.mock('@/lib/renderer/puppeteer', () => ({ renderHtmlToPng: vi.fn(async () => Buffer.from('png')) }))
vi.mock('@/lib/storage/minio', () => ({ uploadObject: vi.fn(), exportKey: () => 'k', BUCKET_EXPORTS: 'exports' }))
vi.mock('@/lib/agent/tools', () => ({
  toolRenderHtml: h.toolRenderHtml,
  toolGenerateImage: h.toolGenerateImage,
  toolGetBrandKitContext: vi.fn(async () => ({ colors: [] })),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: (args: { tools: unknown[] }) => {
        h.tools = args.tools
        return h.create(args)
      },
    }
  },
}))

const { runDesignAgentRefine } = await import('@/lib/agent/designAgent')
const { runDesignAgentCliRefine } = await import('@/lib/agent/designAgentCli')
const { buildMockHtml, buildMockConflict } = await import('@/lib/testHooks')
const puppeteer = await import('@/lib/renderer/puppeteer')
const minio = await import('@/lib/storage/minio')

const base = {
  systemPrompt: 'SYSTEM #0f2d4e',
  userMessage: 'Current HTML design:\n\n<html>x</html>\n\nInstruction: make it pop',
  briefId: 'brief-1',
  width: 1080,
  height: 1350,
  refine: { attempt: 1 as const, instruction: 'make it pop', slimHtml: '<html>x</html>' },
}
const usage = { input_tokens: 1, output_tokens: 1 }

beforeEach(() => {
  h.mockAi = false
  h.runClaudeCli.mockReset()
  h.toolRenderHtml.mockReset()
  h.toolGenerateImage.mockReset()
  h.create.mockReset()
  vi.mocked(puppeteer.renderHtmlToPng).mockClear()
  vi.mocked(minio.uploadObject).mockClear()
})

describe('runDesignAgentCliRefine', () => {
  it('returns the raw CLI reply verbatim — no cut, no restore, no render, no upload', async () => {
    const raw = 'narration\n```json\n{"classes":["add"]}\n```\n<!DOCTYPE html><html><body>__INLINE_ASSET_0__</body></html>'
    h.runClaudeCli.mockResolvedValue(raw)
    expect(await runDesignAgentCliRefine({ systemPrompt: 'S', userMessage: 'U', model: 'sonnet' })).toBe(raw)
    expect(h.runClaudeCli).toHaveBeenCalledWith('S\n\nU', expect.objectContaining({ model: 'sonnet', label: 'refine' }))
    expect(puppeteer.renderHtmlToPng).not.toHaveBeenCalled()
    expect(minio.uploadObject).not.toHaveBeenCalled()
  })
})

describe('runDesignAgentRefine — MOCK_AI branch', () => {
  beforeEach(() => {
    h.mockAi = true
  })

  it('with no sentinel, returns exactly the old mock document, unrendered', async () => {
    const raw = await runDesignAgentRefine(base)
    expect(raw).toBe(buildMockHtml(`${base.systemPrompt}\n${base.userMessage}`, 1080, 1350))
    expect(h.toolRenderHtml).not.toHaveBeenCalled()
  })

  it('keeps conflict_test and __FAIL_GEN_ALWAYS__', async () => {
    expect(await runDesignAgentRefine({ ...base, userMessage: `${base.userMessage} conflict_test` })).toBe(buildMockConflict())
    await expect(runDesignAgentRefine({ ...base, userMessage: `${base.userMessage} __FAIL_GEN_ALWAYS__` })).rejects.toThrow(
      /Mock generation failure/,
    )
  })

  it('threads the attempt into the T20 reply seam (__REFINE_FIX_ON_RETRY__)', async () => {
    const instruction = 'reduce __REFINE_REDUCE_NOOP__ __REFINE_FIX_ON_RETRY__'
    const slimHtml = '<!DOCTYPE html><html><body><p>Join us for a long evening of ideas</p></body></html>'
    const first = await runDesignAgentRefine({ ...base, refine: { attempt: 1, instruction, slimHtml } })
    const second = await runDesignAgentRefine({ ...base, refine: { attempt: 2, instruction, slimHtml } })
    expect(first).toContain(slimHtml)
    expect(second).toContain('Shortened.')
  })
})

describe('runDesignAgentRefine — the real tool loop', () => {
  it('does not offer renderHtml, and returns the final text', async () => {
    h.create.mockResolvedValue({ content: [{ type: 'text', text: 'HEADER\n<!DOCTYPE html><html></html>' }], stop_reason: 'end_turn', usage })
    expect(await runDesignAgentRefine(base)).toBe('HEADER\n<!DOCTYPE html><html></html>')
    expect((h.tools as Array<{ name: string }>).map((t) => t.name)).not.toContain('renderHtml')
  })

  it('answers a renderHtml call with an error result instead of rendering', async () => {
    h.create
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 't1', name: 'renderHtml', input: { html: '<html></html>', width: 1080, height: 1080 } }],
        stop_reason: 'tool_use',
        usage,
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'final' }], stop_reason: 'end_turn', usage })
    expect(await runDesignAgentRefine(base)).toBe('final')
    expect(h.toolRenderHtml).not.toHaveBeenCalled()
    const second = h.create.mock.calls[1][0] as { messages: Array<{ content: unknown }> }
    expect(JSON.stringify(second.messages.at(-1))).toMatch(/not available in this step/)
  })

  it('returns a max_tokens-truncated turn as partial text (the route treats it as not applied), not a crash', async () => {
    h.create.mockResolvedValue({ content: [{ type: 'text', text: '<!DOCTYPE html><html><body>cut' }], stop_reason: 'max_tokens', usage })
    expect(await runDesignAgentRefine(base)).toBe('<!DOCTYPE html><html><body>cut')
  })
})
