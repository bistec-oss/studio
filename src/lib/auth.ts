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

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session) return null
  return {
    userId: session.user.id,
    role: ((session.user as { role?: string }).role ?? "editor") as Role,
  }
}
