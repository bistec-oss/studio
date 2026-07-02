import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe('buildMockCopy', () => {
  it('embeds the brief topic so sentinels reach the publishers via the caption', async () => {
    const hooks = await loadHooks()
    const copy = hooks.buildMockCopy('launch __FAIL_ONCE__ t1')
    expect(copy).toContain(hooks.MOCK_COPY_TEXT)
    expect(copy).toContain('__FAIL_ONCE__')
  })
})
