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

// Team tenancy: AvailableProvider.teamId is required and the unique
// constraint is now (teamId, slot, providerKey). This baseline provider
// belongs in the "Bistec" team — created unconditionally by the
// team_tenancy_b migration's backfill (id 'team_bistec_default'), so it
// always exists by the time this script runs. Falls back to creating it
// here too, defensively, if run standalone.
async function ensureBistecTeamId() {
  const existing = await prisma.team.findFirst({ where: { name: "Bistec" } })
  if (existing) return existing.id
  const created = await prisma.team.create({ data: { name: "Bistec" } })
  return created.id
}

const teamId = await ensureBistecTeamId()

const cli = await prisma.availableProvider.upsert({
  where: { teamId_slot_providerKey: { teamId, slot: "COPY", providerKey: "cli" } },
  update: { isEnabled: true, isDefault: true },
  create: {
    teamId,
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
