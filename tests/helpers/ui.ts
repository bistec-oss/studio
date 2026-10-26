import { expect, type Page } from '@playwright/test'
import { waitForDraft, type ApiClient } from './api'

// Shared E2E helpers for the UI suites: change 011's surfaces suite and
// change 014's a11y suite. Moved out of tests/e2e/surfaces.test.ts by 014 T9
// as a pure move (design.md §6); the bodies are unchanged.

export const ADMIN_EMAIL = 'admin@bisteccare.lk'
export const ADMIN_PASSWORD = 'BistecStudio2026!'

// A 1×1 PNG for the Images step's upload row.
export const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
)

// The caller's unfinished briefs, so a case can discard the ones it autosaved.
export async function briefDraftIds(api: ApiClient): Promise<string[]> {
  const body = await (await api.get('/api/brief-drafts')).json()
  return (body.drafts ?? []).map((d: { id: string }) => d.id)
}

// Same flow as ui.test.ts pageLogin. A super admin with more than one team
// lands on /choose-team.
export async function pageLogin(page: Page) {
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

// AC-11 / AC-12: the page never scrolls sideways.
export async function expectNoHorizontalScroll(page: Page, what: string) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }))
  expect(sw, `${what}: scrollWidth ${sw} > clientWidth ${cw}`).toBeLessThanOrEqual(cw)
}

// AC-17: Tab from the top of the page three times. Each stop is a
// :focus-visible element that draws an outline or a ring (box-shadow). Polled,
// because a ring can transition in. Returns a short label per stop.
export async function tabThreeWithVisibleFocus(page: Page): Promise<string[]> {
  const stops: string[] = []
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab')
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          if (!el || el === document.body) return 'nothing focused'
          const cs = getComputedStyle(el)
          // Tailwind's outline-none is `2px solid transparent`: an outline only
          // counts when its colour is not fully transparent (T7). A ring counts
          // on the same terms: Tailwind writes an unused ring as a transparent
          // `0 0 0 0` box-shadow layer, so a layer counts only when its colour
          // is not fully transparent and one of its lengths is non-zero (T13).
          const transparent = (c: string) =>
            c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c)
          const c = cs.outlineColor
          const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && !transparent(c)
          const ring =
            cs.boxShadow !== 'none' &&
            cs.boxShadow.split(/,(?![^(]*\))/).some((layer) => {
              const colour = layer.match(/rgba?\([^)]*\)/)?.[0] ?? 'transparent'
              const lengths = layer.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) ?? []
              return !transparent(colour) && lengths.some((l) => parseFloat(l) !== 0)
            })
          if (!el.matches(':focus-visible')) return 'not :focus-visible'
          return outline || ring ? 'visible' : 'no indicator'
        }),
      )
      .toBe('visible')
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        return (el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.textContent ?? '').trim()
      }),
    )
  }
  return stops
}

// AC-17 on a screen: start focus at <main> (made focusable for the test only),
// so the next Tab lands on the screen's first interactive element, past the
// shell's stops that T6 already covers.
export async function tabThreeFromMain(page: Page): Promise<string[]> {
  await page.locator('main').evaluate((el) => {
    el.setAttribute('tabindex', '-1')
    ;(el as HTMLElement).focus()
  })
  return tabThreeWithVisibleFocus(page)
}

// A project, a campaign under it with two briefing versions, and two queue
// entries (one PENDING, one CANCELLED), made through the API.
export async function mintCampaignFixture(api: ApiClient) {
  const stamp = `${Date.now()}`
  const project = await (await api.post('/api/projects', { name: `T10 Project ${stamp}` })).json()
  const camp = await (
    await api.post('/api/campaigns', { name: `T10 Campaign ${stamp}`, projectId: project.id })
  ).json()
  for (const content of ['T10 briefing v1', 'T10 briefing v2, the active one']) {
    expect((await api.post(`/api/campaigns/${camp.id}/briefing`, { content })).status()).toBe(201)
  }
  const entry = (topic: string) => ({
    topic,
    goal: 'Awareness',
    tone: 'professional',
    channels: ['INSTAGRAM', 'LINKEDIN'],
    designMode: 'GENERATE',
    generateAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    postAction: 'HOLD',
  })
  const pending = await api.post(`/api/campaigns/${camp.id}/queue`, entry(`T10 pending ${stamp}`))
  expect(pending.status()).toBe(201)
  const cancelled = await (await api.post(`/api/campaigns/${camp.id}/queue`, entry(`T10 cancelled ${stamp}`))).json()
  expect((await api.del(`/api/campaigns/${camp.id}/queue/${cancelled.id}`)).status()).toBe(204)
  return { project, camp }
}

// A kit with colours, fonts, two voice-prompt versions, a logo, a template, a
// reference-doc artifact and an assistant source document, made through the API.
export async function mintBrandKitFixture(api: ApiClient) {
  const stamp = `${Date.now()}`
  const kit = await (
    await api.post('/api/admin/brandkits', {
      name: `T11 Kit ${stamp}`,
      colors: ['#0b6e4f', '#f2c14e'],
      fonts: [{ name: 'DM Sans', url: 'https://fonts.googleapis.com/css2?family=DM+Sans' }],
    })
  ).json()
  for (const content of ['T11 voice v1', 'T11 voice v2, the active one']) {
    expect((await api.post(`/api/admin/brandkits/${kit.id}/prompts`, { content })).status()).toBe(201)
  }
  const logo = await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
    file: { name: 't11-logo.png', mimeType: 'image/png', buffer: ONE_PX_PNG },
    type: 'LOGO',
    name: `t11-logo-${stamp}`,
    feedToAI: 'true',
  })
  expect(logo.ok()).toBe(true)
  const doc = await api.multipart(`/api/admin/brandkits/${kit.id}/artifacts`, {
    file: { name: `t11-guide-${stamp}.txt`, mimeType: 'text/plain', buffer: Buffer.from('T11 guidelines') },
    type: 'REFERENCE_DOC',
    name: `t11-guide-${stamp}.txt`,
    feedToAI: 'false',
  })
  expect(doc.ok()).toBe(true)
  const template = await api.post(`/api/admin/brandkits/${kit.id}/templates`, {
    name: `T11 template ${stamp}`,
    htmlTemplate: '<!DOCTYPE html><html><body>{{headline}}</body></html>',
    aspectRatio: 'SQUARE',
  })
  expect(template.ok()).toBe(true)
  const source = await api.multipart(`/api/admin/brandkits/${kit.id}/documents`, {
    file: { name: `t11-brand-book-${stamp}.txt`, mimeType: 'text/plain', buffer: Buffer.from('T11 brand book') },
  })
  expect(source.ok()).toBe(true)
  return { kit, stamp }
}

// A fresh EXPORTED Path B draft, for a case that changes it (T9).
export async function mintExportedDraft(api: ApiClient, topic: string): Promise<{ id: string; topic: string }> {
  const kit = await (
    await api.post('/api/admin/brandkits', { name: `Surfaces Kit ${topic}`, colors: ['#8c4812'] })
  ).json()
  const camp = await (
    await api.post('/api/campaigns', { name: `Surfaces Camp ${topic}`, brandKitId: kit.id })
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
  const res = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  const { draftId } = await res.json()
  const draft = await waitForDraft(api, draftId)
  expect(draft.status).toBe('EXPORTED')
  return { id: draftId, topic }
}
