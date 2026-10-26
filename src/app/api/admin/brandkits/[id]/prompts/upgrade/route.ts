import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { parseBody, withTeamAdmin } from '@/lib/api/handler'
import { withClaudeAuth } from '@/lib/agent/userToken'
import { AssistantModelError } from '@/lib/campaign/briefingAssistant'
import { runRuleUpgrade } from '@/lib/kitUpgrade/upgrade'

type Params = { id: string }

const bodySchema = z
  .object({
    text: z.string().min(1).max(20_000),
    baseVersion: z.number().int().min(0),
  })
  .strict()

// 007 FR-05: turn vague design phrases in a draft brand voice prompt into
// measurable rules. Nothing is saved here; the author reviews each edit.
export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const kit = await prisma.brandKit.findUnique({
    where: { id: params.id },
    include: { prompts: { where: { isActive: true }, take: 1 } },
  })
  if (!kit || kit.isDeleted || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response

  const activeVersion = kit.prompts[0]?.version ?? 0
  if (body.data.baseVersion !== activeVersion) {
    return NextResponse.json({ code: 'STALE_BASE', activeVersion }, { status: 409 })
  }

  const colors = Array.isArray(kit.colors) ? (kit.colors as string[]) : []
  const fonts = Array.isArray(kit.fonts) ? (kit.fonts as Array<{ name: string; url: string }>) : []

  try {
    const result = await withClaudeAuth(user.userId, user.teamId, () =>
      runRuleUpgrade({
        roleKit: { colors, fonts },
        text: body.data.text,
        teamId: user.teamId,
        userId: user.userId,
        surface: 'ASSISTANT_BRANDKIT',
        label: 'kit-upgrade',
        logRef: { name: 'kit', id: kit.id },
      }),
    )
    if (result.status === 'parse-failed') {
      return NextResponse.json(
        {
          code: 'UPGRADE_PARSE_FAILED',
          message: 'The assistant reply could not be read. Try again.',
        },
        { status: 502 },
      )
    }
    if (result.status === 'edits') {
      return NextResponse.json({
        outcome: 'edits',
        baseVersion: body.data.baseVersion,
        edits: result.edits,
        rejected: result.rejected,
        candidates: result.candidates,
      })
    }
    return NextResponse.json({
      outcome: 'none',
      reason: result.reason,
      rejected: result.rejected,
      candidates: result.candidates,
    })
  } catch (err) {
    // 008: no model the team can run; nothing ran, say why.
    if (err instanceof AssistantModelError) {
      return NextResponse.json({ code: err.code, message: err.message }, { status: 422 })
    }
    throw err
  }
})
