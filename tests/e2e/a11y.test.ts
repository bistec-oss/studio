import { test, expect, type Locator, type Page } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { expectNoAxeViolations } from '../helpers/axe'
import { prisma, dbAvailable } from '../helpers/db'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  briefDraftIds,
  expectNoHorizontalScroll,
  mintBrandKitFixture,
  mintCampaignFixture,
  mintExportedDraft,
  pageLogin,
  tabThreeFromMain,
  tabThreeWithVisibleFocus,
} from '../helpers/ui'

// Change 014 — accessibility naming and the consistency pass. Each wave 2 and
// wave 3 task adds its own describe block here (design.md §6):
//   T9:  AC-05 (FR-06, one field-label style) and AC-11 (FR-12) for rows 6,
//        14, 21 and 22; the group captions name their groups (§8.3).
//   T10: AC-06 (FR-07, one control height per size, read from --control-*).
//   T11: brand kits — AC-07 (FR-08, one accent primary), AC-08 (FR-09, the
//        kit-list region), AC-11 (FR-12) for rows 12, 13, 15, 16 and 17, and
//        AC-15's kit part (FR-16, read-once swatches).
//   T12: AC-09 (FR-10, tabular figures on the body).
//   T13: AC-11 (FR-12) for rows 1–5 (login, library, brief) and AC-13 (FR-14,
//        the login h1).
//   T14: AC-11 (FR-12) for rows 18, 19, 20 (briefing assistant, campaign
//        briefing) and 23, 24, 25 (the campaign and project aside selects).
//   T15: AC-11 (FR-12) for rows 26 and 27 (the draft caption and refine prompt).
//   T16: AC-11 (FR-12) for rows 7–11 (/team register form and channel rows) and
//        AC-18 (FR-19, the provider toggle's On/Off word).
//   T17: ARIA states — AC-12 (FR-13, named tablists), AC-15's breadcrumb part
//        on the project page (FR-16), AC-16 (FR-17, static scroll regions) and
//        AC-17 (FR-18, 24 × 24 remove targets). AC-14 (the stepper) and the
//        campaign breadcrumb live in surfaces.test.ts, in the 011 cases they
//        supersede.
//   T18: AC-19 (A4, the axe-core scan on the listed routes and rules), and
//        AC-07's no-kit-open state (Add Kit is the one accent fill).

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)

// ── Helpers ──────────────────────────────────────────────────────────────────

// The computed type of a field label (AC-05).
async function labelStyle(label: Locator) {
  await expect(label).toBeVisible()
  return label.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      textTransform: cs.textTransform,
      fontSize: cs.fontSize,
      letterSpacing: cs.letterSpacing,
      color: cs.color,
    }
  })
}

// The <label for> that names a field: the association, not the text, is what
// this finds.
async function labelFor(page: Page, field: Locator): Promise<Locator> {
  const id = await field.getAttribute('id')
  expect(id, 'the field has an id for its label').toBeTruthy()
  return page.locator(`label[for="${id}"]`)
}

// AC-11: the label names exactly one field, the label text is visible, and
// (where the field has a placeholder today) the placeholder still finds the
// same element.
async function expectLabelled(
  scope: Page | Locator,
  label: string,
  opts: { tag: 'INPUT' | 'TEXTAREA' | 'SELECT'; placeholder?: string },
) {
  const byLabel = scope.getByLabel(label, { exact: true })
  await expect(byLabel, `"${label}" names exactly one field`).toHaveCount(1)
  await expect(byLabel).toHaveJSProperty('tagName', opts.tag)
  await expect(
    scope.locator('label').filter({ hasText: new RegExp(`^${label}$`) }),
    `the "${label}" label is visible`,
  ).toBeVisible()
  if (opts.placeholder) {
    const byPlaceholder = scope.getByPlaceholder(opts.placeholder, { exact: true })
    await expect(byPlaceholder).toHaveCount(1)
    await expect(byLabel.and(byPlaceholder), 'label and placeholder find the same element').toHaveCount(1)
  }
}

// Walk /brief to step 2 (Size & Design), picking the first kit if none is set.
async function briefStepTwo(page: Page) {
  await page.goto('/brief')
  await expect(page.getByRole('heading', { name: 'Select a campaign' })).toBeVisible()
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
  const kit = page.getByRole('combobox', { name: 'Brand kit' })
  // The kit options load after the step renders: wait for one before choosing.
  await expect(kit.locator('option:not([value=""])').first()).toBeAttached()
  if ((await kit.inputValue()) === '') {
    const values = await kit
      .locator('option')
      .evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value).filter(Boolean))
    await kit.selectOption(values[0])
  }
  return kit
}

// ── T9: one field-label style (AC-05) and rows 6, 14, 21, 22 (AC-11) ─────────

test.describe('Field labels (T9)', () => {
  let api: ApiClient
  let before: Set<string>
  // Every kit a case mints is deleted after it.
  const mintedKits: string[] = []
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    before = new Set(await briefDraftIds(api))
  })
  // A brief walk can autosave an unfinished brief; discard any this suite made.
  test.afterEach(async () => {
    for (const id of await briefDraftIds(api)) {
      if (!before.has(id)) await api.del(`/api/brief-drafts/${id}`)
    }
    for (const id of mintedKits.splice(0)) await api.del(`/api/admin/brandkits/${id}`)
    await api.dispose()
  })

  test('AC-05: Input and Select labels share the brief FieldLabel style (sentence case, 021 AC-09)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)

    // The reference: the brief's "Topic" FieldLabel on step 3.
    await briefStepTwo(page)
    // Path B needs no template, so step 2 can continue.
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
    const reference = await labelStyle(page.locator('label').filter({ hasText: /^Topic$/ }))
    // 021 FR-07: field labels are sentence case at 13 px (no longer small caps).
    expect(reference.textTransform).toBe('none')
    expect(reference.fontSize).toBe('13px')

    // The campaign create form: an Input label and a Select label.
    await page.goto('/campaigns')
    await expect(page.getByRole('heading', { name: 'Campaigns', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'New Campaign' }).click()
    const name = page.getByRole('textbox', { name: 'Campaign name', exact: true })
    const project = page.getByRole('combobox', { name: 'Project', exact: true })
    await expect(name).toBeVisible()
    await expect(project).toBeVisible()
    expect(await labelStyle(await labelFor(page, name)), 'the "Campaign name" Input label').toEqual(reference)
    expect(await labelStyle(await labelFor(page, project)), 'the "Project" Select label').toEqual(reference)
  })

  test('AC-05 + AC-11 row 6: the brief brand kit select is named "Brand Kit"', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const kit = await briefStepTwo(page)
    await expect(kit).toHaveCount(1)
    await expectLabelled(page, 'Brand kit', { tag: 'SELECT' })
  })

  test('AC-11 row 14: the template HTML/CSS field is labelled, and "Size" is a group caption', async ({ page }) => {
    const { kit } = await mintBrandKitFixture(api)
    mintedKits.push(kit.id)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/admin/brandkits')
    await expect(page.getByRole('heading', { name: 'Brand kits', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: new RegExp(`^${kit.name}`) }).click()
    await expect(page.getByRole('heading', { name: kit.name, level: 2 })).toBeVisible()

    // The innermost section holding the HTML Templates head (the kit's own
    // section holds it too, and comes first).
    const templates = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'HTML templates', level: 3 }) })
      .last()
    await templates.getByRole('button', { name: 'Add', exact: true }).click()
    await expectLabelled(templates, 'HTML/CSS', { tag: 'TEXTAREA', placeholder: '<!DOCTYPE html>…' })
    // The size caption is a span over a group named by its own aria-label.
    const size = templates.getByRole('group', { name: 'Size' })
    await expect(size).toBeVisible()
    await expect(templates.locator('label').filter({ hasText: /^Size$/ })).toHaveCount(0)
    await expect(templates.locator('span').filter({ hasText: /^Size$/ })).toBeVisible()
  })

  test('AC-11 rows 21 and 22: the queue modal labels Post specifics and the Template select', async ({ page }) => {
    const { camp } = await mintCampaignFixture(api)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByRole('heading', { name: camp.name, level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Plan a post' }).click()
    const modal = page.getByRole('dialog', { name: 'Plan a post' })
    await expect(modal).toBeVisible()

    // Row 21.
    await expectLabelled(modal, 'Post specifics', {
      tag: 'TEXTAREA',
      placeholder: 'What this specific post should say — the campaign briefing carries the rest.',
    })

    // Row 22: the select appears on the Template design path.
    await modal.getByRole('tab', { name: 'Template', exact: true }).click()
    await expectLabelled(modal, 'Template', { tag: 'SELECT' })
    await expect(modal.getByRole('combobox', { name: 'Template', exact: true })).toBeVisible()
  })

  test('§8.3: the Channels and After generation captions name their groups', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint an exported draft')
    const { camp } = await mintCampaignFixture(api)
    const draft = await mintExportedDraft(api, `a11y-groups-${Date.now()}`)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)

    // The queue modal: the channel checkboxes and the post-action radios.
    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByRole('heading', { name: camp.name, level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Plan a post' }).click()
    const modal = page.getByRole('dialog', { name: 'Plan a post' })
    const queueChannels = modal.getByRole('group', { name: 'Channels', exact: true })
    await expect(queueChannels).toBeVisible()
    await expect(queueChannels.getByRole('checkbox')).toHaveCount(2)
    const action = modal.getByRole('radiogroup', { name: 'After generation', exact: true })
    await expect(action).toBeVisible()
    await expect(action.getByRole('radio')).toHaveCount(3)
    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).toBeHidden()

    // The publish dialog, from the draft page.
    await page.goto(`/drafts/${draft.id}`)
    await page.getByRole('button', { name: /^publish$/i }).click()
    const publish = page.getByRole('dialog', { name: 'Publish post' })
    const publishChannels = publish.getByRole('group', { name: 'Channels', exact: true })
    await expect(publishChannels).toBeVisible()
    await expect(publishChannels.getByRole('checkbox')).toHaveCount(2)
  })
})

// ── T10: one control height per size, from the --control-* tokens (AC-06) ────

// 021 A1: Graphite's heights (--control-sm|md = 32 | 38 px).
const CONTROL_PX = { sm: 32, md: 38 } as const
// Values no literal utility produces, for the override check below.
const OVERRIDE_PX = { sm: 46, md: 54 } as const

async function heightOf(control: Locator) {
  await expect(control).toBeVisible()
  return (await control.boundingBox())?.height ?? NaN
}

// Each control is its size's token height (± 0.5 px). Then the tokens are
// overridden on :root and every control must follow: a control that writes its
// height as a literal (h-9, h-[30px]) would keep its old height and fail.
async function expectControlHeights(page: Page, controls: [string, Locator, keyof typeof CONTROL_PX][]) {
  for (const [name, control, size] of controls) {
    expect(await heightOf(control), `${name}: --control-${size}`).toBeCloseTo(CONTROL_PX[size], 0)
  }
  await page.evaluate((px) => {
    for (const [size, value] of Object.entries(px)) {
      document.documentElement.style.setProperty(`--control-${size}`, `${value}px`)
    }
  }, OVERRIDE_PX)
  try {
    for (const [name, control, size] of controls) {
      await expect
        .poll(() => heightOf(control), { message: `${name} follows --control-${size}` })
        .toBeCloseTo(OVERRIDE_PX[size], 0)
    }
  } finally {
    await page.evaluate(() => {
      for (const size of ['sm', 'md']) document.documentElement.style.removeProperty(`--control-${size}`)
    })
  }
}

test.describe('Control heights (T10)', () => {
  let api: ApiClient
  const mintedKits: string[] = []
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    for (const id of mintedKits.splice(0)) await api.del(`/api/admin/brandkits/${id}`)
    await api.dispose()
  })

  test('AC-06: the campaign form Input, Select and md Button are --control-md tall', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/campaigns')
    await expect(page.getByRole('heading', { name: 'Campaigns', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'New Campaign' }).click()
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create', exact: true }) })
    await expectControlHeights(page, [
      ['"Campaign name" Input', form.getByRole('textbox', { name: 'Campaign name', exact: true }), 'md'],
      ['"Project" Select', form.getByRole('combobox', { name: 'Project', exact: true }), 'md'],
      ['"Create" md Button', form.getByRole('button', { name: 'Create', exact: true }), 'md'],
    ])
  })

  test('AC-06: in kit edit mode the add-colour field and its sm "Add" are --control-sm tall', async ({ page }) => {
    const { kit } = await mintBrandKitFixture(api)
    mintedKits.push(kit.id)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/admin/brandkits')
    await expect(page.getByRole('heading', { name: 'Brand kits', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: new RegExp(`^${kit.name}`) }).click()
    await expect(page.getByRole('heading', { name: kit.name, level: 2 })).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()

    const colour = page.getByPlaceholder('#1A2B3C', { exact: true })
    // The colour editor's own row: the field and the Add beside it.
    const row = page.locator('div').filter({ has: colour }).filter({ has: page.getByRole('button', { name: 'Add' }) }).last()
    await expectControlHeights(page, [
      ['add-colour field (COMPACT_FIELD)', colour, 'sm'],
      ['colour "Add" sm Button', row.getByRole('button', { name: 'Add', exact: true }), 'sm'],
      // A raw single-line input on the same view (inputClasses).
      ['font search field', page.getByPlaceholder('Search Google Fonts…', { exact: true }), 'md'],
    ])
  })
})

// ── T11: brand kits — one accent primary, the kit-list region, labels, swatches ─

// Open a kit from the list and wait for its panel (a region named by the kit).
async function openKit(page: Page, name: string): Promise<Locator> {
  await page.goto('/admin/brandkits')
  await expect(page.getByRole('heading', { name: 'Brand kits', level: 1 })).toBeVisible()
  await page
    .getByRole('region', { name: 'Brand kits', exact: true })
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click()
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible()
  return page.getByRole('region', { name, exact: true })
}

// The innermost section holding a kit section's h3 (the kit's own section
// holds it too, and comes first).
function kitSection(page: Page, title: string): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: title, level: 3 }) }).last()
}

// The tokens as computed colours, read off :root.
async function tokenColours(page: Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const rgb = (name: string) => `rgb(${root.getPropertyValue(name).trim().split(/\s+/).join(', ')})`
    return { accent: rgb('--accent'), fg: rgb('--fg') }
  })
}

// A computed box-shadow with at least one visible layer: `none`, and Tailwind's
// `shadow-none` (layers of rgba(0, 0, 0, 0)), have none.
const VISIBLE_SHADOW = /rgba?\((?!0, 0, 0, 0\))/

// The names of the primary buttons in main (AC-07). In Graphite --accent
// equals --fg (021 A13), so fill alone no longer tells Primary from Ink:
// Primary is the accent fill WITH a resting shadow, Ink the same fill, flat.
async function accentFilledInMain(page: Page): Promise<string[]> {
  const { accent } = await tokenColours(page)
  return page.locator('main button').evaluateAll(
    (buttons, [colour, visible]) =>
      buttons
        .filter((b) => {
          const cs = getComputedStyle(b)
          return cs.backgroundColor === colour && new RegExp(visible).test(cs.boxShadow)
        })
        .map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim()),
    [accent, VISIBLE_SHADOW.source] as const,
  )
}

// An Ink button: the --fg fill and no visible resting shadow (021 A13).
async function expectInk(button: Locator, fg: string) {
  await expect(button).toHaveCSS('background-color', fg)
  expect(await button.evaluate((b) => getComputedStyle(b).boxShadow)).not.toMatch(VISIBLE_SHADOW)
}

test.describe('Brand kits (T11)', () => {
  let api: ApiClient
  const mintedKits: string[] = []
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    for (const id of mintedKits.splice(0)) await api.del(`/api/admin/brandkits/${id}`)
    await api.dispose()
  })
  const mint = async () => {
    const fixture = await mintBrandKitFixture(api)
    mintedKits.push(fixture.kit.id)
    return fixture
  }

  test('AC-07: with a kit in edit mode, the template form and New Version open, the kit Save is the only accent fill', async ({ page }) => {
    const { kit } = await mint()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const kitPanel = await openKit(page, kit.name)
    await kitPanel.getByRole('button', { name: 'Edit', exact: true }).click()
    await kitSection(page, 'HTML templates').getByRole('button', { name: 'Add', exact: true }).click()
    await kitPanel.getByRole('tab', { name: 'New Version' }).click()
    const saveTemplate = kitPanel.getByRole('button', { name: 'Save template' })
    const saveVersion = kitPanel.getByRole('button', { name: 'Save as new version' })
    await expect(saveTemplate).toBeVisible()
    await expect(saveVersion).toBeVisible()

    const { fg } = await tokenColours(page)
    expect(await accentFilledInMain(page), 'the accent-filled buttons in main').toEqual(['Save'])
    // The inline-form submits are Ink: the same fill, flat.
    await expectInk(saveTemplate, fg)
    await expectInk(saveVersion, fg)
  })

  test('AC-08: the kit list is a capped, focusable "Brand kits" region with a visible focus indicator', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/admin/brandkits')
    await expect(page.getByRole('heading', { name: 'Brand kits', level: 1 })).toBeVisible()
    const list = page.getByRole('region', { name: 'Brand kits', exact: true })
    await expect(list.getByRole('listitem').first()).toBeVisible()
    await expect(list).toHaveAttribute('tabindex', '0')
    await expect(list).toHaveCSS('max-height', '512px')
    await expect(list).toHaveCSS('overflow-y', 'auto')
    // With no kit open, Add Kit is the first stop and the region the second;
    // the helper fails a stop that draws no focus indicator.
    const stops = await tabThreeFromMain(page)
    expect(stops.slice(0, 2)).toEqual(['Add Kit', 'Brand kits'])
    // AC-07, the other state: with no kit open, Add Kit is the one accent fill.
    expect(await accentFilledInMain(page), 'the accent-filled buttons in main, no kit open').toEqual(['Add Kit'])
  })

  test('AC-15 (kit part): a kit row is named by the kit alone; its swatches are aria-hidden and keep their titles', async ({ page }) => {
    const { kit } = await mint()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/admin/brandkits')
    const row = page
      .getByRole('region', { name: 'Brand kits', exact: true })
      .getByRole('button', { name: new RegExp(`^${kit.name}( default)?$`) })
    await expect(row).toHaveCount(1)
    await expect(row).toHaveAccessibleName(kit.name)
    const swatches = row.locator('span[title^="#"]')
    await expect(swatches).toHaveCount(2)
    for (const hex of ['#0b6e4f', '#f2c14e']) {
      await expect(row.locator(`span[title="${hex}"]`)).toHaveAttribute('aria-hidden', 'true')
    }
  })

  test('AC-11 rows 12, 13 and 16: the add-colour field, the font search and the voice prompt are labelled', async ({ page }) => {
    const { kit } = await mint()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const kitPanel = await openKit(page, kit.name)

    // Row 16, on the New Version tab.
    await kitPanel.getByRole('tab', { name: 'New Version' }).click()
    await expectLabelled(kitPanel, 'Brand voice prompt', { tag: 'TEXTAREA', placeholder: 'Write your brand voice prompt…' })

    // Rows 12 and 13, in edit mode.
    await kitPanel.getByRole('button', { name: 'Edit', exact: true }).click()
    await expectLabelled(kitPanel, 'Add color', { tag: 'INPUT', placeholder: '#1A2B3C' })
    await expectLabelled(kitPanel, 'Search Google Fonts', { tag: 'INPUT', placeholder: 'Search Google Fonts…' })
    await expect(kitPanel.getByRole('combobox', { name: 'Search Google Fonts', exact: true })).toBeVisible()
  })

  test('AC-11 rows 15 and 17: the brand description and the assistant message are labelled', async ({ page }) => {
    // A kit with no voice prompt, so the brand description field shows.
    const kit = await (
      await api.post('/api/admin/brandkits', { name: `T11 Bare Kit ${Date.now()}`, colors: ['#0b6e4f'] })
    ).json()
    mintedKits.push(kit.id)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const kitPanel = await openKit(page, kit.name)

    // Row 15.
    await expect(kitPanel.getByText('No active prompt. Generate one below.')).toBeVisible()
    await expectLabelled(kitPanel, 'Brand description', {
      tag: 'INPUT',
      placeholder: 'Describe your brand in a few sentences…',
    })

    // Row 17, in the assistant drawer.
    await kitPanel.getByRole('button', { name: 'Extract from references' }).click()
    const drawer = page.getByRole('dialog', { name: 'Extract brand from references' })
    await expect(drawer).toBeVisible()
    await expectLabelled(drawer, 'Message', {
      tag: 'INPUT',
      placeholder: 'e.g. Extract the brand voice and style from these references',
    })
  })
})

// ── T12: tabular figures on the body (AC-09) ─────────────────────────────────

test.describe('Body figures (T12)', () => {
  test('AC-09: the body computes font-variant-numeric: tabular-nums, signed out and in', async ({ page }) => {
    const bodyFigures = () => page.evaluate(() => getComputedStyle(document.body).fontVariantNumeric)

    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    expect(await bodyFigures()).toBe('tabular-nums')

    await pageLogin(page)
    await page.goto('/library')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await bodyFigures()).toBe('tabular-nums')
  })
})

// ── T13: labels on login, library and brief (AC-11 rows 1–5); the login h1 ───

test.describe('Labels: login, library, brief (T13)', () => {
  test('AC-11 rows 1 and 2: the login Username and Password fields are labelled', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expectLabelled(page, 'Username', { tag: 'INPUT', placeholder: 'Username' })
    await expectLabelled(page, 'Password', { tag: 'INPUT', placeholder: 'Password' })
    // The accessible names are unchanged.
    await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveAttribute('type', 'text')
  })

  test('AC-13: /login has one sr-only h1 "Sign in to Studio", and its focus stops are unchanged', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.locator('h1')).toHaveCount(1)
    const h1 = page.getByRole('heading', { level: 1, name: 'Sign in to Studio', exact: true })
    await expect(h1).toHaveCount(1)
    await expect(h1).toHaveClass(/(^|\s)sr-only(\s|$)/)
    expect(await tabThreeWithVisibleFocus(page)).toEqual(['Username', 'Password', 'Sign in'])
  })

  test('AC-11 row 3: the library search is labelled "Search by topic", above the field', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/library')
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()
    await expectLabelled(page, 'Search by topic', { tag: 'INPUT', placeholder: 'Search by topic…' })

    // The label sits over the field, which keeps its 288 px column (sm:w-72).
    const field = page.getByLabel('Search by topic', { exact: true })
    const label = page.locator('label').filter({ hasText: /^Search by topic$/ })
    const [f, l] = [await field.boundingBox(), await label.boundingBox()]
    expect(f && l, 'the field and its label have boxes').toBeTruthy()
    expect(l!.y + l!.height).toBeLessThanOrEqual(f!.y)
    expect(Math.abs(l!.x - f!.x)).toBeLessThan(1)
    expect(f!.width).toBeCloseTo(288, 0)

    // The head still fits at the md and phone widths.
    for (const width of [768, 375]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(field).toBeVisible()
      await expectNoHorizontalScroll(page, `library at ${width}px`)
    }
  })

  test('AC-11 rows 4 and 5: the brief Topic and Description fields are labelled', async ({ page, request }) => {
    const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const before = new Set(await briefDraftIds(api))
    try {
      await page.setViewportSize({ width: 1440, height: 900 })
      await pageLogin(page)
      await briefStepTwo(page)
      await page.getByRole('button', { name: /^Freeform/ }).click()
      await page.getByRole('button', { name: /continue/i }).click()
      await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
      await expectLabelled(page, 'Topic', { tag: 'INPUT', placeholder: 'e.g. Q3 product launch' })
      await expectLabelled(page, 'Description', {
        tag: 'TEXTAREA',
        placeholder:
          'e.g. Announce our Q3 product launch with excitement. Highlight that it saves the marketing team hours on post creation. Include a CTA to try it.',
      })
    } finally {
      // A brief walk can autosave an unfinished brief; discard any this case made.
      for (const id of await briefDraftIds(api)) {
        if (!before.has(id)) await api.del(`/api/brief-drafts/${id}`)
      }
      await api.dispose()
    }
  })
})

// ── T14: labels on campaigns and projects (AC-11 rows 18–20, 23–25) ─────────

// AC-11 rows 23–25: the select is named by the visible dt it points at.
async function expectNamedByTerm(page: Page, name: string) {
  const select = page.getByRole('combobox', { name, exact: true })
  await expect(select, `"${name}" names exactly one select`).toHaveCount(1)
  await expect(select).toHaveJSProperty('tagName', 'SELECT')
  const labelledBy = await select.getAttribute('aria-labelledby')
  expect(labelledBy, `the "${name}" select has aria-labelledby`).toBeTruthy()
  const term = page.locator(`[id="${labelledBy}"]`)
  await expect(term).toHaveJSProperty('tagName', 'DT')
  await expect(term, `the "${name}" dt is visible`).toBeVisible()
  await expect(term).toHaveText(name)
}

const BRIEFING_PLACEHOLDER = "Audience, key messages, themes, do's and don'ts for this campaign…"
const ASSISTANT_PLACEHOLDER = 'Tell the assistant about this campaign…'

test.describe('Labels: campaigns and projects (T14)', () => {
  let api: ApiClient
  // Every campaign and project a case mints is deleted after it.
  const minted: { project: { id: string }; camp: { id: string } }[] = []
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    for (const { project, camp } of minted.splice(0)) {
      await api.del(`/api/campaigns/${camp.id}`)
      await api.del(`/api/projects/${project.id}`)
    }
    await api.dispose()
  })

  async function mint() {
    const fixture = await mintCampaignFixture(api)
    minted.push(fixture)
    return fixture
  }

  test('AC-11 rows 23, 24 and 20: the campaign aside selects and the new-version briefing are labelled', async ({ page }) => {
    const { camp } = await mint()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByRole('heading', { name: camp.name, level: 1 })).toBeVisible()

    // Rows 23 and 24.
    await expectNamedByTerm(page, 'Project')
    await expectNamedByTerm(page, 'Brand kit override')

    // Row 20: the new-version textarea.
    await page.getByRole('button', { name: 'Edit as new version' }).click()
    await expectLabelled(page, 'Briefing', { tag: 'TEXTAREA', placeholder: BRIEFING_PLACEHOLDER })
  })

  test('AC-11 row 25: the project aside default kit select is labelled', async ({ page }) => {
    const { project } = await mint()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/projects/${project.id}`)
    await expect(page.getByRole('heading', { name: project.name, level: 1 })).toBeVisible()
    await expectNamedByTerm(page, 'Default brand kit')
  })

  test('AC-11 rows 19 and 18: the briefing assistant message and each plan row topic are named', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI for the assistant schedule plan')
    const { camp } = await mint()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByRole('heading', { name: camp.name, level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Draft with AI' }).click()
    const drawer = page.getByRole('dialog', { name: 'Draft briefing with AI' })
    await expect(drawer).toBeVisible()

    // Row 19.
    await expectLabelled(drawer, 'Message', { tag: 'INPUT', placeholder: ASSISTANT_PLACEHOLDER })

    // Row 18: aria-label only (A6), one per plan row, alongside "Generate at".
    const ask = drawer.getByLabel('Message', { exact: true })
    await ask.fill('Please schedule a short series of posts.')
    await ask.press('Enter')
    const plan = drawer.getByRole('region', { name: 'Proposed schedule' })
    await expect(plan).toBeVisible({ timeout: 30_000 })
    const rows = plan.getByRole('listitem')
    await expect(rows).toHaveCount(2)
    for (let i = 0; i < 2; i++) {
      const row = rows.nth(i)
      const topic = row.getByLabel('Post topic', { exact: true })
      await expect(topic, `row ${i + 1} has one "Post topic" field`).toHaveCount(1)
      await expect(topic).toHaveJSProperty('tagName', 'INPUT')
      await expect(topic).toHaveAttribute('aria-label', 'Post topic')
      await expect(topic.and(row.getByPlaceholder('Post topic', { exact: true }))).toHaveCount(1)
      await expect(row.getByRole('textbox', { name: 'Post topic', exact: true })).toHaveValue(`Mock scheduled post ${i + 1}`)
    }
  })
})

// ── T15: labels on the draft page (AC-11 rows 26 and 27) ────────────────────

// AC-11 rows 26–27: the field is named by the visible section heading it points
// at. The numeral ("i.", "ii.") is aria-hidden and outside the heading, so the
// name is the heading text alone. Since 012 the captions are named by their
// channel's h3 inside the "Captions" section, so the heading level is a parameter.
async function expectNamedByHeading(
  page: Page,
  name: string,
  opts: { tag: 'INPUT' | 'TEXTAREA'; placeholder: string; headingTag?: 'H2' | 'H3' },
) {
  const field = page.getByRole('textbox', { name, exact: true })
  await expect(field, `"${name}" names exactly one field`).toHaveCount(1)
  await expect(field).toHaveJSProperty('tagName', opts.tag)
  const labelledBy = await field.getAttribute('aria-labelledby')
  expect(labelledBy, `the "${name}" field has aria-labelledby`).toBeTruthy()
  const heading = page.locator(`[id="${labelledBy}"]`)
  await expect(heading).toHaveJSProperty('tagName', opts.headingTag ?? 'H2')
  await expect(heading, `the "${name}" heading is visible`).toBeVisible()
  await expect(heading).toHaveText(name)
  const byPlaceholder = page.getByPlaceholder(opts.placeholder, { exact: true })
  await expect(byPlaceholder).toHaveCount(1)
  await expect(field.and(byPlaceholder), 'name and placeholder find the same element').toHaveCount(1)
}

test.describe('Labels: draft page (T15)', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  test('AC-11 rows 26 and 27: the caption and the refine prompt are named by their section headings', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint an exported draft')
    const draft = await mintExportedDraft(api, `a11y-draft-labels-${Date.now()}`)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })

    // Row 26: each caption (012) is named by its channel's h3.
    for (const label of ['Instagram', 'LinkedIn']) {
      await expectNamedByHeading(page, label, {
        tag: 'TEXTAREA',
        placeholder: `Write the ${label} caption…`,
        headingTag: 'H3',
      })
    }
    // Row 27.
    await expectNamedByHeading(page, 'Refine design', { tag: 'INPUT', placeholder: 'e.g. Make the logo larger…' })
  })
})

// ── T16: labels on /team (AC-11 rows 7–11) and the provider On/Off word (AC-18) ─

// Rows 7 and 10: the eye button is absolutely centred in the relative wrapper
// around the field, and the label sits above that wrapper (spec Edge Cases),
// so the button's centre stays on the field's centre.
async function expectEyeCentred(field: Locator, eye: Locator) {
  const [f, e] = [await field.boundingBox(), await eye.boundingBox()]
  expect(f && e, 'the field and its eye button have boxes').toBeTruthy()
  expect(Math.abs(f!.y + f!.height / 2 - (e!.y + e!.height / 2))).toBeLessThan(1)
}

// A channel's ruled row, found by its visible channel name.
function channelRow(page: Page, name: string): Locator {
  return page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })
}

test.describe('Labels: team (T16)', () => {
  test('AC-11 rows 7, 8 and 9: the register form key, provider name and display label are labelled', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/team')
    await expect(page.getByRole('heading', { name: 'AI providers' })).toBeVisible()

    // Both modes offer COPY and IMAGE with one "API key" field since 024 FR-09.
    await page.getByRole('button', { name: 'Register provider', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Register new provider', level: 3 })).toBeVisible()

    // Row 7. Exact, so the "Show API key" button doesn't also match.
    const keyLabel = 'API key'
    const keyPlaceholder = 'API key (sk-ant-…, sk-…, or AIza… Gemini for images)'
    await expectLabelled(page, keyLabel, { tag: 'INPUT', placeholder: keyPlaceholder })
    const key = page.getByLabel(keyLabel, { exact: true })
    await expectEyeCentred(key, page.getByRole('button', { name: 'Show API key' }))

    // Rows 8 and 9 appear for a key of unknown format.
    await key.fill('xyz-unknown-format-key')
    await expectLabelled(page, 'Provider name', { tag: 'INPUT', placeholder: 'Provider name (e.g. groq)' })
    await expectLabelled(page, 'Display label', { tag: 'INPUT', placeholder: 'Display label (e.g. Llama 3 (Groq))' })
  })

  test('AC-11 rows 10 and 11: each channel row labels its access token and its ID field', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/team')
    await expect(page.getByRole('heading', { name: 'Social channels' })).toBeVisible()

    for (const [name, idLabel] of [
      ['Instagram', 'Business Account ID'],
      ['LinkedIn', 'Organization ID'],
    ] as const) {
      const row = channelRow(page, name)
      await expect(row, `one ${name} row`).toHaveCount(1)
      // Row 10, scoped to the channel row: both rows say "Access token".
      await expectLabelled(row, 'Access token', { tag: 'INPUT', placeholder: 'Access token' })
      await expectEyeCentred(
        row.getByLabel('Access token', { exact: true }),
        row.getByRole('button', { name: 'Show access token' }),
      )
      // Row 11.
      await expectLabelled(row, idLabel, { tag: 'INPUT', placeholder: idLabel })
    }

    // The two "Access token" labels point at two different fields.
    const ids = await page.getByLabel('Access token', { exact: true }).evaluateAll((els) => els.map((el) => el.id))
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  test('AC-18: a provider row shows "On" or "Off" beside its toggle, aria-hidden, and the toggle keeps its name', async ({ page, request }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI so a fake key registers')
    // A fresh team, so the shared team's providers are never touched.
    const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const teamName = `a11y T16 ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const teamRes = await sa.post('/api/admin/teams', { name: teamName })
    expect(teamRes.status()).toBe(201)
    const team = (await teamRes.json()) as { id: string }
    const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: teamName })
    let providerId: string | undefined
    try {
      const label = 'T16 Toggle Image'
      const reg = await api.post('/api/admin/providers', { apiKey: 'sk-t16-image-000001', slot: 'IMAGE', label })
      expect(reg.status()).toBe(201)
      const row = (await reg.json()) as { id: string; isEnabled: boolean }
      providerId = row.id
      expect(row.isEnabled).toBe(true)

      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/login')
      await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
      await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
      expect((await page.request.post('/api/me/active-team', { data: { teamId: team.id } })).ok()).toBe(true)
      await page.goto('/team')

      const toggle = page.getByRole('button', { name: `Enable ${label}`, exact: true })
      await expect(toggle).toHaveCount(1)
      const providerRow = page.getByRole('listitem').filter({ has: toggle })
      const word = providerRow.getByText(/^(On|Off)$/)
      await expect(word).toHaveCount(1)
      // Outside the button, so it is not part of the button's name.
      await expect(toggle.getByText(/^(On|Off)$/)).toHaveCount(0)
      await expect(word).toHaveAttribute('aria-hidden', 'true')

      // Enabled: "On" in the accent, aria-pressed true.
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await expect(word).toBeVisible()
      await expect(word).toHaveText('On')
      await expect(word).toHaveClass(/(^|\s)text-accent(\s|$)/)

      // Toggled off: "Off" in --fg-muted, aria-pressed false, the name unchanged.
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await expect(word).toHaveText('Off')
      await expect(word).toBeVisible()
      await expect(word).toHaveClass(/(^|\s)text-fg-muted(\s|$)/)
      await expect(word).toHaveAttribute('aria-hidden', 'true')
      await expect(page.getByRole('button', { name: `Enable ${label}`, exact: true })).toHaveCount(1)
    } finally {
      if (providerId) await api.del(`/api/admin/providers/${providerId}`)
      await api.dispose()
      await sa.del(`/api/admin/teams/${team.id}`)
      await sa.dispose()
    }
  })
})

// ── T17: ARIA states — tablists, breadcrumb, scroll regions, remove targets ──

// AC-12: each listed name names exactly one tablist in the scope, and every
// tablist there (the listed ones and any other, such as /team's "Operating
// system" guide) has a non-empty accessible name.
async function expectTablistsNamed(scope: Page | Locator, names: string[]) {
  for (const name of names) {
    await expect(scope.getByRole('tablist', { name, exact: true }), `one tablist named "${name}"`).toHaveCount(1)
  }
  const all = await scope.getByRole('tablist').all()
  expect(all.length).toBeGreaterThanOrEqual(names.length)
  for (const tablist of all) await expect(tablist, 'every tablist is named').toHaveAccessibleName(/\S/)
}

// AC-16: a static scroll region — named, a region, in the tab order whether or
// not it has content to scroll.
async function expectStaticRegion(scope: Page | Locator, name: string) {
  const region = scope.getByRole('region', { name, exact: true })
  await expect(region, `one "${name}" region`).toHaveCount(1)
  await expect(region).toHaveAttribute('tabindex', '0')
  await region.focus()
  await expect(region).toBeFocused()
}

// AC-17: the control's own border box is at least 24 × 24 CSS px.
async function expectAtLeast24(control: Locator, what: string) {
  await expect(control, what).toBeVisible()
  const box = await control.boundingBox()
  expect(box, `${what} has a box`).toBeTruthy()
  expect(box!.width, `${what} width`).toBeGreaterThanOrEqual(24)
  expect(box!.height, `${what} height`).toBeGreaterThanOrEqual(24)
}

test.describe('ARIA states (T17)', () => {
  let api: ApiClient
  const mintedKits: string[] = []
  const mintedCampaigns: string[] = []
  const mintedProjects: string[] = []
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    for (const id of mintedCampaigns.splice(0)) await api.del(`/api/campaigns/${id}`)
    for (const id of mintedProjects.splice(0)) await api.del(`/api/projects/${id}`)
    for (const id of mintedKits.splice(0)) await api.del(`/api/admin/brandkits/${id}`)
    await api.dispose()
  })
  const mintKit = async () => {
    const kit = await (
      await api.post('/api/admin/brandkits', {
        name: `T17 Kit ${Date.now()}`,
        colors: ['#0b6e4f'],
        fonts: [{ name: 'DM Sans', url: 'https://fonts.googleapis.com/css2?family=DM+Sans' }],
      })
    ).json()
    mintedKits.push(kit.id)
    return kit as { id: string; name: string }
  }
  const mintCampaign = async () => {
    const fixture = await mintCampaignFixture(api)
    mintedCampaigns.push(fixture.camp.id)
    mintedProjects.push(fixture.project.id)
    return fixture
  }

  test('AC-12: every tablist is named — library, /team, an open kit, a campaign and its queue modal', async ({ page }) => {
    const kit = await mintKit()
    const { camp } = await mintCampaign()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)

    await page.goto('/library')
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()
    await expectTablistsNamed(page, ['Filter by status'])

    // /team with the register form open. Both modes render the slot toggle
    // since 024 FR-09.
    await page.goto('/team')
    await page.getByRole('button', { name: 'Register provider', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Register new provider', level: 3 })).toBeVisible()
    await expectTablistsNamed(page, ['Provider slot'])

    await openKit(page, kit.name)
    await expectTablistsNamed(page, ['Prompt view'])

    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByRole('heading', { name: camp.name, level: 1 })).toBeVisible()
    await expectTablistsNamed(page, ['Briefing view'])
    await page.getByRole('button', { name: 'Plan a post' }).click()
    const modal = page.getByRole('dialog', { name: 'Plan a post' })
    await expect(modal).toBeVisible()
    await expectTablistsNamed(modal, ['Size', 'Design'])
  })

  test('AC-12 + AC-16: on a draft with no refine requests, "Refine requests" is a region, and the inline editor names its tablist', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint an exported draft')
    const draft = await mintExportedDraft(api, `a11y-t17-${Date.now()}`)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })

    // AC-16: no requests yet, and the log is still a focusable, labelled region.
    await expectStaticRegion(page, 'Refine requests')
    await expect(page.getByRole('region', { name: 'Refine requests', exact: true }).getByRole('listitem')).toHaveCount(0)

    // AC-12: the inline-edit modal.
    await page.getByRole('button', { name: 'Edit inline', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit inline' })
    await expect(dialog.locator('[data-editor-ready="true"]')).toBeAttached({ timeout: 20_000 })
    await expectTablistsNamed(dialog, ['Edit mode'])
  })

  test('AC-16: with no turns yet, both assistant drawers hold a focusable "Conversation" region', async ({ page }) => {
    const kit = await mintKit()
    const { camp } = await mintCampaign()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)

    const kitPanel = await openKit(page, kit.name)
    await kitPanel.getByRole('button', { name: 'Extract from references' }).click()
    const kitDrawer = page.getByRole('dialog', { name: 'Extract brand from references' })
    await expect(kitDrawer).toBeVisible()
    // The empty-state hint: there are no turns yet.
    await expect(kitDrawer.getByText('then ask me to extract the brand voice and style', { exact: false })).toBeVisible()
    await expectStaticRegion(kitDrawer, 'Conversation')
    await page.keyboard.press('Escape')
    await expect(kitDrawer).toBeHidden()

    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByRole('heading', { name: camp.name, level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Draft with AI' }).click()
    const briefingDrawer = page.getByRole('dialog', { name: 'Draft briefing with AI' })
    await expect(briefingDrawer).toBeVisible()
    await expect(briefingDrawer.getByText('the assistant will interview', { exact: false })).toBeVisible()
    await expectStaticRegion(briefingDrawer, 'Conversation')
  })

  test('AC-15 (breadcrumb): on a project page the tail crumb is visible but aria-hidden, and the h1 carries the name', async ({ page }) => {
    const { project } = await mintCampaign()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/projects/${project.id}`)
    await expect(page.getByRole('heading', { name: project.name, level: 1 })).toBeVisible()
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    const tail = crumbs.getByText(project.name, { exact: true })
    await expect(tail).toBeVisible()
    await expect(tail).toHaveAttribute('aria-hidden', 'true')
    await expect(crumbs.locator('[aria-current]')).toHaveCount(0)
    expect(await crumbs.ariaSnapshot()).not.toContain(project.name)
  })

  test('AC-17: "Discard unfinished post", "Remove color …" and "Remove font …" are at least 24 × 24', async ({ page }) => {
    const kit = await mintKit()
    const topic = `T17 unfinished ${Date.now()}`
    const put = await api.put('/api/brief-drafts', {
      payload: {
        step: 2,
        campaignId: '',
        aspectRatio: 'SQUARE',
        brandKitId: '',
        designMode: 'GENERATE',
        templateId: '',
        referenceTemplateId: '',
        topic,
        prompt: 'A prompt long enough to matter',
        goal: 'awareness',
        tone: 'professional',
        images: [],
      },
    })
    expect(put.status()).toBe(200)
    const briefDraftId = (await put.json()).id as string
    try {
      await page.setViewportSize({ width: 1440, height: 900 })
      await pageLogin(page)
      const row = page.getByRole('row').filter({ hasText: topic })
      await expect(row).toHaveCount(1)
      await expectAtLeast24(row.getByRole('button', { name: 'Discard unfinished post', exact: true }), 'Discard unfinished post')

      const kitPanel = await openKit(page, kit.name)
      await kitPanel.getByRole('button', { name: 'Edit', exact: true }).click()
      await expectAtLeast24(kitPanel.getByRole('button', { name: 'Remove color #0b6e4f', exact: true }), 'Remove color')
      await expectAtLeast24(kitPanel.getByRole('button', { name: 'Remove font DM Sans', exact: true }), 'Remove font')
    } finally {
      await api.del(`/api/brief-drafts/${briefDraftId}`)
    }
  })
})

// ── T18: the axe-core scan (AC-19) ───────────────────────────────────────────

// The scan itself (the AC-19 rules, axe injection, `incomplete` logging) is
// the shared tests/helpers/axe.ts (018 FR-07). Every call here opts into
// its settle step, the networkidle + fonts wait this suite always ran.

test.describe('axe scan (T18)', () => {
  let api: ApiClient
  let before: Set<string>
  const mintedKits: string[] = []
  const mintedCampaigns: string[] = []
  const mintedProjects: string[] = []
  test.beforeEach(async ({ page, request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    before = new Set(await briefDraftIds(api))
    // AC-19: light theme at 1440 px.
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 1440, height: 900 })
  })
  test.afterEach(async () => {
    // A brief walk can autosave an unfinished brief; discard any this suite made.
    for (const id of await briefDraftIds(api)) {
      if (!before.has(id)) await api.del(`/api/brief-drafts/${id}`)
    }
    for (const id of mintedCampaigns.splice(0)) await api.del(`/api/campaigns/${id}`)
    for (const id of mintedProjects.splice(0)) await api.del(`/api/projects/${id}`)
    for (const id of mintedKits.splice(0)) await api.del(`/api/admin/brandkits/${id}`)
    await api.dispose()
  })

  test('AC-19: /login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expectNoAxeViolations(page, '/login', { settle: true })
  })

  test('AC-19: the dashboard, /library, /campaigns, /settings and /admin/users', async ({ page }) => {
    await pageLogin(page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoAxeViolations(page, '/', { settle: true })

    await page.goto('/library')
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()
    await expectNoAxeViolations(page, '/library', { settle: true })

    await page.goto('/campaigns')
    await expect(page.getByRole('heading', { name: 'Campaigns', level: 1 })).toBeVisible()
    await expectNoAxeViolations(page, '/campaigns', { settle: true })

    await page.goto('/settings')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoAxeViolations(page, '/settings', { settle: true })

    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('row').nth(1)).toBeVisible()
    await expectNoAxeViolations(page, '/admin/users', { settle: true })
  })

  test('AC-19: /brief steps 1, 2 and 3', async ({ page }) => {
    await pageLogin(page)
    await page.goto('/brief')
    await expect(page.getByRole('heading', { name: 'Select a campaign' })).toBeVisible()
    await expectNoAxeViolations(page, '/brief step 1', { settle: true })

    await briefStepTwo(page)
    await expectNoAxeViolations(page, '/brief step 2', { settle: true })

    await page.getByRole('button', { name: /^Freeform/ }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
    await expectNoAxeViolations(page, '/brief step 3', { settle: true })
  })

  test('AC-19: /drafts/[id]', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint an exported draft')
    const draft = await mintExportedDraft(api, `a11y-axe-${Date.now()}`)
    await pageLogin(page)
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })
    // 008 AC-33: the scan covers the model pickers. They load a query of their
    // own (/api/models), so wait for them rather than relying on networkidle.
    for (const name of ['Design model', 'Headline model', 'Instagram caption model', 'Refine model']) {
      await expect(page.getByRole('combobox', { name, exact: true })).toBeVisible()
    }
    await expectNoAxeViolations(page, '/drafts/[id]', { settle: true })
  })

  // 009 AC-19: /drafts/[id] with the composition notice shown, and /brief step 2
  // with the Image style picker (Path B) on screen.
  test('AC-19 (009): /drafts/[id] with the composition notice, and the Image style picker', async ({ page }) => {
    test.skip(!MOCKED() || !dbAvailable, 'needs MOCK_AI + MOCK_PUPPETEER and the test DB (a stamp is set in the DB)')
    const draft = await mintExportedDraft(api, `a11y-hero-${Date.now()}`)
    await prisma!.draft.update({
      where: { id: draft.id },
      data: {
        composition: {
          requestedArchetype: 'product-showcase',
          appliedArchetype: 'classic',
          contractVersion: null,
          fallbackReason: 'busy',
          imageQuality: 'default',
        },
      },
    })
    await pageLogin(page)
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByTestId('composition-notice')).toBeVisible({ timeout: 20_000 })
    for (const name of ['Design model', 'Headline model', 'Instagram caption model', 'Refine model']) {
      await expect(page.getByRole('combobox', { name, exact: true })).toBeVisible()
    }
    await expectNoAxeViolations(page, '/drafts/[id] with the composition notice', { settle: true })

    await briefStepTwo(page)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await expect(page.getByTestId('image-style-section')).toBeVisible()
    await expectNoAxeViolations(page, '/brief step 2 with the image style picker', { settle: true })
  })

  test('AC-19: /campaigns/[id] and /projects/[id]', async ({ page }) => {
    const { project, camp } = await mintCampaignFixture(api)
    mintedCampaigns.push(camp.id)
    mintedProjects.push(project.id)
    await pageLogin(page)

    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByRole('heading', { name: camp.name, level: 1 })).toBeVisible()
    await expect(page.getByText(`T10 pending`, { exact: false }).first()).toBeVisible()
    await expectNoAxeViolations(page, '/campaigns/[id]', { settle: true })

    await page.goto(`/projects/${project.id}`)
    await expect(page.getByRole('heading', { name: project.name, level: 1 })).toBeVisible()
    await expectNoAxeViolations(page, '/projects/[id]', { settle: true })
  })

  // 030 FR-13: the draft page with the stale-headline badge shown.
  test('AC-19: a draft page with the stale-headline badge', async ({ page }) => {
    if (!MOCKED()) test.skip()
    const draft = await mintExportedDraft(api, `a11y-headline-${Date.now()}`)
    expect((await api.patch(`/api/drafts/${draft.id}`, { headline: 'A brand new headline' })).status()).toBe(200)
    await pageLogin(page)
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByTestId('headline-image-notice')).toBeVisible({ timeout: 20_000 })
    await expectNoAxeViolations(page, '/drafts/[id] (stale headline badge)', { settle: true })
  })

  test('AC-19: /admin/brandkits with a kit open in edit mode', async ({ page }) => {
    const { kit } = await mintBrandKitFixture(api)
    mintedKits.push(kit.id)
    await pageLogin(page)
    const kitPanel = await openKit(page, kit.name)
    await kitPanel.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(kitPanel.getByPlaceholder('#1A2B3C', { exact: true })).toBeVisible()
    await expectNoAxeViolations(page, '/admin/brandkits (kit in edit mode)', { settle: true })
  })

  test('AC-19: /team with the register form open', async ({ page }) => {
    await pageLogin(page)
    await page.goto('/team')
    await expect(page.getByRole('heading', { name: 'AI providers' })).toBeVisible()
    await page.getByRole('button', { name: 'Register provider', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Register new provider', level: 3 })).toBeVisible()
    // 008 AC-22: the scan covers /team → Models too. It loads two queries of
    // its own, so wait for its form rather than relying on networkidle.
    await expect(
      page.getByRole('region', { name: 'Models', exact: true }).getByRole('button', { name: 'Save', exact: true }),
    ).toBeVisible()
    await expectNoAxeViolations(page, '/team (register form open)', { settle: true })
  })
})
