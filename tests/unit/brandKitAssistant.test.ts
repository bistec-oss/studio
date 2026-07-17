// Brand-kit assistant (F5): the ```brandkit block extraction the panel depends
// on, the deterministic MOCK_AI seam the E2E asserts on, and the chat grounding
// union (BrandKitDocument source docs + feedToAI artifacts). Prisma, MinIO, and
// the model runners are mocked; buildDocsContext is real.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  artifactFindMany: vi.fn(),
  documentFindMany: vi.fn(),
  runVisionModel: vi.fn(),
  runBriefingModel: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandKitArtifact: { findMany: h.artifactFindMany },
    brandKitDocument: { findMany: h.documentFindMany },
  },
}))
vi.mock('@/lib/agent/vision', () => ({ runVisionModel: h.runVisionModel }))
vi.mock('@/lib/campaign/briefingAssistant', () => ({ runBriefingModel: h.runBriefingModel }))
vi.mock('@/lib/storage/minio', () => ({
  BUCKET_DOCS: 'docs',
  getPresignedUrl: vi.fn(async (_bucket: string, key: string) => `https://minio.invalid/docs/${key}`),
}))

import { collectBrandKitGrounding, extractBrandKitBlock, runBrandKitChat } from '@/lib/brandkit/assistant'
import { buildMockBrandKitReply } from '@/lib/testHooks'

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

beforeEach(() => {
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
    const result = await runBrandKitChat('k1', messages)
    expect(result.reply).toContain('Add at least one reference')
    expect(result.suggestion).toBeNull()
    expect(h.runVisionModel).not.toHaveBeenCalled()
    expect(h.runBriefingModel).not.toHaveBeenCalled()
  })

  it('a text DOCUMENT alone lifts the guard and its text reaches the prompt', async () => {
    stubGrounding({
      docTexts: [{ name: 'guidelines.pdf', parsedText: 'DOCUMENT BODY', truncated: false }],
    })
    const result = await runBrandKitChat('k1', messages)
    expect(result.reply).toBe('text reply — no block')
    expect(h.runVisionModel).not.toHaveBeenCalled()
    expect(h.runBriefingModel).toHaveBeenCalledTimes(1)
    const system = h.runBriefingModel.mock.calls[0][0] as string
    expect(system).toContain('DOCUMENT BODY')
  })

  it('a document IMAGE alone lifts the guard and routes to the vision model', async () => {
    stubGrounding({ docImageKeys: ['brandkits/k1/ref.png'] })
    const result = await runBrandKitChat('k1', messages)
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
    expect(block!.fonts).toEqual(['Inter'])
  })

  it('applies defaults for omitted optional fields', () => {
    const block = extractBrandKitBlock('```brandkit\n{"voice":"Just a voice."}\n```')
    expect(block).toMatchObject({ voice: 'Just a voice.', tone: '', style: '', fonts: [], colors: [] })
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
    expect(block!.fonts.length).toBeGreaterThan(0)
  })
})
