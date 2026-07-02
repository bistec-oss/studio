/**
 * Creates the initial admin user via better-auth, then promotes to ADMIN.
 * Self-contained (package imports only) so it runs on plain node:
 *
 *   node scripts/seed-admin.mjs
 *
 * Requires env: DATABASE_URL, BETTER_AUTH_SECRET (loaded from .env if present).
 *
 * Password resolution:
 *   1. SEED_ADMIN_PASSWORD env var, when set.
 *   2. The fixed test password, ONLY when the target is the test environment:
 *      NODE_ENV=test, SEED_FIXED_CREDENTIALS=true (set by
 *      scripts/setup-test-db.mjs), or DATABASE_URL points at a *_test database
 *      (covers CI, which seeds bistec_studio_test directly). The E2E helpers in
 *      tests/helpers/api.ts log in with these fixed credentials.
 *   3. Otherwise a random 16-char password, printed ONCE below — change it
 *      after first login.
 */
import { randomBytes } from "node:crypto"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { PrismaClient } from "@prisma/client"

const ADMIN_EMAIL = "admin@bisteccare.lk"
const ADMIN_NAME = "Admin"
const FIXED_TEST_PASSWORD = "BistecStudio2026!"

function generatePassword() {
  // Random 16-char password from a mixed alphabet (no ambiguous chars).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%"
  const bytes = randomBytes(16)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
}

// True when DATABASE_URL names a *_test database (e.g. bistec_studio_test).
function targetsTestDatabase() {
  try {
    return new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "").endsWith("_test")
  } catch {
    return false
  }
}

const useFixed =
  process.env.NODE_ENV === "test" ||
  process.env.SEED_FIXED_CREDENTIALS === "true" ||
  targetsTestDatabase()

const ADMIN_PASSWORD =
  process.env.SEED_ADMIN_PASSWORD || (useFixed ? FIXED_TEST_PASSWORD : generatePassword())

const passwordSource = process.env.SEED_ADMIN_PASSWORD
  ? "from SEED_ADMIN_PASSWORD"
  : useFixed
    ? "fixed test credentials"
    : "randomly generated — shown only once"

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
console.log(`  Password: ${ADMIN_PASSWORD}  (${passwordSource})`)
console.log("Change this password after first login.")

await prisma.$disconnect()
