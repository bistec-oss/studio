import { describe, it, expect, vi, beforeEach } from 'vitest'
// buildMockHtml reads no env var, so it is safe to import statically (unlike the
// sentinel helpers below, which snapshot MOCK_* at module load).
import { buildMockHtml } from '@/lib/testHooks'

// testHooks.ts snapshots its MOCK_* env vars at module load, and
// shouldMockPublishFail keeps per-caption __FAIL_ONCE__ state at module level —
// so every scenario gets a fresh module instance via resetModules + dynamic import.
async function loadHooks(env: Record<string, string> = {}) {
  vi.resetModules()
  vi.unstubAllEnvs()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  return await import('@/lib/testHooks')
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('shouldMockPublishFail', () => {
  it('succeeds by default (no sentinel, no env)', async () => {
    const hooks = await loadHooks({ MOCK_SOCIAL: 'true' })
    expect(hooks.shouldMockPublishFail('a perfectly normal caption')).toBe(false)
  })

  it('__FAIL_ALWAYS__ sentinel always fails', async () => {
    const hooks = await loadHooks({ MOCK_SOCIAL: 'true' })
    const caption = 'post __FAIL_ALWAYS__ x'
    expect(hooks.shouldMockPublishFail(caption)).toBe(true)
    expect(hooks.shouldMockPublishFail(caption)).toBe(true)
  })

  it('__FAIL_ONCE__ fails the first attempt then succeeds (per unique caption)', async () => {
    const hooks = await loadHooks({ MOCK_SOCIAL: 'true' })
    const caption = 'retry-me __FAIL_ONCE__ unique-1'
    expect(hooks.shouldMockPublishFail(caption)).toBe(true)
    expect(hooks.shouldMockPublishFail(caption)).toBe(false)
    // A different caption gets its own first failure
    expect(hooks.shouldMockPublishFail('retry-me __FAIL_ONCE__ unique-2')).toBe(true)
  })

  it('MOCK_SOCIAL_FAIL env forces failure regardless of caption', async () => {
    const hooks = await loadHooks({ MOCK_SOCIAL: 'true', MOCK_SOCIAL_FAIL: 'true' })
    expect(hooks.MOCK_SOCIAL_FAIL).toBe(true)
    expect(hooks.shouldMockPublishFail('no sentinel at all')).toBe(true)
  })

  it('MOCK_* flags are dormant unless exactly "true"', async () => {
    const hooks = await loadHooks({ MOCK_SOCIAL: '1', MOCK_SOCIAL_FAIL: 'TRUE' })
    expect(hooks.MOCK_SOCIAL).toBe(false)
    expect(hooks.MOCK_SOCIAL_FAIL).toBe(false)
    expect(hooks.shouldMockPublishFail('plain')).toBe(false)
  })
})

describe('shouldMockVerificationMiss (FR-24)', () => {
  // The once-state is globalThis-backed, so it survives loadHooks' resetModules
  // just as it survives a Turbopack module split — every case below therefore
  // uses its own unique instruction string, exactly as a __FAIL_ONCE__ caption
  // must be unique per post.

  it('is inert without MOCK_AI — the production default — and records no state', async () => {
    const prod = await loadHooks()
    expect(prod.MOCK_AI).toBe(false)
    expect(prod.shouldMockVerificationMiss('reduce the text __FAIL_VERIFY_ALWAYS__ dormant-1')).toBe(false)
    expect(prod.shouldMockVerificationMiss('reduce the text __FAIL_VERIFY_ONCE__ dormant-2')).toBe(false)
    expect(prod.shouldMockVerificationMiss('reduce the text __FAIL_VERIFY_ONCE__ dormant-2')).toBe(false)
    // The dormant calls must not have consumed the once-sentinel's first miss:
    // under MOCK_AI the very same instruction still misses first.
    const mocked = await loadHooks({ MOCK_AI: 'true' })
    expect(mocked.shouldMockVerificationMiss('reduce the text __FAIL_VERIFY_ONCE__ dormant-2')).toBe(true)
  })

  it('leaves a plain instruction alone', async () => {
    const hooks = await loadHooks({ MOCK_AI: 'true' })
    expect(hooks.shouldMockVerificationMiss('use the uploaded image as the background')).toBe(false)
    expect(hooks.shouldMockVerificationMiss('')).toBe(false)
  })

  it('__FAIL_VERIFY_ALWAYS__ misses every time (the twice-failed / not-applied path)', async () => {
    const hooks = await loadHooks({ MOCK_AI: 'true' })
    const instruction = 'add a human character __FAIL_VERIFY_ALWAYS__ always-1'
    expect(hooks.shouldMockVerificationMiss(instruction)).toBe(true)
    expect(hooks.shouldMockVerificationMiss(instruction)).toBe(true)
  })

  it('__FAIL_VERIFY_ONCE__ misses the first verification then passes (the retry path)', async () => {
    const hooks = await loadHooks({ MOCK_AI: 'true' })
    const instruction = 'add a human character __FAIL_VERIFY_ONCE__ once-1'
    expect(hooks.shouldMockVerificationMiss(instruction)).toBe(true)
    expect(hooks.shouldMockVerificationMiss(instruction)).toBe(false)
    // A different instruction gets its own first miss.
    expect(hooks.shouldMockVerificationMiss('add a human character __FAIL_VERIFY_ONCE__ once-2')).toBe(true)
  })

  it('stays dormant when MOCK_AI is set to anything but exactly "true"', async () => {
    const hooks = await loadHooks({ MOCK_AI: '1' })
    expect(hooks.MOCK_AI).toBe(false)
    expect(hooks.shouldMockVerificationMiss('__FAIL_VERIFY_ALWAYS__ not-quite-true')).toBe(false)
  })
})

describe('buildMockCopy', () => {
  it('embeds the brief topic so sentinels reach the publishers via the caption', async () => {
    const hooks = await loadHooks()
    const copy = hooks.buildMockCopy('launch __FAIL_ONCE__ t1')
    expect(copy).toContain(hooks.MOCK_COPY_TEXT)
    expect(copy).toContain('__FAIL_ONCE__')
  })
})

// buildMockHtml must produce a DIFFERENT document for a different prompt.
//
// This is load-bearing for the refine-verification work (change 004): the stub's
// output used to depend only on the first #RRGGBB in the prompt, so a mocked
// refine returned the draft's current HTML byte-for-byte. An unchanged document
// is a legitimate verification miss, so every mocked refine would have failed
// closed and the forced-miss seam would have been unreachable.
describe('buildMockHtml determinism and variance', () => {
  it('returns the same document for the same prompt', () => {
    expect(buildMockHtml('brand #0f172a / instruction A')).toBe(buildMockHtml('brand #0f172a / instruction A'))
  })

  it('returns a different document when the prompt changes but the colour does not', () => {
    const first = buildMockHtml('brand #0f172a / instruction A')
    const second = buildMockHtml('brand #0f172a / instruction B')
    expect(second).not.toBe(first)
  })

  it('still honours the brand colour and canvas size', () => {
    const html = buildMockHtml('colors: #abcdef', 1080, 1350)
    expect(html).toContain('#abcdef')
    expect(html).toContain('height: 1350px')
  })
})
