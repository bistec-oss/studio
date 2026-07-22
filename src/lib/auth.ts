import { betterAuth } from "better-auth"
import { APIError } from "better-auth/api"
import { username } from "better-auth/plugins"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { env } from "@/lib/env"

const BETTER_AUTH_SECRET = env.BETTER_AUTH_SECRET
if (!BETTER_AUTH_SECRET || BETTER_AUTH_SECRET === "your-32-byte-hex-secret") {
  throw new Error(
    "BETTER_AUTH_SECRET is not set or still uses the placeholder value — set a real 32-byte hex secret",
  )
}

export const auth = betterAuth({
  secret: BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  // Accounts sign in with a username; email is kept internally (better-auth
  // requires one) and synthesized for admin-created accounts.
  plugins: [username()],
  databaseHooks: {
    session: {
      create: {
        // Deactivated accounts can't sign in (getCurrentUser also nulls out
        // any session that predates deactivation — belt and braces).
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { disabled: true },
          })
          if (user?.disabled) {
            throw new APIError("FORBIDDEN", { message: "This account has been deactivated" })
          }
        },
      },
    },
  },
  user: {
    additionalFields: {
      // defaultValue must match the DB enum casing (EDITOR) — Prisma rejects
      // lowercase on create. getCurrentUser normalises to lowercase for checks.
      role: { type: "string", required: false, defaultValue: "EDITOR", input: false },
      disabled: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
})

export { hasRole, normalizeRole, type Role } from "@/lib/roles"
import { hasRole, normalizeRole, type Role } from "@/lib/roles"

export async function requireRole(role: Role): Promise<{ userId: string } | NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const sessionUser = session.user as { role?: string; disabled?: boolean }
  if (sessionUser.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!hasRole(normalizeRole(sessionUser.role), role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return { userId: session.user.id }
}

// Resolves the per-item access-check inputs for a draft (its own teamId, the
// owning user's id via its brief, and the brief's campaignId — team-shared
// per D6 when non-null). null if not found. Feeds canAccessContent()
// (src/lib/authz/visibility.ts) at every draft-keyed route.
export async function getDraftAccessInfo(
  draftId: string,
): Promise<{ teamId: string | null; ownerId: string; campaignId: string | null } | null> {
  const d = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { teamId: true, brief: { select: { userId: true, campaignId: true } } },
  })
  if (!d) return null
  return { teamId: d.teamId, ownerId: d.brief.userId, campaignId: d.brief.campaignId }
}

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const sessionUser = session.user as { role?: string; disabled?: boolean }
  // Deactivated accounts resolve to no user even with a live session cookie.
  if (sessionUser.disabled) return null
  return {
    userId: session.user.id,
    role: normalizeRole(sessionUser.role),
  }
}
