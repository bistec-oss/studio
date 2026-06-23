import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "editor", input: false },
    },
  },
})

export type Role = "admin" | "editor"

export async function requireRole(role: Role): Promise<{ userId: string } | NextResponse> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userRole = ((session.user as { role?: string }).role ?? "editor").toLowerCase()
  if (role === "admin" && userRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return { userId: session.user.id }
}

// Returns a 403 response if the user is neither an admin nor the resource owner;
// returns null when access is allowed. Centralises the ownership check used by
// draft/brief/generation routes (IDOR guard).
export function forbiddenIfNotOwner(
  user: { userId: string; role: Role },
  ownerId: string | null | undefined,
): NextResponse | null {
  if (user.role === "admin") return null
  if (ownerId && ownerId === user.userId) return null
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

// Resolves the owning user's id for a draft (via its brief). null if not found.
export async function getDraftOwnerId(draftId: string): Promise<string | null> {
  const d = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { brief: { select: { userId: true } } },
  })
  return d?.brief.userId ?? null
}

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session) return null
  return {
    userId: session.user.id,
    // Normalise case: the DB enum stores ADMIN/EDITOR, but call sites compare
    // against lowercase "admin"/"editor".
    role: (((session.user as { role?: string }).role ?? "editor").toLowerCase()) as Role,
  }
}
