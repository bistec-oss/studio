/**
 * Refines the existing default "Bistec" brand kit with the REAL BISTEC Global
 * master-brand visual identity (colours, Lato typography, master logos) sourced
 * from the `bistec-designer-v2` skill's Brand Identity Style Guide v1.1.
 *
 *   node --env-file=.env scripts/refine-bistec-brandkit.mjs
 *
 * What it does (idempotent — safe to re-run):
 *   1. Uploads master_logo / master_logo_reversed / master_icon PNGs to the
 *      public-read `brand-kits` MinIO bucket and sets BrandKit.logoUrl.
 *   2. Overwrites BrandKit.colors with the master palette (Navy/Royal/Green +
 *      neutrals) and BrandKit.fonts with the Lato-first system.
 *   3. Rebuilds the kit's LOGO artifacts (full/reversed/icon, feedToAI=true).
 *   4. Publishes a refined brand-voice prompt (new active version) carrying the
 *      "Hearts" signature, the group tagline, and Australian-English rules.
 *
 * Requires env: DATABASE_URL, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY,
 * MINIO_BUCKET_BRANDKITS (falls back to "brand-kits").
 */
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3"

const prisma = new PrismaClient()

// ── Skill asset source (bistec-designer-v2/assets) ──────────────────────────
const ASSETS_DIR =
  "C:\\Users\\Damian\\AppData\\Roaming\\Claude\\local-agent-mode-sessions\\skills-plugin\\3fa60060-0e0e-496a-b432-dd74cf6e07b8\\2d2125cb-2f6d-4bd4-8737-8d27595717fb\\skills\\bistec-designer-v2\\assets"

const LOGO_FILES = [
  { file: "master_logo.png", name: "BISTEC Global — full logo (colour)", primary: true },
  { file: "master_logo_reversed.png", name: "BISTEC Global — reversed logo (white, for dark backgrounds)", primary: false },
  { file: "master_icon.png", name: "BISTEC Global — icon mark (1:1)", primary: false },
]

// ── Master palette — Brand Identity Style Guide v1.1 (Sep 2025) ─────────────
const COLORS = [
  "#14377D", // Navy Blue  — primary dark / authority / headings
  "#006FB9", // Royal Blue — secondary accent / connective
  "#2CB34A", // Grass Green — master brand accent
  "#FFFFFF", // White      — light backgrounds / text on dark
  "#203232", // Charcoal   — body text on light
  "#F4F4F3", // Pale Fawn  — secondary light background
]

// Lato is the primary brand font (Arial/Calibri are the office alternates only,
// not web fonts, so not listed here).
const FONTS = [
  {
    name: "Lato",
    url: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap",
  },
]

// ── Refined brand-voice prompt (master brand) ───────────────────────────────
const VOICE_PROMPT = `You are writing social media content for BISTEC Global Pty Ltd — a managed technology and professional-services group, Australian-headquartered in Sydney with delivery from Colombo, Sri Lanka (ISO 27001 certified; SOC 2 Type II ready; Microsoft Gold Partner). This is the MASTER brand (corporate / multi-service voice), not a single service line.

Brand signature — always honour:
- The tagline is "Hearts empowering business with technology." Where the audience is external, work the word "hearts" in at least once (BISTEC deliberately says "hearts", never "headcount" or "employees" — say "hearts" or "team members").
- Refer to the BISTEC ecosystem as "our family" where it reads naturally.

Voice attributes:
- Tone: Confident, clear, and technically credible. Warm and human — never cold corporate. Practical over hype.
- Person: Active voice. Address the reader as "you".
- Register: Enterprise/B2B. Your reader is a technical decision-maker or business leader — assume baseline technical literacy.
- Claims: Substantiate everything. Reference real certifications (ISO 27001, SOC 2 Type II, Microsoft Gold Partner) only when genuinely relevant. Never invent customer counts, metrics, or case-study results.

Language conventions:
- Australian English spelling: colour, organisation, analyse, recognise, optimise (unless the audience is explicitly US).
- "On-premises", never "on-premise".
- Smart quotes (' ' " ") and em-dashes (—) for emphasis, not double-hyphens or parentheses.
- Use the exact legal entity "BISTEC Global Pty Ltd" in any legal/contracting reference; "BISTEC Global" in ordinary body copy.

Platform guidance:
- Instagram: Shorter sentences, visual-first framing, single strong hook line, 3–5 relevant hashtags at the end. Under 150 words.
- LinkedIn: Thought-leadership framing, up to 250 words. Lead with a concrete insight or result. End with a clear call to action or takeaway.

Banned patterns:
- "best-in-class", "world-class", "world-leading", "cutting-edge", "revolutionary", "synergise", "leverage" — unless backed by a specific, verifiable claim.
- "headcount" / "employees" in branded copy (use "hearts" / "team members").
- Fabricated social proof or unsubstantiated superlatives.`

// ── MinIO (mirrors src/lib/storage/minio.ts) ────────────────────────────────
const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000"
const publicEndpoint = (process.env.MINIO_PUBLIC_ENDPOINT ?? endpoint).replace(/\/+$/, "")
const BUCKET = process.env.MINIO_BUCKET_BRANDKITS ?? "brand-kits"

const s3 = new S3Client({
  endpoint,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
  },
  forcePathStyle: true,
})

async function ensurePublicBucket(bucket) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }))
  }
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      }),
    }),
  )
}

async function uploadLogo(kitId, fileName) {
  const abs = path.join(ASSETS_DIR, fileName)
  if (!existsSync(abs)) throw new Error(`Asset not found: ${abs}`)
  const body = readFileSync(abs)
  const key = `${kitId}/${fileName}`
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: "image/png" }),
  )
  return `${publicEndpoint}/${BUCKET}/${key}`
}

async function main() {
  const kit = await prisma.brandKit.findFirst({
    where: { name: "Bistec", isDeleted: false },
    orderBy: { createdAt: "asc" },
  })
  if (!kit) throw new Error('No non-deleted brand kit named "Bistec" found. Run seed-brandkit.mjs first.')
  console.log(`Refining brand kit "${kit.name}" (${kit.id})`)

  await ensurePublicBucket(BUCKET)

  // 1) Upload logos → collect public URLs.
  const uploaded = []
  for (const l of LOGO_FILES) {
    const url = await uploadLogo(kit.id, l.file)
    uploaded.push({ ...l, url })
    console.log(`  ↑ ${l.file} → ${url}`)
  }
  const primaryUrl = uploaded.find((u) => u.primary).url

  // 2) Update colours, fonts, logoUrl.
  await prisma.brandKit.update({
    where: { id: kit.id },
    data: { colors: COLORS, fonts: FONTS, logoUrl: primaryUrl },
  })
  console.log(`  ✓ colours (${COLORS.length}), fonts (${FONTS.map((f) => f.name).join(", ")}), logoUrl set`)

  // 3) Rebuild LOGO artifacts (idempotent: clear existing LOGO rows, recreate).
  await prisma.brandKitArtifact.deleteMany({ where: { brandKitId: kit.id, type: "LOGO" } })
  await prisma.brandKitArtifact.createMany({
    data: uploaded.map((u) => ({
      brandKitId: kit.id,
      type: "LOGO",
      name: u.name,
      url: u.url,
      feedToAI: true,
    })),
  })
  console.log(`  ✓ ${uploaded.length} LOGO artifacts (feedToAI=true)`)

  // 4) Publish refined voice prompt as a new active version (single-active invariant).
  const active = await prisma.brandKitPrompt.findFirst({
    where: { brandKitId: kit.id, isActive: true },
  })
  if (active && active.content.includes("Hearts empowering business with technology")) {
    console.log("  = voice prompt already refined (active version carries the tagline) — skipping")
  } else {
    const owner =
      (await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } })) ??
      (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }))
    const createdBy = owner?.id ?? active?.createdBy ?? "system-seed"
    const max = await prisma.brandKitPrompt.aggregate({
      where: { brandKitId: kit.id },
      _max: { version: true },
    })
    const nextVersion = (max._max.version ?? 0) + 1
    await prisma.brandKitPrompt.updateMany({
      where: { brandKitId: kit.id, isActive: true },
      data: { isActive: false },
    })
    const p = await prisma.brandKitPrompt.create({
      data: {
        brandKitId: kit.id,
        content: VOICE_PROMPT,
        version: nextVersion,
        isActive: true,
        createdBy,
      },
    })
    console.log(`  ✓ voice prompt v${p.version} (active), createdBy=${createdBy}`)
  }

  console.log("Done.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
