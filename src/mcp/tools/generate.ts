import { prisma } from '@/lib/prisma'
import type { Channel } from '@prisma/client'
import { generateDraftForBrief, NoBrandKitError } from '@/lib/agent/generateDraft'
import { resolveExportUrl } from '@/lib/storage/minio'
import { getSystemUserId } from '@/mcp/systemUser'

interface GeneratePostArgs {
  topic: string
  goal: string
  tone: string
  channels: string[]
  designMode: 'TEMPLATE' | 'GENERATE'
  copyProviderKey?: string
  campaignId?: string
  description?: string
}

// ACP entry point for post generation — a thin adapter over the same Path B
// pipeline the web routes use (runPathBDesign), so aspect ratio, brand-kit
// precedence, per-path models, and CLI/API dispatch can never drift from the
// app. TEMPLATE mode needs a template selection this surface doesn't have.
export async function generatePost(args: GeneratePostArgs) {
  if (args.designMode === 'TEMPLATE') {
    throw new Error(
      'TEMPLATE mode is not supported via ACP — it requires selecting a brand template. Use GENERATE, or create the post in the web app.'
    )
  }

  // MCP/ACP has no team wrapper yet (Task 13) — derive from the explicit
  // campaign when the caller passed one, same rule as POST /api/briefs.
  const campaign = args.campaignId
    ? await prisma.campaign.findFirst({ where: { id: args.campaignId, isDeleted: false }, select: { teamId: true } })
    : null

  // Create the Brief row first so copy + design run off the same record the
  // web pipeline would use.
  const brief = await prisma.brief.create({
    data: {
      teamId: campaign?.teamId ?? null,
      userId: await getSystemUserId(),
      topic: args.topic,
      description: args.description,
      goal: args.goal,
      tone: args.tone,
      // Channel enum values are uppercase; tolerate lowercase from older callers.
      channels: args.channels.map((c: string) => c.toUpperCase() as Channel),
      designMode: args.designMode,
      copyProviderKey: args.copyProviderKey ?? 'env-default',
      campaignId: args.campaignId ?? null,
    },
  })

  // Shared brief→draft orchestrator: kit precedence (campaign → project →
  // system default; no explicit kit on this surface), campaign briefing, copy,
  // Path B design, Draft persistence — identical to the web routes.
  // Deliberately NOT wrapped in withClaudeAuth: MCP/ACP callers hold server
  // API keys (M2M trust boundary), not app-user sessions.
  // TODO(Task 13): the shared env credential this comment used to describe is
  // gone (Task 10) — an MCP/ACP call in CLI mode now has no ALS auth context
  // and will hard-fail with "No Claude credential available" until this
  // surface resolves the calling ApiKey's team and wraps its span in
  // withClaudeAuth(null, teamId, ...).
  try {
    const { draft } = await generateDraftForBrief(brief)
    return { draftId: draft.id, exportUrl: await resolveExportUrl(draft.exportUrl), htmlContent: draft.htmlContent }
  } catch (err) {
    if (err instanceof NoBrandKitError) {
      throw new Error(
        'No brand kit found — configure a brand kit for this campaign, or set a system default.'
      )
    }
    throw err
  }
}

export async function getDraft(args: { id: string }) {
  const draft = await prisma.draft.findUnique({
    where: { id: args.id },
    select: { copyText: true, imageUrl: true, exportUrl: true, status: true },
  })
  if (!draft) throw new Error(`Draft ${args.id} not found`)
  // exportUrl is stored as an EXPORTS object key — sign it for the caller.
  return { ...draft, exportUrl: await resolveExportUrl(draft.exportUrl) }
}
