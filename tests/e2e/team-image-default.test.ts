import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// §TID — the explicit IMAGE default in /team (005 FR-05, AC-07) plus the two
// items carried from the T1 review: the star on disabled rows, and the brief
// picker / POST /api/briefs refusing legacy incompatible IMAGE rows.
// Every case runs in its own fresh team (soft-deleted afterwards). Key
// validation goes through T1's MOCK_AI seam, so a fake sk- key registers.

const ADMIN_EMAIL = 'admin@bisteccare.lk' // super admin
const ADMIN_PASSWORD = 'BistecStudio2026!'

interface Session {
  api: ApiClient
  teamId: string
  dispose(): Promise<void>
}

async function freshTeam(request: APIRequestContext, label: string): Promise<Session> {
  const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  const name = `Image-Default ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const teamRes = await sa.post('/api/admin/teams', { name })
  expect(teamRes.status()).toBe(201)
  const team = await teamRes.json()
  const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: name })
  return {
    api,
    teamId: team.id,
    async dispose() {
      await api.dispose()
      await sa.del(`/api/admin/teams/${team.id}`)
      await sa.dispose()
    },
  }
}

async function pageLoginToTeam(page: Page, teamId: string) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  const res = await page.request.post('/api/me/active-team', { data: { teamId } })
  expect(res.ok()).toBe(true)
}

type Row = {
  id: string
  slot: string
  providerKey: string
  isEnabled: boolean
  isDefault: boolean
  label: string
}

test.describe('§TID — IMAGE default in /team', () => {
  let t: Session
  test.beforeEach(async ({ request }, testInfo) => {
    t = await freshTeam(request, testInfo.title.slice(0, 16))
  })
  test.afterEach(async () => {
    await t.dispose()
  })

  test('AC-07: states (c) → (a) → (b); Make default restores (a)', async ({ page }) => {
    await pageLoginToTeam(page, t.teamId)
    await page.goto('/team')
    const state = page.getByTestId('image-default-state')

    // (c) no enabled, compatible IMAGE row
    await expect(state).toHaveAttribute('data-state', 'none')
    await expect(state).toContainText('No image provider')
    await expect(state).toContainText(
      'Teammates without a personal OpenAI key get no AI backgrounds',
    )

    // register one IMAGE row through the API (the first row becomes the default)
    const reg = await t.api.post('/api/admin/providers', {
      apiKey: 'sk-tid-image-000001',
      slot: 'IMAGE',
      label: 'TID Image',
    })
    expect(reg.status()).toBe(201)
    const row: Row = await reg.json()
    expect(row.isDefault).toBe(true)

    // (a) a default exists
    await page.reload()
    await expect(state).toHaveAttribute('data-state', 'default')
    await expect(state).toContainText('Teammates without a personal OpenAI key use this provider.')
    await expect(page.getByText('Default', { exact: true })).toBeVisible()

    // (b) no enabled default, but a serving fallback
    expect(
      (await t.api.patch(`/api/admin/providers/${row.id}`, { isDefault: false })).status(),
    ).toBe(200)
    await page.reload()
    await expect(state).toHaveAttribute('data-state', 'fallback')
    await expect(state).toContainText('No default set')
    await expect(state).toContainText('TID Image')
    await expect(state).toContainText('the oldest enabled image provider')

    // Make default restores (a) and persists
    await state.getByRole('button', { name: 'Make default' }).click()
    await expect(state).toHaveAttribute('data-state', 'default')
    const rows: Row[] = await (await t.api.get('/api/admin/providers')).json()
    expect(rows.find((r) => r.id === row.id)?.isDefault).toBe(true)
  })

  test('a disabled IMAGE row cannot be starred (button disabled, with a reason)', async ({
    page,
  }) => {
    await (
      await t.api.post('/api/admin/providers', {
        apiKey: 'sk-tid-image-000002',
        slot: 'IMAGE',
        label: 'TID A',
      })
    ).json()
    const b: Row = await (
      await t.api.post('/api/admin/providers', {
        apiKey: 'sk-tid-image-000003',
        slot: 'IMAGE',
        label: 'TID B',
      })
    ).json()
    expect((await t.api.patch(`/api/admin/providers/${b.id}`, { isEnabled: false })).status()).toBe(
      200,
    )

    await pageLoginToTeam(page, t.teamId)
    await page.goto('/team')
    const star = page.getByRole('button', { name: 'Set TID B as default' })
    await expect(star).toBeDisabled()
    await expect(star).toHaveAttribute('title', /enable/i)
    await expect(page.getByRole('button', { name: 'Set TID A as default' })).toBeEnabled()
  })

  test('the brief picker and POST /api/briefs refuse a legacy incompatible IMAGE row', async () => {
    test.skip(!dbAvailable, 'needs the test DB')
    const good: Row = await (
      await t.api.post('/api/admin/providers', {
        apiKey: 'sk-tid-image-000004',
        slot: 'IMAGE',
        label: 'TID Good',
      })
    ).json()
    const legacy = await prisma!.availableProvider.create({
      data: {
        teamId: t.teamId,
        slot: 'IMAGE',
        providerKey: `legacy-anthropic-${Date.now()}`,
        providerName: 'anthropic',
        label: 'Legacy Anthropic as IMAGE',
        keyPrefix: '…0005',
        encryptedApiKey: 'not-a-real-ciphertext',
        isEnabled: true,
        isDefault: false,
      },
    })

    const list: { id: string; providerKey: string }[] = await (
      await t.api.get('/api/providers/available?slot=IMAGE')
    ).json()
    expect(list.map((p) => p.id)).toEqual([good.id])

    const copy = await (
      await t.api.post('/api/admin/providers', {
        apiKey: 'tidcopy_key_123456789',
        slot: 'COPY',
        providerName: 'tidcopy',
        label: 'TID Copy',
      })
    ).json()
    const base = {
      topic: 'T',
      goal: 'awareness',
      tone: 'professional',
      channels: ['LINKEDIN'],
      designMode: 'GENERATE',
      copyProviderKey: copy.providerKey,
    }
    const bad = await t.api.post('/api/briefs', { ...base, imageProviderKey: legacy.providerKey })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).error).toBe('Invalid or disabled imageProviderKey')

    // Control: the same brief with the compatible row passes validation.
    const ok = await t.api.post('/api/briefs', { ...base, imageProviderKey: good.providerKey })
    expect(ok.status()).toBe(201)

    // COPY listing is unchanged by the filter.
    expect((await t.api.get('/api/providers/available?slot=COPY')).status()).toBe(200)
  })
})
