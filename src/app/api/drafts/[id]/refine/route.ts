import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth, parseBody } from '@/lib/api/handler'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolveExportUrl } from '@/lib/storage/minio'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { runDesignAgentCli } from '@/lib/agent/designAgentCli'
import { extractInlineAssets, restoreInlineAssets } from '@/lib/agent/inlineAssets'
import { AgentToolLimitError } from '@/lib/agent/types'
import { dimensionsFor } from '@/lib/aspectRatio'
import { isCliMode, modelFor, pathForDesignMode, pipelineMode } from '@/lib/agent/config'
import { buildRefineSystemPrompt, buildRefineUserMessage } from '@/lib/agent/prompts/refine'
import { generateBackgroundForRefine } from '@/lib/agent/background'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { withNextRevisionNumber } from '@/lib/drafts/revisions'
import { resolveClaudeAuthForUser } from '@/lib/agent/userToken'
import { runWithClaudeAuth } from '@/lib/agent/claudeAuth'

export const maxDuration = 120

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

export const POST = withAuth<{ id: string }>(async (req, { params }, user) => {
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
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, draft.brief.userId)
  if (forbidden) return forbidden

  // Output canvas for this draft's brief (1080×1080 square or 1080×1350 portrait).
  const { width, height } = dimensionsFor(draft.brief.aspectRatio)

  // ── Override path: apply the previously withheld HTML without re-running compliance.
  if (overrideConflictId) {
    const pending = draft.pendingConflict as unknown as PendingConflict | null
    if (!pending || pending.conflictId !== overrideConflictId) {
      return NextResponse.json({ error: 'Conflict not found or already resolved' }, { status: 409 })
    }
    return commitRevision(draft.id, instruction || 'Override brand kit conflict', pending.pendingHtml, width, height)
  }

  // Explicit brief kit → campaign → project → system default.
  const kit = await resolveBrandKit(draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)
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

  // CLI mode bills the acting user's personal Claude token when connected
  // (shared server token otherwise). Resolved ONCE here and applied to both
  // model-calling spans below (background decision + the refine agent call)
  // so they can't observe different tokens. No-op (null) outside CLI mode.
  const claudeAuth = await resolveClaudeAuthForUser(user.userId)

  // Background pre-step: generates a new background ONLY when the instruction
  // asks for one (e.g. "change the background to a city skyline"); null
  // otherwise, and on any failure. See agent/background.ts.
  const backgroundImageUrl = await runWithClaudeAuth(claudeAuth, () =>
    generateBackgroundForRefine(draft.brief, kit, instruction)
  )

  const systemPrompt = buildRefineSystemPrompt({ kit, mode, width, height, hasInlineAssets, backgroundImageUrl })
  const userMessage = buildRefineUserMessage({
    slimHtml,
    hasHtml: !!draft.htmlContent,
    instruction,
    width,
    height,
  })

  // ── CLI mode: single-shot edit through the local Claude CLI (no Anthropic API,
  // no API key). Conflict-card detection is an API-mode feature; CLI mode applies
  // the edit directly.
  if (isCliMode()) {
    try {
      const result = await runWithClaudeAuth(claudeAuth, () =>
        runDesignAgentCli({
          systemPrompt,
          userMessage,
          briefId: draft.brief.id,
          inlineAssets,
          width,
          height,
          model: modelFor(path, 'cli'),
        })
      )
      return commitRevision(draft.id, instruction, result.htmlContent, width, height, result.exportUrl, backgroundImageUrl)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
    }
  }

  try {
    const result = await runDesignAgent({
      systemPrompt,
      userMessage,
      briefId: draft.brief.id,
      model: modelFor(path, 'api'),
      maxToolCalls: 15,
      inlineAssets,
      width,
      height,
    })

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
      return NextResponse.json({ conflict: true, explanation: conflict.explanation, conflictId })
    }

    return commitRevision(draft.id, instruction, result.htmlContent, width, height, result.exportUrl, backgroundImageUrl)
  } catch (err) {
    if (err instanceof AgentToolLimitError) {
      return NextResponse.json({ code: 'AGENT_LIMIT', message: err.message }, { status: 422 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
  }
})

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
  // finalExportUrl is an EXPORTS object key (from runDesignAgent's renderHtml).
  // The override path has no fresh render — render the pending HTML now to get a key.
  let finalExportUrl = exportUrl
  if (!finalExportUrl) {
    const { renderHtmlToPng } = await import('@/lib/renderer/puppeteer')
    const { uploadObject, exportKey, BUCKET_EXPORTS } = await import('@/lib/storage/minio')
    const buffer = await renderHtmlToPng(newHtml, width, height)
    finalExportUrl = exportKey('refine', draftId)
    await uploadObject(buffer, BUCKET_EXPORTS, finalExportUrl, 'image/png')
  }

  // Allocate the revision number, write the revision, and update the draft
  // atomically (P2002 collision retry handled by the shared helper).
  const revision = await withNextRevisionNumber(draftId, async (tx, revisionNumber) => {
    const created = await tx.draftRevision.create({
      data: {
        draftId,
        revisionNumber,
        instruction,
        htmlSnapshot: newHtml,
        exportUrl: finalExportUrl,
      },
      select: { id: true },
    })

    await tx.draft.update({
      where: { id: draftId },
      data: {
        htmlContent: newHtml,
        exportUrl: finalExportUrl,
        // The refined state becomes the active revision.
        currentRevisionNumber: revisionNumber,
        pendingConflict: Prisma.JsonNull,
        promptVersion: PROMPT_VERSION,
        ...(backgroundImageUrl ? { imageUrl: backgroundImageUrl } : {}),
      },
    })

    return created
  })

  return NextResponse.json({
    reply: 'Design updated',
    revisionId: revision.id,
    exportUrl: await resolveExportUrl(finalExportUrl),
  })
}
