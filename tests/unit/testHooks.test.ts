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

// 012 FR-21 / AC-11 — the mock caption reply runs through the REAL extractor.
describe('buildMockCaptionReply', () => {
  const ALL = ['HEADLINE', 'INSTAGRAM', 'LINKEDIN'] as const

  it('is a raw reply (preamble, json fence, sign-off) the real extractor parses into 2 captions and a headline', async () => {
    const hooks = await loadHooks()
    const { extractCaptionReply } = await import('@/lib/captions/extract')
    const raw = hooks.buildMockCaptionReply('Launch day', ALL)
    expect(raw.startsWith('Here are your captions:')).toBe(true)
    expect(raw).toContain('```json\n')
    expect(raw.trimEnd().endsWith("Let me know if you'd like changes.")).toBe(true)

    const result = extractCaptionReply(raw, ALL)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fields).toEqual({
      HEADLINE: { ok: true, text: 'Mock headline Launch day' },
      INSTAGRAM: { ok: true, text: 'Mock Instagram caption [Launch day]' },
      LINKEDIN: { ok: true, text: 'Mock LinkedIn caption [Launch day]' },
    })
    for (const f of Object.values(result.fields)) expect(f.ok && f.text).not.toContain('**')
    // 026 AC-07: no WhatsApp key in the reply
    expect(raw).not.toMatch(/whatsapp/i)
    // The preamble and sign-off are what the extractor discards.
    expect(result.discarded).toContain('Here are your captions:')
  })

  it('carries only the requested keys', async () => {
    const hooks = await loadHooks()
    const raw = hooks.buildMockCaptionReply('t', ['LINKEDIN'])
    expect(raw).toContain('"linkedin"')
    expect(raw).not.toMatch(/"(headline|instagram|whatsapp)"/)
  })

  it('embeds the topic in every caption, so the topic sentinels still reach a caption reader', async () => {
    const hooks = await loadHooks()
    const raw = hooks.buildMockCaptionReply('launch __FAIL_ONCE__ t1', ALL)
    expect(raw.match(/__FAIL_ONCE__/g)).toHaveLength(3)
  })

  it('__DROP_CAPTION_LINKEDIN__ drops linkedin from an all-channel reply, but not from a {linkedin} reply', async () => {
    const hooks = await loadHooks()
    const { extractCaptionReply } = await import('@/lib/captions/extract')
    const topic = 'x __DROP_CAPTION_LINKEDIN__'

    const all = extractCaptionReply(hooks.buildMockCaptionReply(topic, ALL), ALL)
    expect(all.ok && all.fields.LINKEDIN).toEqual({ ok: false, reason: 'missing' })
    expect(all.ok && all.fields.INSTAGRAM?.ok).toBe(true)

    const one = extractCaptionReply(hooks.buildMockCaptionReply(topic, ['LINKEDIN']), ['LINKEDIN'])
    expect(one.ok && one.fields.LINKEDIN?.ok).toBe(true)
  })

  it('each drop sentinel drops only its own key, and only when every channel is requested', async () => {
    const hooks = await loadHooks()
    const { extractCaptionReply } = await import('@/lib/captions/extract')
    for (const target of ALL) {
      const topic = `t __DROP_CAPTION_${target}__`
      const all = extractCaptionReply(hooks.buildMockCaptionReply(topic, ALL), ALL)
      if (!all.ok) throw new Error('mock reply rejected')
      for (const other of ALL) {
        expect(all.fields[other]?.ok).toBe(other !== target)
      }
    }
    // A headline-only request keeps the headline; channels without the headline keep every channel.
    const headlineOnly = hooks.buildMockCaptionReply('t __DROP_CAPTION_HEADLINE__', ['HEADLINE'])
    expect(headlineOnly).toContain('"headline"')
    const channelsOnly = hooks.buildMockCaptionReply('t __DROP_CAPTION_HEADLINE__', ['INSTAGRAM', 'LINKEDIN'])
    expect(channelsOnly).not.toContain('"headline"')
    expect(channelsOnly).toContain('"instagram"')
  })

  it('clips the headline to 100 characters', async () => {
    const hooks = await loadHooks()
    const { extractCaptionReply } = await import('@/lib/captions/extract')
    const result = extractCaptionReply(hooks.buildMockCaptionReply('y'.repeat(200), ['HEADLINE']), ['HEADLINE'])
    expect(result.ok && result.fields.HEADLINE).toEqual({ ok: true, text: `Mock headline ${'y'.repeat(86)}` })
  })

  it('is deterministic: the same input gives byte-identical output', async () => {
    const hooks = await loadHooks()
    expect(hooks.buildMockCaptionReply('Launch "day"\nnew', ALL)).toBe(hooks.buildMockCaptionReply('Launch "day"\nnew', ALL))
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

// ── 009 FR-17: the hero check and layout seams ──────────────────────────────
describe('hero seams (mockRegionSamples, mockLayoutBoxes)', () => {
  const regions = [{ rect: { x: 0, y: 0, w: 45, h: 100 }, purpose: 'text' as const, minAreaPct: 20 }]

  it('are dormant unless MOCK_AI is exactly "true": null, and no throw on a sentinel', async () => {
    for (const env of [{}, { MOCK_AI: '1' }, { MOCK_AI: 'TRUE' }, { MOCK_AI: 'false' }] as Array<Record<string, string>>) {
      const hooks = await loadHooks(env)
      expect(hooks.mockRegionSamples('__MOCK_BG__ __MOCK_HERO_CHECK_ERROR__', regions, 'light')).toBeNull()
      expect(hooks.mockRegionSamples('__MOCK_BG__ __MOCK_HERO_BUSY__', regions, 'light')).toBeNull()
      expect(hooks.mockLayoutBoxes('__MOCK_HERO_LAYOUT__', regions)).toBeNull()
    }
  })

  it('with MOCK_AI on: calm by default, a thrown error for the check-error sentinel, one outside box for the layout sentinel', async () => {
    const hooks = await loadHooks({ MOCK_AI: 'true' })
    const calm = hooks.mockRegionSamples('x', regions, 'light')!
    expect(calm).toHaveLength(1)
    expect(calm[0].areaPct).toBe(45)
    expect(() => hooks.mockRegionSamples('__MOCK_HERO_CHECK_ERROR__', regions, 'light')).toThrow(/CHECK_ERROR/)
    expect(hooks.mockLayoutBoxes('x', regions)).toHaveLength(1)
    expect(hooks.mockLayoutBoxes('__MOCK_HERO_LAYOUT__', regions)).toHaveLength(2)
  })
})

// 027 FR-15 / AC-15 — the facts-check seams. A fact sentinel in the TOPIC adds
// one invented value to the mock reply, with no digit of its own; a topic with
// no sentinel gets today's reply byte for byte.
describe('027 fact sentinels in buildMockCaptionReply', () => {
  const ALL = ['HEADLINE', 'INSTAGRAM', 'LINKEDIN'] as const
  const FOUR: Array<[string, string]> = [
    ['__MOCK_FACT_PRICE__', '$49'],
    ['__MOCK_FACT_PCT__', '35% off'],
    ['__MOCK_FACT_DATE__', '30 March 2027'],
    ['__MOCK_FACT_NUM__', '1,250 customers'],
  ]
  const fields = async (hooks: typeof import('@/lib/testHooks'), topic: string) => {
    const { extractCaptionReply } = await import('@/lib/captions/extract')
    const result = extractCaptionReply(hooks.buildMockCaptionReply(topic, ALL), ALL)
    if (!result.ok) throw new Error('mock reply rejected')
    return Object.fromEntries(Object.entries(result.fields).map(([k, v]) => [k, v.ok ? v.text : '']))
  }

  it('a topic with no sentinel is byte-identical to the reply of before 027', async () => {
    const hooks = await loadHooks()
    const topic = 'Launch day'
    const old = JSON.stringify(
      {
        headline: `Mock headline ${topic}`.slice(0, 100),
        instagram: `Mock Instagram caption [${topic}]`,
        linkedin: `Mock LinkedIn caption [${topic}]`,
      },
      null,
      2,
    )
    expect(hooks.buildMockCaptionReply(topic, ALL)).toBe(
      ['Here are your captions:', '', '```json', old, '```', '', "Let me know if you'd like changes."].join('\n'),
    )
  })

  it.each(FOUR)('%s adds exactly its value to the headline and to every caption, and no other digit', async (sentinel, value) => {
    const hooks = await loadHooks()
    const got = await fields(hooks, `Launch ${sentinel}`)
    for (const text of Object.values(got)) {
      expect(text).toContain(value)
      expect(text.split(value)).toHaveLength(2)
      expect(text.replace(value, '')).not.toMatch(/\d/)
    }
  })

  it('the sentinels hold no digit themselves', () => {
    for (const [sentinel] of [...FOUR, ['__MOCK_FACT_HEADLINE__'], ['__MOCK_FACT_ERROR__']]) {
      expect(sentinel).not.toMatch(/\d/)
    }
  })

  it('__MOCK_FACT_HEADLINE__ puts $49 in the headline only', async () => {
    const hooks = await loadHooks()
    const got = await fields(hooks, 'Launch __MOCK_FACT_HEADLINE__')
    expect(got.HEADLINE).toContain('$49')
    expect(got.INSTAGRAM).not.toMatch(/\d/)
    expect(got.LINKEDIN).not.toMatch(/\d/)
  })

  it('a long topic never hides the value: it is appended after the cut and the headline stays within 100 characters', async () => {
    const hooks = await loadHooks()
    const got = await fields(hooks, `${'y'.repeat(200)} __MOCK_FACT_PRICE__`)
    expect(got.HEADLINE.endsWith(' $49')).toBe(true)
    expect(Array.from(got.HEADLINE).length).toBeLessThanOrEqual(100)
  })

  it('two sentinels add both values', async () => {
    const hooks = await loadHooks()
    const got = await fields(hooks, 'x __MOCK_FACT_PRICE__ __MOCK_FACT_PCT__')
    expect(got.INSTAGRAM).toContain('$49')
    expect(got.INSTAGRAM).toContain('35% off')
  })

  it('shouldMockFactError needs both MOCK_AI and the sentinel', async () => {
    const on = await loadHooks({ MOCK_AI: 'true' })
    expect(on.shouldMockFactError('x __MOCK_FACT_ERROR__')).toBe(true)
    expect(on.shouldMockFactError('x')).toBe(false)
    const off = await loadHooks()
    expect(off.shouldMockFactError('x __MOCK_FACT_ERROR__')).toBe(false)
  })
})
