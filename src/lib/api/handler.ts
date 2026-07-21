import { NextRequest, NextResponse } from 'next/server'
import type { ZodType, ZodTypeDef } from 'zod'
import type { TeamRole } from '@prisma/client'
import { getCurrentUser, hasRole, type Role } from '@/lib/auth'
import { resolveActiveTeam, ACTIVE_TEAM_COOKIE } from '@/lib/authz/teamContext'

// Shared route-handler infrastructure: one place for the auth check, the
// role gate, JSON-body parsing/validation, and the unexpected-error envelope.
// Handlers written with these wrappers can't forget an auth check, 500 on a
// malformed body, or invent a new error shape.

export interface AuthedUser {
  userId: string
  role: Role
}

// Next 15+/16: route-handler `params` is a Promise. The wrapper awaits it once
// and hands handlers a RESOLVED params object, so the 30+ call sites keep their
// synchronous `{ params }` destructuring.
type IncomingRouteContext<P> = { params: Promise<P> }
type RouteContext<P> = { params: P }

type AuthedHandler<P> = (
  req: NextRequest,
  ctx: RouteContext<P>,
  user: AuthedUser
) => Promise<NextResponse> | NextResponse

// Wraps a handler with session resolution (401 when absent), an optional admin
// gate (403), and a catch-all that logs and returns a uniform 500 envelope
// instead of Next's opaque default.
export function withAuth<P = Record<string, string>>(
  handler: AuthedHandler<P>,
  opts: { role?: 'admin' | 'super_admin' } = {}
) {
  return async (req: NextRequest, ctx: IncomingRouteContext<P>): Promise<NextResponse> => {
    try {
      const user = await getCurrentUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (opts.role && !hasRole(user.role, opts.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return await handler(req, { params: await ctx.params }, user)
    } catch (err) {
      console.error(`[api] ${req.method} ${req.nextUrl.pathname} failed:`, err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}

export function withAdmin<P = Record<string, string>>(handler: AuthedHandler<P>) {
  return withAuth(handler, { role: 'admin' })
}

export function withSuperAdmin<P = Record<string, string>>(handler: AuthedHandler<P>) {
  return withAuth(handler, { role: 'super_admin' })
}

export interface TeamAuthedUser {
  userId: string
  teamId: string
  teamRole: TeamRole
  isSuperAdmin: boolean
}

type TeamAuthedHandler<P> = (
  req: NextRequest,
  ctx: RouteContext<P>,
  user: TeamAuthedUser,
) => Promise<NextResponse> | NextResponse

// Team-scoped twin of withAuth: resolves the active team (cookie validated
// against memberships) and refuses to run without one. Personal routes that
// must work with zero memberships (/api/me/*) keep plain withAuth.
export function withTeamAuth<P = Record<string, string>>(
  handler: TeamAuthedHandler<P>,
  opts: { teamRole?: 'ADMIN' } = {},
) {
  return async (req: NextRequest, ctx: IncomingRouteContext<P>): Promise<NextResponse> => {
    try {
      const user = await getCurrentUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const isSuperAdmin = hasRole(user.role, 'super_admin')
      const cookieTeamId = req.cookies.get(ACTIVE_TEAM_COOKIE)?.value ?? null
      const resolved = await resolveActiveTeam(user.userId, cookieTeamId, isSuperAdmin)
      if (resolved.kind === 'no-team') {
        return NextResponse.json({ error: 'You are not a member of any team' }, { status: 403 })
      }
      if (resolved.kind === 'choice-required') {
        return NextResponse.json(
          { error: 'Choose a team', code: 'team-choice-required' },
          { status: 409 },
        )
      }
      if (opts.teamRole === 'ADMIN' && resolved.teamRole !== 'ADMIN' && !isSuperAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return await handler(
        req,
        { params: await ctx.params },
        {
          userId: user.userId,
          teamId: resolved.teamId,
          teamRole: resolved.teamRole,
          isSuperAdmin,
        },
      )
    } catch (err) {
      console.error(`[api] ${req.method} ${req.nextUrl.pathname} failed:`, err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}

export function withTeamAdmin<P = Record<string, string>>(handler: TeamAuthedHandler<P>) {
  return withTeamAuth(handler, { teamRole: 'ADMIN' })
}

// Parses and validates the JSON body. Returns { data } on success or
// { response } (a ready 400) on malformed JSON / schema failure — callers
// early-return the response, keeping handler bodies linear:
//
//   const body = await parseBody(req, schema)
//   if (body.response) return body.response
//   ... use body.data
export async function parseBody<Out, Def extends ZodTypeDef, In>(
  req: NextRequest,
  schema: ZodType<Out, Def, In>
): Promise<{ data: Out; response?: undefined } | { data?: undefined; response: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue.path.join('.')
    return {
      response: NextResponse.json(
        { error: path ? `${path}: ${issue.message}` : issue.message },
        { status: 400 }
      ),
    }
  }
  return { data: parsed.data }
}
