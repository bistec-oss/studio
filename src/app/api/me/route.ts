import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { prisma } from '@/lib/prisma'
import { isCliMode } from '@/lib/agent/config'

// Returns the current user's id + normalised role for client-side gating.
// Replaces ad-hoc /api/auth/session probing (which 404s — the better-auth
// route is /api/auth/get-session) and centralises role casing.
// Also carries the Claude-token connection state (masked) + whether the
// server runs CLI mode, so the app shell can prompt un-connected users
// without an extra request.
export const GET = withAuth(async (_req, _ctx, user) => {
  const token = await prisma.userClaudeToken.findUnique({
    where: { userId: user.userId },
    select: { status: true, keyPrefix: true, createdAt: true },
  })
  return NextResponse.json({
    ...user,
    cliMode: isCliMode(),
    claudeToken: token
      ? { status: token.status, keyPrefix: token.keyPrefix, connectedAt: token.createdAt.toISOString() }
      : null,
  })
})
