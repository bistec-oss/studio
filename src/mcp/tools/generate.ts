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
  /** The calling ApiKey's team (resolved by the ACP route / MCP server via resolveApiKey). */
  teamId: string
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

  // Task 13: the caller's team now comes from its resolved ApiKey, not a
  // campaign lookup. An explicit campaignId still must belong to that same
  // team — otherwise the new Brief would reference a campaign (and inherit
  // its brand-kit precedence) the caller has no claim to.
  if (args.campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: args.campaignId, isDeleted: false },
      select: { teamId: true },
    })
    if (!campaign || campaign.teamId !== args.teamId) {
      throw new Error(`Campaign ${args.campaignId} not found`)
    }
  }

  // Create the Brief row first so copy + design run off the same record the
  // web pipeline would use.
  const brief = await prisma.brief.create({
    data: {
      teamId: args.teamId,
      userId: await getSystemUserId(args.teamId),
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
  // TODO(follow-up, out of Task 14's scope — that task only covered the
  // scheduler): in CLI mode this call has no ALS auth context (no personal
  // token — there's no signed-in user) and will hard-fail with "No Claude
  // credential available" until a dedicated task wraps this span in
  // withClaudeAuth(null, args.teamId, ...), mirroring generationRunner.ts.
  try {
    // userId: null — MCP/ACP callers hold server API keys (M2M trust
    // boundary, see the withClaudeAuth note above), not a signed-in teammate;
    // the IMAGE-provider resolution must skip the personal tier and fall
    // through to the team's default (see resolveImageProvider).
    const { draft } = await generateDraftForBrief(brief, { userId: null, teamId: args.teamId })
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

export async function getDraft(args: { id: string; teamId: string }) {
  const draft = await prisma.draft.findUnique({
    where: { id: args.id },
    select: { copyText: true, imageUrl: true, exportUrl: true, status: true, teamId: true },
  })
  // Task 13 (reviewer follow-up): same team-bound guard as publishPost — a
  // draft belonging to a different team (or the pre-tenancy null) reads as
  // "not found" rather than leaking its existence/content across tenants.
  if (!draft || draft.teamId !== args.teamId) throw new Error(`Draft ${args.id} not found`)
  // exportUrl is stored as an EXPORTS object key — sign it for the caller.
  const { teamId: _teamId, ...rest } = draft
  return { ...rest, exportUrl: await resolveExportUrl(draft.exportUrl) }
}
