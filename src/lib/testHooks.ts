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

/**
 * Decide whether a mocked DESIGN generation should throw. Consulted only inside
 * the MOCK_AI branches of the design agents, so it is inert in production. A
 * "__FAIL_GEN_ALWAYS__" sentinel in the brief topic (which flows into the
 * prompt) drives deterministic generation failure — the scheduled-generation
 * retry/FAILED path's E2E counterpart to shouldMockPublishFail.
 */
export function shouldMockGenerateFail(promptContext: string): boolean {
  return promptContext.includes('__FAIL_GEN_ALWAYS__')
}

/**
 * Deterministic briefing-assistant chat reply (MOCK_AI). Echoes the last user
 * message and always carries a ```briefing block so tests can assert the
 * draft-extraction path end-to-end.
 */
export function buildMockBriefingReply(lastUserMessage: string): string {
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
