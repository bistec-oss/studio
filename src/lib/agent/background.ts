// Background-image pre-step for Path B generation and AGUI refine.
//
// Flow: Claude (the fixed INTERNAL_BACKGROUND model, Haiku — 008 FR-15)
// answers a small strict-JSON question
// ("should this post get an AI-generated background, and with what prompt?"),
// then the server calls the resolved IMAGE provider (gpt-image-2 by default) and
// persists the result to the public IMAGES bucket. The returned URL is injected
// into the design/refine prompts as the background layer and stored on
// Draft.imageUrl.
//
// Failure policy: this step NEVER fails the pipeline. No image provider, a
// declined decision, a provider error, or malformed JSON all resolve to a skip
// with its reason (BackgroundResult, 005 FR-06), and the design proceeds without
// a generated background (CSS/SVG as before). The callers store an unintended
// skip on the draft so the draft page can say why (FR-07, drafts/backgroundNotice.ts).
// MOCK_AI skips the step entirely so the E2E suite stays deterministic — unless
// the brief topic (or, for refine, the instruction) carries a __MOCK_BG__
// sentinel (the NFR-06 seam, testHooks.ts).
//
// Hero image styles (change 009): for a hero plan the same step writes the
// image prompt from the archetype's contract (the closed decision still returns
// only { needed, prompt }: nothing the model says supplies or moves a region),
// makes ONE image call, persists it, and runs the pixel check on the image
// BEFORE the design call. The check fails closed: only an explicit `{ ok: true }`
// keeps the archetype; every other exit settles to classic over the SAME image
// (settleComposition, designData/plan.ts).

import Anthropic from '@anthropic-ai/sdk'
import { internalModel, type ResolvedModel } from '@/lib/models/resolve'
import { createMessage, textOf } from '@/lib/models/anthropicCall'
import { modelCallFor, recordModelCall } from '@/lib/models/modelCalls'
import { z } from 'zod'
import type { Brief } from '@prisma/client'
import { env } from '@/lib/env'
import {
  MOCK_AI,
  backgroundSeamText,
  mockBackgroundDecision,
  mockImageProvider,
  mockRegionSamples,
  mockScreenGrid,
  shouldMockBackground,
} from '@/lib/testHooks'
import { imageGeometryPin, type HeroCheckResult, type HeroPlan } from '@/lib/designData'
import { runHeroCheck } from '@/lib/renderer/heroCheck'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { resolveImageProviderWithSource, type ResolvedImageProvider } from '@/providers/registry'
import { isAuthRejection, markUserOpenAiKeyInvalid } from '@/lib/agent/openAiKey'
import type { ImageSource } from '@/lib/drafts/imageSourceNotice'
import { imageSizeFor, type ImageTier } from '@/providers/imageCapabilities'
import type { ImageProvider } from '@/providers/interfaces/ImageProvider'
import { persistDataUrlImage } from '@/lib/storage/minio'
import { runClaudeCli, stripCodeFences } from '@/lib/agent/claudeCli'
import { isCliMode, pipelineMode } from '@/lib/agent/config'
import { imageRulesFor } from '@/lib/agent/briefInput'
import type { GenerationActor } from '@/lib/agent/types'
import {
  buildBackgroundDecisionPrompt,
  buildRefineBackgroundDecisionPrompt,
  type BackgroundDecisionPrompt,
} from '@/lib/agent/prompts/background'
import {
  cleanSkipDetail,
  type BackgroundResult,
  type BackgroundSkipReason,
} from '@/lib/drafts/backgroundNotice'

export type { BackgroundResult, BackgroundSkipReason } from '@/lib/drafts/backgroundNotice'

// The step's outcome with the hero extras (009): the tier the provider reported
// and, for a hero plan only, the pixel check's result. A skip is unchanged.
// Assignable to BackgroundResult, so every existing consumer is untouched.
export type BackgroundOutcome =
  | { url: string; quality?: ImageTier; check?: HeroCheckResult; imageSource?: ImageSource }
  | Extract<BackgroundResult, { url: null }>

// CLOSED (009 FR-05): zod's default object parsing strips unknown keys, so an
// `archetype`, `safeArea`, `regions` or `role` in the reply is discarded. No
// code reads a region from a model reply; regions live in designData only.
const decisionSchema = z.object({
  needed: z.boolean(),
  prompt: z.string().optional().default(''),
})
export type BackgroundDecision = z.infer<typeof decisionSchema>

function log(msg: string) {
  console.log(`[background] ${msg}`)
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// One skip, logged once (the raw detail, server-side only). The returned
// detail is redacted and clipped to SKIP_DETAIL_MAX here, at the source, so no
// caller can store or show a key, an internal URL, or more than that.
function skip(reason: BackgroundSkipReason, detail?: string, imageSource?: ImageSource): BackgroundResult {
  log(`skipped (${reason})${detail ? ` — ${detail}` : ''}`)
  const src = imageSource ? { imageSource } : {}
  return detail ? { url: null, skip: reason, detail: cleanSkipDetail(detail), ...src } : { url: null, skip: reason, ...src }
}

// 031 FR-13: the user's own key failed and the team has no provider to fall to.
class PersonalKeyFailed extends Error {
  constructor(
    readonly providerName: ImageSource['provider'],
    cause: unknown,
  ) {
    super(errorText(cause), { cause })
  }
}

type GenerateImageResult = { url: string; quality?: ImageTier }

// One image call with the 031 fallback. A personal-tier failure retries ONCE on
// the team tiers (userId null), a 401 or 403 also marks the personal row
// INVALID, and `source` says which provider ran. A team-tier failure is the
// ordinary PROVIDER_ERROR path. `wrap` swaps in the MOCK_AI image stand-in
// after the real resolver chose the provider.
async function generateWithFallback(
  resolved: ResolvedImageProvider,
  opts: { actor: GenerationActor; imageProviderKey?: string | null },
  wrap: (r: ResolvedImageProvider) => ImageProvider,
  call: (provider: ImageProvider) => Promise<GenerateImageResult>,
): Promise<{ result: GenerateImageResult; source: ImageSource }> {
  try {
    const result = await call(wrap(resolved))
    return { result, source: { tier: resolved.tier, provider: resolved.providerName } }
  } catch (err) {
    if (resolved.tier !== 'personal') throw err
    if (isAuthRejection(err) && opts.actor.userId) {
      try {
        await markUserOpenAiKeyInvalid(opts.actor.userId)
      } catch (markErr) {
        log(`could not mark the personal image key invalid: ${errorText(markErr)}`)
      }
    }
    log(`personal ${resolved.providerName} image key failed — falling back to the team provider`)
    const team = await resolveImageProviderWithSource(
      { teamId: opts.actor.teamId, userId: null },
      opts.imageProviderKey ?? undefined,
    )
    if (!team) throw new PersonalKeyFailed(resolved.providerName, err)
    const result = await call(wrap(team))
    return {
      result,
      source: { tier: 'team', provider: team.providerName, personalFailed: true, personalProvider: resolved.providerName },
    }
  }
}

// Tolerant strict-JSON extraction, mirroring the refine route's parseConflict:
// strip a wrapping fence, isolate the outermost {...}, JSON.parse, zod-validate.
export function parseBackgroundDecision(raw: string): BackgroundDecision | null {
  const unfenced = stripCodeFences(raw)
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return decisionSchema.parse(JSON.parse(unfenced.slice(start, end + 1)))
  } catch {
    return null
  }
}

// The decision's model: an internal surface (008 FR-15, A14), fixed and never
// read from a team policy, so removing Haiku at /team does not stop this step.
// Its timeout is the entry's INTERNAL_BACKGROUND timeout.
function decisionModel(): ResolvedModel {
  return internalModel('INTERNAL_BACKGROUND', pipelineMode())
}

// One decision call, CLI vs API, on the fixed internal model.
async function runDecision(prompt: BackgroundDecisionPrompt): Promise<BackgroundDecision | null> {
  const model = decisionModel()
  if (isCliMode()) {
    const raw = await runClaudeCli(`${prompt.system}\n\n${prompt.user}`, { label: 'background', model })
    return parseBackgroundDecision(raw)
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const message = await createMessage(
    client,
    {
      max_tokens: 1024,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    },
    model,
    { label: 'background' },
  )
  const text = textOf(message)
  return text ? parseBackgroundDecision(text) : null
}

// Shared tail: resolve the provider, run the decision, then (when needed)
// generate + persist the image. imageProviderKey is the brief's optional
// per-brief override. actor is WHO is running this call (see GenerationActor)
// — deliberately NOT derived from the brief, since the acting teammate and the
// brief's owner are often different people on a shared team brief.
//
// Every ending is a BackgroundResult (FR-06); nothing here throws. The reason
// for an unexpected throw comes from `stage`, advanced as the step runs — never
// from the error's wording: before the decision has parsed it is a
// DECISION_ERROR, after it a PROVIDER_ERROR (generation or persisting).
//
// Order: both entry points resolve the provider FIRST. With none configured
// there is no point spending a Claude call on the decision: generation records
// NO_PROVIDER whatever the model would say, and refine's writer leaves the
// draft's skip unchanged on a refine NO_PROVIDER (refineSkipFields), since it
// never learned whether the instruction wanted a background.
//
// One refine-only wrinkle: a resolver that THROWS (resolveImageProvider never
// does today; a DB hiccup could) is held until the decision has run. refine
// stores PROVIDER_ERROR, so it may only report one when the instruction wanted
// a background — otherwise that is NOT_NEEDED like any other refine.
async function runBackgroundStep(
  buildPrompt: () => BackgroundDecisionPrompt,
  opts: {
    actor: GenerationActor
    brandKitId: string
    aspectRatio: string
    imageProviderKey?: string | null
    // The text the NFR-06 seam reads its sentinel from (testHooks.ts).
    seamText: string
    kind: 'generation' | 'refine'
    // A hero plan (009), generation only: the needed flag is ignored (the user
    // required an image), an empty prompt is no image, one image call is made
    // (with the operator's quality tier when set) and its pixels are checked.
    hero?: HeroPlan
    // Called with the image prompt just before the image call (025 probe).
    onPrompt?: (prompt: string) => void
  },
): Promise<BackgroundOutcome> {
  // NFR-06 seam: without a __MOCK_BG__ sentinel, MOCK_AI skips the step (no
  // background, nothing recorded) exactly as it always has.
  const mockSeam = shouldMockBackground(opts.seamText)
  if (MOCK_AI && !mockSeam) return { url: null, skip: 'NOT_NEEDED' }

  const resolved = await resolveProvider(opts)
  if (!resolved.resolved) {
    if (!resolved.failed) return skip('NO_PROVIDER')
    if (opts.kind === 'generation') return skip('PROVIDER_ERROR', resolved.detail)
  }

  let stage: 'decision' | 'provider' = 'decision'
  try {
    // The seam replaces only the Haiku decision here; resolution above is real.
    // It short-circuits before the boundary, so it records the internal model
    // the real decision would have run (008 FR-16, design §7). The no-sentinel
    // early return above records nothing: no call is made, as today.
    if (mockSeam) recordModelCall(modelCallFor(decisionModel(), pipelineMode(), 'background'))
    const decision = mockSeam ? mockBackgroundDecision(opts.seamText) : await runDecision(buildPrompt())
    if (!decision) return skip('DECISION_ERROR', 'decision response was not valid JSON')
    stage = 'provider'
    // A hero plan ignores `needed`: the person chose the style, so an image is
    // required, and only an empty prompt means there is none (no-image).
    if (opts.hero ? !decision.prompt.trim() : !decision.needed || !decision.prompt.trim()) return skip('NOT_NEEDED')
    // refine only: the held resolver failure, now that a background was wanted.
    if (!resolved.resolved) return skip('PROVIDER_ERROR', resolved.detail)
    const chosen = resolved.resolved

    // The fixture swap happens AFTER the real resolver chose the provider. The
    // tier rides along so __MOCK_BG_PERSONAL_FAIL__ can fail only the personal one.
    const wrap = (r: ResolvedImageProvider): ImageProvider =>
      mockSeam ? mockImageProvider(r.provider, opts.seamText, r.tier) : r.provider
    const provider = wrap(chosen)

    // A composite look (025) gets its measurements appended word for word.
    const pin = opts.hero ? imageGeometryPin(opts.hero.contract, opts.hero.sizeContract) : null
    const imagePrompt = pin ? `${decision.prompt}\n\n${pin}` : decision.prompt
    log(`generating background · size=${imageSizeFor(provider.providerName, opts.aspectRatio)} · prompt="${imagePrompt.slice(0, 120)}..."`)
    opts.onPrompt?.(imagePrompt)
    const startedAt = Date.now()
    // ONE image call on every exit (031: a failed personal key may be followed by
    // one team call). The fourth argument exists only for a hero plan with
    // IMAGE_QUALITY set: a classic call is exactly what it always was.
    const heroQuality = opts.hero ? env.IMAGE_QUALITY : undefined
    const { result, source } = await generateWithFallback(chosen, opts, wrap, (p) => {
      const size = imageSizeFor(p.providerName, opts.aspectRatio)
      return heroQuality
        ? p.generateImage(imagePrompt, opts.brandKitId, size, { quality: heroQuality })
        : p.generateImage(imagePrompt, opts.brandKitId, size)
    })

    // persistDataUrlImage enforces the raster allow-list and returns a stable
    // public URL; a provider that already returns an http(s) URL passes through.
    const url = result.url.startsWith('data:')
      ? await persistDataUrlImage(result.url, 'background')
      : result.url
    log(`background ready in ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ${url}`)
    if (!opts.hero) return { url, imageSource: source }
    // The pixel check runs on the bytes the provider returned (a data: URL: the
    // sampler refuses anything else, which settles to check-error).
    const check = await checkHero(result.url, opts.hero, mockSeam, opts.seamText)
    return { url, ...(result.quality ? { quality: result.quality } : {}), check, imageSource: source }
  } catch (err) {
    // 031 FR-13: a personal key that failed with no team provider to fall to.
    if (err instanceof PersonalKeyFailed) {
      return skip('PROVIDER_ERROR', err.message, { tier: 'personal', provider: err.providerName, personalFailed: true })
    }
    return skip(stage === 'decision' ? 'DECISION_ERROR' : 'PROVIDER_ERROR', errorText(err))
  }
}

// The pixel check for a hero image (009 FR-09/FR-10, 025 A1): one shared
// function (renderer/heroCheck.ts) that the OP-025 recheck also runs. Under
// MOCK_AI with a __MOCK_BG__ sentinel the seams' synthetic samples and screen
// grid feed the REAL evaluator and detector. It FAILS CLOSED and never throws.
async function checkHero(
  imageUrl: string,
  hero: HeroPlan,
  mockSeam: boolean,
  seamText: string,
): Promise<HeroCheckResult> {
  return runHeroCheck(imageUrl, hero, {
    log,
    seams: mockSeam
      ? {
          regionSamples: (regions, tone) => mockRegionSamples(seamText, regions, tone),
          screenGrid: (window, region, canvas) => mockScreenGrid(seamText, window, region, canvas),
        }
      : undefined,
  })
}

// resolveImageProviderWithSource never throws (returns null), but keep the
// guard: a DB hiccup here must still degrade gracefully, not fail the whole
// generation. It returns the outcome, not a skip: the caller decides when a
// failure is reported (refine holds it until its decision has run).
async function resolveProvider(opts: {
  actor: GenerationActor
  imageProviderKey?: string | null
}): Promise<
  | { resolved: ResolvedImageProvider; failed?: never; detail?: never }
  | { resolved: null; failed: boolean; detail?: string }
> {
  try {
    const resolved = await resolveImageProviderWithSource(
      { teamId: opts.actor.teamId, userId: opts.actor.userId },
      opts.imageProviderKey ?? undefined
    )
    return resolved ? { resolved } : { resolved: null, failed: false }
  } catch (err) {
    return { resolved: null, failed: true, detail: errorText(err) }
  }
}

/**
 * Path B initial generation / regeneration: decide (biased toward yes) and
 * generate a background for the brief. Returns the public image URL, or the
 * reason there is none. Never throws.
 *
 * `hero` (009) is the plan of a non-classic image style: the decision prompt
 * is written from its contract, `needed` is ignored, and the result carries
 * the pixel check (and the provider's quality tier). Absent: today's step.
 */
export async function generateBackgroundForBrief(
  brief: Brief,
  kit: ResolvedBrandKit,
  // The on-image headline (012 FR-09) — never a caption.
  headline: string,
  campaignBriefing: string | null | undefined,
  actor: GenerationActor,
  hero?: HeroPlan,
  onPrompt?: (prompt: string) => void,
): Promise<BackgroundOutcome> {
  return runBackgroundStep(
    () =>
      buildBackgroundDecisionPrompt({
        kit,
        topic: brief.topic,
        description: brief.description,
        goal: brief.goal,
        tone: brief.tone,
        headline,
        campaignBriefing,
        imageRules: imageRulesFor(brief),
        ...(hero ? { hero: { label: hero.label, contract: hero.contract, size: hero.sizeContract } } : {}),
      }),
    {
      actor,
      brandKitId: kit.id,
      aspectRatio: brief.aspectRatio,
      imageProviderKey: brief.imageProviderKey,
      seamText: brief.topic,
      kind: 'generation',
      hero,
      onPrompt,
    },
  )
}

/**
 * AGUI refine: generate a new background ONLY when the instruction asks for one
 * (neutral bias — see the refine decision prompt). Returns the URL, or the
 * reason there is none: NOT_NEEDED means the instruction didn't ask, and
 * NO_PROVIDER means none resolved, so the decision never ran (the refine
 * writer leaves the draft's skip unchanged for both). Never throws.
 *
 * The mock seam reads its sentinel from the instruction when it carries one,
 * so a test can make one refine fail on a draft whose generation produced a
 * background; otherwise from the draft's brief topic.
 */
export async function generateBackgroundForRefine(
  brief: Brief,
  kit: ResolvedBrandKit,
  instruction: string,
  actor: GenerationActor,
): Promise<BackgroundResult> {
  return runBackgroundStep(
    () => buildRefineBackgroundDecisionPrompt({ kit, topic: brief.topic, instruction }),
    {
      actor,
      brandKitId: kit.id,
      aspectRatio: brief.aspectRatio,
      imageProviderKey: brief.imageProviderKey,
      seamText: backgroundSeamText(instruction, brief.topic),
      kind: 'refine',
    },
  )
}
