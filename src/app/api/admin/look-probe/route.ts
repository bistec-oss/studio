import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Brief } from '@prisma/client'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { generateBackgroundForBrief } from '@/lib/agent/background'
import { withClaudeAuth } from '@/lib/agent/userToken'
import { planComposition, BLANK_STDDEV_MAX, archetypes } from '@/lib/designData'
import { BUCKET_IMAGES, deleteObject } from '@/lib/storage/minio'
import { MOCK_AI } from '@/lib/testHooks'

// OP-025 probe (025 FR-09). A super-admin operator tool: one hero image with the
// shipped prompt and the shipped pixel check, so the real-image check tests what
// ships. One Haiku decision call and one image call per request, and no draft,
// brief or other row is written. The persisted IMAGES object is deleted once the
// response body is built. 404 in production, checked before anything else.

const bodySchema = z
  .object({
    key: z.string().min(1).max(64),
    size: z.enum(['SQUARE', 'PORTRAIT', 'STORY']),
    // 031 FR-48: plan this contract version instead of the look's `current` (OP-031 checks a
    // candidate version). At most the look's latest version. This route is the only caller that
    // may pass one (planOverrideBoundary.test.ts).
    version: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (b) => {
      if (b.version === undefined) return true
      const versions = archetypes[b.key]?.versions
      return !!versions && b.version <= Math.max(...Object.keys(versions).map(Number))
    },
    { message: 'version is above the latest version of this look', path: ['version'] },
  )

const PROBE_TOPIC = 'Product screen probe'

export const POST = withTeamAuth(async (req, _ctx, user) => {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!user.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { key, size, version } = body.data

  const plan = planComposition({ imageStyle: key, aspectRatio: size, hasCompositeSource: true }, undefined, { version })
  if (plan.kind !== 'hero') {
    return NextResponse.json({ error: `Not a hero look at this size (${plan.fallbackReason ?? 'classic'})` }, { status: 400 })
  }

  const kit = await resolveBrandKit(user.teamId)
  if (!kit) return NextResponse.json({ error: 'The team has no brand kit' }, { status: 409 })

  // Under MOCK_AI the background seam only runs for a __MOCK_BG__ sentinel in the topic.
  const topic = MOCK_AI ? `${PROBE_TOPIC} __MOCK_BG__` : PROBE_TOPIC
  const brief = {
    topic,
    description: 'A laptop showing the product, for the check of the blank screen.',
    goal: null,
    tone: null,
    aspectRatio: size,
    designMode: 'GENERATE',
    imageProviderKey: null,
    postStyle: null,
  } as unknown as Brief

  let imagePrompt: string | null = null
  // The Haiku decision call runs through `claude -p` in CLI mode, which needs the
  // acting user's credential context, exactly as generation sets it.
  const outcome = await withClaudeAuth(user.userId, user.teamId, () =>
    generateBackgroundForBrief(
      brief,
      kit,
      PROBE_TOPIC,
      null,
      { userId: user.userId, teamId: user.teamId },
      plan,
      (p) => {
        imagePrompt = p
      },
    ),
  )

  if (outcome.url === null) {
    return NextResponse.json({ error: 'No image was produced', skip: outcome.skip, detail: outcome.detail ?? null }, { status: 502 })
  }

  const objectKey = outcome.url.includes(`/${BUCKET_IMAGES}/`) ? outcome.url.split(`/${BUCKET_IMAGES}/`)[1] : null
  try {
    const img = await fetch(outcome.url)
    if (!img.ok) return NextResponse.json({ error: `The image could not be read back (${img.status})` }, { status: 502 })
    const type = img.headers.get('content-type') ?? 'image/png'
    const image = `data:${type};base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`
    const verdict = outcome.check ?? { ok: false as const, reason: 'check-error' as const }
    // The screen the detector found (025 A1), or null when there is none.
    const rect = verdict.ok ? (verdict.composites?.[0]?.rect ?? null) : null
    return NextResponse.json({
      verdict,
      rect,
      fallbackReason: verdict.ok ? null : verdict.reason,
      threshold: BLANK_STDDEV_MAX,
      promptHash: createHash('sha256').update(imagePrompt ?? '').digest('hex'),
      image,
    })
  } finally {
    if (objectKey) await deleteObject(BUCKET_IMAGES, objectKey).catch(() => undefined)
  }
})
