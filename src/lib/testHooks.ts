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

import { createHash } from 'node:crypto'
import type { Channel } from '@prisma/client'
import type { ConstrainTarget, InstructionClass } from '@/lib/agent/instructionClasses'
// Type-only — erased at compile time (tsconfig isolatedModules), so this does
// not create a runtime import cycle with refineVerify.ts, which imports this
// module for MOCK_AI + the two seams below.
import type { VerifyResult } from '@/lib/drafts/refineVerify'
import type { ImageProvider } from '@/providers/interfaces/ImageProvider'
// Type-only (erased): the module stays free of a runtime import of designData.
import type { CanvasPx, LuminanceGrid, Rect, Region, RegionSample, TextTone } from '@/lib/designData'
// layout.ts is pure (type-only imports), so this does not pull the dataset in.
import { LAYOUT_TOLERANCE_PCT } from '@/lib/designData/layout'
import { MOCK_HEADLINE_HIDDEN } from '@/lib/renderedText/mockCheck'
import { GRID_STEP_PX } from '@/lib/designData/composite'
import { CAPTION_CHANNELS, type CaptionTarget } from '@/lib/channels'
import { HEADLINE_MAX } from '@/lib/captions/headline'

export const MOCK_AI = process.env.MOCK_AI === 'true'
export const MOCK_PUPPETEER = process.env.MOCK_PUPPETEER === 'true'
export const MOCK_SOCIAL = process.env.MOCK_SOCIAL === 'true'
export const MOCK_SOCIAL_FAIL = process.env.MOCK_SOCIAL_FAIL === 'true'

// ── 012 FR-21: the mock caption reply seam ──────────────────────────────────

const DROP_CAPTION_SENTINELS: Partial<Record<CaptionTarget, string>> = {
  HEADLINE: '__DROP_CAPTION_HEADLINE__',
  INSTAGRAM: '__DROP_CAPTION_INSTAGRAM__',
  LINKEDIN: '__DROP_CAPTION_LINKEDIN__',
}

// ── 027 FR-15: the facts-check seams ────────────────────────────────────────
// Sentinels in the TOPIC add one invented value to the mock reply. No sentinel
// holds a digit, so a sentinel never becomes a supported value of its own. The
// values are constants. A topic with no sentinel gets today's reply, byte for
// byte.
const FACT_VALUE_SENTINELS: ReadonlyArray<readonly [sentinel: string, value: string]> = [
  ['__MOCK_FACT_PRICE__', '$49'],
  ['__MOCK_FACT_PCT__', '35% off'],
  ['__MOCK_FACT_DATE__', '30 March 2027'],
  ['__MOCK_FACT_NUM__', '1,250 customers'],
]
const FACT_HEADLINE_SENTINEL = '__MOCK_FACT_HEADLINE__'
const FACT_HEADLINE_VALUE = '$49'
const FACT_ERROR_SENTINEL = '__MOCK_FACT_ERROR__'

/**
 * Whether the facts check must fail for this topic (MOCK_AI only): the check's
 * own wrapper then stores `status: 'error'`, and the generation or action goes
 * on. Consulted by the code that runs the check, never by the pure extractor.
 */
export function shouldMockFactError(topic: string): boolean {
  return MOCK_AI && topic.includes(FACT_ERROR_SENTINEL)
}

/**
 * Deterministic RAW caption reply returned by the mock copy provider (MOCK_AI):
 * a chat preamble, a ```json-fenced object holding only the requested keys,
 * and a sign-off — the shape a real model drifts into — so the REAL extractor
 * (extractCaptionReply) parses every mock reply.
 *
 * Each caption embeds the brief topic, so the existing topic sentinels still
 * reach whatever reads a caption (__FAIL_ALWAYS__ / __FAIL_ONCE__ for the
 * publishers).
 *
 * A "__DROP_CAPTION_<TARGET>__" sentinel in the topic omits that key, ONLY in
 * a reply that requests every channel (a generation or "Regenerate all"). So
 * a single-channel regenerate of the dropped channel succeeds, with no stored
 * state. Deterministic: same input, same bytes.
 *
 * 027: a fact sentinel in the topic (__MOCK_FACT_PRICE__ and the other three)
 * appends its invented value to the headline and to every caption;
 * __MOCK_FACT_HEADLINE__ appends one to the headline only.
 */
export function buildMockCaptionReply(topic: string, targets: readonly CaptionTarget[]): string {
  const allChannels = CAPTION_CHANNELS.every((s) => targets.includes(s.channel))
  const dropped = (target: CaptionTarget) => {
    const sentinel = DROP_CAPTION_SENTINELS[target]
    return allChannels && sentinel !== undefined && topic.includes(sentinel)
  }

  const values = FACT_VALUE_SENTINELS.filter(([sentinel]) => topic.includes(sentinel)).map(([, value]) => value)
  const headlineValues = topic.includes(FACT_HEADLINE_SENTINEL) ? [...values, FACT_HEADLINE_VALUE] : values
  const withValues = (text: string, add: string[]) => (add.length > 0 ? `${text} ${add.join(' ')}` : text)

  const reply: Record<string, string> = {}
  if (targets.includes('HEADLINE') && !dropped('HEADLINE')) {
    // The values are appended after the cut, so a long topic never hides one;
    // the cut leaves room for them inside HEADLINE_MAX.
    const tail = headlineValues.length > 0 ? ` ${headlineValues.join(' ')}` : ''
    reply.headline = `Mock headline ${topic}`.slice(0, HEADLINE_MAX - tail.length) + tail
  }
  for (const s of CAPTION_CHANNELS) {
    if (!targets.includes(s.channel) || dropped(s.channel)) continue
    reply[s.jsonKey] = withValues(`Mock ${s.label} caption [${topic}]`, values)
  }

  return [
    'Here are your captions:',
    '',
    '```json',
    JSON.stringify(reply, null, 2),
    '```',
    '',
    "Let me know if you'd like changes.",
  ].join('\n')
}

// Per-caption record so a __FAIL_ONCE__ post fails the first publish attempt and
// succeeds on retry — state lives for the life of the serve process. Backed by
// globalThis (not a plain module-scope `const`): Next.js/Turbopack can give
// different API route bundles their own instance of this module in dev mode
// (each route is compiled somewhat independently), which would silently
// split this Set across the "first attempt" route and the "retry" route and
// break the once-then-succeed contract (observed: retry.test flakiness where
// __FAIL_ONCE__ failed on both the first attempt AND the retry). A
// globalThis-backed singleton survives that split.
const mockFailedOnce: Set<string> = ((globalThis as Record<string, unknown>).__mockFailedOnce ??=
  new Set<string>()) as Set<string>

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
 * The mock publishers' platformId (012 FR-21): `mock-<channel>-<Date.now()>-`
 * then the first 12 hex of sha256(caption), so an E2E can prove which text a
 * channel received. The `mock-<channel>-<timestamp>` prefix is unchanged.
 */
export function mockPlatformId(channel: Channel, caption: string): string {
  const hash = createHash('sha256').update(caption).digest('hex').slice(0, 12)
  return `mock-${channel.toLowerCase()}-${Date.now()}-${hash}`
}

// Per-prompt record so a __FAIL_GEN_ONCE__ generation fails its first attempt
// and succeeds on retry — state for the life of the serve process. Same
// globalThis-backed pattern as mockFailedOnce above, for the same reason: the
// initial generation (assemble-a/b's route) and the retry (drafts/[id]/retry's
// route) are different Next.js route files, which can end up as separate
// Turbopack dev-mode module instances of this file.
const mockGenFailedOnce: Set<string> = ((globalThis as Record<string, unknown>).__mockGenFailedOnce ??=
  new Set<string>()) as Set<string>

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
        { topic: 'Mock scheduled post 1', postStyle: 'launch', tone: 'professional', daysFromNow: 1, postAction: 'HOLD' },
        { topic: 'Mock scheduled post 2', postStyle: 'flash-sale', tone: 'casual', daysFromNow: 3, postAction: 'HOLD' },
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
export const MOCK_BRANDKIT_UNKNOWN_FONT = '__MOCK_FONT_UNKNOWN__'

export function buildMockBrandKitReply(lastUserMessage: string): string {
  const suggestion = {
    voice: `Mock brand voice extracted from references. [${lastUserMessage}]`,
    tone: 'confident, modern',
    style: 'Clean, high-contrast, generous whitespace.',
    // 031 FR-33: catalogue families plus a Sinhala script font. The sentinel in the user's
    // message swaps the body for a name that is not in the font list (the panel keeps exact
    // catalogue matches only).
    fonts: {
      heading: 'Playfair Display',
      body: lastUserMessage.includes(MOCK_BRANDKIT_UNKNOWN_FONT) ? 'Zzyzx Mock Sans' : 'Inter',
    },
    scriptFonts: { sinhala: 'Noto Sans Sinhala' },
  }
  return [
    'Mock brand-kit assistant reply for E2E tests.',
    '',
    '```brandkit',
    JSON.stringify(suggestion, null, 2),
    '```',
  ].join('\n')
}

// 007 FR-11: the kit-upgrade seam. Sentinels in the posted text select the
// outcome; each is reachable with no real model. Dormant in production like
// the neighbours (the route only reaches this under MOCK_AI).
export const MOCK_UPGRADE_UNPARSEABLE = '__MOCK_UPGRADE_UNPARSEABLE__'
export const MOCK_UPGRADE_NONE = '__MOCK_UPGRADE_NONE__'
export const MOCK_UPGRADE_BAD = '__MOCK_UPGRADE_BAD__'
export const MOCK_UPGRADE_OUTOFRANGE = '__MOCK_UPGRADE_OUTOFRANGE__'
export const MOCK_IMPROVE_DROP_RULES = '__MOCK_IMPROVE_DROP_RULES__'

export function buildMockKitUpgradeReply(
  candidates: ReadonlyArray<{ id: string; mockReplacement: string }>,
  text: string,
): string {
  const block = (proposals: unknown[]) =>
    [
      'Mock kit-upgrade reply for E2E tests.',
      '',
      '```kitedits',
      JSON.stringify(proposals, null, 2),
      '```',
    ].join('\n')

  if (text.includes(MOCK_UPGRADE_UNPARSEABLE)) {
    return 'Mock kit-upgrade reply with no edits block: I would rather describe the changes in prose.'
  }
  if (text.includes(MOCK_UPGRADE_NONE)) return block([])
  if (text.includes(MOCK_UPGRADE_BAD)) {
    const [first, second, third] = candidates
    const proposals: unknown[] = []
    if (first) proposals.push({ candidateId: first.id, replacement: first.mockReplacement })
    if (second) {
      proposals.push({ candidateId: second.id, replacement: 'Leave it nicely roomy and balanced.' })
    }
    if (third) {
      proposals.push({
        candidateId: third.id,
        replacement: 'Use #ff0000 for 40 percent of the canvas.',
      })
    }
    proposals.push({
      candidateId: 'no-such-candidate:0',
      replacement: 'clear space of 1 to 2 wordmark letters on every side',
    })
    return block(proposals)
  }
  if (text.includes(MOCK_UPGRADE_OUTOFRANGE)) {
    return block(
      candidates.slice(0, 1).map((c) => ({
        candidateId: c.id,
        // Every number far outside any entry's range; still measurable.
        replacement: c.mockReplacement.replace(/\d+(?:\.\d+)?/g, '997'),
      })),
    )
  }
  return block(candidates.map((c) => ({ candidateId: c.id, replacement: c.mockReplacement })))
}

/**
 * Deterministic image→template HTML (MOCK_AI, F6). A self-contained Path A
 * template with SAMPLE content in each slot (headline / body / photo) that the
 * fill agent replaces at generation time — Path A templates use sample text,
 * not mustache tokens (see prompts/pathA.ts).
 */
export function buildMockTemplateHtml(width = 1080, height = 1080): string {
  return `<!DOCTYPE html>
<html><head><style>
body { margin:0; width:${width}px; height:${height}px; background:#0284c7; color:#fff; font-family:Inter,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; padding:80px; box-sizing:border-box; text-align:center; }
.photo { width:280px; height:280px; border-radius:24px; background:rgba(255,255,255,0.15); }
h1 { font-size:64px; margin:0; }
p { font-size:32px; margin:0; opacity:0.9; }
</style></head>
<body data-mock-template="true">
  <div class="photo"></div>
  <h1>Your headline here</h1>
  <p>Supporting body copy goes here.</p>
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

/**
 * Deterministic provider API-key validation (MOCK_AI). The real path calls the
 * provider's live models endpoint with the candidate key, so an E2E run with a
 * fake key could never create a usable row. A key containing "invalid" fails;
 * anything else passes — so tests can drive both the 201 and 422 branches of
 * POST /api/admin/providers (005 NFR-06).
 */
export function mockProviderKeyValidation(apiKey: string): { ok: boolean; error?: string } {
  if (apiKey.includes('invalid')) {
    return { ok: false, error: 'Provider rejected the key (mock validation)' }
  }
  return { ok: true }
}

// ── 005 NFR-06: the background mock seam ─────────────────────────────────────

/**
 * Whether the background step (agent/background.ts) runs its MOCK_AI seam for
 * this brief topic (or refine instruction, see backgroundSeamText). True only
 * with MOCK_AI on and one of the sentinels "__MOCK_BG__", "__MOCK_BG_FAIL__"
 * "__MOCK_BG_PERSONAL_FAIL__" (031: only the personal-key provider throws)
 * or "__MOCK_BG_NOT_NEEDED__" in that text.
 * Without one, MOCK_AI keeps the step's early return (no background, nothing
 * recorded), so every suite written before the seam is unchanged.
 */
const MOCK_BG_SENTINEL = /__MOCK_BG(?:_FAIL|_PERSONAL_FAIL|_NOT_NEEDED)?__/

export function shouldMockBackground(topic: string): boolean {
  return MOCK_AI && MOCK_BG_SENTINEL.test(topic)
}

/**
 * Which text a refine's seam reads: the instruction when it carries a
 * sentinel (so one refine can fail on a draft whose generation produced a
 * background), else the brief topic. Only picks a string — whether the seam
 * runs at all is still shouldMockBackground, gated on MOCK_AI, so a sentinel
 * typed into a real refine instruction changes nothing outside the mock suite.
 */
export function backgroundSeamText(instruction: string, topic: string): string {
  return MOCK_BG_SENTINEL.test(instruction) ? instruction : topic
}

/**
 * The seam's stand-in for the Haiku decision: needed, with a fixed prompt —
 * or not needed for "__MOCK_BG_NOT_NEEDED__".
 */
export function mockBackgroundDecision(topic: string): { needed: boolean; prompt: string } {
  return topic.includes('__MOCK_BG_NOT_NEEDED__')
    ? { needed: false, prompt: '' }
    : { needed: true, prompt: 'Mock background: soft abstract gradient (E2E seam)' }
}

/** A valid 1×1 PNG as a data URL — the shape real providers return, so persistDataUrlImage stores it unchanged. */
export const MOCK_BACKGROUND_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

/**
 * Wrap the provider the REAL resolver returned so only its generateImage is
 * replaced: the fixture PNG, or a throw for "__MOCK_BG_FAIL__". Everything
 * else (the resolved row, its providerName) is the real provider's, via the
 * prototype, so the resolver is what's under test, not a stand-in.
 */
export function mockImageProvider(
  provider: ImageProvider,
  topic: string,
  tier: 'personal' | 'team' = 'team',
): ImageProvider {
  const mocked = Object.create(provider) as ImageProvider
  mocked.generateImage = async () => {
    if (topic.includes('__MOCK_BG_FAIL__')) {
      throw new Error('Mock image provider failure (__MOCK_BG_FAIL__ sentinel)')
    }
    // 031 FR-13: only the personal tier fails, so the fallback to the team's
    // provider can be exercised. The team provider succeeds.
    if (tier === 'personal' && topic.includes('__MOCK_BG_PERSONAL_FAIL__')) {
      throw new Error('Mock personal image key failure (__MOCK_BG_PERSONAL_FAIL__ sentinel)')
    }
    return { url: MOCK_BACKGROUND_DATA_URL }
  }
  return mocked
}

// ── 009 FR-17: the hero check and layout seams ───────────────────────────────
//
// Read from the same seam text as the __MOCK_BG__ family (a hero case carries
// __MOCK_BG__ plus one of these). Each seam returns DATA that the caller feeds
// to the REAL evaluateRegions / evaluateLayout, so the E2E exercises the pure
// logic and its verdict, never a stub of it. All dormant outside MOCK_AI: they
// return null, and the caller runs the real sampler / measurement.

export const HERO_MOCK_SENTINELS = {
  busy: '__MOCK_HERO_BUSY__',
  contrast: '__MOCK_HERO_CONTRAST__',
  checkError: '__MOCK_HERO_CHECK_ERROR__',
  layout: '__MOCK_HERO_LAYOUT__',
  // 025: the screen's seed patch is textured, so the screen detector says
  // composite-not-blank; text regions stay calm.
  screen: '__MOCK_HERO_SCREEN__',
  // 025 A1: the flat screen sits off the contract region (inside the search
  // margin), so the detected rect differs from the region.
  screenOffset: '__MOCK_HERO_SCREEN_OFFSET__',
} as const

const HERO_SAMPLE_COUNT = 256
const samplesOf = (region: Region, lum: (i: number) => number): RegionSample => ({
  luminance: Array.from({ length: HERO_SAMPLE_COUNT }, (_, i) => lum(i)),
  // Rect units are canvas percent, so the area share is w * h / 100.
  areaPct: (region.rect.w * region.rect.h) / 100,
})

/**
 * Synthetic luminance samples for a hero image's regions: calm by default (a
 * dark area for light text, a light one for dark text), alternating dark and
 * light for __MOCK_HERO_BUSY__ (high lightness variance), flat and on the wrong
 * side of the text colour for __MOCK_HERO_CONTRAST__, and a thrown error for
 * __MOCK_HERO_CHECK_ERROR__ (the caller settles any throw to check-error).
 * A composite region has no samples of its own to judge here: the screen
 * detector reads it through mockScreenGrid (025 A1). null when MOCK_AI is off.
 */
export function mockRegionSamples(
  seamText: string,
  regions: ReadonlyArray<Region>,
  textTone: TextTone,
): RegionSample[] | null {
  if (!MOCK_AI) return null
  if (seamText.includes(HERO_MOCK_SENTINELS.checkError)) {
    throw new Error(`Mock hero check failure (${HERO_MOCK_SENTINELS.checkError} sentinel)`)
  }
  if (seamText.includes(HERO_MOCK_SENTINELS.busy)) {
    return regions.map((r) => samplesOf(r, (i) => (i % 2 === 0 ? 0.02 : 0.6)))
  }
  if (seamText.includes(HERO_MOCK_SENTINELS.contrast)) {
    const flat = textTone === 'light' ? 0.4 : 0.05
    return regions.map((r) => samplesOf(r, () => flat))
  }
  const calm = textTone === 'light' ? 0.02 : 0.8
  return regions.map((r) => samplesOf(r, (i) => calm + (i % 2 === 0 ? 0.001 : -0.001)))
}

// ── 025 A1: the synthetic screen grid ────────────────────────────────────────
// L*/100 of an evenly lit screen and of the dark surround around it.
const MOCK_SCREEN_L = 0.86
const MOCK_SURROUND_L = 0.1
// How far __MOCK_HERO_SCREEN_OFFSET__ moves the screen, in percent of the canvas.
const MOCK_SCREEN_OFFSET = { dx: 3, dy: 2 }

/**
 * A grid over `window` (canvas percent) with a flat screen exactly on `region`
 * and a dark surround, in the sampler's shape: one point per GRID_STEP_PX canvas
 * px, the first point at the centre of the first step. `textured` makes the
 * seed patch (the centre 5% by 5% of the canvas) alternate dark and light;
 * `offset` moves the screen by MOCK_SCREEN_OFFSET.
 */
export function syntheticScreenGrid(
  window: Rect,
  region: Region,
  canvas: CanvasPx,
  opts: { textured?: boolean; offset?: boolean } = {},
): LuminanceGrid {
  const W = canvas.width
  const H = canvas.height
  const step = GRID_STEP_PX
  const wx = (window.x * W) / 100
  const wy = (window.y * H) / 100
  const cols = Math.max(1, Math.floor(((window.w * W) / 100) / step))
  const rows = Math.max(1, Math.floor(((window.h * H) / 100) / step))
  const shift = opts.offset ? MOCK_SCREEN_OFFSET : { dx: 0, dy: 0 }
  const left = ((region.rect.x + shift.dx) * W) / 100
  const top = ((region.rect.y + shift.dy) * H) / 100
  const right = left + (region.rect.w * W) / 100
  const bottom = top + (region.rect.h * H) / 100
  const cx = left + (right - left) / 2
  const cy = top + (bottom - top) / 2
  const halfX = (5 * W) / 200
  const halfY = (5 * H) / 200
  const x0 = wx + step / 2
  const y0 = wy + step / 2
  const values = new Float64Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = x0 + c * step
      const py = y0 + r * step
      let v = px >= left && px <= right && py >= top && py <= bottom ? MOCK_SCREEN_L : MOCK_SURROUND_L
      if (opts.textured && Math.abs(px - cx) <= halfX && Math.abs(py - cy) <= halfY) {
        v = (r + c) % 2 === 0 ? 0.5 : MOCK_SCREEN_L
      }
      values[r * cols + c] = v
    }
  }
  return { cols, rows, x0, y0, step, values }
}

/**
 * The screen grid for a hero image under the mock seam (025 A1): flat and on
 * the region by default, a textured seed for __MOCK_HERO_SCREEN__, the screen
 * moved inside the margin for __MOCK_HERO_SCREEN_OFFSET__. null when MOCK_AI is off.
 */
export function mockScreenGrid(
  seamText: string,
  window: Rect,
  region: Region,
  canvas: CanvasPx,
): LuminanceGrid | null {
  if (!MOCK_AI) return null
  return syntheticScreenGrid(window, region, canvas, {
    textured: seamText.includes(HERO_MOCK_SENTINELS.screen),
    offset: seamText.includes(HERO_MOCK_SENTINELS.screenOffset),
  })
}

// First cell of a fixed 6 x 6 grid (2% start, 8% step, left to right, top to
// bottom) that lies outside every text region plus the layout tolerance.
function mockOutsideBox(textRegions: ReadonlyArray<Region>): Rect {
  const tol = LAYOUT_TOLERANCE_PCT
  const outside = (b: Rect, r: Rect) =>
    b.x + b.w < r.x - tol || b.x > r.x + r.w + tol || b.y + b.h < r.y - tol || b.y > r.y + r.h + tol
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const c: Rect = { x: 2 + col * 8, y: 2 + row * 8, w: 6, h: 6 }
      if (textRegions.every((r) => outside(c, r.rect))) return c
    }
  }
  return { x: 92, y: 92, w: 6, h: 6 }
}

/**
 * Synthetic canvas-percent boxes for the layout observation (MOCK_PUPPETEER
 * measures nothing): one box inside the first text region, plus one in the
 * bottom-right corner for __MOCK_HERO_LAYOUT__, the first grid cell outside every text
 * region of the contract. null when MOCK_AI is off.
 */
export function mockLayoutBoxes(seamText: string, textRegions: ReadonlyArray<Region>): Rect[] | null {
  if (!MOCK_AI) return null
  const first = textRegions[0]?.rect
  const boxes: Rect[] = first
    ? [{ x: first.x + first.w * 0.1, y: first.y + first.h * 0.1, w: first.w * 0.5, h: Math.min(10, first.h * 0.2) }]
    : []
  if (seamText.includes(HERO_MOCK_SENTINELS.layout)) boxes.push(mockOutsideBox(textRegions))
  return boxes
}

const escapeMockHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// ── 025 FR-14: the composite render failure seam ─────────────────────────────
export const COMPOSITE_MOCK_SENTINEL = '__MOCK_COMPOSITE_FAIL__'

/**
 * True when MOCK_AI is on and the design HTML carries the sentinel (the mock
 * design HTML copies it from the brief topic into a comment). The renderer
 * then fails the composite check as composite-not-rendered.
 */
export function shouldMockCompositeFail(html: string): boolean {
  return MOCK_AI && html.includes(COMPOSITE_MOCK_SENTINEL)
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
export function buildMockHtml(promptContext: string, width = 1080, height = 1080, headline?: string): string {
  const hex = promptContext.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#0f172a'
  // 025: the composite failure sentinel rides along as a comment.
  const sentinel = promptContext.includes(COMPOSITE_MOCK_SENTINEL) ? `<!-- ${COMPOSITE_MOCK_SENTINEL} -->` : ''
  // 030: the headline the mock design "paints", and the hidden-headline sentinel
  // (the mock check reads it from the HTML, like the composite sentinel).
  const hidden = promptContext.includes(MOCK_HEADLINE_HIDDEN) ? `<!-- ${MOCK_HEADLINE_HIDDEN} -->` : ''
  const headlineEl = headline
    ? `<div class="headline" data-mock-headline="true">${escapeMockHtml(headline)}</div>`
    : ''
  return `<!DOCTYPE html>
${sentinel}${hidden}<html>
<head><style>
body { margin: 0; width: ${width}px; height: ${height}px; background: ${hex}; display: flex; align-items: center; justify-content: center; }
.card { color: #ffffff; font-family: Inter, sans-serif; font-size: 48px; text-align: center; padding: 40px; }
</style></head>
<body><div class="card" data-mock="true">MOCK DESIGN</div>${headlineEl}</body>
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

/**
 * Deterministic reply of the refine add-verifier MODEL (MOCK_AI, change 004
 * T14/T21). A raw string, not a verdict object, so the mock always runs through
 * the real verdict parser (refineVerify.parseVerifierVerdict). It stands in for
 * the model call only: verifyRefine has already counted the call
 * (onVerifierCall) by the time this is consulted, so rejection.verifierCalls
 * reports these calls truthfully — unlike mockVerifyOutcome's forced outcomes,
 * which short-circuit before any call. Reached only for an `add` class whose
 * structural checks (if any) passed.
 *
 * Sentinels in the instruction (first match wins; none → "applied"):
 *   - "__VERIFIER_SAYS_NO__"  — a well-formed `{"applied": false, …}` verdict →
 *     a miss (AC-13: an add absent after the retry is not applied, one call
 *     per attempt).
 *   - "__VERIFIER_GARBAGE__"  — prose with no JSON verdict → unparseable →
 *     unavailable (AC-14, routed like a miss).
 *   - "__VERIFIER_EMPTY__"    — an empty reply → unavailable (AC-14).
 * Deliberately named __VERIFIER_…__, never __VERIFY_…__, so mockVerifyOutcome
 * never matches them and the real verification path runs.
 */
export function buildMockVerifierReply(instruction: string): string {
  const tag = instruction.slice(0, 80)
  if (instruction.includes('__VERIFIER_SAYS_NO__')) {
    return JSON.stringify({ applied: false, reason: `Mock verifier: the requested element is absent. [${tag}]` })
  }
  if (instruction.includes('__VERIFIER_GARBAGE__')) {
    return 'Mock verifier: looks great to me, no notes!'
  }
  if (instruction.includes('__VERIFIER_EMPTY__')) {
    return ''
  }
  return JSON.stringify({ applied: true, reason: `Mock verifier: applied. [${tag}]` })
}

/**
 * Deterministic verification-OUTCOME override (MOCK_AI, change 004 T20).
 * Consulted at the very top of refineVerify.verifyRefine(), before any DOM
 * extraction or model call — so it works even though, under MOCK_PUPPETEER,
 * staticDomFacts() cannot resolve `#id`/`.class` fragments or constrain
 * targets (domFacts.ts header) and structural checks would otherwise always
 * miss. Without this seam the retry and twice-failed refine branches (T17)
 * are unreachable in tests.
 *
 * Sentinels in the instruction, checked in this order (first match wins):
 *   - "__VERIFY_UNAVAILABLE__" — unavailable on every attempt. FR-10 requires
 *     the caller to route this exactly like a miss; this seam only produces
 *     the outcome, the routing is T17's.
 *   - "__VERIFY_FAIL_ALWAYS__" — miss on every attempt (the twice-failed
 *     refine path, AC-16/17).
 *   - "__VERIFY_FAIL_ONCE__"   — miss on attempt 1, pass on attempt 2 (the
 *     one-retry-succeeds path, FR-11).
 *   - "__VERIFY_PASS__"       — pass on every attempt (needed because the
 *     mock's structural checks can't be trusted to pass on their own).
 * No sentinel → null → verifyRefine runs its real logic unchanged (including
 * buildMockVerifierReply's own MOCK_AI hook for the `add` class, untouched).
 */
export function mockVerifyOutcome(instruction: string, attempt: 1 | 2): VerifyResult | null {
  if (instruction.includes('__VERIFY_UNAVAILABLE__')) {
    return { kind: 'unavailable', reason: 'mock verifier: forced unavailable (__VERIFY_UNAVAILABLE__ sentinel)' }
  }
  if (instruction.includes('__VERIFY_FAIL_ALWAYS__')) {
    return { kind: 'miss', reasons: ['mock verifier: forced miss on every attempt (__VERIFY_FAIL_ALWAYS__ sentinel)'] }
  }
  if (instruction.includes('__VERIFY_FAIL_ONCE__')) {
    return attempt === 1
      ? { kind: 'miss', reasons: ['mock verifier: forced miss on attempt 1 (__VERIFY_FAIL_ONCE__ sentinel)'] }
      : { kind: 'pass' }
  }
  if (instruction.includes('__VERIFY_PASS__')) {
    return { kind: 'pass' }
  }
  return null
}

// ── T20: deterministic refine-reply seam (change 004 Phase 2) ───────────────

const INLINE_TOKEN_RE = /__INLINE_ASSET_\d+__/
const IMAGE_ATTR_RE = /\bsrc\s*=\s*"([^"]+)"|url\(\s*['"]?([^'")]+)['"]?\s*\)/i
const MOCK_NEW_IMAGE = 'https://mock.invalid/refine-new-image.png'

/** The first `__INLINE_ASSET_n__` token, else the first `src="…"`/`url(…)` reference, in `html`. */
function findImageRef(html: string): string | null {
  const token = INLINE_TOKEN_RE.exec(html)?.[0]
  if (token) return token
  const m = IMAGE_ATTR_RE.exec(html)
  return m ? (m[1] ?? m[2] ?? null) : null
}

/** Every `src="…"` / `url(…)` reference in `html`, in document order, minus `@import url(…)`. */
function findImageRefs(html: string): string[] {
  const re = /(@import\s+)?(?:\bsrc\s*=\s*"([^"]+)"|url\(\s*['"]?([^'")]+)['"]?\s*\))/gi
  const refs: string[] = []
  for (const m of html.matchAll(re)) {
    if (m[1]) continue
    const ref = m[2] ?? m[3]
    if (ref) refs.push(ref)
  }
  return refs
}

/** A short leading phrase of `html`'s visible text (tags/script/style/comments stripped). */
function findTextPhrase(html: string): string | null {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  const words = text.split(' ')
  return words.slice(0, Math.min(6, words.length)).join(' ')
}

/** A minimal valid (or, with `closeHtml: false`, deliberately truncated) document. */
function refineDoc(width: number, height: number, bodyInner: string, closeHtml = true): string {
  const open = `<!DOCTYPE html>\n<html>\n<head><style>body{margin:0;width:${width}px;height:${height}px}</style></head>\n<body>${bodyInner}</body>`
  return closeHtml ? `${open}\n</html>` : open
}

/** The fenced JSON header the wire format puts before the document (refineEnvelope.ts). */
function refineHeader(classes: InstructionClass[], supersedes: string[] = [], constrains: ConstrainTarget[] = []): string {
  return ['```json', JSON.stringify({ classes, supersedes, constrains }), '```'].join('\n')
}

/**
 * Deterministic refine-model REPLY (MOCK_AI, change 004 T20). Returns a raw
 * reply string in the real refine envelope wire format (refineEnvelope.ts
 * header + `REFINE_ENVELOPE_EXAMPLE` / `parseRefineEnvelope`) — never a
 * parsed object — so the real parser and `effectiveClasses` run on it
 * unchanged. T17 wires this into the runners' refine-mode MOCK_AI branch;
 * this module only builds the string.
 *
 * Default (no sentinel in the instruction): byte-identical to today's mock
 * design agent, `buildMockHtml(promptContext, width, height)`'s bare
 * document — NO envelope header at all. A bare document parses as no
 * envelope (FR-05), defaulting to the preserving `add` class, so every
 * existing refine E2E keeps passing unchanged.
 *
 * Sentinels (checked in this order; first match wins) are built from a text
 * phrase or an image URL/token taken from `slimHtml` (the current document),
 * because staticDomFacts (MOCK_PUPPETEER) resolves visible-text phrases and
 * image URLs/tokens but never `#id`/`.class` (domFacts.ts header):
 *   - "__REFINE_TRUNCATED__"        — reply has no closing `</html>` (T17's
 *     truncation rule).
 *   - "__REFINE_REDUCE_NOOP__"      — a `remove` whose reply leaves the
 *     current document's text unchanged → structural miss (the reported
 *     "reduce the text" bug, AC-08 regression).
 *   - "__REFINE_REDUCE_REAL__"      — a `remove` whose reply visibly
 *     shortens that text → pass.
 *   - "__REFINE_IMAGE_DUP__"        — a `replace` whose reply keeps the
 *     superseded image AND adds a new one → miss (the reported duplicate-
 *     background bug, AC-09 regression).
 *   - "__REFINE_IMAGE_REPLACE__"    — a `replace` whose reply drops the
 *     superseded image and adds a new one → pass.
 *   - "__REFINE_IMAGE_MOVE_DUP__"   — the REPORTED duplicate shape (final F1
 *     / C-1): the document's SECOND image (the "uploaded" inset) is applied
 *     as the background AND kept as the inset, with supersedes = the FIRST
 *     image (the old background, which is gone) → miss on image
 *     multiplicity. Checked before the two above (distinct substring). With
 *     "__REFINE_FIX_ON_RETRY__", attempt 2 is the correct move (inset gone).
 *     Fewer than two images → a non-resolving supersedes (always a miss).
 *   - "__REFINE_EMPTY_SUPERSEDES__" — a `replace` with `supersedes: []`
 *     (AC-10 — `effectiveClasses` downgrades this to `add` before
 *     verification).
 *   - "__REFINE_TOKEN_RENAME__"     — renames an `__INLINE_ASSET_n__` token
 *     found in `slimHtml` (AC-07 — `reconcileInlineAssets` sees an unknown
 *     token).
 *   - "__REFINE_MULTI_CLASS__"      — returns more than one class (AC-11):
 *     `replace` (a passing image swap) plus `add`.
 * The combinable modifier "__REFINE_FIX_ON_RETRY__" flips the reduce/image/
 * empty-supersedes/token-rename/truncated sentinels above to their FIXED
 * variant when `attempt` is 2 — the retry-succeeds path (FR-11). It has no
 * effect alone, and no effect on multi-class (which has no broken/fixed pair).
 *
 * Every case degrades deterministically when `slimHtml` doesn't carry what it
 * needs: the reduce cases fall back to `supersedes: []` when there is no
 * visible text, and the image/token cases fall back to a synthetic reference
 * that will not resolve in the current document — either way verification
 * always misses (a downgrade or a fragment not found), never a crash and
 * never a silent pass. T21 arranges a before-document that has one when the
 * passing variant is required.
 *
 * Deterministic: no randomness, no Date.now().
 */
export function buildMockRefineReply(args: {
  slimHtml: string
  instruction: string
  attempt: 1 | 2
  width: number
  height: number
  // Extra context (e.g. the brand-kit system context) for the default
  // reply's hex echo — see buildMockHtml. Optional; omitted → the neutral
  // fallback colour.
  promptContext?: string
}): string {
  const { slimHtml, instruction, attempt, width, height, promptContext } = args
  const fixOnRetry = instruction.includes('__REFINE_FIX_ON_RETRY__') && attempt === 2

  if (instruction.includes('__REFINE_TRUNCATED__')) {
    return `${refineHeader(['add'])}\n${refineDoc(width, height, 'Mock truncated refine reply.', fixOnRetry)}`
  }

  if (instruction.includes('__REFINE_REDUCE_NOOP__') || instruction.includes('__REFINE_REDUCE_REAL__')) {
    const wantsReal = instruction.includes('__REFINE_REDUCE_REAL__') || fixOnRetry
    const phrase = findTextPhrase(slimHtml)
    const supersedes = phrase ? [phrase] : []
    if (!wantsReal) {
      // No-op: echo the current document unchanged — the named passage stays intact.
      return `${refineHeader(['remove'], supersedes)}\n${slimHtml}`
    }
    return `${refineHeader(['remove'], supersedes)}\n${refineDoc(width, height, 'Shortened.')}`
  }

  if (instruction.includes('__REFINE_IMAGE_MOVE_DUP__')) {
    // The REPORTED shape (final F1 / C-1): the design's second image (the
    // "uploaded" inset) becomes the background AND stays as the inset;
    // supersedes names the old background, which is gone.
    const [bgRef, insetRef] = findImageRefs(slimHtml)
    if (!bgRef || !insetRef) {
      // degrade: a supersedes entry that never resolves → always a miss
      return `${refineHeader(['replace'], [MOCK_NEW_IMAGE])}\n${refineDoc(width, height, 'Mock move-dup refine reply.')}`
    }
    const background = `<div style="background-image:url('${insetRef}')"></div>`
    const body = fixOnRetry ? background : `${background}<img src="${insetRef}" alt="Uploaded photo">`
    return `${refineHeader(['replace'], [bgRef])}\n${refineDoc(width, height, body)}`
  }

  if (instruction.includes('__REFINE_IMAGE_DUP__') || instruction.includes('__REFINE_IMAGE_REPLACE__')) {
    const wantsClean = instruction.includes('__REFINE_IMAGE_REPLACE__') || fixOnRetry
    const ref = findImageRef(slimHtml) ?? MOCK_NEW_IMAGE // degrade: never resolves in the current document
    const supersedes = [ref]
    const body = wantsClean
      ? `<div style="background-image:url('${MOCK_NEW_IMAGE}')"></div>`
      : `<div style="background-image:url('${ref}')"></div><div style="background-image:url('${MOCK_NEW_IMAGE}')"></div>`
    return `${refineHeader(['replace'], supersedes)}\n${refineDoc(width, height, body)}`
  }

  if (instruction.includes('__REFINE_EMPTY_SUPERSEDES__')) {
    const named = fixOnRetry
    const ref = findImageRef(slimHtml) ?? findTextPhrase(slimHtml) ?? MOCK_NEW_IMAGE
    const supersedes = named ? [ref] : []
    return `${refineHeader(['replace'], supersedes)}\n${refineDoc(width, height, 'Mock empty-supersedes refine reply.')}`
  }

  if (instruction.includes('__REFINE_TOKEN_RENAME__')) {
    const token = INLINE_TOKEN_RE.exec(slimHtml)?.[0]
    if (!token) return buildMockHtml(promptContext ?? '', width, height) // degrade: nothing to rename
    const renamed = fixOnRetry ? token : `${token.slice(0, -2)}_RENAMED__`
    return `${refineHeader(['add'])}\n${slimHtml.replace(token, renamed)}`
  }

  if (instruction.includes('__REFINE_MULTI_CLASS__')) {
    const ref = findImageRef(slimHtml) ?? MOCK_NEW_IMAGE
    const body = `<div style="background-image:url('${MOCK_NEW_IMAGE}')"></div>`
    return `${refineHeader(['replace', 'add'], [ref])}\n${refineDoc(width, height, body)}`
  }

  // Default: byte-identical to today's mock design agent — no envelope header.
  // 030: a headline element in the current document is carried over, so a
  // refine that does not touch the headline keeps it.
  const carried = slimHtml.match(/<div class="headline" data-mock-headline="true">[\s\S]*?<\/div>/)?.[0]
  const base = buildMockHtml(promptContext ?? '', width, height)
  return carried ? base.replace('</body>', () => `${carried}</body>`) : base
}
