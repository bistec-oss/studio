import { z } from 'zod'
import { NextResponse } from 'next/server'
import { Channel, AspectRatio, DesignMode, PostGenerationAction } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveBrandKit } from '@/lib/brandkit/resolve'

// Body schema for creating/replacing a scheduled-generation queue entry.
// PATCH sends the full entry too (the edit modal carries every field), so
// create and edit validate through one schema. DB-dependent checks (campaign
// exists, template exists/kit-match/ratio-match) live in the routes.
export const queueEntrySchema = z
  .object({
    topic: z.string().trim().min(1, 'topic is required'),
    description: z.string().trim().optional(),
    goal: z.string().trim().min(1, 'goal is required'),
    tone: z.string().trim().min(1, 'tone is required'),
    channels: z.array(z.nativeEnum(Channel)).min(1, 'at least one channel is required'),
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

// Auto-publish actions are a deferred publish, so they inherit the admin-only
// publish gate (POST /api/posts is withAdmin). HOLD entries are editor-plannable.
export function requiresAdmin(postAction: PostGenerationAction): boolean {
  return postAction !== 'HOLD'
}

// Shared DB validation for an entry's template selection (TEMPLATE mode): the
// template must exist, belong to the campaign-resolved brand kit, and be
// designed for the entry's size. Returns a ready 4xx response or null. Used by
// both queue routes (create + edit).
export async function validateTemplateSelection(
  campaignId: string,
  entry: QueueEntryInput,
): Promise<NextResponse | null> {
  if (entry.designMode !== 'TEMPLATE') return null

  const template = await prisma.brandKitTemplate.findUnique({
    where: { id: entry.templateId! },
    select: { brandKitId: true, aspectRatio: true },
  })
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const kit = await resolveBrandKit(campaignId)
  if (kit && template.brandKitId !== kit.id) {
    return NextResponse.json(
      { error: "Template does not belong to the campaign's brand kit" },
      { status: 400 }
    )
  }
  if (template.aspectRatio !== entry.aspectRatio) {
    return NextResponse.json(
      { error: "Template aspect ratio does not match the entry's selected size" },
      { status: 400 }
    )
  }
  return null
}
