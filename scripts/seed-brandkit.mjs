/**
 * Seeds the default "Bistec" brand kit + its active brand-voice prompt.
 * Self-contained (package imports only) so it runs on plain node:
 *
 *   node --env-file=.env scripts/seed-brandkit.mjs
 *
 * Idempotent: skips if a non-deleted default brand kit already exists.
 * Mirrors the admin API's single-default invariant (one BrandKit.isDefault=true).
 * Run scripts/seed-admin.mjs first so the prompt's createdBy references a real admin.
 *
 * Requires env: DATABASE_URL.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Brand identity values sourced from bistec-brand-studio + the bistec-studio
// design system (docs/ui-reference/DESIGN_SYSTEM.md).
const COLORS = [
  "#0284c7", // primary / CTA (sky-600)
  "#7dd3fc", // ice-blue accent
  "#0369a1", // primary hover
  "#0f172a", // text primary / deep navy
  "#f1f5f9", // light background
]

const FONTS = [
  {
    name: "Inter",
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  },
  {
    name: "JetBrains Mono",
    url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap",
  },
]

// NOTE: provisional — inferred from Bistec Global's public positioning.
// Confirm against the official brand style guide before treating as authoritative.
const VOICE_PROMPT = `You are writing social media content for Bistec Global, a B2B technology and managed-services company (Sydney + Colombo; ISO 27001 certified; SOC 2 Type II ready; Microsoft Gold Partner).

Voice attributes:
- Tone: Confident, clear, and technically credible. Practical over hype-y. No empty superlatives ("world-class", "cutting-edge") without concrete proof.
- Person: Active voice. Address the reader as "you" directly.
- Register: Enterprise/B2B. Your reader is a technical decision-maker or business leader — not a consumer. Assume baseline technical literacy.
- Claims: Substantiate every claim. Reference real certifications (ISO 27001, SOC 2 Type II) only when the product being promoted actually inherits them from Bistec Global. Do not invent customer counts or case-study results.
- Jargon: Explain or avoid technical terms that would not be known to a business-decision-maker audience.

Platform guidance:
- Instagram: Shorter sentences, visual-first framing, single strong hook line, 3–5 relevant hashtags at the end. Keep captions under 150 words.
- LinkedIn: Professional, thought-leadership framing, may go up to 250 words. Lead with a concrete insight or result, not a question. End with a clear call to action or takeaway.

Banned patterns:
- "The best", "world-class", "cutting-edge", "revolutionary" — unless backed by a specific, verifiable claim in the post.
- Fabricated social proof (e.g. "thousands of customers love us").
- Inconsistent product naming — always use the exact registered product name.`

// Team tenancy: BrandKit.teamId is required. This script seeds the baseline
// "Bistec" brand kit, which belongs in the "Bistec" team — created
// unconditionally by the team_tenancy_b migration's backfill (id
// 'team_bistec_default'), so it always exists by the time this script runs.
// Falls back to creating it here too, defensively, if run standalone.
async function ensureBistecTeamId() {
  const existing = await prisma.team.findFirst({ where: { name: "Bistec" } })
  if (existing) return existing.id
  const created = await prisma.team.create({ data: { name: "Bistec" } })
  return created.id
}

async function main() {
  const teamId = await ensureBistecTeamId()

  // Idempotency: a non-deleted default kit already present (in this team) → skip.
  const existingDefault = await prisma.brandKit.findFirst({
    where: { isDefault: true, isDeleted: false, teamId },
  })
  if (existingDefault) {
    console.log(
      `Default brand kit already exists: "${existingDefault.name}" (${existingDefault.id}) — skipping`
    )
    return
  }

  // createdBy is a required audit field (no FK). Prefer a real admin id so the
  // prompt is attributed to the seeded admin; fall back to any user, then a sentinel.
  const owner =
    (await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }))
  const createdBy = owner?.id ?? "system-seed"

  // Mirror the admin API: clear any other defaults so exactly one kit is default (within this team).
  await prisma.brandKit.updateMany({
    where: { isDefault: true, teamId },
    data: { isDefault: false },
  })

  const kit = await prisma.brandKit.create({
    data: {
      teamId,
      name: "Bistec",
      isDefault: true,
      colors: COLORS,
      fonts: FONTS,
      logoUrl: null, // upload via /admin/brandkits after first run
      prompts: {
        create: {
          content: VOICE_PROMPT,
          version: 1,
          isActive: true,
          createdBy,
        },
      },
    },
    include: { prompts: true },
  })

  console.log(`Created default brand kit "Bistec" (${kit.id})`)
  console.log(`  Colors:  ${COLORS.length} swatches`)
  console.log(`  Fonts:   ${FONTS.map((f) => f.name).join(", ")}`)
  console.log(`  Prompt:  v${kit.prompts[0].version} (active), createdBy=${createdBy}`)
  if (createdBy === "system-seed") {
    console.log(
      "  Note: no user found — prompt.createdBy set to 'system-seed'. Run scripts/seed-admin.mjs to create the admin."
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
