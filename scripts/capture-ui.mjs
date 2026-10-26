// Screenshot capture of every app screen (change 011, FR-14 / AC-15).
//
// A review tool, not a gate (011 spec A1): it saves PNGs for a person to look
// at, and asserts nothing. It logs in against a RUNNING server, visits each
// FR-11 screen plus the shell with the mobile sidebar open, in light and dark,
// at 1440 px and 375 px wide.
//
// Usage (with `npm run test:e2e:serve` running on :3001):
//   node scripts/capture-ui.mjs                  → ui-captures/<YYYY-MM-DD>/
//   node scripts/capture-ui.mjs --out ui-captures/before
//
// Environment:
//   TEST_BASE_URL     server to capture (default http://localhost:3001)
//   CAPTURE_USERNAME  account to sign in as (default: the seeded E2E admin)
//   CAPTURE_PASSWORD  its password (default: the seeded E2E fixture password)
//   CAPTURE_TEAM      team to make active when a chooser appears (default Bistec)
//
// If the account can see no draft, one is generated through the mock seams
// (brand kit → campaign → brief → assemble-b), so run it against a MOCK_AI +
// MOCK_PUPPETEER server. Without the mocks the draft screen is skipped.
//
// Output goes to the gitignored ui-captures/ folder. Files are named
// <screen>-<theme>-<width>.png.

import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'
// The seeded E2E fixture account (scripts/seed-admin.mjs), the same one the
// Playwright suite signs in with. Override for any other server.
const USERNAME = process.env.CAPTURE_USERNAME ?? 'admin@bisteccare.lk'
const PASSWORD = process.env.CAPTURE_PASSWORD ?? 'BistecStudio2026!'
const TEAM = process.env.CAPTURE_TEAM ?? 'Bistec'

const outArg = process.argv.indexOf('--out')
const OUT = resolve(
  outArg > -1 && process.argv[outArg + 1]
    ? process.argv[outArg + 1]
    : join('ui-captures', new Date().toISOString().slice(0, 10)),
)

const THEMES = ['light', 'dark']
const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375', width: 375, height: 812 },
]

function log(msg) {
  console.log(`[capture-ui] ${msg}`)
}

// A fresh context per theme. The theme is set both ways the app reads it:
// the stored manual choice (themeInitScript reads `bistec-theme`) and the OS
// preference it falls back to.
async function newThemedContext(browser, theme) {
  const context = await browser.newContext({ baseURL: BASE, colorScheme: theme })
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('bistec-theme', t)
    } catch {
      // storage blocked: the colorScheme emulation still applies
    }
  }, theme)
  return context
}

async function signIn(page) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(USERNAME)
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  // A full navigation, so team resolution runs server-side against the fresh
  // session (same dance as the E2E suite's pageLogin).
  await page.goto('/')
  if (page.url().includes('/choose-team')) {
    await page.getByRole('button', { name: TEAM }).click()
    await page.waitForURL((url) => url.pathname === '/')
  }
}

async function getJson(page, path) {
  const res = await page.request.get(path)
  if (!res.ok()) throw new Error(`GET ${path} → ${res.status()}`)
  return res.json()
}

async function postJson(page, path, data) {
  const res = await page.request.post(path, { data })
  if (!res.ok()) throw new Error(`POST ${path} → ${res.status()}`)
  return res.json()
}

// The newest draft the account can see, or a freshly generated one.
async function findOrCreateDraft(page) {
  const library = await getJson(page, '/api/library?pageSize=1')
  if (library.drafts?.length) return library.drafts[0].id

  log('no draft visible — generating one through the mock seams')
  try {
    const stamp = Date.now()
    const kit = await postJson(page, '/api/admin/brandkits', {
      name: `Capture kit ${stamp}`,
      colors: ['#211c18', '#f6f3ed'],
    })
    const campaign = await postJson(page, '/api/campaigns', {
      name: `Capture campaign ${stamp}`,
      brandKitId: kit.id,
    })
    const brief = await postJson(page, '/api/briefs', {
      topic: 'UI capture sample post',
      goal: 'Show the draft review screen',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      // The seeded keyless COPY row (scripts/seed-cli-provider.mjs).
      copyProviderKey: 'cli',
      campaignId: campaign.id,
    })
    const { draftId } = await postJson(page, '/api/generate/assemble-b', { briefId: brief.id })
    const deadline = Date.now() + 60_000
    for (;;) {
      const draft = await getJson(page, `/api/drafts/${draftId}`)
      if (draft.status && draft.status !== 'IN_PROGRESS') return draftId
      if (Date.now() > deadline) return draftId
      await page.waitForTimeout(500)
    }
  } catch (err) {
    log(`could not generate a draft (${err.message}) — the draft screen is skipped`)
    return null
  }
}

async function firstId(page, path) {
  try {
    const rows = await getJson(page, path)
    const list = Array.isArray(rows) ? rows : (rows.campaigns ?? rows.projects ?? [])
    return list[0]?.id ?? null
  } catch {
    return null
  }
}

// Let client data load and fonts settle before the shot.
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForTimeout(300)
}

async function shoot(page, file) {
  await settle(page)
  // `next dev` floats its own indicator over the page (bottom-left, over the
  // sidebar's Sign out); it is never in a production build, so keep it out of
  // the captures.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' }).catch(() => {})
  await page.screenshot({ path: join(OUT, file), fullPage: true, animations: 'disabled' })
  log(`saved ${file}`)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  log(`capturing ${BASE} → ${OUT}`)
  const browser = await chromium.launch()
  let saved = 0

  try {
    for (const theme of THEMES) {
      // Logged out: the login page.
      const anon = await newThemedContext(browser, theme)
      const anonPage = await anon.newPage()
      for (const w of WIDTHS) {
        await anonPage.setViewportSize({ width: w.width, height: w.height })
        await anonPage.goto('/login')
        await shoot(anonPage, `login-${theme}-${w.name}.png`)
        saved++
      }
      await anon.close()

      // Signed in: every app screen.
      const context = await newThemedContext(browser, theme)
      const page = await context.newPage()
      await page.setViewportSize({ width: 1440, height: 900 })
      await signIn(page)

      const draftId = await findOrCreateDraft(page)
      const campaignId = await firstId(page, '/api/campaigns')
      const projectId = await firstId(page, '/api/projects')

      const screens = [
        ['dashboard', '/'],
        ['library', '/library'],
        ['brief', '/brief'],
        draftId && ['draft', `/drafts/${draftId}`],
        ['campaigns', '/campaigns'],
        campaignId && ['campaign-detail', `/campaigns/${campaignId}`],
        ['projects', '/projects'],
        projectId && ['project-detail', `/projects/${projectId}`],
        ['brandkits', '/admin/brandkits'],
        ['team', '/team'],
        ['settings', '/settings'],
        ['admin-users', '/admin/users'],
        ['admin-teams', '/admin/teams'],
        ['choose-team', '/choose-team'],
      ].filter(Boolean)

      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w.width, height: w.height })
        for (const [name, path] of screens) {
          await page.goto(path)
          await shoot(page, `${name}-${theme}-${w.name}.png`)
          saved++
        }
        if (w.width < 768) {
          // The shell with the mobile sidebar open.
          await page.goto('/')
          await settle(page)
          await page.getByRole('button', { name: 'Open sidebar' }).click()
          await page.getByRole('button', { name: 'Close sidebar' }).waitFor()
          await page.waitForTimeout(300)
          await page.screenshot({
            path: join(OUT, `shell-sidebar-open-${theme}-${w.name}.png`),
            animations: 'disabled',
          })
          log(`saved shell-sidebar-open-${theme}-${w.name}.png`)
          saved++
        }
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  log(`done: ${saved} screenshots in ${OUT}`)
}

main().catch((err) => {
  console.error(`[capture-ui] failed: ${err.stack ?? err}`)
  process.exit(1)
})
