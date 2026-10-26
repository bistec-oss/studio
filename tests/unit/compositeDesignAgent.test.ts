// 025 T8 review fixes (NFR-08): the design agents never return HTML with the
// screenshot inserted unless a render with the composites argument passed.
//   - API loop: a run that ends in prose and never renders throws
//     composite-not-rendered (it used to return the inserted HTML unchecked);
//   - API loop: a composite failure carries EVERY export the run uploaded;
//   - CLI: the render gets the inserted HTML and the composites argument, and a
//     failed check throws before anything is uploaded.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  responses: [] as unknown[],
  toolRenderHtml: vi.fn(),
  runClaudeCli: vi.fn(),
  renderHtmlToPng: vi.fn(),
  uploadObject: vi.fn(),
}))

vi.mock('@/lib/models/anthropicCall', () => ({
  createMessage: async () => h.responses.shift(),
  textOf: (r: { content: Array<{ type: string; text?: string }> }) =>
    r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n'),
}))
vi.mock('@/lib/models/modelCalls', () => ({ modelCallFor: vi.fn(), recordModelCall: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }))
vi.mock('@/lib/agent/tools', () => ({
  toolRenderHtml: h.toolRenderHtml,
  toolGenerateImage: vi.fn(),
  toolGetBrandKitContext: vi.fn(),
}))
vi.mock('@/lib/agent/claudeCli', () => ({ runClaudeCli: h.runClaudeCli }))
// 030: the runners render through renderPost; it delegates to the same spy so the
// composites argument stays observable as the fourth call argument.
vi.mock('@/lib/renderer/puppeteer', () => ({
  renderHtmlToPng: h.renderHtmlToPng,
  renderPost: async (html: string, w: number, ht: number, c: unknown, check: unknown) => ({
    png: await h.renderHtmlToPng(html, w, ht, c),
    headlineCheck: check ? 'painted' : null,
  }),
}))
vi.mock('@/lib/storage/minio', () => ({
  uploadObject: h.uploadObject,
  exportKey: () => 'exports/cli/x.png',
  BUCKET_EXPORTS: 'exports',
}))

const { runDesignAgent } = await import('@/lib/agent/designAgent')
const { runDesignAgentCli } = await import('@/lib/agent/designAgentCli')
const { CompositeRenderError } = await import('@/lib/composite/render')

const model = { timeoutMs: 60_000, arg: 'm', source: 'test', entry: {} } as never
const composites = { token: '__COMPOSITE_0__', dataUri: 'data:image/png;base64,AAAA', rectPx: { left: 1, top: 2, width: 16, height: 10 } }
const usage = { input_tokens: 1, output_tokens: 1 }
const render = (id: string) => ({
  content: [{ type: 'tool_use', id, name: 'renderHtml', input: { html: '<html><body>model</body></html>', width: 1080, height: 1080 } }],
  stop_reason: 'tool_use',
  usage,
})
const finalText = (text = '<html><body>prose-only</body></html>') => ({
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  usage,
})
const insert = (html: string) => html.replace('</body>', '<i data-inserted></i></body>')
const base = { systemPrompt: 's', userMessage: 'u', briefId: 'b', model, width: 1080, height: 1080, headline: 'Headline' }

beforeEach(() => {
  h.responses.length = 0
  h.toolRenderHtml.mockReset()
  h.runClaudeCli.mockReset()
  h.renderHtmlToPng.mockReset().mockResolvedValue(Buffer.from('png'))
  h.uploadObject.mockReset()
})

describe('the API loop never returns an unchecked composite (NFR-08)', () => {
  it('a run that ends in prose and never renders throws composite-not-rendered', async () => {
    h.responses.push(finalText())
    const err = await runDesignAgent({ ...base, postProcess: insert, composites }).catch((e) => e)
    expect(err).toBeInstanceOf(CompositeRenderError)
    expect(err.reason).toBe('composite-not-rendered')
    expect(err.uploadedKeys).toEqual([])
    expect(h.toolRenderHtml).not.toHaveBeenCalled()
  })

  it('without composites the prose-only path is unchanged', async () => {
    h.responses.push(finalText())
    const out = await runDesignAgent({ ...base })
    expect(out.htmlContent).toBe('<html><body>prose-only</body></html>')
    expect(out.exportUrl).toBe('')
  })

  it('a rendered run returns the inserted HTML, rendered with the composites argument', async () => {
    h.responses.push(render('t1'), finalText('done'))
    h.toolRenderHtml.mockResolvedValue({ url: 'u', key: 'exports/a.png' })
    const out = await runDesignAgent({ ...base, postProcess: insert, composites })
    expect(out.htmlContent).toContain('data-inserted')
    expect(out.exportUrl).toBe('exports/a.png')
    expect(h.toolRenderHtml).toHaveBeenCalledWith(expect.stringContaining('data-inserted'), 1080, 1080, composites, 'Headline')
  })

  it('a failure after two passing renders carries every export the run uploaded', async () => {
    h.responses.push(render('t1'), render('t2'), render('t3'))
    h.toolRenderHtml
      .mockResolvedValueOnce({ url: 'u', key: 'exports/one.png' })
      .mockResolvedValueOnce({ url: 'u', key: 'exports/two.png' })
      .mockImplementationOnce(async () => {
        throw new CompositeRenderError('composite-not-rendered', 'covered')
      })
    const err = await runDesignAgent({ ...base, postProcess: insert, composites }).catch((e) => e)
    expect(err).toBeInstanceOf(CompositeRenderError)
    expect(err.uploadedKeys).toEqual(['exports/one.png', 'exports/two.png'])
  })
})

describe('the CLI runner never returns an unchecked composite (NFR-08)', () => {
  it('renders the inserted HTML with the composites argument and returns that HTML', async () => {
    h.runClaudeCli.mockResolvedValue('<!doctype html><html><body>cli</body></html>')
    const out = await runDesignAgentCli({ ...base, postProcess: insert, composites })
    expect(h.renderHtmlToPng).toHaveBeenCalledTimes(1)
    const [html, , , arg] = h.renderHtmlToPng.mock.calls[0]
    expect(html).toContain('data-inserted')
    expect(arg).toBe(composites)
    expect(out.htmlContent).toBe(html)
  })

  it('a failed check throws before anything is uploaded', async () => {
    h.runClaudeCli.mockResolvedValue('<!doctype html><html><body>cli</body></html>')
    h.renderHtmlToPng.mockImplementation(async () => {
      throw new CompositeRenderError('composite-not-rendered', 'covered')
    })
    const err = await runDesignAgentCli({ ...base, postProcess: insert, composites }).catch((e) => e)
    expect(err).toBeInstanceOf(CompositeRenderError)
    expect(h.uploadObject).not.toHaveBeenCalled()
  })

  it('without an insertion nothing changes: composites null, no postProcess', async () => {
    h.runClaudeCli.mockResolvedValue('<!doctype html><html><body>cli</body></html>')
    const out = await runDesignAgentCli({ ...base })
    expect(h.renderHtmlToPng.mock.calls[0][3]).toBeNull()
    expect(out.htmlContent).not.toContain('data-inserted')
  })
})
