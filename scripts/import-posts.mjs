/**
 * Imports a scripts/export-posts.mjs bundle into THIS machine's dev environment
 * as a selective merge: rows are added alongside existing data (cuid ids never
 * collide across machines), MinIO objects are uploaded, and nothing existing is
 * modified or deleted. Re-running is idempotent — rows/objects that already
 * exist are skipped.
 *
 *   node --env-file=.env scripts/import-posts.mjs <export-dir> [--owner <username>] [--dry-run]
 *
 *   --owner    fallback owner: briefs/posts whose original username doesn't
 *              exist here are assigned to this user (otherwise the import
 *              aborts and lists the missing usernames)
 *   --dry-run  print what would happen without writing anything
 *
 * Reference remapping (by name, on this machine's data):
 *   user     → matched by username, else --owner
 *   campaign → matched by name (non-deleted), else null (brief keeps working)
 *   brandKit → matched by name (non-deleted), else null (falls back to kit precedence)
 *   referenceTemplate → matched by name within the matched kit, else null
 *
 * Post rows: only terminal statuses (PUBLISHED / FAILED / CANCELLED) are
 * imported. PENDING / SCHEDULED / PUBLISHING rows are skipped so this
 * machine's publish scheduler doesn't unexpectedly act on imported work.
 *
 * Requires env: DATABASE_URL, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY.
 */
import { PrismaClient } from "@prisma/client"
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3"
import fs from "node:fs"
import path from "node:path"

const prisma = new PrismaClient()

const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000"
const publicEndpoint = (process.env.MINIO_PUBLIC_ENDPOINT ?? endpoint).replace(/\/+$/, "")
const BUCKET_IMAGES = process.env.MINIO_BUCKET_IMAGES ?? "generated-images"
const BUCKET_BRANDKITS = process.env.MINIO_BUCKET_BRANDKITS ?? "brand-kits"
const PUBLIC_BUCKETS = [BUCKET_IMAGES, BUCKET_BRANDKITS]

const TERMINAL_POST_STATUSES = new Set(["PUBLISHED", "FAILED", "CANCELLED"])

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
  const args = { dir: null, owner: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--owner") args.owner = argv[++i]
    else if (argv[i] === "--dry-run") args.dryRun = true
    else if (!args.dir) args.dir = argv[i]
    else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  if (!args.dir) throw new Error("Usage: import-posts.mjs <export-dir> [--owner <username>] [--dry-run]")
  return args
}

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
}

async function ensureBucket(bucket) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }))
    if (PUBLIC_BUCKETS.includes(bucket)) {
      // Mirror src/lib/storage/minio.ts — these buckets serve stable public URLs.
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      }
      await s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(policy) }))
    }
  }
}

function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walkFiles(full)
    else yield full
  }
}

async function uploadObjects(objectsDir, dryRun) {
  if (!fs.existsSync(objectsDir)) return { uploaded: 0, skipped: 0 }
  let uploaded = 0
  let skipped = 0
  const ensured = new Set()
  for (const file of walkFiles(objectsDir)) {
    const rel = path.relative(objectsDir, file).split(path.sep)
    const bucket = rel[0]
    const key = rel.slice(1).join("/")
    if (!ensured.has(bucket)) {
      if (!dryRun) await ensureBucket(bucket)
      ensured.add(bucket)
    }
    let exists = false
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      exists = true
    } catch {
      /* not found — upload */
    }
    if (exists) {
      skipped++
      continue
    }
    if (!dryRun) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fs.readFileSync(file),
          ContentType: CONTENT_TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream",
        })
      )
    }
    uploaded++
  }
  return { uploaded, skipped }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dir = path.resolve(args.dir)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"))
  if (manifest.version !== 1) throw new Error(`Unsupported manifest version: ${manifest.version}`)
  if (args.dryRun) console.log("DRY RUN — no writes will happen\n")

  // If this machine serves MinIO from a different endpoint than the source,
  // rewrite every stored URL (imageUrl, briefImages, URLs embedded in HTML)
  // in one pass at the JSON level. No-op when both are localhost:9000.
  let { briefs, drafts, revisions, posts } = manifest
  for (const src of new Set([manifest.sourcePublicEndpoint, manifest.sourceEndpoint].filter(Boolean))) {
    if (src !== publicEndpoint) {
      console.log(`Rewriting asset URLs: ${src} → ${publicEndpoint}`)
      const rewritten = JSON.parse(
        JSON.stringify({ briefs, drafts, revisions, posts }).replaceAll(src, publicEndpoint)
      )
      ;({ briefs, drafts, revisions, posts } = rewritten)
    }
  }

  // ── Resolve owners ────────────────────────────────────────────────────────
  const usernames = [...new Set(briefs.map((b) => b.ownerUsername).filter(Boolean))]
  const localUsers = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true },
  })
  const userIdByUsername = new Map(localUsers.map((u) => [u.username, u.id]))

  let fallbackOwnerId = null
  if (args.owner) {
    const owner = await prisma.user.findUnique({ where: { username: args.owner.toLowerCase() } })
    if (!owner) throw new Error(`--owner user "${args.owner}" not found on this machine`)
    fallbackOwnerId = owner.id
  }

  const unresolved = usernames.filter((u) => !userIdByUsername.has(u))
  if ((unresolved.length > 0 || usernames.length === 0) && !fallbackOwnerId) {
    throw new Error(
      `These export owners don't exist here: ${unresolved.join(", ") || "(no username on export)"}. ` +
        `Re-run with --owner <username> to assign their posts to a local user.`
    )
  }
  const resolveUserId = (username) => userIdByUsername.get(username) ?? fallbackOwnerId

  // Original owner id → local id, so Post.userId remaps consistently even when
  // it differs from the brief owner.
  const ownerIdRemap = new Map(briefs.map((b) => [b.userId, resolveUserId(b.ownerUsername)]))

  // ── Resolve campaigns / brand kits / templates by name ───────────────────
  const campaignByName = new Map(
    (
      await prisma.campaign.findMany({ where: { isDeleted: false }, select: { id: true, name: true } })
    ).map((c) => [c.name, c.id])
  )
  const kits = await prisma.brandKit.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true, templates: { select: { id: true, name: true } } },
  })
  const kitByName = new Map(kits.map((k) => [k.name, k]))

  // ── Insert rows (skip ids that already exist — idempotent re-runs) ───────
  const existingIds = async (model, ids) =>
    new Set((await model.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id))

  const stats = {}

  const haveBriefs = await existingIds(prisma.brief, briefs.map((b) => b.id))
  stats.briefs = { created: 0, skipped: haveBriefs.size, unlinkedCampaigns: 0, unlinkedKits: 0 }
  for (const b of briefs) {
    if (haveBriefs.has(b.id)) continue
    const kit = b.brandKitName ? kitByName.get(b.brandKitName) : undefined
    if (b.brandKitName && !kit) stats.briefs.unlinkedKits++
    const campaignId = b.campaignName ? (campaignByName.get(b.campaignName) ?? null) : null
    if (b.campaignName && !campaignId) stats.briefs.unlinkedCampaigns++
    const referenceTemplateId = b.referenceTemplateName
      ? (kit?.templates.find((t) => t.name === b.referenceTemplateName)?.id ?? null)
      : null
    const data = {
      id: b.id,
      userId: resolveUserId(b.ownerUsername),
      campaignId,
      brandKitId: kit?.id ?? null,
      topic: b.topic,
      description: b.description,
      goal: b.goal,
      tone: b.tone,
      channels: b.channels,
      aspectRatio: b.aspectRatio,
      designMode: b.designMode,
      copyProviderKey: b.copyProviderKey,
      imageProviderKey: b.imageProviderKey,
      additionalImageUrl: b.additionalImageUrl,
      briefImages: b.briefImages ?? undefined,
      referenceTemplateId,
      createdAt: b.createdAt,
    }
    if (!args.dryRun) await prisma.brief.create({ data })
    stats.briefs.created++
  }

  const haveDrafts = await existingIds(prisma.draft, drafts.map((d) => d.id))
  stats.drafts = { created: 0, skipped: haveDrafts.size }
  for (const d of drafts) {
    if (haveDrafts.has(d.id)) continue
    const data = {
      id: d.id,
      briefId: d.briefId,
      copyText: d.copyText,
      imageUrl: d.imageUrl,
      htmlContent: d.htmlContent,
      // Bare string column (no FK) — kept as provenance; may not exist here.
      templateId: d.templateId,
      exportUrl: d.exportUrl,
      pendingConflict: d.pendingConflict ?? undefined,
      currentRevisionNumber: d.currentRevisionNumber,
      promptVersion: d.promptVersion,
      status: d.status,
      failureReason: d.failureReason,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }
    if (!args.dryRun) await prisma.draft.create({ data })
    stats.drafts.created++
  }

  const haveRevisions = await existingIds(prisma.draftRevision, revisions.map((r) => r.id))
  stats.revisions = { created: 0, skipped: haveRevisions.size }
  for (const r of revisions) {
    if (haveRevisions.has(r.id)) continue
    const data = {
      id: r.id,
      draftId: r.draftId,
      revisionNumber: r.revisionNumber,
      instruction: r.instruction,
      htmlSnapshot: r.htmlSnapshot,
      exportUrl: r.exportUrl,
      createdAt: r.createdAt,
    }
    if (!args.dryRun) await prisma.draftRevision.create({ data })
    stats.revisions.created++
  }

  const havePosts = await existingIds(prisma.post, posts.map((p) => p.id))
  stats.posts = { created: 0, skipped: havePosts.size, skippedNonTerminal: 0 }
  for (const p of posts) {
    if (havePosts.has(p.id)) continue
    if (!TERMINAL_POST_STATUSES.has(p.status)) {
      stats.posts.skippedNonTerminal++
      continue
    }
    const data = {
      id: p.id,
      draftId: p.draftId,
      userId: ownerIdRemap.get(p.userId) ?? fallbackOwnerId,
      channel: p.channel,
      status: p.status,
      scheduledAt: p.scheduledAt,
      publishedAt: p.publishedAt,
      platformId: p.platformId,
      errorReason: p.errorReason,
      retryCount: p.retryCount,
      nextRetryAt: p.nextRetryAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }
    if (!args.dryRun) await prisma.post.create({ data })
    stats.posts.created++
  }

  // ── Upload MinIO objects ──────────────────────────────────────────────────
  const objects = await uploadObjects(path.join(dir, "objects"), args.dryRun)

  console.log(`\nImport ${args.dryRun ? "(dry run) " : ""}complete:`)
  console.log(`  briefs:    ${stats.briefs.created} created, ${stats.briefs.skipped} already present`)
  if (stats.briefs.unlinkedCampaigns > 0)
    console.log(`             ⚠ ${stats.briefs.unlinkedCampaigns} campaign links dropped (no campaign with that name here)`)
  if (stats.briefs.unlinkedKits > 0)
    console.log(`             ⚠ ${stats.briefs.unlinkedKits} brand-kit links dropped (no kit with that name here — kit precedence fallback applies)`)
  console.log(`  drafts:    ${stats.drafts.created} created, ${stats.drafts.skipped} already present`)
  console.log(`  revisions: ${stats.revisions.created} created, ${stats.revisions.skipped} already present`)
  console.log(
    `  posts:     ${stats.posts.created} created, ${stats.posts.skipped} already present` +
      (stats.posts.skippedNonTerminal > 0
        ? `, ${stats.posts.skippedNonTerminal} skipped (PENDING/SCHEDULED/PUBLISHING — not imported so the scheduler won't act on them)`
        : "")
  )
  console.log(`  objects:   ${objects.uploaded} uploaded, ${objects.skipped} already present`)
  if (manifest.missingObjects?.length > 0) {
    console.log(`  ⚠ export noted ${manifest.missingObjects.length} objects missing at export time`)
  }
}

main()
  .catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
