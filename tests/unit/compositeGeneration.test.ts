// 025 T8 (FR-15, NFR-08): runPathBDesign places the author's screenshot.
//
//   - a kept device-screen look reads the object once, names the DETECTED
//     screen in the design prompt, and hands the design agent an insertion that
//     writes the element at the detected rect (not the contract region);
//   - the stamp carries composites[0].rect only after the render passed;
//   - a render that fails (CompositeRenderError) deletes the export an earlier
//     render uploaded and re-runs the design ONCE as classic without the hero
//     image: exactly one image step and two design calls;
//   - an unreadable or foreign screenshot falls back to classic without a
//     failed render (composite-source-missing), with one design call.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { MOCK_PNG_BUFFER } from '@/lib/testHooks'
import { ASPECT_DIMENSIONS } from '@/lib/aspectRatio'
import { archetypes, compositeRegionOf } from '@/lib/designData'

const h = vi.hoisted(() => ({
  designCalls: [] as Array<{
    systemPrompt: string
    userMessage: string
    postProcess?: (html: string) => string
    composites?: { token: string; dataUri: string; rectPx: unknown } | null
  }>,
  designImpl: null as null | ((n: number) => Promise<unknown>),
  background: vi.fn(),
  observe: vi.fn(),
  getObjectBytes: vi.fn(),
  deleteObject: vi.fn(),
}))

vi.mock('@/lib/agent/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/config')>()
  return { ...actual, isCliMode: () => true, pipelineMode: () => 'cli' }
})
vi.mock('@/lib/storage/minio', () => ({
  BUCKET_DOCS: 'docs',
  BUCKET_EXPORTS: 'exports',
  getObjectBytes: h.getObjectBytes,
  deleteObject: h.deleteObject,
  persistDataUrlImage: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandKitArtifact: { findMany: async () => [] },
    brandKitTemplate: { findFirst: async () => null },
  },
}))
vi.mock('@/lib/agent/designAgentCli', () => ({
  runDesignAgentCli: async (o: (typeof h.designCalls)[number]) => {
    h.designCalls.push(o)
    if (h.designImpl) return h.designImpl(h.designCalls.length)
    return { htmlContent: '<html><body>design</body></html>', exportUrl: 'exports/x.png', toolCallCount: 0 }
  },
  runDesignAgentCliRefine: vi.fn(),
}))
vi.mock('@/lib/agent/designAgent', () => ({ runDesignAgent: vi.fn(), runDesignAgentRefine: vi.fn() }))

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#14377D'],
  fonts: [],
  logoUrl: null,
  logos: [],
  voicePrompt: null,
  source: 'system',
}
const actor = { userId: 'user-actor', teamId: 'team-1' }
const KEY = 'screenshots/team-1/user-1/shot.png'
const mkBrief = (over: Record<string, unknown> = {}) =>
  ({
    id: 'brief-1',
    teamId: 'team-1',
    userId: 'user-1',
    topic: 'Q3 launch',
    description: 'Announce the launch',
    goal: 'awareness',
    tone: 'professional',
    channels: ['LINKEDIN'],
    aspectRatio: 'SQUARE',
    imageStyle: 'device-screen',
    imageProviderKey: null,
    briefImages: null,
    referenceTemplateId: null,
    compositeSource: { kind: 'brief-upload', key: KEY, width: 1600, height: 1000 },
    ...over,
  }) as unknown as Brief

// The screen the check found: offset from the contract region (14, 42, 72, 45).
const DETECTED = { x: 17, y: 44, w: 72, h: 45 }
const keptBg = {
  url: 'https://minio.example.com/bg.png',
  quality: 'default',
  check: { ok: true, composites: [{ region: 0, rect: DETECTED }] },
}

describe('runPathBDesign places the screenshot (025 FR-15)', () => {
  const previous = { ...process.env }
  afterAll(() => {
    vi.unstubAllEnvs()
    for (const k of ['MOCK_AI', 'MOCK_PUPPETEER']) {
      if (previous[k] === undefined) delete process.env[k]
      else process.env[k] = previous[k]
    }
    vi.resetModules()
  })

  async function load() {
    vi.resetModules()
    vi.stubEnv('MOCK_AI', 'false')
    vi.stubEnv('MOCK_PUPPETEER', 'false')
    vi.doMock('@/lib/agent/background', () => ({ generateBackgroundForBrief: h.background }))
    vi.doMock('@/lib/renderer/layoutFacts', () => ({ observeLayout: h.observe }))
    return import('@/lib/agent/pathB')
  }
  const model = {} as never

  beforeEach(() => {
    h.designCalls.length = 0
    h.designImpl = null
    h.background.mockReset().mockResolvedValue(keptBg)
    h.observe.mockReset().mockResolvedValue({ ok: true })
    h.getObjectBytes.mockReset().mockResolvedValue(MOCK_PNG_BUFFER)
    h.deleteObject.mockReset().mockResolvedValue(undefined)
  })

  it('a kept look: the object is read once, the prompt names the detected screen, the insertion writes the element at it, and the stamp carries the rect', async () => {
    const { runPathBDesign } = await load()
    const result = await runPathBDesign(mkBrief(), kit, 'Big news', null, actor, model)
    expect(h.background).toHaveBeenCalledTimes(1)
    expect(h.getObjectBytes).toHaveBeenCalledTimes(1)
    expect(h.getObjectBytes).toHaveBeenCalledWith('docs', KEY)
    expect(h.designCalls).toHaveLength(1)

    // The prompt names the detected screen in canvas pixels, not the contract region.
    const region = compositeRegionOf(archetypes['device-screen'].versions[1].sizes.SQUARE!)!.rect
    expect(region).not.toEqual(DETECTED)
    expect(h.designCalls[0].systemPrompt).toContain('x 184 to 961, y 475 to 961')
    expect(h.designCalls[0].systemPrompt).not.toContain('x 151 to 929, y 454 to 940')

    // The insertion is at the detected rect.
    const call = h.designCalls[0]
    expect(call.composites?.token).toBe('__COMPOSITE_0__')
    expect(call.composites?.rectPx).toEqual({ left: 183.6, top: 475.2, width: 777.6, height: 486 })
    const html = call.postProcess!('<html><body>design</body></html>')
    expect(html).toContain('left:183.6px;top:475.2px;width:777.6px;height:486px')

    expect(result.composition).toMatchObject({
      appliedArchetype: 'device-screen',
      composites: [{ region: 0, rect: DETECTED, source: { kind: 'brief-upload', key: KEY } }],
    })
    expect(result.backgroundImageUrl).toBe('https://minio.example.com/bg.png')
    // The layout observation renders the same composite argument.
    expect(h.observe.mock.calls[0][2]).toMatchObject({ composites: call.composites })
  })

  it('a render that fails: the export is deleted, the design runs once more as classic with no hero image, and the stamp is classic with the reason', async () => {
    const { runPathBDesign } = await load()
    // After resetModules: the same module copy the pipeline just loaded.
    const { CompositeRenderError } = await import('@/lib/composite/render')
    h.designImpl = async (n) => {
      if (n === 1) {
        const err = new CompositeRenderError('composite-not-rendered', 'something covers the element')
        err.uploadedKeys = ['exports/design/first.png', 'exports/design/abandoned.png']
        throw err
      }
      return { htmlContent: '<html><body>classic</body></html>', exportUrl: 'exports/y.png', toolCallCount: 0 }
    }
    const result = await runPathBDesign(mkBrief(), kit, 'Big news', null, actor, model)
    // One image step (the only image call), two design calls.
    expect(h.background).toHaveBeenCalledTimes(1)
    expect(h.designCalls).toHaveLength(2)
    expect(h.deleteObject).toHaveBeenCalledTimes(2)
    expect(h.deleteObject).toHaveBeenCalledWith('exports', 'exports/design/first.png')
    expect(h.deleteObject).toHaveBeenCalledWith('exports', 'exports/design/abandoned.png')

    // The second call is classic: no hero contract, no image, no insertion.
    expect(h.designCalls[1].composites ?? null).toBeNull()
    // 031 FR-22: the only post-process left is the font injection, which inserts no screenshot.
    const classicHtml = h.designCalls[1].postProcess?.('<html><body>design</body></html>') ?? ''
    expect(classicHtml).not.toContain('data-composite')
    expect(classicHtml).not.toContain('__COMPOSITE_0__')
    expect(h.designCalls[1].systemPrompt).not.toContain('Headline, body text and the logo go only inside these regions:')
    expect(h.designCalls[1].systemPrompt).not.toContain('https://minio.example.com/bg.png')

    expect(result.htmlContent).toBe('<html><body>classic</body></html>')
    expect(result.backgroundImageUrl).toBeNull()
    expect(result.composition).toEqual({
      requestedArchetype: 'device-screen',
      appliedArchetype: 'classic',
      contractVersion: null,
      fallbackReason: 'composite-not-rendered',
      imageQuality: 'default',
    })
    expect(result.composition).not.toHaveProperty('composites')
    expect(h.observe).not.toHaveBeenCalled()
  })

  it('a failure that is not a composite failure is not retried', async () => {
    const { runPathBDesign } = await load()
    h.designImpl = async () => {
      throw new Error('model timeout')
    }
    await expect(runPathBDesign(mkBrief(), kit, 'h', null, actor, model)).rejects.toThrow('model timeout')
    expect(h.designCalls).toHaveLength(1)
  })

  it('an unreadable screenshot: classic composite-source-missing, one design call, no hero image', async () => {
    const { runPathBDesign } = await load()
    h.getObjectBytes.mockImplementation(() => {
      throw new Error('NoSuchKey')
    })
    const result = await runPathBDesign(mkBrief(), kit, 'h', null, actor, model)
    expect(h.designCalls).toHaveLength(1)
    expect(h.designCalls[0].composites ?? null).toBeNull()
    expect(h.designCalls[0].systemPrompt).not.toContain('https://minio.example.com/bg.png')
    expect(result.backgroundImageUrl).toBeNull()
    expect(result.composition).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'composite-source-missing' })
    expect(result.composition).not.toHaveProperty('composites')
  })

  it("a screenshot under another team's prefix is refused without reading it", async () => {
    const { runPathBDesign } = await load()
    const foreign = { kind: 'brief-upload', key: 'screenshots/team-2/user-9/shot.png', width: 1600, height: 1000 }
    const result = await runPathBDesign(mkBrief({ compositeSource: foreign }), kit, 'h', null, actor, model)
    expect(h.getObjectBytes).not.toHaveBeenCalled()
    expect(result.composition).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'composite-source-missing' })
  })

  it('a blank failure (composite-not-blank) reuses the image under classic, with no screenshot read', async () => {
    const { runPathBDesign } = await load()
    h.background.mockResolvedValue({
      url: 'https://minio.example.com/bg.png',
      check: { ok: false, reason: 'composite-not-blank' },
    })
    const result = await runPathBDesign(mkBrief(), kit, 'h', null, actor, model)
    expect(h.getObjectBytes).not.toHaveBeenCalled()
    expect(h.designCalls).toHaveLength(1)
    expect(h.designCalls[0].systemPrompt).toContain('https://minio.example.com/bg.png')
    expect(result.backgroundImageUrl).toBe('https://minio.example.com/bg.png')
    expect(result.composition).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'composite-not-blank' })
  })

  it('a brief with no screenshot never reaches the composite look (classic composite-source-missing)', async () => {
    const { runPathBDesign } = await load()
    h.background.mockResolvedValue({ url: 'https://minio.example.com/bg.png' })
    const result = await runPathBDesign(mkBrief({ compositeSource: null }), kit, 'h', null, actor, model)
    expect(h.getObjectBytes).not.toHaveBeenCalled()
    expect(result.composition).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'composite-source-missing' })
  })

  it('the canvas the screenshot is placed on is the brief size', () => {
    expect(ASPECT_DIMENSIONS.SQUARE).toEqual({ width: 1080, height: 1080 })
  })
})
