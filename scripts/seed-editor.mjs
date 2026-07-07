/**
 * Creates a non-admin EDITOR user via better-auth (so it has a credential Account
 * and can log in), used by the RBAC/IDOR E2E tests (docs/e2e-test-plan.md §A/§H).
 * Self-contained (package imports only) so it runs on plain node:
 *
 *   node --env-file=.env.test scripts/seed-editor.mjs
 *
 * Requires env: DATABASE_URL, BETTER_AUTH_SECRET (loaded from .env/.env.test).
 * Idempotent: skips if the user already exists.
 */
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { PrismaClient } from "@prisma/client"

const EDITOR_EMAIL = "editor@bisteccare.lk"
const EDITOR_PASSWORD = "BistecStudio2026!"
const EDITOR_NAME = "Editor"

const prisma = new PrismaClient()

const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
})

const existing = await prisma.user.findUnique({ where: { email: EDITOR_EMAIL } })
if (existing) {
  console.log(`User already exists: ${EDITOR_EMAIL} (role: ${existing.role})`)
  await prisma.$disconnect()
  process.exit(0)
}

await auth.api.signUpEmail({
  body: { name: EDITOR_NAME, email: EDITOR_EMAIL, password: EDITOR_PASSWORD },
})

// Ensure the role is explicitly EDITOR (the non-admin floor) regardless of the
// schema default, so the RBAC tests assert against a known-non-admin account.
// Username: accounts sign in by username since the username switch.
await prisma.user.update({
  where: { email: EDITOR_EMAIL },
  data: { role: "EDITOR", username: "editor", displayUsername: "editor" },
})

console.log("Editor user created")
console.log(`  Email:    ${EDITOR_EMAIL}`)
console.log(`  Password: ${EDITOR_PASSWORD}`)

await prisma.$disconnect()
