// GeminiImageProvider (005 FR-13, AC-19): fetch is mocked, nothing reaches
// Google. Mock-verified only, by user decision (AC-21) — so the fixtures below
// are shaped exactly like the documented REST response, and the request
// assertions are the documented request, so a later live check is a diff
// against the source rather than a guess:
//   - request + endpoint: https://ai.google.dev/api/generate-content
//     (GenerateContentRequest, GenerationConfig.responseModalities,
//     GenerationConfig.imageConfig {aspectRatio}) — checked 2026-10-02;
//   - response: the same page, GenerateContentResponse → candidates[].content
//     .parts[].inlineData {mimeType, data}, promptFeedback.blockReason,
//     Candidate.finishReason (SAFETY / IMAGE_SAFETY / NO_IMAGE …);
//   - aspect ratios + model: https://ai.google.dev/gemini-api/docs/image-generation
//     ("Aspect ratios and image size", 3.1 Flash Image table: 1:1, 4:5, 9:16).
//   - non-2xx body: the Google API error envelope {error:{code,message,status}}
//     (https://ai.google.dev/gemini-api/docs/troubleshooting).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { GeminiImageProvider, GEMINI_IMAGE_MODEL } = await import('@/providers/implementations/image/gemini')

// AIzaSy + 33 characters: the shape of a real Google API key.
const KEY = 'AIzaSyTEST_gemini_key_0123456789abcdefgh'
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// A docs-shaped success: the model may interleave a text part before the image.
function successBody(mimeType = 'image/png') {
  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts: [{ text: 'Here is the background you asked for.' }, { inlineData: { mimeType, data: PNG_B64 } }],
        },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 1290, totalTokenCount: 1302 },
    modelVersion: GEMINI_IMAGE_MODEL,
    responseId: 'resp-1',
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function errorOf(p: Promise<unknown>): Promise<Error> {
  try {
    await p
  } catch (e) {
    return e as Error
  }
  throw new Error('expected a rejection')
}

describe('GeminiImageProvider — request shape (AC-19)', () => {
  it('POSTs the documented generateContent request with the key in x-goog-api-key, never the URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(successBody()))
    const provider = new GeminiImageProvider(KEY)
    await provider.generateImage('a soft teal gradient', 'kit-1', '4:5')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`)
    expect(url).not.toContain(KEY)
    expect(url).not.toContain('key=')
    expect(init.method).toBe('POST')
    const headers = new Headers(init.headers)
    expect(headers.get('x-goog-api-key')).toBe(KEY)
    expect(headers.get('content-type')).toBe('application/json')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body as string)).toEqual({
      contents: [{ parts: [{ text: 'a soft teal gradient' }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '4:5' } },
    })
  })

  it('the model id is the documented stable 3.1 Flash Image model', () => {
    expect(GEMINI_IMAGE_MODEL).toBe('gemini-3.1-flash-image')
    expect(new GeminiImageProvider(KEY).providerName).toBe('gemini')
  })

  it.each(['1:1', '4:5', '9:16'])('passes the T7 size value %s through as imageConfig.aspectRatio', async (size) => {
    fetchMock.mockResolvedValue(jsonResponse(successBody()))
    await new GeminiImageProvider(KEY).generateImage('p', undefined, size)
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.generationConfig.imageConfig.aspectRatio).toBe(size)
  })

  it('defaults to 1:1 when no size is given', async () => {
    fetchMock.mockResolvedValue(jsonResponse(successBody()))
    await new GeminiImageProvider(KEY).generateImage('p')
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('1:1')
  })
})

describe('GeminiImageProvider — response (AC-19)', () => {
  it('returns the first inline image as a data: URL persistDataUrlImage accepts', async () => {
    fetchMock.mockResolvedValue(jsonResponse(successBody()))
    const result = await new GeminiImageProvider(KEY).generateImage('p', undefined, '1:1')
    expect(result).toEqual({ url: `data:image/png;base64,${PNG_B64}` })
    // The same regex persistDataUrlImage parses with (storage/minio.ts).
    expect(result.url).toMatch(/^data:([^;]+);base64,(.+)$/)
  })

  it('keeps a JPEG as a JPEG (persistDataUrlImage accepts image/jpeg)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(successBody('image/jpeg')))
    const result = await new GeminiImageProvider(KEY).generateImage('p')
    expect(result.url).toBe(`data:image/jpeg;base64,${PNG_B64}`)
  })

  it('refuses an image type persistDataUrlImage cannot store, with a readable error', async () => {
    fetchMock.mockResolvedValue(jsonResponse(successBody('image/heic')))
    const err = await errorOf(new GeminiImageProvider(KEY).generateImage('p'))
    expect(err.message).toBe('Gemini returned an unsupported image type: image/heic')
  })
})

describe('GeminiImageProvider — readable errors, never the key (AC-19)', () => {
  it('non-2xx → "Gemini image generation failed (HTTP <status>): <api message>"', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } },
        400,
      ),
    )
    const err = await errorOf(new GeminiImageProvider(KEY).generateImage('p'))
    expect(err.message).toBe(
      'Gemini image generation failed (HTTP 400): API key not valid. Please pass a valid API key.',
    )
    expect(err.message).not.toContain(KEY)
  })

  it('non-2xx with a body that echoes the key → the key is redacted', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 403, message: `Key ${KEY} is suspended` } }, 403))
    const err = await errorOf(new GeminiImageProvider(KEY).generateImage('p'))
    expect(err.message).toMatch(/^Gemini image generation failed \(HTTP 403\): /)
    expect(err.message).not.toContain(KEY)
  })

  it('non-2xx with a non-JSON body → the status text, still readable', async () => {
    fetchMock.mockResolvedValue(new Response('upstream connect error', { status: 503 }))
    const err = await errorOf(new GeminiImageProvider(KEY).generateImage('p'))
    expect(err.message).toBe('Gemini image generation failed (HTTP 503): upstream connect error')
  })

  it('a prompt block (promptFeedback.blockReason, no candidates) → a safety refusal', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ promptFeedback: { blockReason: 'SAFETY', safetyRatings: [] } }))
    const err = await errorOf(new GeminiImageProvider(KEY).generateImage('p'))
    expect(err.message).toBe('Gemini image request blocked by safety filters (prompt: SAFETY)')
    expect(err.message).not.toContain(KEY)
  })

  it.each(['SAFETY', 'IMAGE_SAFETY', 'PROHIBITED_CONTENT', 'IMAGE_PROHIBITED_CONTENT'])(
    'a candidate stopped for %s → a safety refusal',
    async (finishReason) => {
      fetchMock.mockResolvedValue(jsonResponse({ candidates: [{ finishReason, index: 0 }] }))
      const err = await errorOf(new GeminiImageProvider(KEY).generateImage('p'))
      expect(err.message).toBe(`Gemini image request blocked by safety filters (${finishReason})`)
    },
  )

  it('the safety message reads as a refusal to the draft notice (T2 MODERATION_RE)', async () => {
    const { MODERATION_RE } = await import('@/lib/drafts/backgroundNotice')
    fetchMock.mockResolvedValue(jsonResponse({ candidates: [{ finishReason: 'IMAGE_SAFETY' }] }))
    const err = await errorOf(new GeminiImageProvider(KEY).generateImage('p'))
    expect(MODERATION_RE.test(err.message)).toBe(true)
  })

  it('a text-only reply (no inline image) → "Gemini returned no image"', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ candidates: [{ content: { role: 'model', parts: [{ text: 'I cannot draw that.' }] }, finishReason: 'STOP' }] }),
    )
    const err = await errorOf(new GeminiImageProvider(KEY).generateImage('p'))
    expect(err.message).toBe('Gemini returned no image (finish reason: STOP)')
  })

  it('finishReason NO_IMAGE → "Gemini returned no image"', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ candidates: [{ finishReason: 'NO_IMAGE' }] }))
    const err = await errorOf(new GeminiImageProvider(KEY).generateImage('p'))
    expect(err.message).toBe('Gemini returned no image (finish reason: NO_IMAGE)')
  })

  it('an empty body → "Gemini returned no image"', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const err = await errorOf(new GeminiImageProvider(KEY).generateImage('p'))
    expect(err.message).toBe('Gemini returned no image')
  })

  it('the request is aborted after 120 s → a readable timeout error', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })),
          )
        }),
    )
    const pending = errorOf(new GeminiImageProvider(KEY).generateImage('p'))
    await vi.advanceTimersByTimeAsync(119_999)
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal
    expect(signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signal.aborted).toBe(true)
    const err = await pending
    expect(err.message).toBe('Gemini image generation timed out after 120s')
  })
})

// ── Registry (FR-13 wiring): a gemini IMAGE row instantiates the provider ────

describe('resolveImageProvider — a gemini row serves a GeminiImageProvider', () => {
  it('the team default gemini row resolves to a GeminiImageProvider with the decrypted key', async () => {
    vi.resetModules()
    process.env.TOKEN_ENCRYPTION_KEY = 'c'.repeat(64)
    const findFirst = vi.fn()
    vi.doMock('@/lib/prisma', () => ({
      prisma: { userOpenAiKey: { findUnique: vi.fn() }, availableProvider: { findFirst } },
    }))
    const { encrypt } = await import('@/lib/crypto')
    findFirst.mockResolvedValue({
      id: 'row-1',
      slot: 'IMAGE',
      providerName: 'gemini',
      providerKey: 'gemini-1',
      encryptedApiKey: encrypt(KEY),
      isEnabled: true,
      isDefault: true,
    })
    const { resolveImageProvider } = await import('@/providers/registry')
    const { GeminiImageProvider: Fresh } = await import('@/providers/implementations/image/gemini')

    const provider = await resolveImageProvider({ teamId: 'team-1', userId: null })
    expect(provider).toBeInstanceOf(Fresh)
    expect(provider?.providerName).toBe('gemini')

    // It really carries the row's key: the request goes out with it.
    fetchMock.mockResolvedValue(jsonResponse(successBody()))
    await provider!.generateImage('p', undefined, '9:16')
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('x-goog-api-key')).toBe(KEY)
    vi.doUnmock('@/lib/prisma')
  })
})
