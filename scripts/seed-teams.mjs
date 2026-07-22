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
 *   - Team "NoKitCo" (new, final-review C1 guardrail): a third team with a
 *     `nokitco.admin` user (fixed test password, TeamRole.ADMIN) and a 'cli'
 *     COPY provider, but deliberately NO BrandKit, campaign, or drafts. Only
 *     "Bistec" gets a real isDefault=true system kit (via seed-brandkit.mjs,
 *     which runs after this script) — this team exercises resolveBrandKit's
 *     last-resort tier finding NOTHING of its own, which is exactly the
 *     shape that used to leak Bistec's default kit across tenants (see
 *     tests/e2e/team-isolation.test.ts's "kit-less team" case).
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

const NOKITCO_ADMIN_USERNAME = "nokitco.admin"
const NOKITCO_ADMIN_EMAIL = `${NOKITCO_ADMIN_USERNAME}@users.bistec.internal`

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

// The keyless "cli" COPY provider (scripts/seed-cli-provider.mjs) is now
// team-scoped (AvailableProvider.teamId + the teamId_slot_providerKey
// composite unique — team-tenancy). This script's fixtures reference
// copyProviderKey: 'cli' directly via Prisma (bypassing /api/briefs'
// validation), so it works either way for the seeded rows themselves, but a
// team with no 'cli' row of its own would fail real (non-MOCK_AI) generation
// or brief-creation validation against that key. seed-cli-provider.mjs only
// seeds Bistec's row — ensure ClientX has its own too, so the fixture isn't
// a dangling reference and both teams have equal provider parity.
async function ensureCliProvider(teamId) {
  await prisma.availableProvider.upsert({
    where: { teamId_slot_providerKey: { teamId, slot: "COPY", providerKey: "cli" } },
    update: { isEnabled: true, isDefault: true },
    create: {
      teamId,
      slot: "COPY",
      providerKey: "cli",
      providerName: "cli",
      label: "Claude CLI (local, no API key)",
      keyPrefix: "cli",
      encryptedApiKey: "cli", // placeholder; the "cli" provider never decrypts this
      isEnabled: true,
      isDefault: true,
    },
  })
}

async function ensureTeamAdminUser(email, username, displayName) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return existing

  await auth.api.signUpEmail({
    body: { name: displayName, email, password: FIXED_TEST_PASSWORD },
  })
  const user = await prisma.user.update({
    where: { email },
    data: {
      role: "ADMIN",
      username: username.toLowerCase(),
      displayUsername: username,
    },
  })
  console.log(`Created user "${username}" (${user.id})`)
  return user
}

// One brand kit, one campaign (linked to it), one uncategorized brief+draft,
// one campaign-linked brief+draft — all find-or-create by a stable name
// scoped to the team, so re-running this script is a no-op.
//
// `kitIsDefault` (final review C1 fixture gap): Bistec keeps isDefault:false
// here because seed-brandkit.mjs (which runs right after this script) creates
// the REAL "Bistec" default kit with its full voice prompt/colors/fonts — a
// pre-existing team-tenancy invariant this script must not disturb. Every
// OTHER team fixtured here (ClientX, and any future one) has no such separate
// default-kit seed script, so ITS "{team} Kit" must be the team's own default
// — otherwise resolveBrandKit's last-resort tier finds nothing for that team
// (correctly, post-C1-fix) and any campaign-less generation 422s with
// NoBrandKit. This was masked before the C1 fix: the team-default tier's
// missing teamId filter let a kit-less team silently fall through to
// Bistec's real default kit and "pass" anyway.
async function ensureTeamFixtures(teamId, teamLabel, ownerId, { kitIsDefault = false } = {}) {
  const kitName = `${teamLabel} Kit`
  let kit = await prisma.brandKit.findFirst({ where: { teamId, name: kitName, isDeleted: false } })
  if (!kit) {
    if (kitIsDefault) {
      await prisma.brandKit.updateMany({ where: { teamId, isDefault: true }, data: { isDefault: false } })
    }
    kit = await prisma.brandKit.create({
      data: { teamId, name: kitName, colors: ["#0284c7"], fonts: [], isDefault: kitIsDefault },
    })
    console.log(`  [${teamLabel}] brand kit "${kitName}" (${kit.id})`)
  } else if (kitIsDefault && !kit.isDefault) {
    // Idempotency fix-up for a DB seeded before this default-kit fix existed.
    await prisma.brandKit.updateMany({ where: { teamId, isDefault: true }, data: { isDefault: false } })
    kit = await prisma.brandKit.update({ where: { id: kit.id }, data: { isDefault: true } })
    console.log(`  [${teamLabel}] brand kit "${kitName}" marked as the team default (${kit.id})`)
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
  const nokitco = await ensureTeam("NoKitCo")

  await ensureMembership(bistec.id, admin.id, "ADMIN")
  await ensureMembership(bistec.id, editor.id, "EDITOR")

  const clientxAdmin = await ensureTeamAdminUser(CLIENTX_ADMIN_EMAIL, CLIENTX_ADMIN_USERNAME, "ClientX Admin")
  await ensureMembership(clientx.id, clientxAdmin.id, "ADMIN")

  const nokitcoAdmin = await ensureTeamAdminUser(NOKITCO_ADMIN_EMAIL, NOKITCO_ADMIN_USERNAME, "NoKitCo Admin")
  await ensureMembership(nokitco.id, nokitcoAdmin.id, "ADMIN")

  // Bistec's "cli" row is seeded by scripts/seed-cli-provider.mjs (runs after
  // this script) — ensure all three explicitly here so this script alone
  // leaves no dangling copyProviderKey: 'cli' reference regardless of run
  // order. NoKitCo needs this too (a brief needs SOME valid copyProviderKey
  // to be created at all) even though it deliberately gets no brand kit.
  await ensureCliProvider(bistec.id)
  await ensureCliProvider(clientx.id)
  await ensureCliProvider(nokitco.id)

  console.log("Bistec team fixtures:")
  await ensureTeamFixtures(bistec.id, "Bistec", editor.id)

  console.log("ClientX team fixtures:")
  await ensureTeamFixtures(clientx.id, "ClientX", clientxAdmin.id, { kitIsDefault: true })

  // NoKitCo deliberately gets NO ensureTeamFixtures call — no brand kit, no
  // campaign, no drafts. That absence is the fixture (see the file header).

  console.log("\nTeams ready:")
  console.log(`  Bistec   (${bistec.id}) — adminBTG=ADMIN, editor=EDITOR`)
  console.log(`  ClientX  (${clientx.id}) — ${CLIENTX_ADMIN_USERNAME}=ADMIN (password: ${FIXED_TEST_PASSWORD})`)
  console.log(`  NoKitCo  (${nokitco.id}) — ${NOKITCO_ADMIN_USERNAME}=ADMIN (password: ${FIXED_TEST_PASSWORD}), no brand kit`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
