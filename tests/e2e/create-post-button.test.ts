import { test, expect, type Locator, type Page, type Route } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'

// Floating Create post button (change 011 T1 — AC-01, AC-02, AC-03). The
// dashboard quick action is named "Create Post", so every lookup here is
// exact (case-sensitive) or goes through the button's test id.

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)

// Same flow as ui.test.ts pageLogin. A super admin with more than one team
// lands on /choose-team.
async function pageLogin(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  await page.goto('/')
  if (page.url().includes('/choose-team')) {
    await page.getByRole('button', { name: 'Bistec' }).click()
    await page.waitForURL((url) => url.pathname === '/')
  }
}

// Mint an EXPORTED draft via the API, owned by the admin so the browser
// session can open it.
async function createExportedDraft(api: ApiClient, topic: string): Promise<string> {
  const kit = await (
    await api.post('/api/admin/brandkits', { name: `FAB Kit ${topic}`, colors: ['#0284c7'] })
  ).json()
  const camp = await (
    await api.post('/api/campaigns', { name: `FAB Camp ${topic}`, brandKitId: kit.id })
  ).json()
  const brief = await (
    await api.post('/api/briefs', {
      topic,
      goal: 'g',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      campaignId: camp.id,
    })
  ).json()
  const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(assembleRes.status()).toBe(202)
  const { draftId } = await assembleRes.json()
  const draft = await waitForDraft(api, draftId)
  expect(draft.status).toBe('EXPORTED')
  return draftId
}

function fab(page: Page): Locator {
  return page.getByTestId('create-post-fab')
}

// The button sits in the bottom-right corner: its right and bottom edges are
// within 32px of the viewport's (it is placed 24px in).
async function expectBottomRight(page: Page) {
  const box = await fab(page).boundingBox()
  const vp = page.viewportSize()
  expect(box).not.toBeNull()
  expect(vp).not.toBeNull()
  expect(vp!.width - (box!.x + box!.width)).toBeLessThanOrEqual(32)
  expect(vp!.height - (box!.y + box!.height)).toBeLessThanOrEqual(32)
}

// Tab from the top of a freshly loaded page until the button holds focus,
// then report whether the browser treats that focus as :focus-visible and what
// outline it draws.
async function tabToFab(page: Page) {
  for (let i = 0; i < 150; i++) {
    await page.keyboard.press('Tab')
    const onFab = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') === 'create-post-fab',
    )
    if (onFab) {
      return page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        const cs = getComputedStyle(el)
        return {
          focusVisible: el.matches(':focus-visible'),
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
        }
      })
    }
  }
  throw new Error('Create post button was not reached with Tab')
}

test.describe('Create post button (011 FR-01 – FR-03)', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  // AC-01 — visible bottom-right on /, /library, /campaigns and /drafts/[id],
  // each navigating to /brief; absent on /brief itself.
  test('AC-01: shown bottom-right on app pages, links to /brief, absent on /brief', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint a draft')
    const draftId = await createExportedDraft(api, `fab-ac01-${Date.now()}`)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)

    for (const path of ['/', '/library', '/campaigns', `/drafts/${draftId}`]) {
      await page.goto(path)
      const link = page.getByRole('link', { name: 'Create post', exact: true })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', '/brief')
      await expectBottomRight(page)
      await link.click()
      await page.waitForURL((url) => url.pathname === '/brief')
      await expect(fab(page)).toHaveCount(0)
    }

    // A resumed brief is still /brief (the query string is not part of the path).
    await page.goto('/brief?resume=does-not-exist')
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible()
    await expect(fab(page)).toHaveCount(0)
  })

  // AC-02 — icon + label at 1440px; icon only (same accessible name, tooltip)
  // at 375px; reachable with Tab and visibly focused at both widths.
  test('AC-02: label at desktop, icon only at mobile, keyboard focus visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)

    const link = page.getByRole('link', { name: 'Create post', exact: true })
    await expect(link).toBeVisible()
    await expect(fab(page).getByText('Create post', { exact: true })).toBeVisible()
    await page.goto('/')
    let focus = await tabToFab(page)
    expect(focus.focusVisible).toBe(true)
    expect(focus.outlineStyle).not.toBe('none')
    expect(focus.outlineWidth).not.toBe('0px')

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await expect(link).toBeVisible()
    await expect(fab(page).getByText('Create post', { exact: true })).toBeHidden()
    await expect(fab(page)).toHaveAttribute('title', 'Create post')
    await expectBottomRight(page)
    focus = await tabToFab(page)
    expect(focus.focusVisible).toBe(true)
    expect(focus.outlineStyle).not.toBe('none')
    expect(focus.outlineWidth).not.toBe('0px')
  })

  // AC-03 — three toasts never cover the button. The campaign create is made
  // to fail (stubbed 500), and each failure toasts its error; the form stays
  // open, so it can be submitted three times. Checked at desktop and at
  // Sonner's full-width mobile layout.
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    test(`AC-03: toasts stack above the button at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await pageLogin(page)
      let n = 0
      await page.route('**/api/campaigns', (route: Route) => {
        if (route.request().method() !== 'POST') return route.continue()
        n += 1
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: `FAB toast ${n}` }),
        })
      })

      await page.goto('/campaigns')
      await expect(fab(page)).toBeVisible()
      await page.getByRole('button', { name: 'New Campaign' }).click()
      await page.getByPlaceholder('e.g. Summer Product Launch').fill('FAB toast campaign')
      const create = page.getByRole('button', { name: 'Create', exact: true })
      for (let i = 1; i <= 3; i++) {
        await create.click()
        await expect(page.getByText(`FAB toast ${i}`, { exact: true })).toBeVisible()
      }

      // Poll until the entry animations settle: every toast's box, transforms
      // included, must clear the button's box.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const b = document.querySelector('[data-testid="create-post-fab"]')!.getBoundingClientRect()
              const toasts = Array.from(document.querySelectorAll('[data-sonner-toast]'))
              const overlaps = toasts.filter((t) => {
                const r = t.getBoundingClientRect()
                return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top
              }).length
              return { count: toasts.length, overlaps }
            }),
          { timeout: 3000 },
        )
        .toEqual({ count: 3, overlaps: 0 })
    })
  }
})
