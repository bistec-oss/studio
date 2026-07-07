/**
 * Dev-only: resets the sole existing user to adminBTG / SUPER_ADMIN with
 * password "1234". Does not delete any users (there was only one to start).
 *
 *   node --env-file=.env scripts/reseed-single-admin.mjs
 */
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
})

const user = await prisma.user.findFirst()
if (!user) {
  console.log("No user found.")
  process.exit(1)
}

const ctx = await auth.$context
const hash = await ctx.password.hash("1234")

await prisma.account.updateMany({
  where: { userId: user.id, providerId: "credential" },
  data: { password: hash },
})

await prisma.user.update({
  where: { id: user.id },
  data: {
    username: "adminbtg",
    displayUsername: "adminBTG",
    role: "SUPER_ADMIN",
    disabled: false,
  },
})

console.log("Done. Username: adminBTG  Password: 1234  Role: SUPER_ADMIN")
await prisma.$disconnect()
