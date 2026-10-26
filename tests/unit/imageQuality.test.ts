import { describe, it, expect } from 'vitest'
import { IMAGE_TIERS, parseImageTier } from '@/providers/imageCapabilities'

describe('parseImageTier (AC-20, parser half)', () => {
  it('the closed set is standard and high', () => {
    expect([...IMAGE_TIERS]).toEqual(['standard', 'high'])
  })

  it('accepts standard and high in any case, trimmed', () => {
    expect(parseImageTier('standard')).toBe('standard')
    expect(parseImageTier('high')).toBe('high')
    expect(parseImageTier('  HIGH ')).toBe('high')
    expect(parseImageTier('Standard\n')).toBe('standard')
  })

  it('treats unset, blank and unknown as unset', () => {
    expect(parseImageTier(undefined)).toBeUndefined()
    expect(parseImageTier(null)).toBeUndefined()
    expect(parseImageTier('')).toBeUndefined()
    expect(parseImageTier('   ')).toBeUndefined()
    expect(parseImageTier('medium')).toBeUndefined()
    expect(parseImageTier('auto')).toBeUndefined()
    expect(parseImageTier('highest')).toBeUndefined()
  })
})

// ── T4: the OpenAI mapping, the option, and the env knob (FR-16, AC-20) ─────
import { vi } from 'vitest'

const o = vi.hoisted(() => ({ create: vi.fn(), options: [] as unknown[] }))
vi.mock('openai', () => ({
  default: class {
    images = { generate: o.create }
    constructor(options: unknown) {
      o.options.push(options)
    }
  },
}))

describe('OpenAIImageProvider quality (AC-20)', () => {
  const reply = { data: [{ b64_json: 'AAAA' }] }

  it('maps standard to medium and high to high', async () => {
    const { openAiQuality } = await import('@/providers/implementations/image/openai')
    expect(openAiQuality('standard')).toBe('medium')
    expect(openAiQuality('high')).toBe('high')
  })

  it('a call with no option sends exactly what it always sent: no quality key', async () => {
    const { OpenAIImageProvider } = await import('@/providers/implementations/image/openai')
    o.create.mockReset().mockResolvedValue(reply)
    const result = await new OpenAIImageProvider('sk-FAKE').generateImage('p', 'kit', '1024x1024')
    expect(Object.keys(o.create.mock.calls[0][0]).sort()).toEqual(['model', 'n', 'prompt', 'size'])
    expect(result).toEqual({ url: 'data:image/png;base64,AAAA' })
  })

  it('a tier is sent as the OpenAI word and reported back', async () => {
    const { OpenAIImageProvider } = await import('@/providers/implementations/image/openai')
    o.create.mockReset().mockResolvedValue(reply)
    const high = await new OpenAIImageProvider('sk-FAKE').generateImage('p', 'kit', '1024x1536', { quality: 'high' })
    expect(o.create.mock.calls[0][0]).toMatchObject({ quality: 'high', size: '1024x1536' })
    expect(high).toEqual({ url: 'data:image/png;base64,AAAA', quality: 'high' })
    o.create.mockClear()
    const std = await new OpenAIImageProvider('sk-FAKE').generateImage('p', 'kit', '1024x1024', { quality: 'standard' })
    expect(o.create.mock.calls[0][0]).toMatchObject({ quality: 'medium' })
    expect(std.quality).toBe('standard')
  })

  it('an empty option object sends no quality', async () => {
    const { OpenAIImageProvider } = await import('@/providers/implementations/image/openai')
    o.create.mockReset().mockResolvedValue(reply)
    const result = await new OpenAIImageProvider('sk-FAKE').generateImage('p', 'kit', '1024x1024', {})
    expect(o.create.mock.calls[0][0]).not.toHaveProperty('quality')
    expect(result).not.toHaveProperty('quality')
  })
})

describe('IMAGE_QUALITY in the env schema (AC-20)', () => {
  const load = async (value: string | undefined) => {
    vi.resetModules()
    vi.unstubAllEnvs()
    if (value !== undefined) vi.stubEnv('IMAGE_QUALITY', value)
    return (await import('@/lib/env')).env.IMAGE_QUALITY
  }

  it('parses the closed set, and treats unset, blank and unknown as unset without failing the boot', async () => {
    expect(await load('high')).toBe('high')
    expect(await load(' Standard ')).toBe('standard')
    expect(await load(undefined)).toBeUndefined()
    expect(await load('')).toBeUndefined()
    expect(await load('ultra')).toBeUndefined()
    vi.unstubAllEnvs()
  })

  it('.env.example documents it', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('.env.example', 'utf8')).toContain('IMAGE_QUALITY')
  })
})
