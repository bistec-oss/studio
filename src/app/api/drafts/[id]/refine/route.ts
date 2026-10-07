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
import { dimensionsFor } from '@/lib/aspectRatio'
import { modelFor, pathForDesignMode, pipelineMode } from '@/lib/agent/config'
import { buildRefineSystemPrompt, buildRefineUserMessage } from '@/lib/agent/prompts/refine'
import { generateBackgroundForRefine } from '@/lib/agent/background'
import { refineSkipFields } from '@/lib/drafts/backgroundNotice'
import { commitDraftRevision, recordRejectedRender } from '@/lib/drafts/revisions'
import { claimDraftAction, startDraftAction, touchDraftAction } from '@/lib/drafts/draftActions'
import { runRefineAttempts, settleRefine } from '@/lib/drafts/refineAttempt'
import { verifyRefine } from '@/lib/drafts/refineVerify'
import { extractDomFacts } from '@/lib/renderer/domFacts'

interface PendingConflict {
  conflictId: string
  pendingHtml: string
  explanation: string
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
    return commitRevision(draft.id, instruction || 'Override brand kit conflict', pending.pendingHtml, width, height)
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
  const { html: slimHtml, assets: inlineAssets } = extractInlineAssets(
    draft.htmlContent ?? ''
  )
  const hasInlineAssets = Object.keys(inlineAssets).length > 0

  const mode = pipelineMode()
  // Refine uses the same model as the originating path: Path A → haiku, Path B → sonnet.
  const path = pathForDesignMode(draft.brief.designMode)

  const claimed = await claimDraftAction(draft.id, 'REFINE')
  if (!claimed) {
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
  await startDraftAction(draft.id, user.userId, user.teamId, 'REFINE', async () => {
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
    const systemPrompt = buildRefineSystemPrompt({ kit, mode, width, height, hasInlineAssets, backgroundImageUrl })
    const userMessage = (retryReasons?: string[]) =>
      buildRefineUserMessage({ slimHtml, hasHtml: !!draft.htmlContent, instruction, width, height, retryReasons })

    // The before document is the same on both attempts, so its facts are
    // extracted once — started now, overlapping the first refine call. Never
    // rejects: on failure verifyRefine extracts (and fails closed) itself.
    const beforeFacts = extractDomFacts(slimHtml, { width, height, inlineAssets }).catch(() => undefined)

    const result = await runRefineAttempts<ConflictMarker>(
      { model: modelFor(path, mode), inlineAssets },
      {
        // Neither runner renders in refine mode: only the document finally
        // kept is rendered (below), so a missed attempt leaves no export.
        //
        // Stale-sweep heartbeat (T17 fix round 1). The lazy sweep in
        // drafts/recovery.ts clears an action whose Draft.updatedAt is
        // STUCK_GENERATION_MS (15 min = 900 s) old. A verified refine can now
        // run two attempts, so each attempt start bumps updatedAt (only while
        // this claim is held). Worst case between bumps, CLI mode (prod):
        //   attempt 1 → attempt 2:  refine 300 s (runClaudeCli timeout)
        //     + after-facts render 60 s (SET_CONTENT_TIMEOUT_MS; the
        //       before-facts render overlaps the refine call)
        //     + verifier 60 s (VERIFIER_TIMEOUT_MS)            ≈ 420 s
        //   attempt 2 → settled:  the same 420 s + the final render 60 s
        //     + upload + a commit/record transaction whose connection wait
        //       is capped at 10 s (TX_MAX_WAIT_MS)             ≈ 490 s
        // (a rejected personal token adds one fast failed CLI spawn before the
        // team-token retry, not a second timeout; the ~410 s margin absorbs
        // renderer queueing under PUPPETEER_MAX_CONCURRENCY). Both are well under 900 s,
        // so the sweep cannot fire on a refine that is still verifying, and a
        // run killed mid-way is still swept 15 min after its last bump.
        // claim → attempt 1 (the background pre-step: ≤ 90 s decision + image
        // generation) is unchanged by T17 and shared with regenerate-design.
        runRefine: async ({ attempt, model, retryReasons }) => {
          await touchDraftAction(draft.id, 'REFINE')
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
        // The verifier model is pinned to Haiku inside verifyRefine (FR-14b).
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

    // 'not-applied' tells startDraftAction to keep the outcome recorded below.
    return settleRefine(result, {
      commit: async (html) => {
        // No export key: commitDraftRevision renders + uploads this document —
        // the one that was verified (Ruling D).
        await commitDraftRevision({
          draftId: draft.id,
          instruction,
          html,
          width,
          height,
          backgroundImageUrl,
          backgroundSkip: refineSkipFields(background),
        })
      },
      conflict: async (conflict) => {
        await prisma.draft.update({
          where: { id: draft.id },
          data: {
            pendingConflict: {
              conflictId: randomUUID(),
              // Restore externalized assets so the withheld HTML renders correctly
              // if the user clicks Override later.
              pendingHtml: restoreInlineAssets(conflict.pendingHtml, inlineAssets),
              explanation: conflict.explanation,
            },
          },
        })
        // The conflict is a clean completion of the action — startDraftAction
        // releases the claim; the client learns of the conflict from the draft
        // GET's pendingConflict-derived field, not from this route's response.
      },
      reject: async (notApplied) => {
        console.warn(
          `[refine] draft ${draft.id}: not applied after ${notApplied.diagnostics.refineCalls} attempts — ${notApplied.reason}`,
        )
        await recordRejectedRender({
          draftId: draft.id,
          instruction,
          html: notApplied.html,
          unusableHtml: notApplied.unusableHtml,
          width,
          height,
          reason: notApplied.reason,
          diagnostics: notApplied.diagnostics,
        })
      },
    })
  })

  return NextResponse.json({ ok: true }, { status: 202 })
})

// The synchronous Override commit: renders the withheld HTML (no model call).
async function commitRevision(draftId: string, instruction: string, newHtml: string, width: number, height: number) {
  const { revisionId, exportKey } = await commitDraftRevision({
    draftId,
    instruction,
    html: newHtml,
    width,
    height,
  })

  return NextResponse.json({
    reply: 'Design updated',
    revisionId,
    exportUrl: await resolveExportUrl(exportKey),
  })
}
