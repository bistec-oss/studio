/**
 * Exports library posts (Brief → Draft → DraftRevision[] + Post[]) plus every
 * MinIO object they reference into a portable folder, so they can be merged
 * into ANOTHER machine's dev environment with scripts/import-posts.mjs
 * (selective merge — nothing on the target is overwritten or deleted).
 *
 *   node --env-file=.env scripts/export-posts.mjs [--out <dir>] [--draft <id>]... [--user <username>]
 *
 *   --out    output folder (default: ./post-export)
 *   --draft  export only this draft id (repeatable); default: all drafts
 *   --user   export only drafts whose brief belongs to this username
 *
 * Output layout:
 *   <out>/manifest.json          — rows + remap hints (owner username, campaign/kit names)
 *   <out>/objects/<bucket>/<key> — every referenced MinIO object (exports, images, brand assets)
 *
 * What is NOT exported: users, brand kits, campaigns, scheduled generations —
 * the importer re-links those by name/username on the target (or falls back).
 *
 * Requires env: DATABASE_URL, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY.
 */
import { PrismaClient } from "@prisma/client"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import fs from "node:fs"
import path from "node:path"

const prisma = new PrismaClient()

const MANIFEST_VERSION = 1

const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000"
const publicEndpoint = (process.env.MINIO_PUBLIC_ENDPOINT ?? endpoint).replace(/\/+$/, "")
const BUCKET_EXPORTS = process.env.MINIO_BUCKET_EXPORTS ?? "exported-designs"

const s3 = new S3Client({
  endpoint,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
  },
  forcePathStyle: true,
})

function parseArgs(argv) {
  const args = { out: "post-export", draftIds: [], user: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = argv[++i]
    else if (argv[i] === "--draft") args.draftIds.push(argv[++i])
    else if (argv[i] === "--user") args.user = argv[++i]
    else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  return args
}

// Finds every MinIO object reference inside the exported rows. Two forms exist:
// full URLs to the internal/public endpoint (imageUrl, briefImages, URLs
// embedded in stored HTML) and bare EXPORTS object keys (exportUrl fields).
function collectAssets(manifestRows) {
  const assets = new Map() // "bucket/key" -> { bucket, key }
  const add = (bucket, key) => {
    // Keys are server-generated, but stay defensive before using them as paths.
    if (!bucket || !key || key.includes("..")) return
    assets.set(`${bucket}/${key}`, { bucket, key })
  }

  const blob = JSON.stringify(manifestRows)
  for (const base of new Set([publicEndpoint, endpoint.replace(/\/+$/, "")])) {
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`${escaped}/([a-z0-9.\\-]+)/([^"'\\\\\\s)]+)`, "g")
    for (const m of blob.matchAll(re)) {
      add(m[1], m[2].split("?")[0])
    }
  }

  for (const draft of manifestRows.drafts) {
    if (draft.exportUrl && !/^https?:\/\//i.test(draft.exportUrl)) add(BUCKET_EXPORTS, draft.exportUrl)
  }
  for (const rev of manifestRows.revisions) {
    if (rev.exportUrl && !/^https?:\/\//i.test(rev.exportUrl)) add(BUCKET_EXPORTS, rev.exportUrl)
  }
  return [...assets.values()]
}

async function downloadObject(outDir, bucket, key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const bytes = Buffer.from(await res.Body.transformToByteArray())
  const dest = path.join(outDir, "objects", bucket, ...key.split("/"))
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, bytes)
  return bytes.length
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const where = {}
  if (args.draftIds.length > 0) where.id = { in: args.draftIds }
  if (args.user) where.brief = { user: { username: args.user.toLowerCase() } }

  const drafts = await prisma.draft.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      brief: {
        include: {
          user: { select: { username: true, name: true } },
          campaign: { select: { name: true } },
          brandKit: { select: { name: true } },
          referenceTemplate: { select: { name: true } },
        },
      },
      revisions: { orderBy: { revisionNumber: "asc" } },
      posts: true,
    },
  })
  if (drafts.length === 0) {
    console.log("No drafts matched — nothing to export.")
    return
  }

  // Dedupe briefs (a brief can own several drafts) and flatten for the manifest.
  const briefs = new Map()
  for (const d of drafts) {
    const { user, campaign, brandKit, referenceTemplate, ...brief } = d.brief
    briefs.set(brief.id, {
      ...brief,
      // Remap hints for the importer — resolved by name/username on the target.
      ownerUsername: user.username,
      ownerName: user.name,
      campaignName: campaign?.name ?? null,
      brandKitName: brandKit?.name ?? null,
      referenceTemplateName: referenceTemplate?.name ?? null,
    })
  }

  const rows = {
    briefs: [...briefs.values()],
    drafts: drafts.map(({ brief: _brief, revisions: _revisions, posts: _posts, ...d }) => d),
    revisions: drafts.flatMap((d) => d.revisions),
    posts: drafts.flatMap((d) => d.posts),
  }

  const outDir = path.resolve(args.out)
  fs.mkdirSync(outDir, { recursive: true })

  const assets = collectAssets(rows)
  let downloaded = 0
  let totalBytes = 0
  const missing = []
  for (const { bucket, key } of assets) {
    try {
      totalBytes += await downloadObject(outDir, bucket, key)
      downloaded++
    } catch (err) {
      missing.push(`${bucket}/${key}`)
      console.warn(`  ⚠ could not download ${bucket}/${key}: ${err.name ?? err.message}`)
    }
  }

  const manifest = {
    version: MANIFEST_VERSION,
    exportedAt: new Date().toISOString(),
    sourcePublicEndpoint: publicEndpoint,
    sourceEndpoint: endpoint.replace(/\/+$/, ""),
    counts: {
      briefs: rows.briefs.length,
      drafts: rows.drafts.length,
      revisions: rows.revisions.length,
      posts: rows.posts.length,
      objects: downloaded,
    },
    missingObjects: missing,
    ...rows,
  }
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2))

  console.log(`Exported to ${outDir}`)
  console.log(
    `  ${rows.drafts.length} drafts, ${rows.briefs.length} briefs, ${rows.revisions.length} revisions, ${rows.posts.length} posts`
  )
  console.log(`  ${downloaded}/${assets.length} MinIO objects (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`)
  if (missing.length > 0) {
    console.log(`  ⚠ ${missing.length} referenced objects were missing in MinIO (listed in manifest.missingObjects)`)
  }
  console.log(`\nCopy the folder to the other machine and run:`)
  console.log(`  node --env-file=.env scripts/import-posts.mjs <folder> [--owner <username>]`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
