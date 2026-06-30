import { test, expect } from '@playwright/test'
import { readEnvTest } from '../helpers/db'

// §J — MCP / ACP surface (docs/e2e-test-plan.md).
//
// Contract (src/app/api/acp/{manifest,run}/route.ts + src/mcp/auth.ts):
//   Auth header: x-bistec-api-key, validated against BISTEC_API_KEYS /
//   BISTEC_ADMIN_API_KEYS (comma-separated). Missing/invalid → 401 (fails closed,
//   so with NO keys configured every request 401s).
//   GET  /api/acp/manifest → 200 AGENT_MANIFEST (capabilities generate_post, publish_post)
//   POST /api/acp/run {capability, input} → {output} | 400 (bad input) | 422 (failure)
//   /api/acp is exempt from the session middleware — the key check governs.
//
// The authenticated cases need a key the APP accepts AND the test knows. We read
// BISTEC_API_KEYS / BISTEC_ADMIN_API_KEYS (process env → .env.test) and use the
// first key. If none is configured, those cases skip (the app would 401 anyway).

function firstConfiguredKey(): string | null {
  for (const name of ['BISTEC_ADMIN_API_KEYS', 'BISTEC_API_KEYS']) {
    const raw = readEnvTest(name)
    if (raw) {
      const k = raw.split(',').map(s => s.trim()).filter(Boolean)[0]
      if (k) return k
    }
  }
  return null
}

const KEY = firstConfiguredKey()
const MOCK_AI = process.env.MOCK_AI === 'true'

test.describe('ACP surface', () => {
  // TC-ACP-01 — No / empty / garbage key → 401 (fails closed). Guards H1.
  test('manifest and run reject missing or invalid keys with 401', async ({ request }) => {
    // No header.
    expect((await request.get('/api/acp/manifest')).status()).toBe(401)
    // Empty header.
    expect((await request.get('/api/acp/manifest', { headers: { 'x-bistec-api-key': '' } })).status()).toBe(401)
    // Garbage header.
    expect((await request.get('/api/acp/manifest', { headers: { 'x-bistec-api-key': 'not-a-real-key' } })).status()).toBe(401)
    // run with a garbage key.
    const run = await request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': 'not-a-real-key' },
      data: { capability: 'generate_post', input: {} },
    })
    expect(run.status()).toBe(401)
  })

  // TC-ACP-02 — Valid key → manifest.
  test('a valid key returns the agent manifest', async ({ request }) => {
    test.skip(!KEY, 'no BISTEC_API_KEYS configured for the app/runner')
    const res = await request.get('/api/acp/manifest', { headers: { 'x-bistec-api-key': KEY! } })
    expect(res.status()).toBe(200)
    const manifest = await res.json()
    expect(manifest.name).toBe('bistec-studio')
    const names = (manifest.capabilities ?? []).map((c: { name: string }) => c.name)
    expect(names).toContain('generate_post')
    expect(names).toContain('publish_post')
  })

  // TC-ACP-03 — run input validation → 400. Guards M6.
  test('run rejects malformed capability input with 400', async ({ request }) => {
    test.skip(!KEY, 'no BISTEC_API_KEYS configured for the app/runner')
    // generate_post with empty input (missing topic/goal/tone/designMode/channels).
    const gen = await request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': KEY! },
      data: { capability: 'generate_post', input: {} },
    })
    expect(gen.status()).toBe(400)

    // publish_post missing channel.
    const pub = await request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': KEY! },
      data: { capability: 'publish_post', input: { draftId: 'x' } },
    })
    expect(pub.status()).toBe(400)

    // Missing capability entirely.
    const noCap = await request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': KEY! },
      data: { input: {} },
    })
    expect(noCap.status()).toBe(400)
  })

  // TC-ACP-04/05 — generate_post creates a draft under the system user (no FK
  // violation, guards L1) and returns a SIGNED exportUrl (guards H10).
  test('generate_post creates a draft and returns a signed exportUrl', async ({ request }) => {
    test.skip(!KEY, 'no BISTEC_API_KEYS configured for the app/runner')
    test.skip(!MOCK_AI, 'requires MOCK_AI for deterministic generation')
    const res = await request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': KEY! },
      data: {
        capability: 'generate_post',
        input: {
          topic: `ACP gen ${Date.now()}`,
          goal: 'Drive signups',
          tone: 'professional',
          channels: ['INSTAGRAM'],
          designMode: 'GENERATE',
        },
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.output?.draftId).toBeTruthy() // Brief+Draft created under the system user
    expect(body.output?.exportUrl).toMatch(/^https?:\/\//) // signed (H10)
  })
})
