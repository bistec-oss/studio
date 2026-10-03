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

// T21 follow-up — the mock verifier MODEL reply (raw string for the real parser).
describe('buildMockVerifierReply', () => {
  it('no sentinel → a well-formed "applied": true verdict', async () => {
    const hooks = await loadHooks()
    expect(JSON.parse(hooks.buildMockVerifierReply('include a human character'))).toMatchObject({ applied: true })
  })

  it('__VERIFIER_SAYS_NO__ → a well-formed "applied": false verdict with a reason', async () => {
    const hooks = await loadHooks()
    const v = JSON.parse(hooks.buildMockVerifierReply('include a human __VERIFIER_SAYS_NO__'))
    expect(v.applied).toBe(false)
    expect(typeof v.reason).toBe('string')
  })

  it('__VERIFIER_GARBAGE__ → prose with no JSON object; __VERIFIER_EMPTY__ → empty', async () => {
    const hooks = await loadHooks()
    const garbage = hooks.buildMockVerifierReply('x __VERIFIER_GARBAGE__')
    expect(garbage.trim()).not.toBe('')
    expect(garbage).not.toMatch(/[{}]/)
    expect(hooks.buildMockVerifierReply('x __VERIFIER_EMPTY__')).toBe('')
  })

  it('never collides with the forced-outcome sentinels (mockVerifyOutcome stays null)', async () => {
    const hooks = await loadHooks()
    for (const s of ['__VERIFIER_SAYS_NO__', '__VERIFIER_GARBAGE__', '__VERIFIER_EMPTY__']) {
      expect(hooks.mockVerifyOutcome(`include a human ${s}`, 1)).toBeNull()
      expect(hooks.mockVerifyOutcome(`include a human ${s}`, 2)).toBeNull()
    }
  })
})

// T20 — the deterministic verification-outcome override (change 004 Phase 2).
describe('mockVerifyOutcome', () => {
  it('no sentinel → null (real verification runs unchanged)', async () => {
    const hooks = await loadHooks()
    expect(hooks.mockVerifyOutcome('include a human character', 1)).toBeNull()
    expect(hooks.mockVerifyOutcome('include a human character', 2)).toBeNull()
  })

  it('__VERIFY_PASS__ → pass on every attempt', async () => {
    const hooks = await loadHooks()
    expect(hooks.mockVerifyOutcome('do it __VERIFY_PASS__', 1)).toEqual({ kind: 'pass' })
    expect(hooks.mockVerifyOutcome('do it __VERIFY_PASS__', 2)).toEqual({ kind: 'pass' })
  })

  it('__VERIFY_FAIL_ALWAYS__ → miss on every attempt (twice-failed path)', async () => {
    const hooks = await loadHooks()
    const r1 = hooks.mockVerifyOutcome('do it __VERIFY_FAIL_ALWAYS__', 1)
    const r2 = hooks.mockVerifyOutcome('do it __VERIFY_FAIL_ALWAYS__', 2)
    expect(r1?.kind).toBe('miss')
    expect(r2?.kind).toBe('miss')
    expect(r1).toEqual(r2)
  })

  it('__VERIFY_FAIL_ONCE__ → miss on attempt 1, pass on attempt 2 (retry-succeeds path)', async () => {
    const hooks = await loadHooks()
    expect(hooks.mockVerifyOutcome('do it __VERIFY_FAIL_ONCE__', 1)?.kind).toBe('miss')
    expect(hooks.mockVerifyOutcome('do it __VERIFY_FAIL_ONCE__', 2)).toEqual({ kind: 'pass' })
  })

  it('__VERIFY_UNAVAILABLE__ → unavailable on every attempt', async () => {
    const hooks = await loadHooks()
    expect(hooks.mockVerifyOutcome('do it __VERIFY_UNAVAILABLE__', 1)?.kind).toBe('unavailable')
    expect(hooks.mockVerifyOutcome('do it __VERIFY_UNAVAILABLE__', 2)?.kind).toBe('unavailable')
  })

  it('checks in a fixed order when multiple sentinels are present', async () => {
    const hooks = await loadHooks()
    // UNAVAILABLE beats everything else.
    expect(hooks.mockVerifyOutcome('__VERIFY_UNAVAILABLE__ __VERIFY_PASS__ __VERIFY_FAIL_ALWAYS__', 1)?.kind).toBe(
      'unavailable',
    )
    // FAIL_ALWAYS beats FAIL_ONCE and PASS.
    expect(hooks.mockVerifyOutcome('__VERIFY_FAIL_ALWAYS__ __VERIFY_FAIL_ONCE__ __VERIFY_PASS__', 2)?.kind).toBe(
      'miss',
    )
  })
})

// T20 — the deterministic refine-reply seam (change 004 Phase 2).
describe('buildMockRefineReply', () => {
  const CURRENT_DOC = `<!DOCTYPE html>
<html><head><style>body{margin:0;width:1080px;height:1080px}.bg{background-image:url('https://minio.example.com/images/old-bg.png')}</style></head>
<body><div class="bg"></div><h1>Limited seats available this weekend only</h1></body>
</html>`

  const TOKEN_DOC = `<!DOCTYPE html>
<html><head><style>body{margin:0}.bg{background-image:url('__INLINE_ASSET_0__')}</style></head>
<body><div class="bg"></div><p>Some copy</p></body>
</html>`

  function args(over: Partial<Parameters<typeof buildMockRefineReply>[0]> = {}) {
    return {
      slimHtml: CURRENT_DOC,
      instruction: 'do something',
      attempt: 1 as const,
      width: 1080,
      height: 1080,
      ...over,
    }
  }

  let buildMockRefineReply: (typeof import('@/lib/testHooks'))['buildMockRefineReply']
  let buildMockHtml: (typeof import('@/lib/testHooks'))['buildMockHtml']
  let parseRefineEnvelope: (typeof import('@/lib/agent/refineEnvelope'))['parseRefineEnvelope']
  let effectiveClasses: (typeof import('@/lib/agent/refineEnvelope'))['effectiveClasses']
  let reconcileInlineAssets: (typeof import('@/lib/agent/inlineAssets'))['reconcileInlineAssets']

  beforeEach(async () => {
    ;({ buildMockRefineReply, buildMockHtml } = await import('@/lib/testHooks'))
    ;({ parseRefineEnvelope, effectiveClasses } = await import('@/lib/agent/refineEnvelope'))
    ;({ reconcileInlineAssets } = await import('@/lib/agent/inlineAssets'))
  })

  it('default (no sentinel): byte-identical to buildMockHtml, no envelope header', () => {
    const reply = buildMockRefineReply(args({ instruction: 'make the headline bigger', promptContext: '#123456 brand' }))
    expect(reply).toBe(buildMockHtml('#123456 brand', 1080, 1080))
    const parsed = parseRefineEnvelope(reply)
    expect(parsed).not.toBeNull()
    expect(parsed?.classificationDefaulted).toBe(true)
    expect(effectiveClasses({ classes: parsed!.classes, supersedes: parsed!.supersedes }).classes).toEqual(['add'])
  })

  it('default with no promptContext falls back to buildMockHtml\'s neutral colour', () => {
    const reply = buildMockRefineReply(args({ instruction: 'plain instruction' }))
    expect(reply).toBe(buildMockHtml('', 1080, 1080))
  })

  describe('__REFINE_REDUCE_NOOP__ / __REFINE_REDUCE_REAL__ (AC-08)', () => {
    it('NOOP: echoes the current document unchanged, supersedes names a real phrase', () => {
      const reply = buildMockRefineReply(args({ instruction: 'reduce the text __REFINE_REDUCE_NOOP__' }))
      const parsed = parseRefineEnvelope(reply)
      expect(parsed?.classes).toEqual(['remove'])
      expect(parsed?.supersedes.length).toBeGreaterThan(0)
      expect(parsed?.supersedes[0].length).toBeGreaterThan(0)
      expect(CURRENT_DOC).toContain(parsed!.supersedes[0])
      expect(parsed?.html.replace(/\s+/g, ' ').trim()).toBe(CURRENT_DOC.replace(/\s+/g, ' ').trim())
    })

    it('REAL: shortens the document (the phrase no longer appears)', () => {
      const reply = buildMockRefineReply(args({ instruction: 'reduce the text __REFINE_REDUCE_REAL__' }))
      const parsed = parseRefineEnvelope(reply)
      expect(parsed?.classes).toEqual(['remove'])
      expect(parsed?.html).not.toContain(parsed?.supersedes[0])
      expect(parsed?.html.length).toBeLessThan(CURRENT_DOC.length)
    })

    it('NOOP + __REFINE_FIX_ON_RETRY__: broken on attempt 1, fixed on attempt 2', () => {
      const noop = buildMockRefineReply(args({ instruction: 'reduce __REFINE_REDUCE_NOOP__ __REFINE_FIX_ON_RETRY__', attempt: 1 }))
      const fixed = buildMockRefineReply(args({ instruction: 'reduce __REFINE_REDUCE_NOOP__ __REFINE_FIX_ON_RETRY__', attempt: 2 }))
      expect(parseRefineEnvelope(noop)?.html.replace(/\s+/g, ' ').trim()).toBe(CURRENT_DOC.replace(/\s+/g, ' ').trim())
      expect(parseRefineEnvelope(fixed)?.html).not.toBe(parseRefineEnvelope(noop)?.html)
    })

    it('degrades deterministically when the document carries no visible text', () => {
      const empty = '<!DOCTYPE html><html><body></body></html>'
      const reply = buildMockRefineReply(args({ slimHtml: empty, instruction: 'reduce __REFINE_REDUCE_NOOP__' }))
      const parsed = parseRefineEnvelope(reply)
      expect(parsed?.supersedes).toEqual([])
    })
  })

  describe('__REFINE_IMAGE_DUP__ / __REFINE_IMAGE_REPLACE__ (AC-09)', () => {
    it('DUP: keeps the old image AND adds a new one', () => {
      const reply = buildMockRefineReply(args({ instruction: 'use the upload as the background __REFINE_IMAGE_DUP__' }))
      const parsed = parseRefineEnvelope(reply)
      expect(parsed?.classes).toEqual(['replace'])
      expect(parsed?.supersedes).toEqual(['https://minio.example.com/images/old-bg.png'])
      expect(parsed?.html).toContain('https://minio.example.com/images/old-bg.png')
      expect(parsed?.html).toContain('refine-new-image.png')
    })

    it('REPLACE: the old image is gone, the new one is present', () => {
      const reply = buildMockRefineReply(args({ instruction: 'use the upload as the background __REFINE_IMAGE_REPLACE__' }))
      const parsed = parseRefineEnvelope(reply)
      expect(parsed?.html).not.toContain('old-bg.png')
      expect(parsed?.html).toContain('refine-new-image.png')
    })

    it('DUP + __REFINE_FIX_ON_RETRY__: broken on attempt 1, fixed on attempt 2', () => {
      const instruction = 'bg __REFINE_IMAGE_DUP__ __REFINE_FIX_ON_RETRY__'
      const broken = parseRefineEnvelope(buildMockRefineReply(args({ instruction, attempt: 1 })))
      const fixed = parseRefineEnvelope(buildMockRefineReply(args({ instruction, attempt: 2 })))
      expect(broken?.html).toContain('old-bg.png')
      expect(fixed?.html).not.toContain('old-bg.png')
    })

    it('degrades deterministically (a synthetic, non-resolving ref) when the document has no image', () => {
      const noImage = '<!DOCTYPE html><html><body>No images here</body></html>'
      const reply = buildMockRefineReply(args({ slimHtml: noImage, instruction: 'bg __REFINE_IMAGE_REPLACE__' }))
      const parsed = parseRefineEnvelope(reply)
      expect(parsed?.supersedes[0]).not.toBe('')
      expect(noImage).not.toContain(parsed!.supersedes[0])
    })
  })

  // Final F1 / C-1: the REPORTED duplicate shape — the design's own inset image
  // applied as the background AND kept as the inset, supersedes naming the old
  // background (which is gone).
  describe('__REFINE_IMAGE_MOVE_DUP__ (AC-09, final F1 C-1)', () => {
    const OLD = 'https://minio.example.com/images/old-bg.png'
    const UP = 'https://minio.example.com/images/uploaded.png'
    const TWO_IMAGE_DOC = `<!DOCTYPE html>
<html><head><style>@import url('https://fonts.googleapis.com/css2?family=Inter');body{margin:0}</style></head>
<body><div style="background-image:url('${OLD}')"></div><img src="${UP}" alt="Uploaded photo"><p>Autumn open day</p></body>
</html>`

    it('broken: the inset image is the background AND still the inset; supersedes = the old background', () => {
      const parsed = parseRefineEnvelope(buildMockRefineReply(args({ slimHtml: TWO_IMAGE_DOC, instruction: 'bg __REFINE_IMAGE_MOVE_DUP__' })))
      expect(parsed?.classes).toEqual(['replace'])
      expect(parsed?.supersedes).toEqual([OLD])
      expect(parsed?.html).not.toContain(OLD)
      expect(parsed!.html.split(UP).length - 1).toBe(2)
    })

    it('+ __REFINE_FIX_ON_RETRY__: attempt 2 is the correct move (the inset is gone)', () => {
      const instruction = 'bg __REFINE_IMAGE_MOVE_DUP__ __REFINE_FIX_ON_RETRY__'
      const broken = parseRefineEnvelope(buildMockRefineReply(args({ slimHtml: TWO_IMAGE_DOC, instruction, attempt: 1 })))
      const fixed = parseRefineEnvelope(buildMockRefineReply(args({ slimHtml: TWO_IMAGE_DOC, instruction, attempt: 2 })))
      expect(broken!.html.split(UP).length - 1).toBe(2)
      expect(fixed!.html.split(UP).length - 1).toBe(1)
      expect(fixed?.html).not.toContain(OLD)
      expect(fixed?.supersedes).toEqual([OLD])
    })

    it('does not trigger the plain __REFINE_IMAGE_DUP__ branch', () => {
      const parsed = parseRefineEnvelope(buildMockRefineReply(args({ slimHtml: TWO_IMAGE_DOC, instruction: 'bg __REFINE_IMAGE_MOVE_DUP__' })))
      expect(parsed?.html).not.toContain('refine-new-image.png')
    })

    it('degrades to a non-resolving supersedes when the document has fewer than two images', () => {
      const parsed = parseRefineEnvelope(buildMockRefineReply(args({ instruction: 'bg __REFINE_IMAGE_MOVE_DUP__' })))
      expect(CURRENT_DOC).not.toContain(parsed!.supersedes[0])
    })
  })

  it('__REFINE_EMPTY_SUPERSEDES__: downgrades to add via effectiveClasses (AC-10)', () => {
    const reply = buildMockRefineReply(args({ instruction: 'delete something __REFINE_EMPTY_SUPERSEDES__' }))
    const parsed = parseRefineEnvelope(reply)
    expect(parsed?.classes).toEqual(['replace'])
    expect(parsed?.supersedes).toEqual([])
    const effective = effectiveClasses({ classes: parsed!.classes, supersedes: parsed!.supersedes })
    expect(effective.classes).toEqual(['add'])
    expect(effective.downgraded).toEqual(['replace'])
  })

  it('__REFINE_EMPTY_SUPERSEDES__ + __REFINE_FIX_ON_RETRY__: names a real fragment on attempt 2', () => {
    const instruction = 'delete something __REFINE_EMPTY_SUPERSEDES__ __REFINE_FIX_ON_RETRY__'
    const broken = parseRefineEnvelope(buildMockRefineReply(args({ instruction, attempt: 1 })))
    const fixed = parseRefineEnvelope(buildMockRefineReply(args({ instruction, attempt: 2 })))
    expect(broken?.supersedes).toEqual([])
    expect(fixed?.supersedes.length).toBeGreaterThan(0)
    expect(effectiveClasses({ classes: fixed!.classes, supersedes: fixed!.supersedes }).downgraded).toEqual([])
  })

  describe('__REFINE_TOKEN_RENAME__ (AC-07)', () => {
    it('renames a token present in slimHtml → reconcileInlineAssets reports mismatch', () => {
      const reply = buildMockRefineReply(args({ slimHtml: TOKEN_DOC, instruction: 'x __REFINE_TOKEN_RENAME__' }))
      const parsed = parseRefineEnvelope(reply)
      expect(parsed?.html).not.toContain('__INLINE_ASSET_0__')
      const result = reconcileInlineAssets(['__INLINE_ASSET_0__'], parsed!.html)
      expect(result.kind).toBe('mismatch')
    })

    it('+ __REFINE_FIX_ON_RETRY__: keeps the token clean on attempt 2 (reconciles)', () => {
      const instruction = 'x __REFINE_TOKEN_RENAME__ __REFINE_FIX_ON_RETRY__'
      const fixed = parseRefineEnvelope(buildMockRefineReply(args({ slimHtml: TOKEN_DOC, instruction, attempt: 2 })))
      const result = reconcileInlineAssets(['__INLINE_ASSET_0__'], fixed!.html)
      expect(result.kind).toBe('clean')
    })

    it('degrades to the default reply when slimHtml carries no token', () => {
      const reply = buildMockRefineReply(args({ instruction: 'x __REFINE_TOKEN_RENAME__', promptContext: 'ctx' }))
      expect(reply).toBe(buildMockHtml('ctx', 1080, 1080))
    })
  })

  it('__REFINE_MULTI_CLASS__: returns more than one class (AC-11)', () => {
    const reply = buildMockRefineReply(args({ instruction: 'do two things __REFINE_MULTI_CLASS__' }))
    const parsed = parseRefineEnvelope(reply)
    expect(parsed?.classes.length).toBeGreaterThan(1)
    expect(parsed?.classes).toEqual(['replace', 'add'])
  })

  describe('__REFINE_TRUNCATED__', () => {
    it('the parsed document has no closing </html>', () => {
      const reply = buildMockRefineReply(args({ instruction: 'x __REFINE_TRUNCATED__' }))
      const parsed = parseRefineEnvelope(reply)
      expect(parsed).not.toBeNull()
      expect(parsed?.html).not.toMatch(/<\/html\s*>/i)
    })

    it('+ __REFINE_FIX_ON_RETRY__: closes properly on attempt 2', () => {
      const instruction = 'x __REFINE_TRUNCATED__ __REFINE_FIX_ON_RETRY__'
      const broken = parseRefineEnvelope(buildMockRefineReply(args({ instruction, attempt: 1 })))
      const fixed = parseRefineEnvelope(buildMockRefineReply(args({ instruction, attempt: 2 })))
      expect(broken?.html).not.toMatch(/<\/html\s*>/i)
      expect(fixed?.html).toMatch(/<\/html\s*>/i)
    })
  })

  it('is deterministic: two calls with the same args produce the same output', () => {
    const a = buildMockRefineReply(args({ instruction: 'reduce the text __REFINE_REDUCE_REAL__' }))
    const b = buildMockRefineReply(args({ instruction: 'reduce the text __REFINE_REDUCE_REAL__' }))
    expect(a).toBe(b)
  })
})
