/**
 * Team-tenancy E2E fixture: two teams with real memberships + one baseline
 * content fixture set each, so the cross-tenant isolation suite
 * (tests/e2e/team-isolation.test.ts) has real cross-team rows to assert
 * against, and the pre-existing E2E catalog (which all runs as Bistec users)
 * keeps working once a second team exists in the database.
 *
 *   node --env-file=.env.test scripts/seed-teams.mjs
 *
 * Requires: scripts/seed-admin.mjs and scripts/seed-editor.mjs to have run
 * first (this script looks up admin@bisteccare.lk / editor@bisteccare.lk by
 * email and fails loudly if either is missing).
 *
 * Idempotent: every step is a find-or-create / upsert, safe to re-run.
 *
 * Produces:
 *   - Team "Bistec" (already created unconditionally by the team_tenancy_b
 *     migration's backfill — this script only adds memberships) with
 *     adminBTG as TeamRole.ADMIN and editor as TeamRole.EDITOR.
 *   - Team "ClientX" (new) with a new user `clientx.admin` (fixed test
 *     password, platform role ADMIN, TeamRole.ADMIN in ClientX).
 *   - Per team: one BrandKit, one Campaign (linked to that kit), one
 *     uncategorized Brief+Draft (EXPORTED), one campaign-linked Brief+Draft
 *     (EXPORTED). Drafts are written directly via Prisma (bypassing
 *     generation) — exportUrl is a plausible EXPORTS-bucket key, which
 *     resolveExportUrl can presign without the object needing to actually
 *     exist in MinIO (presigning is a pure computation, not an existence
 *     check), so no real upload is needed for these fixtures.
 */
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
})

const FIXED_TEST_PASSWORD = "BistecStudio2026!"

const ADMIN_EMAIL = "admin@bisteccare.lk"
const EDITOR_EMAIL = "editor@bisteccare.lk"

const CLIENTX_ADMIN_USERNAME = "clientx.admin"
const CLIENTX_ADMIN_EMAIL = `${CLIENTX_ADMIN_USERNAME}@users.bistec.internal`

async function ensureTeam(name) {
  const existing = await prisma.team.findUnique({ where: { name } })
  if (existing) return existing
  const created = await prisma.team.create({ data: { name } })
  console.log(`Created team "${name}" (${created.id})`)
  return created
}

async function ensureMembership(teamId, userId, role) {
  await prisma.teamMembership.upsert({
    where: { teamId_userId: { teamId, userId } },
    update: { role },
    create: { teamId, userId, role },
  })
}

async function ensureClientXAdmin() {
  const existing = await prisma.user.findUnique({ where: { email: CLIENTX_ADMIN_EMAIL } })
  if (existing) return existing

  await auth.api.signUpEmail({
    body: { name: "ClientX Admin", email: CLIENTX_ADMIN_EMAIL, password: FIXED_TEST_PASSWORD },
  })
  const user = await prisma.user.update({
    where: { email: CLIENTX_ADMIN_EMAIL },
    data: {
      role: "ADMIN",
      username: CLIENTX_ADMIN_USERNAME.toLowerCase(),
      displayUsername: CLIENTX_ADMIN_USERNAME,
    },
  })
  console.log(`Created user "${CLIENTX_ADMIN_USERNAME}" (${user.id})`)
  return user
}

// One brand kit, one campaign (linked to it), one uncategorized brief+draft,
// one campaign-linked brief+draft — all find-or-create by a stable name
// scoped to the team, so re-running this script is a no-op.
async function ensureTeamFixtures(teamId, teamLabel, ownerId) {
  const kitName = `${teamLabel} Kit`
  let kit = await prisma.brandKit.findFirst({ where: { teamId, name: kitName, isDeleted: false } })
  if (!kit) {
    kit = await prisma.brandKit.create({
      data: { teamId, name: kitName, colors: ["#0284c7"], fonts: [], isDefault: false },
    })
    console.log(`  [${teamLabel}] brand kit "${kitName}" (${kit.id})`)
  }

  const campaignName = `${teamLabel} Campaign`
  let campaign = await prisma.campaign.findFirst({
    where: { teamId, name: campaignName, isDeleted: false },
  })
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: { teamId, name: campaignName, brandKitId: kit.id },
    })
    console.log(`  [${teamLabel}] campaign "${campaignName}" (${campaign.id})`)
  }

  async function ensureExportedBriefDraft(topic, campaignId) {
    let brief = await prisma.brief.findFirst({ where: { teamId, topic } })
    if (!brief) {
      brief = await prisma.brief.create({
        data: {
          teamId,
          userId: ownerId,
          campaignId: campaignId ?? null,
          brandKitId: campaignId ? null : kit.id,
          topic,
          goal: "Awareness",
          tone: "professional",
          channels: ["INSTAGRAM"],
          designMode: "GENERATE",
          copyProviderKey: "cli",
        },
      })
    }
    let draft = await prisma.draft.findFirst({ where: { briefId: brief.id } })
    if (!draft) {
      draft = await prisma.draft.create({
        data: {
          teamId,
          briefId: brief.id,
          copyText: `${topic} — seeded fixture copy.`,
          htmlContent: `<div style="font-family:sans-serif;padding:40px">${topic}</div>`,
          status: "EXPORTED",
          exportUrl: `exports/seed-${brief.id}.png`,
          currentRevisionNumber: 1,
        },
      })
      await prisma.draftRevision.create({
        data: {
          draftId: draft.id,
          revisionNumber: 1,
          instruction: "Original design",
          htmlSnapshot: draft.htmlContent,
          exportUrl: draft.exportUrl,
        },
      })
      console.log(`  [${teamLabel}] brief+draft "${topic}" (brief ${brief.id}, draft ${draft.id})`)
    }
    return { brief, draft }
  }

  const uncategorized = await ensureExportedBriefDraft(`${teamLabel} Uncategorized Post`, null)
  const underCampaign = await ensureExportedBriefDraft(`${teamLabel} Campaign Post`, campaign.id)

  return { kit, campaign, uncategorized, underCampaign }
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })
  const editor = await prisma.user.findUnique({ where: { email: EDITOR_EMAIL } })
  if (!admin || !editor) {
    throw new Error(
      "Run scripts/seed-admin.mjs and scripts/seed-editor.mjs first (admin/editor users not found)",
    )
  }

  const bistec = await ensureTeam("Bistec")
  const clientx = await ensureTeam("ClientX")

  await ensureMembership(bistec.id, admin.id, "ADMIN")
  await ensureMembership(bistec.id, editor.id, "EDITOR")

  const clientxAdmin = await ensureClientXAdmin()
  await ensureMembership(clientx.id, clientxAdmin.id, "ADMIN")

  console.log("Bistec team fixtures:")
  await ensureTeamFixtures(bistec.id, "Bistec", editor.id)

  console.log("ClientX team fixtures:")
  await ensureTeamFixtures(clientx.id, "ClientX", clientxAdmin.id)

  console.log("\nTeams ready:")
  console.log(`  Bistec  (${bistec.id}) — adminBTG=ADMIN, editor=EDITOR`)
  console.log(`  ClientX (${clientx.id}) — ${CLIENTX_ADMIN_USERNAME}=ADMIN (password: ${FIXED_TEST_PASSWORD})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
