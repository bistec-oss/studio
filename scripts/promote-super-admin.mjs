/**
 * Promotes an existing user to SUPER_ADMIN and (optionally) assigns their
 * sign-in username (accounts log in by username since the username switch).
 *
 *   node --env-file=.env scripts/promote-super-admin.mjs <email-or-username> [new-username]
 *
 * Requires env: DATABASE_URL.
 */
import { PrismaClient } from "@prisma/client"

const identifier = process.argv[2]
const newUsername = process.argv[3]
if (!identifier) {
  console.error(
    "Usage: node --env-file=.env scripts/promote-super-admin.mjs <email-or-username> [new-username]",
  )
  process.exit(1)
}

const prisma = new PrismaClient()

const user = await prisma.user.findFirst({
  where: { OR: [{ email: identifier }, { username: identifier.toLowerCase() }] },
})
if (!user) {
  console.error(`No user found with email or username: ${identifier}`)
  await prisma.$disconnect()
  process.exit(1)
}

const data = {}
if (user.role !== "SUPER_ADMIN") data.role = "SUPER_ADMIN"
if (newUsername) {
  data.username = newUsername.toLowerCase()
  data.displayUsername = newUsername
}

if (Object.keys(data).length === 0) {
  console.log(`${identifier} is already a SUPER_ADMIN — nothing to do`)
} else {
  await prisma.user.update({ where: { id: user.id }, data })
  console.log(
    `Updated ${user.email}:` +
      (data.role ? ` role ${user.role} → SUPER_ADMIN` : "") +
      (data.username ? ` username → ${newUsername}` : ""),
  )
}

await prisma.$disconnect()
