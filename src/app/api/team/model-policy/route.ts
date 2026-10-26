import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { MODEL_KEYS, USER_SURFACES, type UserSurface } from '@/lib/models/catalogue'
import { loadTeamPolicy, policyInfo, saveTeamPolicy } from '@/lib/models/policy'

// The team's model policy (008 FR-05, FR-13): which models the team may run,
// a default per user surface, and the "Opus requires a personal token" switch.
// Team admins only (super-admins pass); editors get 403 from withTeamAdmin.
// teamId comes only from the session, never from the body.

export const GET = withTeamAdmin(async (_req, _ctx, user) => {
  return NextResponse.json(policyInfo(await loadTeamPolicy(user.teamId)))
})

const modelKey = z.enum(MODEL_KEYS)

// Closed vocabularies at the boundary (NFR-05): unknown keys, unknown surfaces
// and unknown fields are all 400s. A null default = "use the system default".
const putSchema = z
  .object({
    allowed: z.array(modelKey).max(MODEL_KEYS.length),
    defaults: z
      .object(
        Object.fromEntries(USER_SURFACES.map((s) => [s, modelKey.nullable().optional()])) as Record<
          UserSurface,
          z.ZodOptional<z.ZodNullable<typeof modelKey>>
        >,
      )
      .strict(),
    requirePersonalTokenForGated: z.boolean(),
  })
  .strict()

// Replaces the whole policy: validated per FR-05 (rules 1–4) before anything
// is written, then stored in one transaction.
export const PUT = withTeamAdmin(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, putSchema)
  if (body.response) return body.response

  const saved = await saveTeamPolicy(user.teamId, body.data)
  if (!saved.ok) return NextResponse.json({ error: saved.message }, { status: 400 })
  return NextResponse.json(policyInfo(saved.policy))
})
