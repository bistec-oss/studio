import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

// Returns the current user's id + normalised role for client-side gating.
// Replaces ad-hoc /api/auth/session probing (which 404s — the better-auth
// route is /api/auth/get-session) and centralises role casing.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(user)
}
