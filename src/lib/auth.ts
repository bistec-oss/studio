import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export type Role = 'admin' | 'editor'

export async function requireRole(role: Role): Promise<{ userId: string } | NextResponse> {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userRole = (sessionClaims?.metadata as { role?: string })?.role
  if (role === 'admin' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { userId }
}

export async function getCurrentUser() {
  const { userId, sessionClaims } = await auth()
  if (!userId) return null
  return {
    userId,
    role: ((sessionClaims?.metadata as { role?: string })?.role ?? 'editor') as Role,
  }
}
