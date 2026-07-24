import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withSuperAdmin, parseBody } from '@/lib/api/handler'
import { auth } from '@/lib/auth'

// Super-admin user management. Accounts are created with an initial password
// (internal tool — shared out-of-band); roles are set server-side only, and
// SUPER_ADMIN itself is never assignable through this API.

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  username: true,
  displayUsername: true,
  role: true,
  disabled: true,
  createdAt: true,
} as const

// Accounts sign in by username; better-auth still requires an email, so
// admin-created accounts get a synthetic internal one (unique iff username is).
function internalEmail(username: string): string {
  return `${username.toLowerCase()}@users.bistec.internal`
}

export const GET = withSuperAdmin(async () => {
  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(users)
})

// No role field: after team tenancy the global User.role no longer gates any
// team-scoped access (that comes from TeamMembership.teamRole, set when the
// user is added to a team at /admin/teams). New accounts are always created as
// the baseline EDITOR; SUPER_ADMIN is never assignable through this API.
const createSchema = z.object({
  name: z.string().trim().min(1),
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Letters, numbers, dot, dash, underscore only'),
  password: z.string().min(8),
})

export const POST = withSuperAdmin(async (req) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { name, username, password } = body.data

  const existing = await prisma.user.findUnique({ where: { username: username.toLowerCase() } })
  if (existing) {
    return NextResponse.json({ error: 'A user with this username already exists' }, { status: 409 })
  }

  // Create through better-auth so the credential Account row + password hash
  // use its own machinery (same pattern as scripts/seed-admin.mjs). The role is
  // input:false on the sign-up surface; better-auth's additionalField default
  // ('EDITOR') applies, so no explicit role write is needed.
  const email = internalEmail(username)
  await auth.api.signUpEmail({ body: { name, email, password, username } })

  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: USER_SELECT,
  })

  return NextResponse.json(user, { status: 201 })
})
