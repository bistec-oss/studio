import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolveExportUrl } from '@/lib/storage/minio'
import { runDesignAgentRefine } from '@/lib/agent/designAgent'
import { runDesignAgentCliRefine } from '@/lib/agent/designAgentCli'
import { extractInlineAssets, restoreInlineAssets } from '@/lib/agent/inlineAssets'
import { applyPostFonts } from '@/lib/fonts/inject'
import { postFontPlan, postFontsUrl } from '@/lib/fonts/plan'
import { dimensionsFor } from '@/lib/aspectRatio'
import { pathForDesignMode, pipelineMode } from '@/lib/agent/config'
import { resolveModel } from '@/lib/models/policy'
import { internalModel } from '@/lib/models/resolve'
import { track } from '@/lib/analytics/track'
import { newActionTrace } from '@/lib/analytics/trace'
import { modelError, parseModelField } from '@/lib/models/requests'
import { buildRefineSystemPrompt, buildRefineUserMessage } from '@/lib/agent/prompts/refine'
import { generateBackgroundForRefine } from '@/lib/agent/background'
import { refineSkipFields } from '@/lib/drafts/backgroundNotice'
import { refineImageSource } from '@/lib/drafts/imageSourceFields'
import { commitDraftRevision, draftCompositionStamp, draftPostStyleStamp, recordRejectedRender, type ModelStamp } from '@/lib/drafts/revisions'
import { imageRulesAtStamp } from '@/lib/agent/briefInput'
import type { PostStyleStamp } from '@/lib/postStyles'
import { contractAt, refineReplacedStamp, styleLabel, type CompositionStamp, type SizeContract } from '@/lib/designData'
import { claimWhere, logLostClaim } from '@/lib/drafts/claim'
import { claimDraftAction, startDraftAction, touchDraftAction } from '@/lib/drafts/draftActions'
import { runRefineAttempts, settleRefine, summariseAttempt } from '@/lib/drafts/refineAttempt'
import { VERIFIER_PROMPT_VERSION, verifyRefine } from '@/lib/drafts/refineVerify'
import { extractDomFacts } from '@/lib/renderer/domFacts'
import { stripComposite, withDetectedScreen } from '@/lib/composite/insert'
import { CompositePlacementError } from '@/lib/composite/render'

interface PendingConflict {
  conflictId: string
  pendingHtml: string
  explanation: string
  // 008 A6: the refine model that wrote pendingHtml, so an Override commits
  // with it (the stamp an Override commits with).
  model: string | null
  modelSubstitutedFrom: string | null
}

interface ConflictMarker {
  conflict: true
  explanation: string
  pendingHtml: string
}

// The conflict protocol asks the model for a bare JSON object as its final text.
// Models occasionally wrap it in a code fence or a sentence of prose — tolerate
// both by extracting the outermost JSON object before parsing, so a wrapped
// conflict doesn't silently fall through and get stored as htmlContent.
function parseConflict(htmlContent: string): ConflictMarker | null {
  if (!htmlContent.includes('"conflict"')) return null
  // Strip a wrapping markdown fence if present, then isolate {...}.
  const unfenced = htmlContent.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(unfenced.slice(start, end + 1))
    if (parsed && parsed.conflict === true && typeof parsed.explanation === 'string') {
      return parsed as ConflictMarker
    }
  } catch {
    // Not a JSON conflict object — treat as normal HTML.
  }
  return null
}

// Permissive schema + manual check so the error message stays exactly
// 'instruction is required' (asserted by tests).
const refineSchema = z.object({}).passthrough()

// Refines a draft's design from a natural-language instruction. Validation and
// the Override path (commits already-stored HTML, no model call) run
// synchronously; the model path runs in-process fire-and-forget (the F1
// pattern — see draftActions.ts) and the route returns 202. The draft page
// polls pendingAction/pendingActionError — and, for an API-mode brand-kit
// conflict, the conflict surfaced from pendingConflict — to completion.
//
// Change 004 Phase 2 (T17): the model path is VERIFIED. The refine reply
// carries its instruction classes (the envelope); drafts/refineAttempt.ts
// checks and verifies it, retries once on a miss, and settles it. An accepted
// edit is rendered and committed. A twice-failed one commits nothing and is
// recorded as a rejected render plus the draft's not-applied outcome
// (notAppliedReason / notAppliedRevisionId) — a CLEAN completion, not an
// error. Verification lives here only: regenerate-design/copy and generation
// are unchanged (FR-07 / AC-20).
export const POST = withTeamAuth<{ id: string }>(async (req, { params }, user) => {
  const body = await parseBody(req, refineSchema)
  if (body.response) return body.response
  const { instruction, overrideConflictId } = body.data as {
    instruction: string
    overrideConflictId?: string
  }
  if (!overrideConflictId && (typeof instruction !== 'string' || !instruction.trim())) {
    return NextResponse.json({ error: 'instruction is required' }, { status: 400 })
  }
  // 008 FR-17: an optional explicit model pick. A malformed one is a 400 on
  // either path; the Override path makes no model call, so it ignores a valid one.
  const pick = parseModelField((body.data as { model?: unknown }).model)
  if (!pick.ok) return NextResponse.json(pick.body, { status: 400 })
  const requested = pick.value

  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (
    !draft ||
    !canAccessContent(user, { teamId: draft.teamId, ownerId: draft.brief.userId, campaignId: draft.brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // Output canvas for this draft's brief (1080×1080 square or 1080×1350 portrait).
  const { width, height } = dimensionsFor(draft.brief.aspectRatio)

  // ── Override path: apply the previously withheld HTML without re-running
  // compliance. Stays synchronous — it commits stored HTML without a model call.
  if (overrideConflictId) {
    const pending = draft.pendingConflict as unknown as PendingConflict | null
    if (!pending || pending.conflictId !== overrideConflictId) {
      return NextResponse.json({ error: 'Conflict not found or already resolved' }, { status: 409 })
    }
    return commitRevision(
      draft.id,
      instruction || 'Override brand kit conflict',
      pending.pendingHtml,
      width,
      height,
      { model: pending.model, modelSubstitutedFrom: pending.modelSubstitutedFrom },
      draftCompositionStamp(draft),
      draftPostStyleStamp(draft),
      { teamId: user.teamId, userId: user.userId },
    )
  }

  // Explicit brief kit → campaign → project → system default.
  const kit = await resolveBrandKit(draft.teamId, draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)
  if (!kit) {
    return NextResponse.json(
      { code: 'NO_BRAND_KIT', message: 'No brand kit found for this draft.' },
      { status: 422 }
    )
  }

  // Externalize inline data: assets in the current HTML before the model sees it,
  // so refining an asset-heavy draft (e.g. Hearts Talk, 1.81 MB) stays within the
  // CLI prompt guard and the API context. Restored before render.
  // 025 FR-16: the model never sees the screenshot element; code puts the
  // canonical one back at the stamped rect when the revision is committed.
  const { html: slimHtml, assets: inlineAssets } = extractInlineAssets(
    stripComposite(draft.htmlContent ?? '')
  )
  const hasInlineAssets = Object.keys(inlineAssets).length > 0

  const mode = pipelineMode()
  // 008 FR-09 / A8: refine has no stamp tier (it is not a regenerate). The team
  // REFINE default applies to both paths; the system default follows the
  // draft's path (Path A → Haiku, Path B → Sonnet). An explicit pick (FR-17)
  // is tier 1. Resolved before the claim, so a refused pick (400) or a team
  // with nothing allowed (422) claims nothing; the ResolvedModel then travels
  // by value into the background run (both attempts, the commit stamp).
  const resolvedModel = await resolveModel('REFINE', {
    requested,
    userId: user.userId,
    teamId: draft.teamId,
    designPath: pathForDesignMode(draft.brief.designMode),
  })
  if (!resolvedModel.ok) {
    if (requested) return NextResponse.json(modelError(resolvedModel), { status: 400 })
    return NextResponse.json({ code: resolvedModel.code, message: resolvedModel.message }, { status: 422 })
  }
  const model = resolvedModel.resolved

  const claim = await claimDraftAction(draft.id, 'REFINE')
  if (!claim) {
    return NextResponse.json({ error: 'Another action is already running on this draft' }, { status: 409 })
  }

  // CLI mode bills the acting user's personal Claude token when connected
  // (the team token otherwise) — startDraftAction resolves it before the
  // request unwinds and runs the whole closure inside that auth context, so the
  // background decision, both refine attempts and the verifier can't observe
  // different tokens. A throw below is recorded on Draft.pendingActionError.
  // actor is the acting teammate (NOT the brief owner) — image-provider
  // resolution must follow whoever is running this refine.
  const actor = { userId: user.userId, teamId: user.teamId }
  // 006 FR-05: the analytics fields of this refine, filled as the run learns
  // them (a crash keeps whatever was known) and emitted by startDraftAction
  // once the claim is settled.
  const trace = newActionTrace()
  await startDraftAction(draft.id, user.userId, user.teamId, claim, async () => {
    trace.fields.instruction = instruction
    trace.fields.model = { model: model.key, modelId: model.arg, substitutedFrom: model.substitutedFrom }
    trace.fields.verifierModelId = internalModel('INTERNAL_VERIFIER', mode).arg
    trace.fields.verifierPromptVersion = VERIFIER_PROMPT_VERSION
    // Background pre-step: generates a new background ONLY when the instruction
    // asks for one (e.g. "change the background to a city skyline"); a skip
    // with its reason otherwise. See agent/background.ts: it resolves the
    // provider first and, with none, never runs the decision. 005 FR-07: the
    // skip is recorded only when the instruction wanted a background and the
    // provider then failed (refineSkipFields), and only if this refine commits.
    const background = await generateBackgroundForRefine(draft.brief, kit, instruction, actor)
    const backgroundImageUrl = background.url

    // One system prompt and the ORIGINAL slim HTML for both attempts; the retry
    // only appends the miss (prompts/refine.ts buildRefineRetryNote).
    // 009 FR-13: the draft's stamped hero contract, resolved at the version it
    // was made under (versions are immutable). Classic, null and an unresolvable
    // stamp pass nothing: the prompt is then byte-identical to before.
    const prevStamp = draftCompositionStamp(draft)
    let compositionContract: { label: string; version: number; size: SizeContract; canvas?: { width: number; height: number } } | undefined
    if (prevStamp && prevStamp.appliedArchetype !== 'classic' && prevStamp.contractVersion !== null) {
      const size = contractAt(prevStamp.appliedArchetype, prevStamp.contractVersion, draft.brief.aspectRatio)
      if (size) {
        // 025 A1: a composite draft's prompt names the stamped screen rect (the
        // one the screenshot fills), not the contract's target region.
        const screen = prevStamp.composites?.[0]?.rect
        compositionContract = {
          label: styleLabel(prevStamp.appliedArchetype),
          version: prevStamp.contractVersion,
          size: screen ? withDetectedScreen(size, screen) : size,
          canvas: { width, height },
        }
      } else {
        console.warn(
          `[refine] draft ${draft.id}: stamp ${prevStamp.appliedArchetype} v${prevStamp.contractVersion} does not resolve; contract omitted`,
        )
      }
    }
    // A refine that made a new background replaced the hero image, and no check
    // runs on it: a non-classic draft is re-stamped classic. A classic draft
    // keeps its stamp (refineReplacedStamp returns it unchanged).
    const commitStamp = prevStamp && background.url ? refineReplacedStamp(prevStamp) : prevStamp

    // 031 FR-22: code adds the kit's fonts to the refined document before it is written (the
    // commit, the rejected render "Use anyway" may adopt, and a conflict's withheld HTML that an
    // Override commits). Idempotent, so a document that already carries them is unchanged.
    const fontPlan = postFontPlan(kit)

    // 027 FR-09: the image rules of the draft's STAMPED post style, at the
    // stamped version. No stamp, or one that no longer resolves, passes none
    // (the unresolvable case warns once); it never fails a refine.
    const postStyle = draftPostStyleStamp(draft)
    const imageRules = imageRulesAtStamp(postStyle, draft.id)

    const systemPrompt = buildRefineSystemPrompt({
      kit,
      mode,
      width,
      height,
      hasInlineAssets,
      backgroundImageUrl,
      compositionContract,
      imageRules,
    })
    const userMessage = (retryReasons?: string[]) =>
      buildRefineUserMessage({ slimHtml, hasHtml: !!draft.htmlContent, instruction, width, height, retryReasons })

    // The before document is the same on both attempts, so its facts are
    // extracted once — started now, overlapping the first refine call. Never
    // rejects: on failure verifyRefine extracts (and fails closed) itself.
    // (025: slimHtml has the screenshot element stripped, so it renders with no
    // composite argument; the before and after documents are compared like for like.)
    const beforeFacts = extractDomFacts(slimHtml, { width, height, inlineAssets }).catch(() => undefined)

    const result = await runRefineAttempts<ConflictMarker>(
      { model, inlineAssets },
      {
        // Neither runner renders in refine mode: only the document finally
        // kept is rendered (below), so a missed attempt leaves no export.
        //
        // Stale-sweep heartbeat (T17 fix round 1). The lazy sweep in
        // drafts/recovery.ts clears an action whose Draft.updatedAt is
        // STUCK_GENERATION_MS (15 min = 900 s) old. A verified refine can run
        // two attempts, so each attempt start bumps updatedAt (only while this
        // claim is held), and so does the settle below, before its final
        // render (008 FR-12). The segments between bumps (claim → attempt 1,
        // attempt → next bump, pre-settle → settled) are modelled with every
        // eligible model's timeout in src/lib/models/budget.ts, and
        // tests/unit/actionBudget.test.ts fails if any can reach 900 s, so the
        // sweep cannot fire on a refine that is still verifying, and a run
        // killed mid-way is still swept 15 min after its last bump. (A
        // rejected personal token adds one fast failed CLI spawn before the
        // team-token retry, not a second timeout; the margin absorbs renderer
        // queueing under PUPPETEER_MAX_CONCURRENCY.)
        runRefine: async ({ attempt, model, retryReasons }) => {
          await touchDraftAction(draft.id, claim)
          return mode === 'cli'
            ? runDesignAgentCliRefine({ systemPrompt, userMessage: userMessage(retryReasons), model })
            : runDesignAgentRefine({
                systemPrompt,
                userMessage: userMessage(retryReasons),
                briefId: draft.brief.id,
                model,
                maxToolCalls: 15,
                width,
                height,
                actor,
                refine: { attempt, instruction, slimHtml },
              })
        },
        // The verifier runs on its own fixed internal model inside verifyRefine
        // (008 FR-15: INTERNAL_VERIFIER), never on the refine's.
        verify: async (req) => {
          let modelCalls = 0
          const verdict = await verifyRefine({
            instruction,
            classes: req.classes,
            supersedes: req.supersedes,
            constrains: req.constrains,
            beforeHtml: slimHtml,
            afterHtml: req.afterHtml,
            inlineAssets,
            width,
            height,
            teamId: user.teamId,
            attempt: req.attempt,
            beforeFacts: await beforeFacts,
            onVerifierCall: () => {
              modelCalls++
            },
          })
          return { result: verdict, modelCalls }
        },
        // Conflict-card detection is an API-mode feature; CLI mode applies the
        // edit directly. Checked before the envelope is parsed.
        parseConflict: mode === 'api' ? parseConflict : undefined,
      },
    )

    if (result.kind === 'not-applied') {
      trace.fields.refineCalls = result.diagnostics.refineCalls
      trace.fields.verifierCalls = result.diagnostics.verifierCalls
      trace.fields.attempts = result.diagnostics.attempts.map(summariseAttempt)
    } else {
      trace.fields.refineCalls = result.refineCalls
      trace.fields.verifierCalls = result.verifierCalls
      if (result.kind === 'accepted') trace.fields.attempts = result.attempts
      else trace.outcome = 'conflict'
    }

    // 'not-applied' tells startDraftAction to keep the outcome recorded below.
    return settleRefine(result, {
      commit: async (html) => {
        // The pre-commit heartbeat (008 FR-12): the final render + commit is
        // its own budget segment, not the tail of the last attempt's.
        await touchDraftAction(draft.id, claim)
        // No export key: commitDraftRevision renders + uploads this document —
        // the one that was verified (Ruling D).
        await commitDraftRevision({
          draftId: draft.id,
          instruction,
          html: applyPostFonts(html, fontPlan, postFontsUrl),
          width,
          height,
          backgroundImageUrl,
          backgroundSkip: refineSkipFields(background),
          imageSource: refineImageSource(background),
          // 008 FR-08: the revision and the draft record the refine's model.
          model,
          // 019: the final draft write is guarded on this run's claim.
          claim,
          // 009 FR-12/FR-13: the carried stamp, or the re-stamp when this refine
          // replaced the background.
          composition: commitStamp,
          // 027: a refine keeps the rules the draft was made under.
          postStyle,
        })
      },
      conflict: async (conflict) => {
        // 019: guarded on the claim. A run the sweep cleared (or a newer claim
        // superseded) writes nothing, and startDraftAction's complete then
        // misses too.
        const { count } = await prisma.draft.updateMany({
          where: { id: draft.id, ...claimWhere(claim) },
          data: {
            pendingConflict: {
              conflictId: randomUUID(),
              // Restore externalized assets so the withheld HTML renders correctly
              // if the user clicks Override later.
              pendingHtml: applyPostFonts(
                restoreInlineAssets(conflict.pendingHtml, inlineAssets),
                fontPlan,
                postFontsUrl,
              ),
              explanation: conflict.explanation,
              // 008 A6: what wrote pendingHtml, for the Override's stamp.
              model: model.arg,
              modelSubstitutedFrom: model.substitutedFrom,
            },
          },
        })
        if (count !== 1) logLostClaim(draft.id, claim)
        // The conflict is a clean completion of the action — startDraftAction
        // releases the claim; the client learns of the conflict from the draft
        // GET's pendingConflict-derived field, not from this route's response.
      },
      reject: async (notApplied) => {
        console.warn(
          `[refine] draft ${draft.id}: not applied after ${notApplied.diagnostics.refineCalls} attempts — ${notApplied.reason}`,
        )
        // The same heartbeat as commit's: the rejected render is rendered too.
        await touchDraftAction(draft.id, claim)
        await recordRejectedRender({
          draftId: draft.id,
          instruction,
          html: notApplied.html ? applyPostFonts(notApplied.html, fontPlan, postFontsUrl) : notApplied.html,
          unusableHtml: notApplied.unusableHtml,
          width,
          height,
          reason: notApplied.reason,
          diagnostics: notApplied.diagnostics,
          // 008 FR-08: the rejected render records the attempt's model.
          model,
          // The rejected render carries the same stamp a commit would: if it also
          // replaced the background, "Use anyway" adopts a classic render.
          composition: commitStamp,
          postStyle,
          claim,
        })
      },
    })
  }, undefined, trace)

  return NextResponse.json({ ok: true }, { status: 202 })
})

// The synchronous Override commit: renders the withheld HTML (no model call).
async function commitRevision(
  draftId: string,
  instruction: string,
  newHtml: string,
  width: number,
  height: number,
  model: ModelStamp,
  composition: CompositionStamp | null,
  postStyle: PostStyleStamp | null,
  who: { teamId: string; userId: string },
) {
  let committed: Awaited<ReturnType<typeof commitDraftRevision>>
  try {
    committed = await commitDraftRevision({
      draftId,
      instruction,
      html: newHtml,
      width,
      height,
      model,
      composition,
      postStyle,
    })
  } catch (err) {
    // 025 FR-16: the screenshot could not be placed; nothing was written.
    if (err instanceof CompositePlacementError) {
      return NextResponse.json({ error: err.message, code: 'composite-not-placed' }, { status: 422 })
    }
    throw err
  }
  const { revisionId, exportKey } = committed
  // 006 FR-06: the override is a revision with its own event, after the write.
  await track('revision.override', { source: 'web', teamId: who.teamId, userId: who.userId, draftId, outcome: 'ok', payload: {} })

  return NextResponse.json({
    reply: 'Design updated',
    revisionId,
    exportUrl: await resolveExportUrl(exportKey),
  })
}
