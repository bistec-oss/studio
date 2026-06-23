import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000"
const accessKeyId = process.env.MINIO_ACCESS_KEY ?? "minioadmin"
const secretAccessKey = process.env.MINIO_SECRET_KEY ?? "minioadmin"

export const BUCKET_IMAGES = process.env.MINIO_BUCKET_IMAGES ?? "generated-images"
export const BUCKET_EXPORTS = process.env.MINIO_BUCKET_EXPORTS ?? "exported-designs"
export const BUCKET_BRANDKITS = process.env.MINIO_BUCKET_BRANDKITS ?? "brand-kits"

const s3 = new S3Client({
  endpoint,
  region: "us-east-1",
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
})

const SEVEN_DAYS = 60 * 60 * 24 * 7

async function ensureBucket(bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }))
  }
}

// Cache the in-flight promise (not a boolean) so concurrent first-callers on a
// cold start share one initialization instead of racing duplicate bucket creates.
let bucketInit: Promise<void> | null = null

export async function initBuckets(): Promise<void> {
  if (!bucketInit) {
    bucketInit = Promise.all([
      ensureBucket(BUCKET_IMAGES),
      ensureBucket(BUCKET_EXPORTS),
      ensureBucket(BUCKET_BRANDKITS),
    ])
      .then(() => undefined)
      .catch((err) => {
        // Reset so a later call can retry after a transient failure.
        bucketInit = null
        throw err
      })
  }
  return bucketInit
}

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
  return getPresignedUrl(bucket, key)
}

export async function getPresignedUrl(
  bucket: string,
  key: string,
  expiresIn = SEVEN_DAYS
): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn })
}
