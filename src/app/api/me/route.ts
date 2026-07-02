import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'

// Returns the current user's id + normalised role for client-side gating.
// Replaces ad-hoc /api/auth/session probing (which 404s — the better-auth
// route is /api/auth/get-session) and centralises role casing.
export const GET = withAuth(async (_req, _ctx, user) => {
  return NextResponse.json(user)
})
