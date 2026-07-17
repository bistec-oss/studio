/**
 * One-off data fix: converts base64 `data:` URIs stored in BrandKit.logoUrl and
 * BrandKitArtifact.url into real objects in the public-read brand-kits MinIO
 * bucket, rewriting each row to the stable public URL.
 *
 *   node --env-file=.env scripts/fix-data-uri-logos.mjs [--dry-run]
 *
 * Why: embedded data-URI logos (one was 136k chars) inflate every AI prompt that
 * includes brand-kit context and caused a 300s generation timeout (2026-07-17
 * incident). Prompts/APIs now strip/reject data: URIs — this script fixes the
 * rows that already hold them.
 *
 * Behaviour:
 *   - Idempotent: rows already holding http(s) URLs are untouched; a re-run
 *     finds nothing to do.
 *   - --dry-run prints the full migration plan (row identifiers + byte sizes)
 *     and performs zero writes (no bucket creation, no uploads, no DB updates).
 *   - Unparsable data-URIs (non-base64, unsupported mime, empty payload) are
 *     logged and skipped; the rest still migrate; exit code 1 at the end.
 *   - Upload key: <brandKitId>/migrated-<timestamp>-<slug>.<ext>
 *
 * Requires env: DATABASE_URL, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY,
 * MINIO_BUCKET_BRANDKITS (falls back to "brand-kits").
 */
import { PrismaClient } from "@prisma/client"
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3"

const DRY_RUN = process.argv.includes("--dry-run")
const prisma = new PrismaClient()

// ── MinIO (mirrors scripts/refine-bistec-brandkit.mjs / src/lib/storage/minio.ts) ──
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

const MIME_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
}

/** Parse a data: URI → { mime, ext, body: Buffer } or throw with a reason. */
function parseDataUri(value) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(value)
  if (!match) throw new Error("not a base64 data: URI (missing ;base64, section)")
  const mime = match[1].toLowerCase()
  const ext = MIME_EXT[mime]
  if (!ext) throw new Error(`unsupported mime type "${mime}"`)
  const payload = match[2]
  if (!/^[A-Za-z0-9+/\s]*={0,2}$/.test(payload)) throw new Error("payload is not valid base64")
  const body = Buffer.from(payload, "base64")
  if (body.length === 0) throw new Error("empty base64 payload")
  return { mime, ext, body }
}

function slugify(name) {
  return (
    (name ?? "logo")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "logo"
  )
}

const usedKeys = new Set()
function uniqueKey(brandKitId, name, ext) {
  const base = `${brandKitId}/migrated-${Date.now()}-${slugify(name)}`
  let key = `${base}.${ext}`
  for (let n = 2; usedKeys.has(key); n++) key = `${base}-${n}.${ext}`
  usedKeys.add(key)
  return key
}

async function upload(key, body, mime) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: mime }))
  return `${publicEndpoint}/${BUCKET}/${key}`
}

async function main() {
  console.log(`fix-data-uri-logos${DRY_RUN ? " (DRY RUN — no writes)" : ""}`)
  console.log(`  bucket: ${BUCKET} @ ${endpoint} (public: ${publicEndpoint})`)

  // Candidates: rows whose stored value is a data: URI. http(s) rows are clean.
  const kits = await prisma.brandKit.findMany({
    where: { logoUrl: { startsWith: "data:" } },
    select: { id: true, name: true, logoUrl: true },
  })
  const artifacts = await prisma.brandKitArtifact.findMany({
    where: { url: { startsWith: "data:" } },
    select: { id: true, name: true, url: true, brandKitId: true },
  })
  const cleanKits = await prisma.brandKit.count({
    where: { logoUrl: { not: null }, NOT: { logoUrl: { startsWith: "data:" } } },
  })
  const cleanArtifacts = await prisma.brandKitArtifact.count({
    where: { NOT: { url: { startsWith: "data:" } } },
  })
  const alreadyClean = cleanKits + cleanArtifacts

  const rows = [
    ...kits.map((k) => ({
      label: `BrandKit.logoUrl  kit=${k.id} ("${k.name}")`,
      brandKitId: k.id,
      name: k.name,
      value: k.logoUrl,
      apply: (url) => prisma.brandKit.update({ where: { id: k.id }, data: { logoUrl: url } }),
    })),
    ...artifacts.map((a) => ({
      label: `BrandKitArtifact.url  artifact=${a.id} ("${a.name}") kit=${a.brandKitId}`,
      brandKitId: a.brandKitId,
      name: a.name,
      value: a.url,
      apply: (url) => prisma.brandKitArtifact.update({ where: { id: a.id }, data: { url } }),
    })),
  ]

  if (rows.length === 0) {
    console.log(`Nothing to migrate — no data: URIs found (${alreadyClean} row(s) already clean).`)
    return
  }

  if (!DRY_RUN) await ensurePublicBucket(BUCKET)

  let converted = 0
  let skipped = 0
  for (const row of rows) {
    let parsed
    try {
      parsed = parseDataUri(row.value)
    } catch (e) {
      console.error(`  ✗ SKIP ${row.label} — ${e.message} (${row.value.length} chars)`)
      skipped++
      continue
    }
    const key = uniqueKey(row.brandKitId, row.name, parsed.ext)
    const publicUrl = `${publicEndpoint}/${BUCKET}/${key}`
    if (DRY_RUN) {
      console.log(
        `  → PLAN ${row.label}\n         ${parsed.mime}, ${parsed.body.length} bytes (${row.value.length}-char data URI) → ${publicUrl}`,
      )
      converted++
      continue
    }
    const url = await upload(key, parsed.body, parsed.mime)
    await row.apply(url)
    console.log(`  ✓ ${row.label}\n         ${parsed.body.length} bytes → ${url}`)
    converted++
  }

  console.log(
    `Summary: ${converted} ${DRY_RUN ? "would be converted" : "converted"}, ${skipped} skipped (unparsable), ${alreadyClean} already clean.`,
  )
  if (skipped > 0) {
    console.error(`${skipped} row(s) could not be parsed — fix them manually and re-run.`)
    process.exitCode = 1
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
