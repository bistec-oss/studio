/**
 * Seeds the "Hearts Talk" brand kit: palette, Google Fonts, brand-voice prompt,
 * a 1080x1080 HTML template, and logo artifacts.
 *
 *   node --env-file=.env scripts/seed-hearts-talk.mjs
 *
 * Idempotent: skips if a non-deleted "Hearts Talk" kit already exists.
 * This kit is NOT the system default (the "Bistec" kit holds isDefault=true).
 * Run scripts/seed-admin.mjs first so the prompt's createdBy references a real admin.
 *
 * Assets are read from scripts/seed-assets/ at runtime:
 *   - hearts-talk-1080x1080.html   (required — stored as a BrandKitTemplate)
 *   - hearts-academy-logo.png      (optional — LOGO artifact + kit.logoUrl)
 *   - bistec-global-logo.png       (optional — LOGO artifact)
 * Logos are embedded as data: URIs, so they never expire and need no MinIO
 * (the admin UI stores 7-day presigned URLs that break after a week — avoided here).
 *
 * Requires env: DATABASE_URL.
 */
import { PrismaClient } from "@prisma/client"
import { readFileSync, existsSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS = join(__dirname, "seed-assets")
const prisma = new PrismaClient()

// Palette extracted from the brand assets (deep navy, signature cyan, two greens, white).
const COLORS = ["#062e4b", "#00b9d4", "#46e07d", "#036db7", "#23b465", "#ffffff"]

function gf(name, weights) {
  return `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:wght@${weights}&display=swap`
}
const FONTS = [
  { name: "Orbitron", url: gf("Orbitron", "400;700;900") }, // display / event titles
  { name: "Poppins", url: gf("Poppins", "400;500;600;700") }, // wordmarks
  { name: "Montserrat", url: gf("Montserrat", "400;500;600;700") }, // body / CTA / footer
]

// NOTE: provisional — inferred from the brand visuals + positioning.
// Confirm against the official Hearts Talk / Hearts Academy guidelines.
const VOICE_PROMPT = `You are writing social media content for "Hearts Talk", the tech-talk and learning event series run by BISTEC Hearts Academy (the professional-upskilling arm of Bistec Global, a B2B technology and managed-services company).

Voice attributes:
- Tone: Bold, modern, and energetic, with a human, people-centric warmth. Futuristic and tech-forward, but never cold — "Hearts" is in the name for a reason.
- Person: Active voice. Speak directly to the reader as "you". Inviting and community-minded.
- Register: Professional but approachable. The audience is tech professionals, enterprise teams, and members of the internal upskilling community — assume solid technical literacy, but keep event messaging accessible and motivating.
- Claims: Substantiate specifics (speakers, dates, topics, venues). Do not invent attendance numbers or outcomes.

Platform guidance:
- Instagram: Short, punchy, visual-first. One strong hook line, clear event details (what / when / where), 3–5 relevant hashtags. Keep captions under 150 words.
- LinkedIn: Professional, thought-leadership framing. Lead with the value or insight attendees gain. End with a clear call to action (register / save the date / join). May run up to 250 words.

Banned patterns:
- "The best", "world-class", "cutting-edge", "revolutionary" — unless backed by a specific, verifiable claim.
- Fabricated social proof.
- Inconsistent naming — always "Hearts Talk" and "BISTEC Hearts Academy" exactly.`

// [filename in seed-assets/, artifact display name, use as kit.logoUrl?]
const LOGO_FILES = [
  ["hearts-academy-logo.png", "BISTEC Hearts Academy", true],
  ["bistec-global-logo.png", "BISTEC Global", false],
]

function dataUri(path) {
  const ext = path.split(".").pop().toLowerCase()
  const mime =
    ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`
}

async function main() {
  const existing = await prisma.brandKit.findFirst({
    where: { name: "Hearts Talk", isDeleted: false },
  })
  if (existing) {
    console.log(`"Hearts Talk" brand kit already exists (${existing.id}) — skipping`)
    return
  }

  const htmlPath = join(ASSETS, "hearts-talk-1080x1080.html")
  if (!existsSync(htmlPath)) {
    console.error(`Missing required asset: ${htmlPath}`)
    process.exit(1)
  }
  const html = readFileSync(htmlPath, "utf8")

  // createdBy: prefer the seeded admin, fall back to any user, then a sentinel.
  const owner =
    (await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }))
  const createdBy = owner?.id ?? "system-seed"

  // Resolve whichever logo files are present on disk → data URIs.
  const logos = []
  for (const [file, name, isPrimary] of LOGO_FILES) {
    const p = join(ASSETS, file)
    if (existsSync(p)) logos.push({ name, url: dataUri(p), isPrimary })
    else console.warn(`  Logo not found, skipping: scripts/seed-assets/${file}`)
  }
  const primary = logos.find((l) => l.isPrimary) ?? logos[0] ?? null

  const data = {
    name: "Hearts Talk",
    isDefault: false,
    colors: COLORS,
    fonts: FONTS,
    logoUrl: primary?.url ?? null,
    prompts: { create: { content: VOICE_PROMPT, version: 1, isActive: true, createdBy } },
    templates: { create: { name: "Hearts Talk 1080×1080", htmlTemplate: html } },
  }
  if (logos.length > 0) {
    data.artifacts = {
      create: logos.map((l) => ({ type: "LOGO", name: l.name, url: l.url, feedToAI: false })),
    }
  }

  const kit = await prisma.brandKit.create({
    data,
    include: { prompts: true, templates: true, artifacts: true },
  })

  console.log(`Created brand kit "Hearts Talk" (${kit.id})`)
  console.log(`  Colors:   ${COLORS.length} swatches`)
  console.log(`  Fonts:    ${FONTS.map((f) => f.name).join(", ")}`)
  console.log(`  Template: ${kit.templates[0].name} (${(html.length / 1024 / 1024).toFixed(2)} MB)`)
  console.log(`  Logos:    ${kit.artifacts.length} artifact(s)${primary ? " — primary set as kit.logoUrl" : ""}`)
  console.log(`  Prompt:   v${kit.prompts[0].version} (active), createdBy=${createdBy}`)
  if (logos.length < LOGO_FILES.length) {
    console.log(
      "  Note: add the missing logo PNG(s) to scripts/seed-assets/ then delete this kit and re-run to attach them."
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
