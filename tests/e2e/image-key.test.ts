import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// §AI — the personal image generation key (031 group C, AC-12), through the
// card at /settings and the real resolver. The route is still
// /api/me/openai-key. The seam (src/lib/testHooks.ts, consulted in
// src/lib/agent/background.ts) is gated on MOCK_AI plus a sentinel in the BRIEF
// TOPIC:
//   __MOCK_BG__               the decision is "needed"; the REAL resolver picks
//                             the provider; only its generateImage is swapped
//   __MOCK_BG_PERSONAL_FAIL__ same, but the PERSONAL tier's image call throws
//                             (the team tier succeeds), so the fallback runs
//
// Every case runs in its own fresh team (soft-deleted afterwards). The acting
// user is the seeded super admin, whose personal key is removed after each case.

const ADMIN_EMAIL = 'admin@bisteccare.lk' // super admin
const ADMIN_PASSWORD = 'BistecStudio2026!'

const OPENAI_KEY = 'sk-ik-fake-openai-key-0000000000001111'
const GEMINI_KEY = 'AIzaSy' + 'IKgemini_personal_key_0123456789ab' // AIzaSy + 34 chars

interface TeamSession {
  api: ApiClient
  teamId: string
  kitId: string
  copyKey: string
  dispose(): Promise<void>
}

async function freshTeam(request: APIRequestContext, label: string): Promise<TeamSession> {
  const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  const name = `Image-key ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const teamRes = await sa.post('/api/admin/teams', { name })
  expect(teamRes.status()).toBe(201)
  const team = await teamRes.json()
  const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: name })

  const kitRes = await api.post('/api/admin/brandkits', { name: 'IK Kit', colors: ['#0284c7', '#020617'] })
  expect(kitRes.status()).toBe(201)
  const kit = await kitRes.json()
  const copyRes = await api.post('/api/admin/providers', {
    apiKey: 'ikcopy_key_123456789',
    slot: 'COPY',
    providerName: 'ikcopy',
    label: 'IK Copy',
  })
  expect(copyRes.status()).toBe(201)
  const copy = await copyRes.json()

  return {
    api,
    teamId: team.id,
    kitId: kit.id,
    copyKey: copy.providerKey,
    async dispose() {
      await api.del('/api/me/openai-key')
      await api.dispose()
      await sa.del(`/api/admin/teams/${team.id}`)
      await sa.dispose()
    },
  }
}

async function generate(t: TeamSession, topic: string): Promise<Record<string, unknown>> {
  const briefRes = await t.api.post('/api/briefs', {
    topic,
    goal: 'awareness',
    tone: 'professional',
    channels: ['LINKEDIN'],
    designMode: 'GENERATE',
    copyProviderKey: t.copyKey,
    brandKitId: t.kitId,
  })
  expect(briefRes.status()).toBe(201)
  const brief = await briefRes.json()
  const res = await t.api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  const draft = await waitForDraft(t.api, (await res.json()).draftId)
  expect(draft.status).toBe('EXPORTED')
  return draft
}

async function pageLoginToTeam(page: Page, teamId: string) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  // page.request shares the browser context's cookie jar.
  const res = await page.request.post('/api/me/active-team', { data: { teamId } })
  expect(res.ok()).toBe(true)
}

// Types a key into the card on /settings and presses Connect (or Replace). The
// response listener is created before the click.
async function connectViaCard(page: Page, key: string) {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Image generation key', level: 2 })).toBeVisible()
  await page.getByLabel('Image generation API key').fill(key)
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/me/openai-key') && r.request().method() === 'PUT',
  )
  const form = page.locator('form', { has: page.getByLabel('Image generation API key') })
  await form.getByRole('button', { name: /^(Connect|Replace)$/ }).click()
  expect((await saved).status()).toBe(200)
}

function mocked() {
  return !!process.env.MOCK_AI && !!process.env.MOCK_PUPPETEER
}

test.describe('§AI — personal image generation key', () => {
  let t: TeamSession
  test.beforeEach(async ({ request }, testInfo) => {
    test.skip(!mocked(), 'needs MOCK_AI + MOCK_PUPPETEER (the background seam)')
    t = await freshTeam(request, testInfo.title.slice(0, 12))
  })
  test.afterEach(async () => {
    await t?.dispose()
  })

  // TC-IK-01
  test('TC-IK-01: an OpenAI key connects through the card and shows OpenAI next to the suffix', async ({ page }) => {
    await pageLoginToTeam(page, t.teamId)
    await connectViaCard(page, OPENAI_KEY)
    await expect(page.getByTestId('image-key-summary')).toHaveText(`OpenAI …${OPENAI_KEY.slice(-4)}`)
    const me = await (await t.api.get('/api/me/openai-key')).json()
    expect(me).toMatchObject({ connected: true, status: 'ACTIVE', provider: 'openai' })
    expect(JSON.stringify(me)).not.toContain(OPENAI_KEY)
  })

  // TC-IK-02 — AC-12 (card half)
  test('TC-IK-02: a Gemini key connects through the card and shows Gemini next to the suffix', async ({ page }) => {
    await pageLoginToTeam(page, t.teamId)
    await connectViaCard(page, GEMINI_KEY)
    await expect(page.getByTestId('image-key-summary')).toHaveText(`Gemini …${GEMINI_KEY.slice(-4)}`)
    const me = await (await t.api.get('/api/me/openai-key')).json()
    expect(me).toMatchObject({ connected: true, status: 'ACTIVE', provider: 'gemini' })
  })

  // TC-IK-03
  test('TC-IK-03: an Anthropic key and a random string are refused and nothing is stored', async () => {
    for (const bad of ['sk-ant-api03-' + 'x'.repeat(40), 'not-a-key-at-all-0123456789', 'AIza-too-short']) {
      const res = await t.api.put('/api/me/openai-key', { key: bad })
      expect(res.status(), bad).toBe(400)
      expect(JSON.stringify(await res.json())).toContain(
        'Paste an OpenAI key (starts with sk-) or a Gemini key (starts with AIza)',
      )
    }
    const me = await (await t.api.get('/api/me/openai-key')).json()
    expect(me.connected).toBe(false)
  })

  // TC-IK-04 — AC-12 (draft half)
  test('TC-IK-04: a personal Gemini key serves the image; the draft records tier personal, provider gemini', async () => {
    expect((await t.api.put('/api/me/openai-key', { key: GEMINI_KEY })).status()).toBe(200)
    // No team image provider at all: only the personal key can serve.
    const draft = await generate(t, `IK personal gemini __MOCK_BG__ ${Date.now()}`)
    expect(draft.backgroundSkipped).toBeNull()
    expect(draft.imageUrl).toMatch(/^https?:\/\/.+\/background-.+\.png$/)
    expect(draft.imageSourceNotice).toBeNull()
    if (dbAvailable) {
      const row = await prisma!.draft.findUnique({ where: { id: draft.id as string } })
      expect(row?.imageSource).toEqual({ tier: 'personal', provider: 'gemini' })
    }
  })

  // TC-IK-05 — AC-12 (fallback half)
  test('TC-IK-05: a failing personal Gemini key falls back to the team provider and the draft says so', async ({ page }) => {
    const reg = await t.api.post('/api/admin/providers', { apiKey: 'sk-ik-team-image-000001', slot: 'IMAGE' })
    expect(reg.status()).toBe(201)
    expect((await t.api.put('/api/me/openai-key', { key: GEMINI_KEY })).status()).toBe(200)

    const draft = await generate(t, `IK personal fails __MOCK_BG__ __MOCK_BG_PERSONAL_FAIL__ ${Date.now()}`)
    expect(draft.imageUrl).toMatch(/^https?:\/\/.+\/background-.+\.png$/) // the team's provider made it
    expect(draft.backgroundSkipped).toBeNull()
    expect(draft.imageSourceNotice).toEqual({
      message: "Your image generation key (Gemini) failed, so the team's image provider made this image.",
    })
    if (dbAvailable) {
      const row = await prisma!.draft.findUnique({ where: { id: draft.id as string } })
      expect(row?.imageSource).toMatchObject({ tier: 'team', personalFailed: true, personalProvider: 'gemini' })
    }

    await pageLoginToTeam(page, t.teamId)
    await page.goto(`/drafts/${draft.id}`)
    const notice = page.getByTestId('image-source-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveAttribute('role', 'status')
    await expect(notice).toContainText('Your image generation key (Gemini) failed')
    await expect(page.getByTestId('background-notice')).toHaveCount(0)
  })

  // TC-IK-06
  test('TC-IK-06: Disconnect removes the key and the card returns to Not connected', async ({ page }) => {
    await pageLoginToTeam(page, t.teamId)
    await connectViaCard(page, OPENAI_KEY)
    await expect(page.getByTestId('image-key-summary')).toBeVisible()

    await page.getByRole('button', { name: 'Disconnect' }).click()
    const removed = page.waitForResponse(
      (r) => r.url().includes('/api/me/openai-key') && r.request().method() === 'DELETE',
    )
    await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()
    expect((await removed).status()).toBe(200)
    await expect(page.getByTestId('image-key-summary')).toHaveCount(0)
    await expect(page.getByText('Not connected').first()).toBeVisible()
    expect((await (await t.api.get('/api/me/openai-key')).json()).connected).toBe(false)
  })
})
