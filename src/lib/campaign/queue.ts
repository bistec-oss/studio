import { z } from 'zod'
import { NextResponse } from 'next/server'
import { AspectRatio, DesignMode, PostGenerationAction, type Channel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { PUBLISHABLE_CHANNELS } from '@/lib/channels'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolvePostStyle } from '@/lib/postStyles'

// Body schema for creating/replacing a scheduled-generation queue entry.
// PATCH sends the full entry too (the edit modal carries every field), so
// create and edit validate through one schema. DB-dependent checks (campaign
// exists, template exists/kit-match/ratio-match) live in the routes.
export const queueEntrySchema = z
  .object({
    topic: z.string().trim().min(1, 'topic is required'),
    description: z.string().trim().optional(),
    // 027 FR-06: the server is the only writer of the stored goal. A body goal is
    // read only as a legacy hint (it picks a style when no postStyle is sent).
    goal: z.string().trim().optional(),
    tone: z.string().trim().optional(),
    postStyle: z.string().trim().max(40).optional().nullable(),
    // Publishable channels only (010, WhatsApp posting, was dropped on 2026-10-23).
    channels: z
      .array(z.enum(PUBLISHABLE_CHANNELS as [Channel, ...Channel[]]))
      .min(1, 'at least one channel is required'),
    aspectRatio: z.nativeEnum(AspectRatio).default('SQUARE'),
    designMode: z.nativeEnum(DesignMode),
    templateId: z.string().optional().nullable(),
    generateAt: z.coerce.date(),
    postAction: z.nativeEnum(PostGenerationAction).default('HOLD'),
    publishAt: z.coerce.date().optional().nullable(),
  })
  .superRefine((entry, ctx) => {
    if (entry.designMode === 'TEMPLATE' && !entry.templateId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['templateId'],
        message: 'templateId is required for TEMPLATE design mode',
      })
    }
    if (entry.postAction === 'SCHEDULE_PUBLISH') {
      if (!entry.publishAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['publishAt'],
          message: 'publishAt is required for SCHEDULE_PUBLISH',
        })
      } else if (entry.publishAt <= entry.generateAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['publishAt'],
          message: 'publishAt must be after generateAt',
        })
      }
    }
  })

export type QueueEntryInput = z.infer<typeof queueEntrySchema>

// Batch create (F4 auto-scheduling): the AI proposes a plan the admin approves,
// producing many entries in one call. Bounded so a runaway plan can't flood the
// queue. Each entry validates through the same per-entry schema.
export const queueBatchSchema = z.object({
  entries: z.array(queueEntrySchema).min(1, 'at least one entry is required').max(50),
})

export type QueueBatchInput = z.infer<typeof queueBatchSchema>

// Map a validated entry to Prisma create data. One mapper for the single-create
// and batch-create routes so the field handling (template/publishAt nulling)
// can never drift between them.
export function toEntryCreateData(
  campaignId: string,
  createdById: string,
  entry: QueueEntryInput,
  teamId: string,
  style: ResolvedEntryStyle,
) {
  return {
    teamId,
    campaignId,
    createdById,
    topic: entry.topic,
    description: entry.description || null,
    postStyle: style.postStyle,
    goal: style.goal,
    tone: style.tone,
    channels: entry.channels,
    aspectRatio: entry.aspectRatio,
    designMode: entry.designMode,
    templateId: entry.designMode === 'TEMPLATE' ? entry.templateId : null,
    generateAt: entry.generateAt,
    postAction: entry.postAction,
    publishAt: entry.postAction === 'SCHEDULE_PUBLISH' ? entry.publishAt : null,
  }
}

// 027 FR-06: what an entry stores once its style is resolved. The key is the
// resolved key (never null for a new or edited entry); goal and tone are
// snapshots for display (the scheduler resolves again at run time, FR-12).
export interface ResolvedEntryStyle {
  postStyle: string
  goal: string
  tone: string
}

export interface CampaignStyleDefaults {
  defaultPostStyle: string | null
  defaultTone: string | null
}

export async function loadCampaignStyleDefaults(campaignId: string): Promise<CampaignStyleDefaults | null> {
  return prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { defaultPostStyle: true, defaultTone: true },
  })
}

// One resolution shared by the queue routes (create, edit, batch): explicit key,
// else the legacy goal, else the campaign default, else General. An unknown key
// is a 400 UNKNOWN_POST_STYLE and never degrades to "no style". `index` (1-based)
// names the failing entry in the batch route.
export function resolveEntryStyle(
  defaults: CampaignStyleDefaults | null,
  entry: Pick<QueueEntryInput, 'goal' | 'tone' | 'postStyle' | 'designMode' | 'aspectRatio'>,
  index?: number,
): { ok: true; style: ResolvedEntryStyle } | { ok: false; response: NextResponse } {
  const r = resolvePostStyle({
    style: entry.postStyle,
    legacyGoal: entry.goal,
    campaign: defaults,
    explicit: { tone: entry.tone },
    path: entry.designMode === 'TEMPLATE' ? 'A' : 'B',
    aspectRatio: entry.aspectRatio,
    surface: 'queue',
  })
  if (!r.ok) {
    const error = index === undefined ? r.message : `Entry ${index}: ${r.message}`
    return { ok: false, response: NextResponse.json({ error, code: r.code }, { status: 400 }) }
  }
  return { ok: true, style: { postStyle: r.key, goal: r.goal, tone: r.tone } }
}

// Auto-publish actions are a deferred publish, so they inherit the admin-only
// publish gate (POST /api/posts is withTeamAdmin). HOLD entries are editor-plannable.
export function requiresAdmin(postAction: PostGenerationAction): boolean {
  return postAction !== 'HOLD'
}

// Shared DB validation for an entry's template selection (TEMPLATE mode): the
// template must exist, belong to the campaign-resolved brand kit, and be
// designed for the entry's size. Returns a ready 4xx response or null. Used by
// both queue routes (create + edit). `teamId` is the entry/campaign's own team
// (the routes already team-check the campaign before calling this).
export async function validateTemplateSelection(
  campaignId: string,
  entry: QueueEntryInput,
  teamId: string,
): Promise<NextResponse | null> {
  if (entry.designMode !== 'TEMPLATE') return null

  const template = await prisma.brandKitTemplate.findUnique({
    where: { id: entry.templateId! },
    select: { brandKitId: true, aspectRatio: true, brandKit: { select: { teamId: true } } },
  })
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const kit = await resolveBrandKit(teamId, campaignId)
  if (kit) {
    if (template.brandKitId !== kit.id) {
      return NextResponse.json(
        { error: "Template does not belong to the campaign's brand kit" },
        { status: 400 }
      )
    }
  } else if (template.brandKit.teamId !== teamId) {
    // I4 (final review): when the campaign resolves no kit, `kit &&` used to
    // skip validation entirely — ANY existing template id (including a
    // foreign team's) passed and was stored on the entry, later picked up by
    // the scheduler. Verify the template's own kit belongs to this team
    // directly instead of trusting the (now-null) campaign-resolved kit.
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }
  if (template.aspectRatio !== entry.aspectRatio) {
    return NextResponse.json(
      { error: "Template aspect ratio does not match the entry's selected size" },
      { status: 400 }
    )
  }
  return null
}
