/**
 * Test-only deterministic seams for the E2E suite (see docs/e2e-test-plan.md §3).
 *
 * Each hook is active ONLY when its matching MOCK_* env var is set to "true".
 * When unset (the production default) these helpers are never consulted and the
 * real code paths run unchanged. NEVER set these vars in production.
 *
 *   MOCK_AI         — stub copy provider + design agent (no Anthropic/OpenAI calls)
 *   MOCK_PUPPETEER  — skip Chromium, return a fixed PNG
 *   MOCK_SOCIAL     — skip the Instagram/LinkedIn HTTP calls, return a fake platformId
 *   MOCK_SOCIAL_FAIL — make the mock publishers throw (for FAILED/retry coverage)
 */

export const MOCK_AI = process.env.MOCK_AI === 'true'
export const MOCK_PUPPETEER = process.env.MOCK_PUPPETEER === 'true'
export const MOCK_SOCIAL = process.env.MOCK_SOCIAL === 'true'
export const MOCK_SOCIAL_FAIL = process.env.MOCK_SOCIAL_FAIL === 'true'

/** Deterministic copy text returned by the mock copy provider. */
export const MOCK_COPY_TEXT =
  'Mock copy text for E2E tests — deterministic output from the MOCK_AI seam.'

/**
 * Mock copy that embeds the brief topic. The topic flows into the caption the
 * publishers receive (Draft.copyText), so a test can steer the mock publishers'
 * success/failure per-post by placing a sentinel in the brief topic (see
 * shouldMockPublishFail). Without a sentinel the behaviour is unchanged.
 */
export function buildMockCopy(topic: string): string {
  return `${MOCK_COPY_TEXT} [${topic}]`
}

// Per-caption record so a __FAIL_ONCE__ post fails the first publish attempt and
// succeeds on retry — module-level state lives for the life of the serve process.
const mockFailedOnce = new Set<string>()

/**
 * Decide whether a mocked publish should throw. Active only when MOCK_SOCIAL is
 * set (the publishers gate on that). Precedence:
 *   - MOCK_SOCIAL_FAIL (global env)      → always fail (legacy behaviour, kept)
 *   - caption contains "__FAIL_ALWAYS__" → always fail (deterministic FAILED)
 *   - caption contains "__FAIL_ONCE__"   → fail first attempt, succeed after
 *   - otherwise                          → succeed
 * The caption must be unique per post (use a unique brief topic) for __FAIL_ONCE__.
 */
export function shouldMockPublishFail(caption: string): boolean {
  if (MOCK_SOCIAL_FAIL) return true
  if (caption.includes('__FAIL_ALWAYS__')) return true
  if (caption.includes('__FAIL_ONCE__')) {
    if (mockFailedOnce.has(caption)) return false
    mockFailedOnce.add(caption)
    return true
  }
  return false
}

// Per-prompt record so a __FAIL_GEN_ONCE__ generation fails its first attempt
// and succeeds on retry — module-level state for the life of the serve process.
const mockGenFailedOnce = new Set<string>()

/**
 * Decide whether a mocked DESIGN generation should throw. Consulted only inside
 * the MOCK_AI branches of the design agents, so it is inert in production.
 * Sentinels in the brief topic (which flows into the prompt):
 *   - "__FAIL_GEN_ALWAYS__" → always fail (deterministic FAILED)
 *   - "__FAIL_GEN_ONCE__"   → fail first attempt, succeed on retry (F1 retry path)
 * The topic must be unique per draft for __FAIL_GEN_ONCE__ to isolate its state.
 * The scheduled-generation + async-generation retry/FAILED counterpart to
 * shouldMockPublishFail.
 */
export function shouldMockGenerateFail(promptContext: string): boolean {
  if (promptContext.includes('__FAIL_GEN_ALWAYS__')) return true
  if (promptContext.includes('__FAIL_GEN_ONCE__')) {
    if (mockGenFailedOnce.has(promptContext)) return false
    mockGenFailedOnce.add(promptContext)
    return true
  }
  return false
}

/**
 * Deterministic briefing-assistant chat reply (MOCK_AI). Echoes the last user
 * message and always carries a ```briefing block so tests can assert the
 * draft-extraction path end-to-end. When the user message asks to SCHEDULE a
 * series of posts (contains "schedule" or "scheme"), it instead emits a
 * ```schedule block with a small deterministic plan so F4's auto-scheduling
 * path can be asserted end-to-end.
 */
export function buildMockBriefingReply(lastUserMessage: string): string {
  const wantsSchedule = /schedul|scheme/i.test(lastUserMessage)
  if (wantsSchedule) {
    const plan = {
      posts: [
        { topic: 'Mock scheduled post 1', goal: 'awareness', tone: 'professional', daysFromNow: 1, postAction: 'HOLD' },
        { topic: 'Mock scheduled post 2', goal: 'engagement', tone: 'casual', daysFromNow: 3, postAction: 'HOLD' },
      ],
    }
    return [
      `Mock scheduling reply for E2E tests. [${lastUserMessage}]`,
      '',
      '```schedule',
      JSON.stringify(plan, null, 2),
      '```',
    ].join('\n')
  }
  return [
    `Mock briefing assistant reply for E2E tests. [${lastUserMessage}]`,
    '',
    '```briefing',
    `Mock campaign briefing draft based on: ${lastUserMessage}`,
    '```',
  ].join('\n')
}

/** Deterministic "Enhance with AI" briefing rewrite (MOCK_AI). */
export function buildMockBriefingEnhance(content: string): string {
  return `Enhanced: ${content || 'Mock briefing drafted from campaign context.'}`
}

/**
 * Deterministic brand-kit extraction reply (MOCK_AI, F5). Carries a ```brandkit
 * JSON block (voice/tone/style/fonts) so the extraction + apply path can be
 * asserted end-to-end without a live vision call. Colors are injected separately
 * from the (also-mocked) color sampler.
 */
export function buildMockBrandKitReply(lastUserMessage: string): string {
  const suggestion = {
    voice: `Mock brand voice extracted from references. [${lastUserMessage}]`,
    tone: 'confident, modern',
    style: 'Clean, high-contrast, generous whitespace.',
    fonts: ['Inter', 'Playfair Display'],
  }
  return [
    'Mock brand-kit assistant reply for E2E tests.',
    '',
    '```brandkit',
    JSON.stringify(suggestion, null, 2),
    '```',
  ].join('\n')
}

/** Deterministic image→template HTML (MOCK_AI, F6). Slot-based Path A template. */
export function buildMockTemplateHtml(width = 1080, height = 1080): string {
  return `<!DOCTYPE html>
<html><head><style>
body { margin:0; width:${width}px; height:${height}px; background:#0284c7; color:#fff; font-family:Inter,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; }
.logo { width:120px; height:120px; }
h1 { font-size:64px; margin:0; }
p { font-size:32px; margin:0; }
</style></head>
<body data-mock-template="true">
  <img class="logo" src="{{logoUrl}}" alt="logo"/>
  <h1>{{headline}}</h1>
  <p>{{body}}</p>
</body></html>`
}

/**
 * Deterministic Claude-token save-time validation (MOCK_AI). The real path
 * spawns a `claude -p` ping with the candidate token, which the E2E env can't
 * do (claude-html mode, no CLI). A token containing "invalid" fails; anything
 * else passes — so tests can drive both the 200 and 422 branches of
 * PUT /api/me/claude-token.
 */
export function mockClaudeTokenValidation(token: string): { ok: boolean; error?: string } {
  if (token.includes('invalid')) {
    return { ok: false, error: 'Token was rejected by Claude (mock validation)' }
  }
  return { ok: true }
}

/** Deterministic 1×1 transparent PNG returned by the mock Puppeteer renderer. */
export const MOCK_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

/**
 * Build deterministic mock design HTML. Echoes the first brand hex colour found
 * in the prompt context so tests can assert the brand kit actually flowed through
 * to the design agent (the colour reaches the agent via the brand-kit system
 * context). Falls back to a neutral colour when none is present.
 */
export function buildMockHtml(promptContext: string, width = 1080, height = 1080): string {
  const hex = promptContext.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#0f172a'
  return `<!DOCTYPE html>
<html>
<head><style>
body { margin: 0; width: ${width}px; height: ${height}px; background: ${hex}; display: flex; align-items: center; justify-content: center; }
.card { color: #ffffff; font-family: Inter, sans-serif; font-size: 48px; text-align: center; padding: 40px; }
</style></head>
<body><div class="card" data-mock="true">MOCK DESIGN</div></body>
</html>`
}

/**
 * The conflict marker the refine route's parseConflict() expects: a bare JSON
 * object emitted as the agent's text output. The MOCK_AI design agent returns
 * this when the instruction contains the literal "conflict_test", so the AGUI
 * conflict-card flow can be exercised deterministically.
 */
export function buildMockConflict(): string {
  return JSON.stringify({
    conflict: true,
    explanation: 'Mock conflict: the requested change introduces off-brand colours.',
    pendingHtml:
      '<!DOCTYPE html><html><body data-mock-override="true" style="margin:0;width:1080px;height:1080px;background:#ff00ff">OVERRIDDEN MOCK DESIGN</body></html>',
  })
}
