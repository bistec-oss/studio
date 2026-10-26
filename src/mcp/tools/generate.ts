import { prisma } from '@/lib/prisma'
import { isPublishableChannel, PUBLISHABLE_CHANNELS } from '@/lib/channels'
import { generateDraftForBrief, NoBrandKitError } from '@/lib/agent/generateDraft'
import { resolveExportUrl } from '@/lib/storage/minio'
import { getSystemUserId } from '@/mcp/systemUser'
import { withClaudeAuth } from '@/lib/agent/userToken'
import { loadDraftCaptions } from '@/lib/captions/store'
import { resolvePostStyle, styleSummary } from '@/lib/postStyles'
import { parseFactsCheck } from '@/lib/factsCheck/types'

interface GeneratePostArgs {
  topic: string
  /** Legacy (027): picks a style only when no postStyle is given; ignored otherwise. */
  goal?: string
  tone?: string
  /** 027: a post style key (see the tool schema). An unknown key is an error. */
  postStyle?: string
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
// precedence, the team's model policy and system defaults (src/lib/models),
// and CLI/API dispatch can never drift from the app. TEMPLATE mode needs a
// template selection this surface doesn't have.
export async function generatePost(args: GeneratePostArgs, surface: 'mcp' | 'acp' = 'mcp') {
  // Channel enum values are uppercase; tolerate lowercase from older callers.
  // Only publishable channels are accepted (010, WhatsApp posting, was dropped on 2026-10-23).
  const channels = args.channels.map((c: string) => c.toUpperCase())
  if (!channels.every(isPublishableChannel)) {
    throw new Error(`channels entries must be one of: ${PUBLISHABLE_CHANNELS.join(', ')}`)
  }

  if (args.designMode === 'TEMPLATE') {
    throw new Error(
      'TEMPLATE mode is not supported via ACP — it requires selecting a brand template. Use GENERATE, or create the post in the web app.'
    )
  }

  // Task 13: the caller's team now comes from its resolved ApiKey, not a
  // campaign lookup. An explicit campaignId still must belong to that same
  // team — otherwise the new Brief would reference a campaign (and inherit
  // its brand-kit precedence) the caller has no claim to.
  let campaign: { teamId: string; defaultPostStyle: string | null; defaultTone: string | null } | null = null
  if (args.campaignId) {
    campaign = await prisma.campaign.findFirst({
      where: { id: args.campaignId, isDeleted: false },
      select: { teamId: true, defaultPostStyle: true, defaultTone: true },
    })
    if (!campaign || campaign.teamId !== args.teamId) {
      throw new Error(`Campaign ${args.campaignId} not found`)
    }
  }

  // 027 FR-06: the one resolution (explicit key, else the legacy goal, else the
  // campaign default, else General). An unknown key is a named error; it never
  // degrades to "no style". Unattended, so any image style resolves to classic.
  const resolved = resolvePostStyle({
    style: args.postStyle,
    legacyGoal: args.goal,
    campaign,
    explicit: { tone: args.tone },
    path: 'B',
    aspectRatio: 'SQUARE',
    surface: surface,
  })
  if (!resolved.ok) throw new Error(resolved.message)

  // Create the Brief row first so copy + design run off the same record the
  // web pipeline would use.
  const brief = await prisma.brief.create({
    data: {
      teamId: args.teamId,
      userId: await getSystemUserId(args.teamId),
      topic: args.topic,
      description: args.description,
      postStyle: resolved.key,
      goal: resolved.goal,
      tone: resolved.tone,
      imageStyle: resolved.imageStyle,
      channels,
      designMode: args.designMode,
      copyProviderKey: args.copyProviderKey ?? 'env-default',
      campaignId: args.campaignId ?? null,
    },
  })

  // Shared brief→draft orchestrator: kit precedence (campaign → project →
  // system default; no explicit kit on this surface), campaign briefing, copy,
  // Path B design, Draft persistence — identical to the web routes. MCP/ACP
  // callers hold server API keys (M2M trust boundary), not app-user sessions,
  // so there is no personal-token tier here — userId: null skips straight to
  // the caller's TEAM Claude credential (and, for the IMAGE provider, the
  // team's default — see resolveImageProvider). The whole model-calling span
  // (copy → background image → design) runs inside withClaudeAuth so every
  // `claude -p` it spawns shares that one resolved team credential, mirroring
  // generationRunner.ts; a team with none throws the usual no-credential
  // ClaudeCliError, caught below like any other generation failure.
  // args.teamId ?? '' guards a malformed/legacy caller the same way the
  // scheduler guards a pre-Task-15 null ScheduledGeneration.teamId — the
  // GeneratePostArgs type already requires teamId, so this is defense in depth.
  const teamId = args.teamId ?? ''
  try {
    const { draft } = await withClaudeAuth(null, teamId, () =>
      generateDraftForBrief(brief, { userId: null, teamId, source: 'mcp' })
    )
    return {
      draftId: draft.id,
      exportUrl: await resolveExportUrl(draft.exportUrl),
      htmlContent: draft.htmlContent,
      headline: draft.headline,
      captions: await captionList(draft.id),
      postStyle: resolved.key,
      factsCheck: factsCheckResult(draft.factsCheck),
    }
  } catch (err) {
    if (err instanceof NoBrandKitError) {
      throw new Error(
        'No brand kit found — configure a brand kit for this campaign, or ask a team admin to set a team default.'
      )
    }
    throw err
  }
}

// The facts check as a machine caller sees it (027 FR-13): the status and the
// flagged values with where they are, never any text. Null = never checked.
function factsCheckResult(raw: unknown) {
  const check = parseFactsCheck(raw)
  return check ? { status: check.status, flagged: check.flagged } : null
}

// The external caption list (012 FR-17): one `{channel, text, status}` per
// registry channel, in registry order. Read through the
// loader, so every registry channel has its row.
async function captionList(draftId: string) {
  const loaded = await loadDraftCaptions(draftId)
  return (loaded?.captions ?? []).map(({ channel, text, status }) => ({ channel, text, status }))
}

export async function getDraft(args: { id: string; teamId: string }) {
  const draft = await prisma.draft.findUnique({
    where: { id: args.id },
    select: {
      headline: true,
      imageUrl: true,
      exportUrl: true,
      status: true,
      teamId: true,
      postStyle: true,
      factsCheck: true,
    },
  })
  // Task 13 (reviewer follow-up): same team-bound guard as publishPost — a
  // draft belonging to a different team (or the pre-tenancy null) reads as
  // "not found" rather than leaking its existence/content across tenants.
  if (!draft || draft.teamId !== args.teamId) throw new Error(`Draft ${args.id} not found`)
  const captions = await captionList(args.id)
  // exportUrl is stored as an EXPORTS object key — sign it for the caller.
  const { teamId: _teamId, postStyle, factsCheck, ...rest } = draft
  return {
    ...rest,
    postStyle: styleSummary(postStyle)?.key ?? null,
    factsCheck: factsCheckResult(factsCheck),
    captions,
    exportUrl: await resolveExportUrl(draft.exportUrl),
  }
}
