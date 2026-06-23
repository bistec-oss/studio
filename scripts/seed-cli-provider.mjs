/**
 * Registers a "cli" COPY provider so the brief wizard can run end-to-end
 * without API keys — copy + design are driven by the local Claude Code CLI
 * (requires DESIGN_PROVIDER=cli in .env). Idempotent.
 *
 *   node --env-file=.env scripts/seed-cli-provider.mjs
 *
 * Requires env: DATABASE_URL.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// The cli provider carries no real key; the registry skips decrypt() for it,
// so this placeholder is never decoded.
const PLACEHOLDER = "cli"

const cli = await prisma.availableProvider.upsert({
  where: { slot_providerKey: { slot: "COPY", providerKey: "cli" } },
  update: { isEnabled: true, isDefault: true },
  create: {
    slot: "COPY",
    providerKey: "cli",
    providerName: "cli",
    label: "Claude CLI (local, no API key)",
    keyPrefix: "cli",
    encryptedApiKey: PLACEHOLDER,
    isEnabled: true,
    isDefault: true,
  },
})

console.log(`CLI copy provider ready: ${cli.label} (key=${cli.providerKey}, default=${cli.isDefault})`)
console.log("Set DESIGN_PROVIDER=cli in .env to route copy + design through the local CLI.")

await prisma.$disconnect()
