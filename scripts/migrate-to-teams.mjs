/**
 * Backfill script for the team-tenancy conversion (Task 15): absorbs every
 * pre-team row (`teamId IS NULL`) into a single default team, "Bistec", and
 * gives every existing user a membership in it.
 *
 *   node --env-file=.env scripts/migrate-to-teams.mjs [--dry-run]
 *
 * Why: Migration A (`20260721090042_team_tenancy_a`) added `teamId String?`
 * to 12 tables plus the `Team`/`TeamMembership` tables, but did not touch
 * existing rows. All create sites now stamp `teamId` (Task 6+), so no new
 * NULLs were being written — only pre-existing rows on already-running
 * machines needed this backfill.
 *
 * This script is the dry-run/inspection tool for that backfill. The actual
 * live backfill for `prisma migrate deploy` on every machine is EMBEDDED
 * directly in Migration B's `migration.sql`
 * (`prisma/migrations/20260721120000_team_tenancy_b/migration.sql`, ahead of
 * the `SET NOT NULL` statements) so `migrate deploy` is self-contained —
 * running this script for real is optional/defensive, not the primary
 * mechanism. After Migration B, `teamId` is `NOT NULL` at the database level
 * on all 12 tables, so the per-table counts below use raw SQL (Prisma's
 * typed client rejects `{ teamId: null }` filters against a non-null
 * column) — on an up-to-date machine every count is structurally 0.
 *
 * Behaviour:
 *   - Idempotent: fixed ids (`team_bistec_default` / `tm_<userId>`) and
 *     `UPDATE ... WHERE "teamId" IS NULL` mean a re-run after the backfill
 *     has already happened is a no-op (all counts print 0).
 *   - --dry-run performs zero writes: no Team, no TeamMembership rows, no
 *     UPDATE statements — only SELECT/count queries.
 *   - Disabled users still get a membership (inert while disabled, per the
 *     Task 15 brief — not excluded from the team).
 */
import { PrismaClient } from "@prisma/client"

const DRY_RUN = process.argv.includes("--dry-run")
const prisma = new PrismaClient()

const TEAM_ID = "team_bistec_default"
const TEAM_NAME = "Bistec"

// The 12 tables carrying teamId (Task 1); table name matches the Prisma
// model name 1:1 (no @@map in this schema).
const TABLES = [
  "Project",
  "Campaign",
  "BrandKit",
  "Brief",
  "Draft",
  "Post",
  "ScheduledGeneration",
  "BriefDraft",
  "CampaignDocument",
  "BrandKitDocument",
  "AvailableProvider",
  "ChannelToken",
]

function roleFor(user) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? "ADMIN" : "EDITOR"
}

async function countNullTeamId(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM "${table}" WHERE "teamId" IS NULL`,
  )
  return rows[0].c
}

async function backfillNullTeamId(table, teamId) {
  const affected = await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET "teamId" = $1 WHERE "teamId" IS NULL`,
    teamId,
  )
  return affected
}

async function main() {
  console.log(`migrate-to-teams${DRY_RUN ? " (DRY RUN — no writes)" : ""}`)

  // ── Step 1: default team ────────────────────────────────────────────────
  let team = await prisma.team.findUnique({ where: { name: TEAM_NAME } })
  if (team) {
    console.log(`  Team "${TEAM_NAME}" already exists (id=${team.id}) — reusing.`)
  } else if (DRY_RUN) {
    console.log(`  → PLAN create Team "${TEAM_NAME}" (id=${TEAM_ID})`)
    team = { id: TEAM_ID, name: TEAM_NAME }
  } else {
    team = await prisma.team.create({ data: { id: TEAM_ID, name: TEAM_NAME } })
    console.log(`  ✓ created Team "${TEAM_NAME}" (id=${team.id})`)
  }

  // ── Step 2: per-user membership ─────────────────────────────────────────
  const users = await prisma.user.findMany({ select: { id: true, username: true, role: true, disabled: true } })
  let membershipsCreated = 0
  let membershipsExisting = 0
  for (const user of users) {
    // Read-only lookup either way — if the team hasn't been created yet
    // (dry-run, `team.id` is only the planned id), this correctly finds
    // nothing rather than throwing on a missing FK.
    const existing = await prisma.teamMembership
      .findUnique({ where: { teamId_userId: { teamId: team.id, userId: user.id } } })
      .catch(() => null)

    if (existing) {
      membershipsExisting++
      continue
    }

    const role = roleFor(user)
    if (DRY_RUN) {
      console.log(
        `  → PLAN membership user=${user.username ?? user.id} role=${role}${user.disabled ? " (disabled)" : ""}`,
      )
      membershipsCreated++
      continue
    }

    await prisma.teamMembership.create({
      data: { id: `tm_${user.id}`, teamId: team.id, userId: user.id, role },
    })
    membershipsCreated++
  }
  console.log(
    `  Memberships: ${membershipsCreated} ${DRY_RUN ? "would be created" : "created"}, ${membershipsExisting} already existed.`,
  )

  // ── Step 3: backfill teamId across the 12 tables ────────────────────────
  console.log(`  Table backfill (teamId IS NULL):`)
  let totalTouched = 0
  for (const table of TABLES) {
    const nullCount = await countNullTeamId(table)
    if (DRY_RUN) {
      console.log(`    ${table}: ${nullCount} row(s) with teamId IS NULL`)
      totalTouched += nullCount
      continue
    }
    if (nullCount === 0) {
      console.log(`    ${table}: 0 (nothing to do)`)
      continue
    }
    const affected = await backfillNullTeamId(table, team.id)
    console.log(`    ${table}: ${affected} row(s) updated`)
    totalTouched += affected
  }

  console.log(
    `Summary: ${totalTouched} row(s) ${DRY_RUN ? "would be" : "were"} backfilled into team "${TEAM_NAME}" (${team.id}).`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
