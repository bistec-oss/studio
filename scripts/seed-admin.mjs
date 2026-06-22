/**
 * Creates the initial admin user via better-auth, then promotes to ADMIN.
 * Self-contained (package imports only) so it runs on plain node:
 *
 *   node scripts/seed-admin.mjs
 *
 * Requires env: DATABASE_URL, BETTER_AUTH_SECRET (loaded from .env if present).
 */
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { PrismaClient } from "@prisma/client"

const ADMIN_EMAIL = "admin@bisteccare.lk"
const ADMIN_PASSWORD = "BistecStudio2026!"
const ADMIN_NAME = "Admin"

const prisma = new PrismaClient()

const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
})

const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })
if (existing) {
  console.log(`User already exists: ${ADMIN_EMAIL} (role: ${existing.role})`)
  await prisma.$disconnect()
  process.exit(0)
}

await auth.api.signUpEmail({
  body: { name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
})

await prisma.user.update({
  where: { email: ADMIN_EMAIL },
  data: { role: "ADMIN" },
})

console.log("Admin user created")
console.log(`  Email:    ${ADMIN_EMAIL}`)
console.log(`  Password: ${ADMIN_PASSWORD}`)
console.log("Change this password after first login.")

await prisma.$disconnect()
