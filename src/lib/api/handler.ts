import { NextRequest, NextResponse } from 'next/server'
import type { ZodType, ZodTypeDef } from 'zod'
import { getCurrentUser, type Role } from '@/lib/auth'

// Shared route-handler infrastructure: one place for the auth check, the
// role gate, JSON-body parsing/validation, and the unexpected-error envelope.
// Handlers written with these wrappers can't forget an auth check, 500 on a
// malformed body, or invent a new error shape.

export interface AuthedUser {
  userId: string
  role: Role
}

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
  opts: { role?: 'admin' } = {}
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<NextResponse> => {
    try {
      const user = await getCurrentUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (opts.role === 'admin' && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return await handler(req, ctx, user)
    } catch (err) {
      console.error(`[api] ${req.method} ${req.nextUrl.pathname} failed:`, err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}

export function withAdmin<P = Record<string, string>>(handler: AuthedHandler<P>) {
  return withAuth(handler, { role: 'admin' })
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
