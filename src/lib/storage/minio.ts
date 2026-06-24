import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000"
// Browser-facing base URL for public objects. Defaults to the internal endpoint
// (correct for local dev where both are localhost:9000); set explicitly in prod
// when MinIO is reached internally (e.g. http://minio:9000) but served publicly
// from a different host. Trailing slash trimmed so publicUrl() joins cleanly.
const publicEndpoint = (process.env.MINIO_PUBLIC_ENDPOINT ?? endpoint).replace(/\/+$/, "")
const accessKeyId = process.env.MINIO_ACCESS_KEY ?? "minioadmin"
const secretAccessKey = process.env.MINIO_SECRET_KEY ?? "minioadmin"

// Fail closed in production: the "minioadmin/minioadmin" default grants full
// read/write/policy control of object storage to anyone who can reach MinIO.
// Dev keeps the convenient default. Mirrors the placeholder rejection in
// crypto.ts / auth.ts.
if (
  process.env.NODE_ENV === "production" &&
  (accessKeyId === "minioadmin" || secretAccessKey === "minioadmin")
) {
  throw new Error(
    "Refusing to start: set MINIO_ACCESS_KEY and MINIO_SECRET_KEY to non-default " +
      "values in production (the built-in 'minioadmin' default must not be used).",
  )
}

export const BUCKET_IMAGES = process.env.MINIO_BUCKET_IMAGES ?? "generated-images"
export const BUCKET_EXPORTS = process.env.MINIO_BUCKET_EXPORTS ?? "exported-designs"
export const BUCKET_BRANDKITS = process.env.MINIO_BUCKET_BRANDKITS ?? "brand-kits"

// Public-read buckets: objects are served via a stable, non-expiring URL. These
// hold assets embedded into stored HTML (generated images, brief uploads,
// logos/artifacts) so a saved design re-renders correctly indefinitely. The
// EXPORTS bucket is intentionally NOT here — final PNGs stay private and are
// signed per read (see resolveExportUrl).
const PUBLIC_BUCKETS = [BUCKET_IMAGES, BUCKET_BRANDKITS]

const s3 = new S3Client({
  endpoint,
  region: "us-east-1",
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
})

// Hosts our stored asset URLs are allowed to point at — the internal MinIO
// endpoint and the browser-facing public endpoint. Brief image URLs are only
// ever produced by /api/briefs/images (MinIO uploads), so legitimate values
// always match one of these.
const ASSET_HOSTS = new Set(
  [endpoint, publicEndpoint]
    .map((e) => {
      try {
        return new URL(e).host
      } catch {
        return null
      }
    })
    .filter((h): h is string => h !== null),
)

// SSRF guard: validates that a user-supplied asset URL is http(s) and points at
// our own MinIO storage. These URLs get embedded into agent-generated HTML and
// fetched by headless Chromium during render (page.setContent + networkidle0),
// so an unvalidated URL is a server-side request-forgery vector (cloud metadata,
// internal services, other ports). Reject anything off-host before it is stored.
export function isAllowedAssetUrl(value: string): boolean {
  let u: URL
  try {
    u = new URL(value)
  } catch {
    return false
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false
  return ASSET_HOSTS.has(u.host)
}

const SEVEN_DAYS = 60 * 60 * 24 * 7

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB
// Raster only — SVG is intentionally excluded (script-bearing SVGs are an XSS
// vector once embedded in agent-rendered HTML).
export const RASTER_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

// Validates an uploaded File. Returns an error string, or null when acceptable.
// Pass `allowed` to enforce a MIME allow-list (use for untrusted/public uploads);
// omit it to enforce the size cap only (admin-trusted uploads, e.g. fonts whose
// MIME type browsers report inconsistently).
export function validateUpload(file: File, allowed?: string[]): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB size limit`
  }
  if (allowed && (!file.type || !allowed.includes(file.type))) {
    return `Unsupported file type${file.type ? `: ${file.type}` : ""}`
  }
  return null
}

async function ensureBucket(bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }))
  }
}

// Grant anonymous read on a bucket so its objects are fetchable via a stable URL
// without signing. Idempotent — safe to re-apply on every cold start.
async function setPublicReadPolicy(bucket: string): Promise<void> {
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

// Cache the in-flight promise (not a boolean) so concurrent first-callers on a
// cold start share one initialization instead of racing duplicate bucket creates.
let bucketInit: Promise<void> | null = null

export async function initBuckets(): Promise<void> {
  if (!bucketInit) {
    bucketInit = (async () => {
      await Promise.all([
        ensureBucket(BUCKET_IMAGES),
        ensureBucket(BUCKET_EXPORTS),
        ensureBucket(BUCKET_BRANDKITS),
      ])
      // Buckets must exist before a policy can be attached.
      await Promise.all(PUBLIC_BUCKETS.map(setPublicReadPolicy))
    })().catch((err) => {
      // Reset so a later call can retry after a transient failure.
      bucketInit = null
      throw err
    })
  }
  return bucketInit
}

// Uploads bytes and returns the object KEY. Callers decide how to expose it:
// public-bucket assets → publicUrl(bucket, key) (stored/embedded directly);
// private EXPORTS → store the key, sign per read via resolveExportUrl(key).
export async function uploadObject(
  buffer: Buffer,
  bucket: string,
  key: string,
  contentType = "application/octet-stream"
): Promise<string> {
  await initBuckets()
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )
  return key
}

// Stable, non-expiring URL for an object in a public-read bucket. Safe to embed
// in stored HTML.
export function publicUrl(bucket: string, key: string): string {
  return `${publicEndpoint}/${bucket}/${key}`
}

// Resolve a stored EXPORTS reference to a fetchable URL: signs the object key
// for short-lived read access. Null-safe. Tolerates legacy rows that stored a
// full presigned URL before the object-key migration (passes them through).
export async function resolveExportUrl(
  keyOrUrl: string | null | undefined
): Promise<string | null> {
  if (!keyOrUrl) return null
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl
  return getPresignedUrl(BUCKET_EXPORTS, keyOrUrl)
}

export async function getPresignedUrl(
  bucket: string,
  key: string,
  expiresIn = SEVEN_DAYS
): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn })
}
