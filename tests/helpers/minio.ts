import { S3Client, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { readEnvTest } from './db'

// Direct MinIO access for the cases that assert on storage itself (025: the
// private screenshot objects live in the docs bucket, which has no public URL).
// Credentials come from .env.test, like the DB URL.

export const DOCS_BUCKET = readEnvTest('MINIO_BUCKET_DOCS') ?? 'campaign-docs'

const s3 = new S3Client({
  endpoint: readEnvTest('MINIO_ENDPOINT') ?? 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: readEnvTest('MINIO_ACCESS_KEY') ?? 'minioadmin',
    secretAccessKey: readEnvTest('MINIO_SECRET_KEY') ?? 'minioadmin',
  },
  forcePathStyle: true,
})

export async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch {
    return false
  }
}

export async function removeObject(bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
