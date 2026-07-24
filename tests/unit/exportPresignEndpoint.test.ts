// Presigned EXPORTS/DOCS URLs must be signed against the browser-facing PUBLIC
// endpoint, not the internal MinIO endpoint (prod blocker B5, 2026-07-24). On
// Coolify, MINIO_ENDPOINT is an internal container host (minio-xxxx:9000) that a
// browser can't resolve and whose SIGv4 host-bound signature won't validate
// behind the public reverse proxy — the symptom was blank library thumbnails
// and failed export downloads. getPresignedUrl must therefore use
// MINIO_PUBLIC_ENDPOINT when it is set, and fall back to MINIO_ENDPOINT when it
// isn't (local dev / tests, where both are localhost).
//
// env + minio read process.env at module load, so each case stubs env, resets
// the module registry, and dynamically imports a fresh copy.

import { describe, it, expect, vi, afterEach } from 'vitest'

const BASE_ENV = {
  MINIO_ENDPOINT: 'http://minio-internal-xyz:9000',
  MINIO_ACCESS_KEY: 'testkey',
  MINIO_SECRET_KEY: 'testsecret',
}

function stub(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v)
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('getPresignedUrl signing endpoint (B5)', () => {
  it('signs against the PUBLIC endpoint when MINIO_PUBLIC_ENDPOINT is set', async () => {
    vi.resetModules()
    stub({ ...BASE_ENV, MINIO_PUBLIC_ENDPOINT: 'https://minio.studio.bistecglobal.com' })
    const { getPresignedUrl, BUCKET_EXPORTS } = await import('@/lib/storage/minio')

    const signed = await getPresignedUrl(BUCKET_EXPORTS, 'exports/design-abc-123.png')
    const u = new URL(signed)

    expect(u.host).toBe('minio.studio.bistecglobal.com')
    expect(u.protocol).toBe('https:')
    // Not the internal host that broke prod.
    expect(u.host).not.toBe('minio-internal-xyz:9000')
    // Still a real presigned GET (signature present, path-style bucket/key).
    expect(u.searchParams.get('X-Amz-Signature')).toBeTruthy()
    expect(u.pathname).toContain('exports/design-abc-123.png')
  })

  it('falls back to MINIO_ENDPOINT when MINIO_PUBLIC_ENDPOINT is unset (dev/tests)', async () => {
    vi.resetModules()
    stub(BASE_ENV) // no MINIO_PUBLIC_ENDPOINT
    const { getPresignedUrl, BUCKET_EXPORTS } = await import('@/lib/storage/minio')

    const signed = await getPresignedUrl(BUCKET_EXPORTS, 'exports/design-abc-123.png')
    const u = new URL(signed)

    expect(u.host).toBe('minio-internal-xyz:9000')
    expect(u.searchParams.get('X-Amz-Signature')).toBeTruthy()
  })
})
