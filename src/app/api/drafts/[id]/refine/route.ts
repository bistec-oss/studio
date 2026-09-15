import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolveExportUrl } from '@/lib/storage/minio'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { runDesignAgentCli } from '@/lib/agent/designAgentCli'
import { extractInlineAssets, reconcileInlineAssets, restoreInlineAssets } from '@/lib/agent/inlineAssets'
import { dimensionsFor } from '@/lib/aspectRatio'
import { isCliMode, modelFor, pathForDesignMode, pipelineMode } from '@/lib/agent/config'
import {
  buildRefineSystemPrompt,
  buildRefineUserMessage,
  resolveEffectiveClasses,
} from '@/lib/agent/prompts/refine'
import { DEFAULT_INSTRUCTION_CLASSES, parseRefineEnvelope } from '@/lib/agent/refineEnvelope'
import type { InstructionClass } from '@/lib/agent/instructionClasses'
import { verifyRefine, type VerificationResult } from '@/lib/drafts/refineVerify'
import { MOCK_AI } from '@/lib/testHooks'
import { generateBackgroundForRefine } from '@/lib/agent/background'
import { commitDraftRevision } from '@/lib/drafts/revisions'
import { claimDraftAction, startDraftAction } from '@/lib/drafts/draftActions'

// ── The hard cap (FR-11/AC-15) ──────────────────────────────────────────────
// "At most 2 refine calls and 2 verifier calls, under any input" is enforced by
// SHAPE, not by reading the branches below: the refine calls are the iterations
// of one bounded `for`, and the verifier calls are counted against a budget from
// verifyRefine's own `modelCalls` return rather than inferred from which class
// ran. Nothing inside an iteration can add another iteration, and an over-budget
// attempt skips verification and fails closed rather than calling again.
const MAX_REFINE_ATTEMPTS = 2
const MAX_VERIFIER_CALLS = 2

// Negative-number allocation contends on @@unique([draftId, revisionNumber])
// exactly as withNextRevisionNumber's positive one does; same retry discipline,
// same generous budget (a small one 500s under heavy concurrency — TC-REG-H7a).
const REJECTED_ALLOC_ATTEMPTS = 12

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
    // This path commits, so any not-applied outcome from an earlier refine is
    // now stale. (The model path clears it on claim instead — see below.)
    await clearNotApplied(draft.id)
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
  // notAppliedReason is a SEPARATE channel from pendingActionError (FR-14), so
  // claimDraftAction's clear does not cover it. Cleared here, as the new action
  // starts, so the poll stops reporting the previous refine's failure the moment
  // this one is under way rather than for the two minutes it runs.
  await clearNotApplied(draft.id)

  // CLI mode bills the acting user's personal Claude token when connected
  // (the team token otherwise) — startDraftAction resolves it before the
  // request unwinds and runs the whole closure inside that auth context, so the
  // background decision and the refine agent call can't observe different
  // tokens. A throw below is recorded on Draft.pendingActionError.
  await startDraftAction(draft.id, user.userId, user.teamId, async () => {
    // Background pre-step: generates a new background ONLY when the instruction
    // asks for one (e.g. "change the background to a city skyline"); null
    // otherwise, and on any failure. See agent/background.ts. actor is the
    // acting teammate (NOT the brief owner) — image-provider resolution must
    // follow whoever is running this refine.
    const backgroundImageUrl = await generateBackgroundForRefine(draft.brief, kit, instruction, {
      userId: user.userId,
      teamId: user.teamId,
    })

    // ── The refine loop (FR-07/11). One iteration = one refine call, its
    // classification, and one verification. The second iteration exists only to
    // re-issue the edit with the previous attempt's MEASURED miss made explicit;
    // a second miss ends the attempt (FR-11), whatever the class or failure kind.
    let priorMiss: string | undefined
    let rejected: RejectedRender | null = null
    let verifierCallsSpent = 0

    for (let attempt = 1; attempt <= MAX_REFINE_ATTEMPTS; attempt += 1) {
      const systemPrompt = buildRefineSystemPrompt({ kit, mode, width, height, hasInlineAssets, backgroundImageUrl })
      const userMessage = buildRefineUserMessage({
        slimHtml,
        hasHtml: !!draft.htmlContent,
        instruction,
        width,
        height,
        priorMiss,
      })

      // What one attempt yields, in the same shape from both pipeline modes.
      let classes: InstructionClass[]
      let supersedes: string[]
      // `before`/`after` MUST be on the same footing — both with inline assets
      // externalized (CLI) or both with them inlined (API). Comparing a
      // tokenized `before` against a restored `after` would make every length
      // and element measurement wrong by the size of the assets.
      let before: string
      let after: string
      let commitHtml: string
      let exportUrl: string | undefined
      // A miss established without the verifier (FR-20's placeholder mismatch).
      let preVerificationMiss: string | null = null

      // ── CLI mode: single-shot edit through the local Claude CLI (no Anthropic
      // API, no API key). Conflict-card detection is an API-mode feature; CLI
      // mode applies the edit directly.
      if (isCliMode()) {
        const result = await runDesignAgentCli({
          systemPrompt,
          userMessage,
          briefId: draft.brief.id,
          inlineAssets,
          width,
          height,
          model: modelFor(path, 'cli'),
        })

        // The envelope header lines live OUTSIDE the document, in the text
        // runDesignAgentCli discards — hence the rawReply seam. Parsing the
        // restored htmlContent instead would find no header and silently default
        // every reply to the preserving class. Null (no document at all) cannot
        // happen — the runner already threw — but defaults rather than crashes.
        const envelope = parseRefineEnvelope(result.rawReply ?? result.htmlContent)
        supersedes = envelope?.supersedes ?? []

        // FR-04 — the ROUTE decides whether a destructive class is permitted.
        // The prompt asked for a target and the parser reported what it got;
        // neither is trusted to have enforced it.
        const effective = resolveEffectiveClasses(
          envelope?.classes ?? [...DEFAULT_INSTRUCTION_CLASSES],
          supersedes,
        )
        classes = effective.classes
        if (effective.downgraded.length > 0) {
          console.warn(
            `[refine] draft ${draft.id}: ${effective.downgraded.join('/')} declared with no superseded element named — ` +
              `downgraded to ${classes.join(', ')} (FR-04); nothing will be deleted.`,
          )
        }
        if (envelope?.defaulted) {
          console.warn(
            `[refine] draft ${draft.id}: classification defaulted (${envelope.ambiguity})` +
              `${envelope.unrecognized.length > 0 ? ` — unrecognized: ${envelope.unrecognized.join(', ')}` : ''}`,
          )
        }

        before = slimHtml
        after = envelope?.html ?? result.htmlContent
        commitHtml = result.htmlContent
        exportUrl = result.exportUrl

        // FR-20 — reconciliation, not detection. Run against the model's own
        // document, which is the only place the token arithmetic is still true:
        // runDesignAgentCli has already spliced the real assets into
        // result.htmlContent. A mismatch takes the same path as a verified miss.
        if (hasInlineAssets) {
          const reconciliation = reconcileInlineAssets(Object.keys(inlineAssets), after)
          if (reconciliation.outcome === 'mismatch') {
            preVerificationMiss =
              `The image placeholders in the reply do not reconcile with the ones it was given: ` +
              `${reconciliation.unexpected.join(', ')} was never sent, or came back more than once. ` +
              `Keep every __INLINE_ASSET_n__ token exactly as written, once each.`
          } else if (reconciliation.outcome === 'restored') {
            console.warn(
              `[refine] draft ${draft.id}: reply dropped ${reconciliation.absent.length} asset placeholder(s): ${reconciliation.absent.join(', ')}`,
            )
          }
        }
      } else {
        const result = await runDesignAgent({
          systemPrompt,
          userMessage,
          briefId: draft.brief.id,
          model: modelFor(path, 'api'),
          maxToolCalls: 15,
          inlineAssets,
          width,
          height,
          actor: { userId: user.userId, teamId: user.teamId },
        })

        // The conflict protocol is API-only and is NOT a fidelity failure: the
        // model deliberately withheld the edit. It ends the action before any
        // verification, exactly as before this change.
        const conflict = parseConflict(result.htmlContent)
        if (conflict) {
          const conflictId = randomUUID()
          await prisma.draft.update({
            where: { id: draft.id },
            data: {
              pendingConflict: {
                conflictId,
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
          return
        }

        // API mode carries no envelope: its HTML arrives as a renderHtml TOOL
        // ARGUMENT, so there is no surrounding text for the header lines to sit
        // in and nothing to classify from. It therefore always takes FR-05's
        // preserving default — which is precisely today's API-mode behaviour —
        // and is verified against it. Its HTML also comes back with the inline
        // assets already restored, so `before` is the draft's stored HTML rather
        // than the tokenized copy the model saw.
        classes = [...DEFAULT_INSTRUCTION_CLASSES]
        supersedes = []
        before = draft.htmlContent ?? ''
        after = result.htmlContent
        commitHtml = result.htmlContent
        exportUrl = result.exportUrl
      }

      // MOCK_AI is a STUB, not a model: buildMockHtml is a deterministic
      // function of the prompt, and both the generation and the refine prompt
      // open with the same brand-kit colour list, so a mocked refine hands back
      // the document it was given, byte for byte. In production an unchanged
      // document is a miss ("nothing was applied") and must stay one; under the
      // stub it carries no information at all, and verifying it would fail every
      // mocked refine in suites that have nothing to do with this change.
      //
      // Deliberately narrow: it needs MOCK_AI *and* exact identity, it is inert
      // in production, and it retires itself the moment the stub varies its
      // output per instruction (T12/FR-24) — after which the full verification,
      // and its forced-miss seam, run on every mocked refine.
      if (MOCK_AI && before === after) {
        await commitRevision(draft.id, instruction, commitHtml, width, height, exportUrl, backgroundImageUrl)
        return
      }

      // ── Verification (FR-07/08/10). `unavailable` is not a third branch — it
      // routes exactly as `miss`, so there is no path on which a broken verifier
      // commits. The budget check is the arithmetic half of AC-15: it spends
      // verifyRefine's own reported modelCalls and refuses to call once the two
      // are gone, fail-closed.
      const verification: Pick<VerificationResult, 'outcome' | 'reason' | 'modelCalls'> = preVerificationMiss
        ? { outcome: 'miss', reason: preVerificationMiss, modelCalls: 0 }
        : verifierCallsSpent >= MAX_VERIFIER_CALLS
          ? {
              outcome: 'miss',
              reason: 'The verifier budget for this refine was already spent, so the edit could not be confirmed.',
              modelCalls: 0,
            }
          : await verifyRefine({ before, after, instruction, supersedes, classes })
      verifierCallsSpent += verification.modelCalls

      if (verification.outcome === 'pass') {
        await commitRevision(draft.id, instruction, commitHtml, width, height, exportUrl, backgroundImageUrl)
        return
      }

      console.warn(
        `[refine] draft ${draft.id} attempt ${attempt}/${MAX_REFINE_ATTEMPTS} ${verification.outcome} ` +
          `(classes=${classes.join(',')}, verifierCalls=${verifierCallsSpent}): ${verification.reason}`,
      )
      priorMiss = verification.reason
      rejected = { html: commitHtml, exportUrl, classes, reason: verification.reason }
    }

    // Missed twice: the edit is NOT applied (FR-12) — the chain and
    // currentRevisionNumber are left exactly as they were — and the render that
    // was thrown away is retained out of chain for diagnosis (FR-13/14).
    if (rejected) await retainRejectedRender(draft.id, instruction, rejected)
  })

  return NextResponse.json({ ok: true }, { status: 202 })
})

// The render a twice-missed refine threw away, plus everything FR-13 wants it
// labelled with.
interface RejectedRender {
  html: string
  exportUrl?: string
  classes: InstructionClass[]
  reason: string
}

// updateMany (not update) so a draft deleted mid-action is a silent no-op,
// matching releaseDraftAction.
async function clearNotApplied(draftId: string): Promise<void> {
  await prisma.draft.updateMany({ where: { id: draftId }, data: { notAppliedReason: null } })
}

// Retains the rejected render OUT OF CHAIN and records the not-applied outcome.
//
// Deliberately NOT withNextRevisionNumber: that helper allocates POSITIVE
// numbers, and the DB CHECK (DraftRevision_rejected_offchain_check, migration
// 20260915140000) requires a rejected row to be negative. The allocation is
// min(revisionNumber) - 1 floored at -1 over ALL of this draft's rows — first
// rejection -1, second -2 — so a rejection can neither collide with a chain
// number nor consume one, and the chain stays contiguous (FR-12).
//
// currentRevisionNumber is untouched and no chain row is written (AC-16); the
// ONLY draft field this writes is notAppliedReason (FR-14), which is separate
// from pendingActionError because the run did not crash — startDraftAction
// still releases the claim cleanly.
async function retainRejectedRender(
  draftId: string,
  instruction: string,
  rejected: RejectedRender
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        // The one DraftRevision read that must NOT exclude rejected rows: it
        // allocates inside the rejected rows' own number space, so filtering
        // them out would hand every rejection on a draft the number -1.
        // eslint-disable-next-line no-restricted-syntax -- allocating the rejected (out-of-chain) number space, which by definition must see rejected rows
        const lowest = await tx.draftRevision.findFirst({
          where: { draftId },
          orderBy: { revisionNumber: 'asc' },
          select: { revisionNumber: true },
        })
        await tx.draftRevision.create({
          data: {
            draftId,
            revisionNumber: Math.min(-1, (lowest?.revisionNumber ?? 0) - 1),
            instruction,
            htmlSnapshot: rejected.html,
            exportUrl: rejected.exportUrl || null,
            rejected: true,
            rejectionReason: rejected.reason,
            instructionClasses: rejected.classes,
          },
        })
        await tx.draft.update({ where: { id: draftId }, data: { notAppliedReason: rejected.reason } })
      })
      return
    } catch (err) {
      // Same contention as withNextRevisionNumber's positive allocation: two
      // concurrent rejections race for the same number and the loser recomputes.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < REJECTED_ALLOC_ATTEMPTS
      ) {
        continue
      }
      throw err
    }
  }
}

async function commitRevision(
  draftId: string,
  instruction: string,
  newHtml: string,
  width: number,
  height: number,
  exportUrl?: string,
  // Set only when the background pre-step generated a new image for this
  // instruction; undefined/null leaves Draft.imageUrl untouched.
  backgroundImageUrl?: string | null
) {
  const { revisionId, exportKey } = await commitDraftRevision({
    draftId,
    instruction,
    html: newHtml,
    width,
    height,
    exportKey: exportUrl,
    backgroundImageUrl,
  })

  return NextResponse.json({
    reply: 'Design updated',
    revisionId,
    exportUrl: await resolveExportUrl(exportKey),
  })
}
