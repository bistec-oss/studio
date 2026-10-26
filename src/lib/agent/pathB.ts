import { prisma } from '@/lib/prisma'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import type { DesignAgentResult, GenerationActor } from '@/lib/agent/types'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { runDesignAgentCli } from '@/lib/agent/designAgentCli'
import { extractInlineAssets } from '@/lib/agent/inlineAssets'
import { dimensionsFor } from '@/lib/aspectRatio'
import { isCliMode, pipelineMode } from '@/lib/agent/config'
import type { ResolvedModel } from '@/lib/models/resolve'
import { buildPathBSystemPrompt, buildPathBUserMessage } from '@/lib/agent/prompts/pathB'
import { imageRulesFor, parseBriefImages } from '@/lib/agent/briefInput'
import { generateBackgroundForBrief, type BackgroundResult } from '@/lib/agent/background'
import {
  compositionStampSchema,
  evaluateLayout,
  getArchetype,
  planComposition,
  settleComposition,
  type CompositeOutcome,
  type CompositionStamp,
  type HeroPlan,
  type Rect,
  type Region,
} from '@/lib/designData'
import { observeLayout, type LayoutObservation } from '@/lib/renderer/layoutFacts'
import { MOCK_PUPPETEER, mockLayoutBoxes } from '@/lib/testHooks'
import { compositeRenderForSource } from '@/lib/composite/assets'
import { insertComposite, withDetectedScreen } from '@/lib/composite/insert'
import { CompositeRenderError, type CompositeRender } from '@/lib/composite/render'
import { parseCompositeSource } from '@/lib/brief/compositeSource'
import { deleteObject, BUCKET_EXPORTS } from '@/lib/storage/minio'
import { applyPostFonts } from '@/lib/fonts/inject'
import { postFontPlan, postFontsUrl } from '@/lib/fonts/plan'

// Re-export for existing importers; canonical home is agent/briefInput.ts.
export { buildBriefInput } from '@/lib/agent/briefInput'

export type PathBDesignResult = DesignAgentResult & {
  // Public URL of the AI-generated background used in this design (stored on
  // Draft.imageUrl by the callers), or null when the pre-step skipped.
  backgroundImageUrl: string | null
  // The background step's full outcome, including why it skipped (005
  // FR-06) — the callers store an unintended skip on the draft (FR-07).
  background: BackgroundResult
  // The composition stamp of this run (009 FR-12): the image style asked for,
  // the one applied, why not, and the layout observation. The callers write it
  // with the design (finalizeDraftV1, regenerate-design).
  composition: CompositionStamp
}

// The layout observation of a KEPT hero archetype (009 FR-11): one more page
// load of the final HTML, which only records. Under MOCK_PUPPETEER nothing is
// measured; the seam supplies boxes and the REAL evaluateLayout compares them.
// An error records nothing (observeLayout never throws).
//
// Bound: observeLayout races the measurement against LAYOUT_OBSERVE_TIMEOUT_MS
// (15 s); on expiry it records nothing. budget.ts sizes layoutMeasureMs to that
// bound, so the segment budget holds. An abandoned page still holds its
// renderer slot until setContent's own 60 s cap.
async function observeKeptLayout(
  html: string,
  plan: HeroPlan,
  kit: ResolvedBrandKit,
  backgroundImageUrl: string | null,
  canvas: { width: number; height: number },
  seamText: string,
  composites: CompositeRender | null,
): Promise<LayoutObservation | null> {
  const textRegions: Region[] = plan.sizeContract.regions.filter((r) => r.purpose === 'text')
  if (MOCK_PUPPETEER) {
    const boxes = mockLayoutBoxes(seamText, textRegions)
    return boxes ? evaluateLayout(boxes, textRegions) : null
  }
  const logoUrls = Array.from(
    new Set([kit.logoUrl, ...kit.logos.map((l) => l.url)].filter((u): u is string => !!u))
  )
  return observeLayout(html, textRegions, {
    ...canvas,
    logoUrls,
    excludeUrls: backgroundImageUrl ? [backgroundImageUrl] : [],
    composites,
  })
}

// Runs the Path B (freeform) design pipeline for a given brief + its on-image
// headline (012 FR-09: the design never reads a caption), dispatching CLI vs
// API. Single source of truth for initial generation (assemble-b),
// regeneration (regenerate-design), and the ACP surface, so the entry points
// never drift.
export async function runPathBDesign(
  brief: Brief,
  kit: ResolvedBrandKit,
  headline: string,
  campaignBriefing: string | null | undefined,
  actor: GenerationActor,
  // 008 FR-07: the DESIGN_FREEFORM model, resolved by the caller (the
  // generation at its start; regenerate-design before its claim).
  model: ResolvedModel,
  // 008 FR-12: a liveness write (a draft heartbeat or the scheduler's lease
  // renewal), run after the background step and immediately before the
  // design-agent call, so each stays within its own budget segment (budget.ts).
  opts?: { onBeforeDesign?: () => Promise<void> },
): Promise<PathBDesignResult> {
  // Feed-to-AI artifact URLs (brand reference imagery).
  const artifacts = await prisma.brandKitArtifact.findMany({
    where: { brandKitId: kit.id, feedToAI: true },
    select: { url: true },
  })
  const artifactUrls = artifacts.map((a) => a.url)

  // Output canvas for this brief (1080×1080 square or 1080×1350 portrait).
  const { width, height } = dimensionsFor(brief.aspectRatio)

  // Optional reference template for style inspiration. Scoped to the brief's
  // own team via its parent brand kit (I2, final review — defense-in-depth;
  // briefs/route.ts already rejects a foreign referenceTemplateId at create
  // time, but a pre-fix row or a direct DB write must not leak another team's
  // template HTML into the design prompt as "style inspiration").
  let referenceTemplate: { htmlTemplate: string } | null = null
  if (brief.referenceTemplateId) {
    referenceTemplate = await prisma.brandKitTemplate.findFirst({
      where: { id: brief.referenceTemplateId, brandKit: { teamId: brief.teamId } },
      select: { htmlTemplate: true },
    })
  }

  // The reference template is style inspiration only — never filled, never
  // rendered. Strip its inline `data:` assets (the same externalization Path A
  // uses) before it enters the prompt: a heavy template (e.g. "Hearts Talk",
  // 1.89 MB) would otherwise blow the CLI 600k guard / API ~200k context. Unlike
  // Path A there is no restore step — the model only needs the structural
  // HTML/CSS to grasp the visual style, not the base64 payloads it can't read.
  const referenceTemplateHtml = referenceTemplate
    ? extractInlineAssets(referenceTemplate.htmlTemplate).html
    : null

  const mode = pipelineMode()
  const briefImages = parseBriefImages(brief.briefImages)
  // 031 FR-22: the kit's post fonts, planned once for the run.
  const fontPlan = postFontPlan(kit)

  // Background pre-step: Claude (INTERNAL_BACKGROUND, Haiku) decides + gpt-image generates a
  // full-bleed background before the design call. A skip (with its reason)
  // on no provider/failure — the design proceeds with CSS/SVG visuals as
  // before. See agent/background.ts.
  //
  // 009: the brief's image style plans the composition first. A hero plan
  // writes the image prompt from the archetype's contract and gets its pixels
  // checked; every exit that is not an explicit pass settles to classic over the
  // same image (settleComposition), so there is never a second image call.
  // 025: the brief's product screenshot, when it has a valid one.
  const source = parseCompositeSource(brief.compositeSource)
  const plan = planComposition({
    imageStyle: brief.imageStyle,
    aspectRatio: brief.aspectRatio,
    hasCompositeSource: source !== null,
  })
  const heroPlan = plan.kind === 'hero' ? plan : undefined
  const background = await generateBackgroundForBrief(brief, kit, headline, campaignBriefing, actor, heroPlan)
  const needsComposite = !!heroPlan && !!getArchetype(heroPlan.requestedArchetype)?.requires
  // PROVISIONAL, never stored: it only decides whether the look was kept at the
  // pixel check. The stored stamp is settled below, after the render that
  // placed the screenshot passed (NFR-08).
  const placed: CompositeOutcome | undefined =
    needsComposite && source ? { ok: true, source: { kind: 'brief-upload', key: source.key } } : undefined
  const provisional = settleComposition(plan, background, placed)
  // The contract reaches the design prompt only when the archetype was KEPT.
  let kept = heroPlan && provisional.appliedArchetype !== 'classic' ? heroPlan : undefined

  // 025 FR-13: the screenshot's bytes, read once for this run, at the screen
  // the check detected (A1). A failure falls back to classic without the hero
  // image (no second image call).
  let composites: CompositeRender | null = null
  let detected: Rect | null = null
  let fallbackReason: 'composite-not-rendered' | 'composite-source-missing' | null = null
  if (kept && needsComposite) {
    detected = provisional.composites?.[0]?.rect ?? null
    try {
      if (!source || !detected) throw new CompositeRenderError('composite-source-missing', 'no screenshot or screen rect')
      composites = await compositeRenderForSource(source.key, detected, brief.teamId, { width, height })
    } catch (err) {
      fallbackReason = err instanceof CompositeRenderError ? err.reason : 'composite-source-missing'
      console.warn(
        `[pathB] composite look not placed (${fallbackReason}): ${err instanceof Error ? err.message : String(err)}`,
      )
      kept = undefined
      detected = null
    }
  }
  // The image the design may use: none once the composite look has fallen back.
  let designImageUrl: string | null = fallbackReason ? null : background.url

  const designOnce = async (
    hero: HeroPlan | undefined,
    imageUrl: string | null,
    render: CompositeRender | null,
    screen: Rect | null,
  ) => {
    const systemPrompt = buildPathBSystemPrompt({
      kit,
      mode,
      width,
      height,
      artifactUrls,
      referenceTemplateHtml,
      backgroundImageUrl: imageUrl,
      ...(hero
        ? {
            composition: {
              label: hero.label,
              contract: hero.contract,
              // The prompt names the screen the check found, not the contract region.
              size: screen ? withDetectedScreen(hero.sizeContract, screen) : hero.sizeContract,
            },
          }
        : {}),
    })
    const userMessage = buildPathBUserMessage({
      campaignBriefing,
      topic: brief.topic,
      description: brief.description,
      goal: brief.goal,
      tone: brief.tone,
      channels: brief.channels,
      headline,
      mode,
      width,
      height,
      briefImages,
      heroPrecedence: !!hero,
      imageRules: imageRulesFor(brief),
    })
    // 025 FR-15: code inserts the screenshot at the detected screen after the
    // model's HTML is extracted and restored, before every render.
    // 031 FR-22: then code adds the kit's fonts (the marked link, the script font in every stack),
    // on every render, so the stored document is the one that was checked.
    const withFonts = (h: string) => applyPostFonts(h, fontPlan, postFontsUrl)
    const insert =
      render && screen
        ? {
            postProcess: (h: string) => withFonts(insertComposite(h, screen, { width, height })),
            composites: render,
          }
        : { postProcess: withFonts }
    return isCliMode()
      ? runDesignAgentCli({ systemPrompt, userMessage, briefId: brief.id, width, height, model, headline, ...insert })
      : runDesignAgent({
          systemPrompt,
          userMessage,
          briefId: brief.id,
          model,
          maxToolCalls: 15,
          width,
          height,
          actor,
          headline,
          ...insert,
        })
  }

  await opts?.onBeforeDesign?.()

  let result: DesignAgentResult
  try {
    result = await designOnce(kept, designImageUrl, composites, detected)
  } catch (err) {
    // 025 FR-15: a screenshot that could not be placed falls back to classic,
    // once, without the hero image. Any other failure is the caller's.
    if (!(err instanceof CompositeRenderError) || !composites) throw err
    for (const abandoned of err.uploadedKeys ?? []) {
      await deleteObject(BUCKET_EXPORTS, abandoned).catch((e) =>
        console.warn(
          `[pathB] could not delete the abandoned export ${abandoned}: ${e instanceof Error ? e.message : String(e)}`,
        ),
      )
    }
    console.warn(`[pathB] composite render failed (${err.reason}); re-running the design as classic`)
    fallbackReason = err.reason
    kept = undefined
    composites = null
    detected = null
    designImageUrl = null
    result = await designOnce(undefined, null, null, null)
  }

  // The stored stamp: a fallback is classic with the reason; a kept composite
  // look is stamped only now, after its render passed (NFR-08).
  let composition: CompositionStamp = fallbackReason
    ? settleComposition(plan, background, { ok: false, reason: fallbackReason })
    : provisional
  // The layout observation, only for an applied non-classic archetype. A
  // violation is recorded and shown, never a fallback (no second design call).
  if (kept && !fallbackReason) {
    const observation = await observeKeptLayout(
      result.htmlContent,
      kept,
      kit,
      designImageUrl,
      { width, height },
      brief.topic,
      composites,
    )
    if (observation && !observation.ok) {
      composition = compositionStampSchema.parse({ ...composition, observations: ['layout-violation'] })
    }
  }

  return { ...result, backgroundImageUrl: designImageUrl, background, composition }
}
