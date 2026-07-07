import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "@/lib/env"

const endpoint = env.MINIO_ENDPOINT
// Browser-facing base URL for public objects. Defaults to the internal endpoint
// (correct for local dev where both are localhost:9000); set explicitly in prod
// when MinIO is reached internally (e.g. http://minio:9000) but served publicly
// from a different host. Trailing slash trimmed so publicUrl() joins cleanly.
const publicEndpoint = (env.MINIO_PUBLIC_ENDPOINT ?? endpoint).replace(/\/+$/, "")
const accessKeyId = env.MINIO_ACCESS_KEY
const secretAccessKey = env.MINIO_SECRET_KEY

// Fail closed in production: the "minioadmin/minioadmin" default rejection now
// lives centrally in src/lib/env.ts (thrown when env is first imported), along
// with the TOKEN_ENCRYPTION_KEY / BETTER_AUTH_SECRET placeholder rejections.
// Dev keeps the convenient default.

export const BUCKET_IMAGES = env.MINIO_BUCKET_IMAGES
export const BUCKET_EXPORTS = env.MINIO_BUCKET_EXPORTS
export const BUCKET_BRANDKITS = env.MINIO_BUCKET_BRANDKITS
// Campaign source documents (briefing assistant) — private, like EXPORTS.
export const BUCKET_DOCS = env.MINIO_BUCKET_DOCS

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
        ensureBucket(BUCKET_DOCS),
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

// Every EXPORTS object key comes from here — one namespaced format per render
// kind, so lifecycle policies and debugging-by-prefix work across the bucket.
export type ExportKind = "design" | "refine" | "restore" | "export" | "cli"

export function exportKey(kind: ExportKind, id: string): string {
  return `exports/${kind}-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
}

// Persists a base64 `data:` image URL into the public IMAGES bucket and returns
// its stable public URL. Single implementation for the agent's generateImage
// tool and the /api/generate/image route — enforces the raster allow-list in
// both (the declared type lands in a public-read bucket and gets embedded into
// rendered HTML, so a text/html or image/svg+xml payload would be stored XSS).
export async function persistDataUrlImage(dataUrl: string, keyPrefix: string): Promise<string> {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) throw new Error("Invalid base64 data URL from image provider")
  const [, contentType, b64] = matches
  if (!RASTER_IMAGE_TYPES.includes(contentType)) {
    throw new Error(`Unsupported image content-type from provider: ${contentType}`)
  }
  const ext = contentType === "image/png" ? "png" : contentType.split("/")[1]
  const key = `${keyPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const buffer = Buffer.from(b64, "base64")
  await uploadObject(buffer, BUCKET_IMAGES, key, contentType)
  // Public, non-expiring URL — embedded into HTML that is stored and re-rendered
  // later (refine), so it must not expire.
  return publicUrl(BUCKET_IMAGES, key)
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

// Best-effort object removal (used when the owning DB row is deleted).
export async function deleteObject(bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export async function getPresignedUrl(
  bucket: string,
  key: string,
  expiresIn = SEVEN_DAYS
): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn })
}
