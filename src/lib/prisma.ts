import { PrismaClient } from "@prisma/client"
import { env } from "@/lib/env"

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

export const prisma = globalThis.prisma ?? new PrismaClient()

if (env.NODE_ENV !== "production") {
  globalThis.prisma = prisma
}
