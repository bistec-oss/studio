/**
 * Seeds a simple 3:4 PORTRAIT (1080×1350) HTML template onto the system-default
 * brand kit, so Path A has a portrait option out of the box (the brief wizard
 * filters templates by the chosen size).
 *
 *   node --env-file=.env scripts/seed-portrait-template.mjs
 *
 * Idempotent: skips if the default kit already has any PORTRAIT template.
 * Run scripts/seed-brandkit.mjs first so a default kit exists.
 *
 * Requires env: DATABASE_URL.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Brand-neutral portrait layout. Uses CSS variables so the design agent can recolour
// from the brand kit; the exact 1080×1350 root matches AspectRatio.PORTRAIT.
const PORTRAIT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  :root { --brand: #0284c7; --ink: #0f172a; --bg: #f1f5f9; }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1350px; }
  body {
    font-family: Inter, system-ui, sans-serif;
    background: linear-gradient(160deg, var(--bg) 0%, #ffffff 60%);
    color: var(--ink);
    display: flex; flex-direction: column;
    padding: 96px 88px;
  }
  .eyebrow { font-size: 28px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--brand); }
  .headline { margin-top: 28px; font-size: 92px; font-weight: 800; line-height: 1.04; }
  .body { margin-top: 32px; font-size: 36px; line-height: 1.4; color: #334155; max-width: 760px; }
  .spacer { flex: 1; }
  .cta {
    align-self: flex-start;
    background: var(--brand); color: #fff;
    font-size: 32px; font-weight: 700;
    padding: 24px 48px; border-radius: 9999px;
  }
  .footer { margin-top: 40px; font-size: 26px; color: #64748b; }
</style>
</head>
<body>
  <div class="eyebrow">[EYEBROW]</div>
  <h1 class="headline">[HEADLINE]</h1>
  <p class="body">[BODY COPY]</p>
  <div class="spacer"></div>
  <div class="cta">[CALL TO ACTION]</div>
  <div class="footer">[BRAND / HANDLE]</div>
</body>
</html>`

async function main() {
  const kit = await prisma.brandKit.findFirst({
    where: { isDefault: true, isDeleted: false },
  })
  if (!kit) {
    console.log("No default brand kit found — run scripts/seed-brandkit.mjs first. Skipping.")
    return
  }

  const existing = await prisma.brandKitTemplate.findFirst({
    where: { brandKitId: kit.id, aspectRatio: "PORTRAIT" },
  })
  if (existing) {
    console.log(`Default kit "${kit.name}" already has a PORTRAIT template ("${existing.name}") — skipping`)
    return
  }

  const template = await prisma.brandKitTemplate.create({
    data: {
      brandKitId: kit.id,
      name: "Portrait Announcement",
      htmlTemplate: PORTRAIT_HTML,
      aspectRatio: "PORTRAIT",
    },
  })

  console.log(`Created 3:4 template "${template.name}" (${template.id}) on kit "${kit.name}"`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
