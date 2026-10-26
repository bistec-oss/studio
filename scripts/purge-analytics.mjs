/**
 * Operator purge for the analytics event store (006 FR-12). Deletes the events
 * of one team, user or draft.
 *
 *   DATABASE_URL=<url> node scripts/purge-analytics.mjs --team <id> [--dry-run]
 *   DATABASE_URL=<url> node scripts/purge-analytics.mjs --user <id> [--dry-run]
 *   DATABASE_URL=<url> node scripts/purge-analytics.mjs --draft <id> [--dry-run]
 *
 * Refuses to run without an explicit DATABASE_URL in the environment (it never
 * falls back to a .env file, so a stray shell cannot purge the wrong database).
 * Prints the database name and the number of matching events before it deletes;
 * --dry-run stops there. Exit codes: 0 done, 1 bad usage, 2 no DATABASE_URL.
 */
// The guard reads the environment BEFORE @prisma/client is imported: importing the
// client loads a .env file into process.env as a side effect, which would make a
// shell with no DATABASE_URL look like it had one (and aim the purge at whatever
// .env names). The import below is therefore dynamic, and the URL is passed to
// the client explicitly.
const url = process.env.DATABASE_URL
if (!url) {
  console.error("Refusing to run: DATABASE_URL must be set explicitly in the environment.")
  process.exit(2)
}
const { PrismaClient } = await import("@prisma/client")

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const filters = []
for (const [flag, field] of [["--team", "teamId"], ["--user", "userId"], ["--draft", "draftId"]]) {
  const i = args.indexOf(flag)
  if (i === -1) continue
  const value = args[i + 1]
  if (!value || value.startsWith("--")) {
    console.error(`${flag} needs an id`)
    process.exit(1)
  }
  filters.push([field, value])
}
if (filters.length !== 1) {
  console.error("Usage: purge-analytics.mjs --team <id> | --user <id> | --draft <id> [--dry-run]")
  process.exit(1)
}
const [field, value] = filters[0]
const where = { [field]: value }

let dbName
try {
  dbName = new URL(url).pathname.replace(/^\//, "") || "(unknown)"
} catch {
  dbName = "(unparseable DATABASE_URL)"
}

// The URL is passed explicitly, so the client cannot read a different one.
const prisma = new PrismaClient({ datasourceUrl: url })
try {
  const count = await prisma.analyticsEvent.count({ where })
  console.log(`Database: ${dbName}`)
  console.log(`Matching events (${field} = ${value}): ${count}`)
  if (dryRun) {
    console.log("--dry-run: nothing deleted.")
  } else {
    const { count: deleted } = await prisma.analyticsEvent.deleteMany({ where })
    console.log(`Deleted ${deleted} events.`)
  }
} finally {
  await prisma.$disconnect()
}
