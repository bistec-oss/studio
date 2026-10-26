// Brand-kit assistant (F5): the ```brandkit block extraction the panel depends
// on, the deterministic MOCK_AI seam the E2E asserts on, and the chat grounding
// union (BrandKitDocument source docs + feedToAI artifacts). Prisma, MinIO, and
// the model runners are mocked; buildDocsContext is real.
// 008 T8: the chat, image → template and the voice draft resolve
// ASSISTANT_BRANDKIT — the resolver (policy.ts → decideModel) runs for real on a
// faked TeamModelPolicy row, in a mode the test sets.

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'

const h = vi.hoisted(() => ({
  artifactFindMany: vi.fn(),
  documentFindMany: vi.fn(),
  runVisionModel: vi.fn(),
  runBriefingModel: vi.fn(),
  cli: false,
  mockAi: false,
  policy: null as null | Record<string, unknown>,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandKitArtifact: { findMany: h.artifactFindMany },
    brandKitDocument: { findMany: h.documentFindMany },
    teamModelPolicy: { findUnique: async () => h.policy },
    userClaudeToken: { findFirst: async () => null },
  },
}))
vi.mock('@/lib/agent/vision', () => ({ runVisionModel: h.runVisionModel }))
// The real resolveAssistantModel / AssistantModelError; only the call is faked.
vi.mock('@/lib/campaign/briefingAssistant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/campaign/briefingAssistant')>()),
  runBriefingModel: h.runBriefingModel,
}))
// The mode, deterministically (the local .env may set CLI mode; CI has none).
vi.mock('@/lib/agent/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/config')>()),
  isCliMode: () => h.cli,
  pipelineMode: () => (h.cli ? 'cli' : 'api'),
}))
vi.mock('@/lib/testHooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/testHooks')>()),
  get MOCK_AI() {
    return h.mockAi
  },
}))
vi.mock('@/lib/renderer/puppeteer', () => ({
  sampleImageColors: async () => [],
  getImageDimensions: async () => ({ width: 1080, height: 1350 }),
}))
vi.mock('@/lib/storage/minio', () => ({
  BUCKET_DOCS: 'docs',
  getPresignedUrl: vi.fn(async (_bucket: string, key: string) => `https://minio.invalid/docs/${key}`),
}))

import { collectBrandKitGrounding, extractBrandKitBlock, runBrandKitChat } from '@/lib/brandkit/assistant'
import { generateTemplateFromImage } from '@/lib/brandkit/templateFromImage'
import { draftBrandVoice } from '@/lib/brandkit/voiceDraft'
import { AssistantModelError } from '@/lib/campaign/briefingAssistant'
import { buildMockBrandKitReply } from '@/lib/testHooks'
import { setModelCallSink, type ModelCallRecord } from '@/lib/models/modelCalls'

// The grounding queries are dispatched off the where clause: artifact images
// use type:{in:[…]}, artifact docs use type:'REFERENCE_DOC'; kit-document
// image lookups filter on contentType, text lookups don't.
type Where = { type?: unknown; contentType?: unknown }
function stubGrounding(opts: {
  artifactImageUrls?: string[]
  artifactDocs?: Array<{ name: string; parsedText: string | null; truncated: boolean }>
  docImageKeys?: string[]
  docTexts?: Array<{ name: string; parsedText: string; truncated: boolean }>
}) {
  h.artifactFindMany.mockImplementation(async ({ where }: { where: Where }) =>
    where.type === 'REFERENCE_DOC'
      ? (opts.artifactDocs ?? [])
      : (opts.artifactImageUrls ?? []).map((url) => ({ url }))
  )
  h.documentFindMany.mockImplementation(async ({ where }: { where: Where }) =>
    where.contentType
      ? (opts.docImageKeys ?? []).map((objectKey) => ({ objectKey }))
      : (opts.docTexts ?? [])
  )
}

let calls: ModelCallRecord[] = []
beforeEach(() => {
  h.cli = false
  h.mockAi = false
  h.policy = null
  calls = []
  setModelCallSink({ record: (r) => calls.push(r), read: () => calls, clear: () => (calls = []) })
  h.artifactFindMany.mockReset()
  h.documentFindMany.mockReset()
  h.runVisionModel.mockReset().mockResolvedValue('vision reply — no block')
  h.runBriefingModel.mockReset().mockResolvedValue('text reply — no block')
  stubGrounding({})
})

describe('collectBrandKitGrounding', () => {
  it('puts document images FIRST, unions with artifact urls, dedups, caps at 6', async () => {
    stubGrounding({
      docImageKeys: ['brandkits/k1/a.png', 'brandkits/k1/b.png', 'brandkits/k1/c.png'],
      artifactImageUrls: [
        // Duplicate of the first presigned document image — must be deduped.
        'https://minio.invalid/docs/brandkits/k1/a.png',
        'https://cdn/art-1.png',
        'https://cdn/art-2.png',
        'https://cdn/art-3.png',
        'https://cdn/art-4.png',
      ],
    })
    const { imageUrls } = await collectBrandKitGrounding('k1')
    expect(imageUrls).toEqual([
      'https://minio.invalid/docs/brandkits/k1/a.png',
      'https://minio.invalid/docs/brandkits/k1/b.png',
      'https://minio.invalid/docs/brandkits/k1/c.png',
      'https://cdn/art-1.png',
      'https://cdn/art-2.png',
      'https://cdn/art-3.png',
    ]) // doc images first, dup removed, art-4 dropped by the cap of 6
  })

  it('joins kit-document texts and REFERENCE_DOC artifact texts (documents first)', async () => {
    stubGrounding({
      docTexts: [{ name: 'guidelines.pdf', parsedText: 'DOCUMENT BODY', truncated: false }],
      artifactDocs: [{ name: 'voice.md', parsedText: 'ARTIFACT BODY', truncated: false }],
    })
    const { docs } = await collectBrandKitGrounding('k1')
    expect(docs.text).toContain('DOCUMENT BODY')
    expect(docs.text).toContain('ARTIFACT BODY')
    expect(docs.text.indexOf('### guidelines.pdf')).toBeGreaterThanOrEqual(0)
    expect(docs.text.indexOf('### guidelines.pdf')).toBeLessThan(docs.text.indexOf('### voice.md'))
    expect(docs.truncated).toBe(false)
  })

  it('image "documents" (empty parsedText) never leak into the docs context', async () => {
    stubGrounding({
      docTexts: [{ name: 'photo.png', parsedText: '', truncated: false }],
    })
    const { docs } = await collectBrandKitGrounding('k1')
    expect(docs.text).toBe('')
  })
})

describe('runBrandKitChat grounding', () => {
  const messages = [{ role: 'user' as const, content: 'extract the style' }]

  it('returns the canned reply ONLY when there are no artifacts AND no documents', async () => {
    stubGrounding({})
    const result = await runBrandKitChat('k1', messages, 'team-1', 'u1')
    expect(result.reply).toContain('Add at least one reference')
    expect(result.suggestion).toBeNull()
    expect(h.runVisionModel).not.toHaveBeenCalled()
    expect(h.runBriefingModel).not.toHaveBeenCalled()
  })

  it('a text DOCUMENT alone lifts the guard and its text reaches the prompt', async () => {
    stubGrounding({
      docTexts: [{ name: 'guidelines.pdf', parsedText: 'DOCUMENT BODY', truncated: false }],
    })
    const result = await runBrandKitChat('k1', messages, 'team-1', 'u1')
    expect(result.reply).toBe('text reply — no block')
    expect(h.runVisionModel).not.toHaveBeenCalled()
    expect(h.runBriefingModel).toHaveBeenCalledTimes(1)
    const system = h.runBriefingModel.mock.calls[0][0] as string
    expect(system).toContain('DOCUMENT BODY')
  })

  it('a document IMAGE alone lifts the guard and routes to the vision model', async () => {
    stubGrounding({ docImageKeys: ['brandkits/k1/ref.png'] })
    const result = await runBrandKitChat('k1', messages, 'team-1', 'u1')
    expect(result.reply).toBe('vision reply — no block')
    expect(h.runBriefingModel).not.toHaveBeenCalled()
    expect(h.runVisionModel).toHaveBeenCalledTimes(1)
    const call = h.runVisionModel.mock.calls[0][0] as { imageUrls: string[] }
    expect(call.imageUrls).toEqual(['https://minio.invalid/docs/brandkits/k1/ref.png'])
  })
})

describe('extractBrandKitBlock', () => {
  it('parses voice/tone/style/fonts from a ```brandkit block', () => {
    const text = [
      'Here is what I found:',
      '```brandkit',
      JSON.stringify({ voice: 'Warm and expert.', tone: 'friendly', style: 'airy', fonts: ['Inter'] }),
      '```',
    ].join('\n')
    const block = extractBrandKitBlock(text)
    expect(block).toMatchObject({ voice: 'Warm and expert.', tone: 'friendly', style: 'airy' })
    expect(block!.fonts).toEqual({ heading: 'Inter' })
  })

  it('applies defaults for omitted optional fields', () => {
    const block = extractBrandKitBlock('```brandkit\n{"voice":"Just a voice."}\n```')
    expect(block).toMatchObject({ voice: 'Just a voice.', tone: '', style: '', fonts: {}, colors: [] })
  })

  it('parses document-declared hex colors and rejects non-hex values', () => {
    const good = extractBrandKitBlock('```brandkit\n{"voice":"v","colors":["#1A2B3C","#fff"]}\n```')
    expect(good!.colors).toEqual(['#1A2B3C', '#fff'])
    // A non-hex color fails validation → the whole block is rejected.
    expect(extractBrandKitBlock('```brandkit\n{"voice":"v","colors":["cornflower blue"]}\n```')).toBeNull()
  })

  it('returns null when missing, malformed, or missing the required voice', () => {
    expect(extractBrandKitBlock('no block')).toBeNull()
    expect(extractBrandKitBlock('```brandkit\nnot json\n```')).toBeNull()
    expect(extractBrandKitBlock('```brandkit\n{"tone":"x"}\n```')).toBeNull() // voice required
  })

  it('takes the LAST block when restated', () => {
    const text = [
      '```brandkit\n{"voice":"old"}\n```',
      '```brandkit\n{"voice":"new"}\n```',
    ].join('\n')
    expect(extractBrandKitBlock(text)!.voice).toBe('new')
  })
})

describe('MOCK_AI brand-kit seam', () => {
  it('buildMockBrandKitReply carries an extractable brandkit block', () => {
    const reply = buildMockBrandKitReply('extract style')
    const block = extractBrandKitBlock(reply)
    expect(block).not.toBeNull()
    expect(block!.voice).toContain('extract style')
    expect(Object.keys(block!.fonts).length).toBeGreaterThan(0)
  })
})

// ── 008 T8: the brand-kit surfaces on the resolver ───────────────────────────

const SONNET = 'claude-sonnet-5-5'
const HAIKU = 'claude-haiku-4-5'
const haikuDefault = () => ({
  allowedModels: ['HAIKU', 'SONNET', 'OPUS'],
  requirePersonalTokenForGated: false,
  defaults: [{ surface: 'ASSISTANT_BRANDKIT', model: 'HAIKU' }],
})
const noModel = () => ({ allowedModels: [], requirePersonalTokenForGated: false, defaults: [] })
const TEMPLATE_HTML = '<!doctype html><html><body>template</body></html>'
const fromImage = () =>
  generateTemplateFromImage({
    imageDataUrl: 'data:image/png;base64,AAAA',
    imageUrl: 'https://cdn/ref.png',
    teamId: 'team-1',
    userId: 'u1',
  })
const voice = () => draftBrandVoice('team-1', 'u1', 'Write a voice prompt.', { mockDraft: 'MOCK VOICE' })

describe('008 T8: ASSISTANT_BRANDKIT', () => {
  const messages = [{ role: 'user' as const, content: 'extract the style' }]
  // The palette sampler fetches the references: answer at once, never the network.
  beforeEach(() => vi.stubGlobal('fetch', async () => new Response('', { status: 404 })))
  afterEach(() => vi.unstubAllGlobals())

  it('the chat hands the resolved model to the vision call (no team default → Sonnet, system)', async () => {
    stubGrounding({ artifactImageUrls: ['https://cdn/art-1.png'] })
    await runBrandKitChat('k1', messages, 'team-1', 'u1')
    expect(h.runVisionModel.mock.calls[0][0].model).toMatchObject({
      surface: 'ASSISTANT_BRANDKIT',
      key: 'SONNET',
      arg: SONNET,
      source: 'system',
    })
  })

  it('the documents-only chat hands it to the text call, labelled brandkit (team default → Haiku)', async () => {
    h.policy = haikuDefault()
    stubGrounding({ docTexts: [{ name: 'g.pdf', parsedText: 'BODY', truncated: false }] })
    await runBrandKitChat('k1', messages, 'team-1', 'u1')
    const [, , teamId, model, opts] = h.runBriefingModel.mock.calls[0]
    expect(teamId).toBe('team-1')
    expect(model).toMatchObject({ surface: 'ASSISTANT_BRANDKIT', key: 'HAIKU', arg: HAIKU, source: 'team' })
    expect(opts).toEqual({ label: 'brandkit' })
  })

  it('image → template hands the resolved model to the vision call', async () => {
    h.policy = haikuDefault()
    h.runVisionModel.mockResolvedValue(TEMPLATE_HTML)
    const result = await fromImage()
    expect(result.aspectRatio).toBe('PORTRAIT')
    expect(h.runVisionModel.mock.calls[0][0]).toMatchObject({
      label: 'image-template',
      maxTokens: 4096,
      model: { surface: 'ASSISTANT_BRANDKIT', key: 'HAIKU', source: 'team' },
    })
  })

  it('the voice draft runs through runBriefingModel: no system, one user message, max_tokens 1024 (D8)', async () => {
    h.runBriefingModel.mockResolvedValue('A brand voice.')
    await expect(voice()).resolves.toBe('A brand voice.')
    expect(h.runBriefingModel).toHaveBeenCalledWith(
      undefined,
      [{ role: 'user', content: 'Write a voice prompt.' }],
      'team-1',
      expect.objectContaining({ surface: 'ASSISTANT_BRANDKIT', key: 'SONNET', arg: SONNET }),
      { maxTokens: 1024, label: 'brand-voice' },
    )
  })

  it('every MOCK_AI branch records ASSISTANT_BRANDKIT before its mock, in the mode it runs', async () => {
    h.mockAi = true
    h.policy = haikuDefault()
    stubGrounding({ artifactImageUrls: ['https://cdn/art-1.png'] })
    await runBrandKitChat('k1', messages, 'team-1', 'u1')
    expect(await fromImage()).toMatchObject({ aspectRatio: 'PORTRAIT' })
    await expect(voice()).resolves.toBe('MOCK VOICE')
    h.cli = true
    await voice()
    expect(h.runVisionModel).not.toHaveBeenCalled()
    expect(h.runBriefingModel).not.toHaveBeenCalled()
    expect(calls.map((c) => [c.surface, c.key, c.source, c.mode, c.label])).toEqual([
      ['ASSISTANT_BRANDKIT', 'HAIKU', 'team', 'api', 'brandkit'],
      ['ASSISTANT_BRANDKIT', 'HAIKU', 'team', 'api', 'image-template'],
      ['ASSISTANT_BRANDKIT', 'HAIKU', 'team', 'api', 'brand-voice'],
      ['ASSISTANT_BRANDKIT', 'HAIKU', 'team', 'cli', 'brand-voice'],
    ])
  })

  it('no model the team can run → AssistantModelError from each entry point; nothing runs or records', async () => {
    h.policy = noModel()
    stubGrounding({ artifactImageUrls: ['https://cdn/art-1.png'] })
    for (const mockAi of [false, true]) {
      h.mockAi = mockAi
      for (const call of [() => runBrandKitChat('k1', messages, 'team-1', 'u1'), fromImage, voice]) {
        const err = await call().catch((e: unknown) => e)
        expect(err).toBeInstanceOf(AssistantModelError)
        expect(err).toMatchObject({ code: 'NO_ALLOWED_MODEL' })
      }
    }
    expect(h.runVisionModel).not.toHaveBeenCalled()
    expect(h.runBriefingModel).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })
})

afterAll(() => setModelCallSink(null))
