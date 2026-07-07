// Pure parts of the scheduled-generation runner: the backoff curve and the
// generation-failure test sentinel. The claim/lease/post-action flow is
// exercised end-to-end via /api/test/generation-tick in the E2E suite.

import { describe, it, expect } from 'vitest'
import { generationBackoffMs } from '@/lib/scheduler/generationRunner'
import { shouldMockGenerateFail } from '@/lib/testHooks'

describe('generationBackoffMs', () => {
  it('backs off 20, 40 min then caps at 60', () => {
    expect(generationBackoffMs(1)).toBe(20 * 60_000)
    expect(generationBackoffMs(2)).toBe(40 * 60_000)
    expect(generationBackoffMs(3)).toBe(60 * 60_000)
    expect(generationBackoffMs(10)).toBe(60 * 60_000)
  })
})

describe('shouldMockGenerateFail', () => {
  it('fires only on the __FAIL_GEN_ALWAYS__ sentinel', () => {
    expect(shouldMockGenerateFail('Topic: __FAIL_GEN_ALWAYS__ webinar')).toBe(true)
    expect(shouldMockGenerateFail('Topic: normal webinar')).toBe(false)
    expect(shouldMockGenerateFail('__FAIL_ALWAYS__')).toBe(false)
  })
})
