import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth } from '@/lib/api/handler'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { resolveExportUrl } from '@/lib/storage/minio'
import { runPathBDesign } from '@/lib/agent/pathB'
import { AgentToolLimitError } from '@/lib/agent/types'
import { withUserClaudeAuth } from '@/lib/agent/userToken'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { withNextRevisionNumber } from '@/lib/drafts/revisions'

export const maxDuration = 300

// Regenerates the freeform (Path B) design for a draft: produces a brand-new
// design variant from the same brief + existing copy. Before overwriting, the
// CURRENT design is snapshotted as a DraftRevision so the user can return to it
// (the response includes its revisionNumber for an immediate "Undo", and it also
// appears in the revision history). Path B only — Path A is a template fill.
export const POST = withAuth<{ id: string }>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, draft.brief.userId)
  if (forbidden) return forbidden

  if (draft.brief.designMode !== 'GENERATE') {
    return NextResponse.json(
      { code: 'NOT_PATH_B', message: 'Design regeneration is only available for Path B (freeform) drafts.' },
      { status: 400 }
    )
  }

  const kit = await resolveBrandKit(draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)
  if (!kit) {
    return NextResponse.json(
      { code: 'NO_BRAND_KIT', message: 'No brand kit found for this draft.' },
      { status: 422 }
    )
  }

  const campaignBriefing = await getActiveCampaignBriefing(draft.brief.campaignId)

  try {
    // Run the new design first — if it fails, the draft is left untouched.
    // CLI mode bills the acting user's personal Claude token when connected
    // (shared server token otherwise) — see src/lib/agent/userToken.ts.
    const result = await withUserClaudeAuth(user.userId, () =>
      runPathBDesign(draft.brief, kit, draft.copyText, campaignBriefing)
    )

    // Snapshot the design we are replacing as a revision (so "go back" works) —
    // revision-number allocation + P2002 collision retry via the shared helper.
    let previousRevisionNumber: number | null = null
    if (draft.htmlContent) {
      previousRevisionNumber = await withNextRevisionNumber(draft.id, async (tx, revisionNumber) => {
        await tx.draftRevision.create({
          data: {
            draftId: draft.id,
            revisionNumber,
            instruction: 'Design before regenerate',
            htmlSnapshot: draft.htmlContent!,
            exportUrl: draft.exportUrl ?? '',
          },
        })
        return revisionNumber
      })
    }

    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        htmlContent: result.htmlContent,
        exportUrl: result.exportUrl,
        // New background (or null when the pre-step skipped — clears the stale one).
        imageUrl: result.backgroundImageUrl,
        status: 'EXPORTED',
        pendingConflict: Prisma.JsonNull,
        promptVersion: PROMPT_VERSION,
      },
    })

    return NextResponse.json({
      exportUrl: await resolveExportUrl(result.exportUrl),
      previousRevisionNumber,
    })
  } catch (err) {
    if (err instanceof AgentToolLimitError) {
      return NextResponse.json({ code: 'AGENT_LIMIT', message: err.message }, { status: 422 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
  }
})
