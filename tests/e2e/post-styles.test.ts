import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { Prisma } from '@prisma/client'
import { findTeamIdByName, loginAs, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'
import { briefDraftIds, expectNoHorizontalScroll, pageLogin } from '../helpers/ui'
import { expectNoAxeViolations } from '../helpers/axe'

// §AE — Post styles and the facts check (change 027). The SERVER cases are
// TC-PS-01 to TC-PS-29; the UI cases (T6: the wizard, the campaign default, the
// queue modal and held line, the draft notice) are TC-PS-30 onward, and the
// insights section (T7, TC-PS-40) is last.
//
// Everything runs under MOCK_AI (no model call). The facts check is exercised
// through the mock caption seams in src/lib/testHooks.ts: a sentinel in the
// topic appends one invented value to the mock headline and captions, and
// __MOCK_FACT_ERROR__ forces the check itself to fail. Because the mock caption
// embeds the topic, a value written in the topic (or the description, the
// campaign briefing, a campaign document) is a STATED value and is not flagged.
// The scheduler cases drive POST /api/test/generation-tick over HTTP and seed
// the one case the API refuses (a stored key that does not resolve) straight
// into the database, the way the 023 suite does.
//
// Serial. Two campaigns for the whole suite (A: no sources; B: a briefing and
// a document that state values), never one per case.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER && process.env.MOCK_SOCIAL)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const PASSWORD = 'BistecStudio2026!'
const NOT_MOCKED = 'requires MOCK_AI + MOCK_PUPPETEER + MOCK_SOCIAL'

test.describe.configure({ mode: 'serial' })

const FUTURE = () => new Date(Date.now() + 24 * 3600_000).toISOString()
const LATER = () => new Date(Date.now() + 48 * 3600_000).toISOString()
const tag = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

let admin: ApiClient
let editor: ApiClient
let campA: string
let campB: string
let kitId: string

interface FlagJson {
  kind: string
  value: string
  where: string
}
interface FactsJson {
  status: 'clear' | 'flagged' | 'error'
  flagged: FlagJson[]
  reason?: string
}
interface DraftJson {
  id: string
  status: string
  factsCheck: FactsJson | null
  postStyle: { key: string; label: string; version: number } | null
  failureReason: string | null
}

function briefBody(extra: Record<string, unknown> = {}) {
  return {
    topic: `PS base ${tag()}`,
    channels: ['INSTAGRAM', 'LINKEDIN'],
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
    ...extra,
  }
}

async function postBrief(api: ApiClient, extra: Record<string, unknown> = {}) {
  return api.post('/api/briefs', briefBody(extra))
}

// A brief through generation to a settled draft.
async function generate(api: ApiClient, extra: Record<string, unknown> = {}): Promise<DraftJson> {
  const res = await postBrief(api, extra)
  expect(res.status(), await res.text()).toBe(201)
  const brief = await res.json()
  const assembled = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(assembled.status()).toBe(202)
  const { draftId } = await assembled.json()
  return (await waitForDraft(api, draftId)) as unknown as DraftJson
}

const pairs = (check: FactsJson | null) => (check?.flagged ?? []).map((f) => `${f.where}:${f.value}`).sort()
const values = (check: FactsJson | null) => [...new Set((check?.flagged ?? []).map((f) => f.value))].sort()

async function entryRow(id: string) {
  return prisma!.scheduledGeneration.findUnique({ where: { id } })
}

async function makeDue(id: string) {
  await prisma!.scheduledGeneration.update({
    where: { id },
    data: { generateAt: new Date(Date.now() - 1000), nextRetryAt: null },
  })
}

// One tick claims at most two entries, so tick until this entry has left the
// claimable states (or a few times at most).
async function tickUntilSettled(api: ApiClient, id: string) {
  await makeDue(id)
  for (let i = 0; i < 6; i++) {
    const res = await api.post('/api/test/generation-tick', {})
    expect(res.status()).toBe(200)
    const row = await entryRow(id)
    if (row && (row.status !== 'PENDING' || row.retryCount > 0)) return row
    await makeDue(id)
  }
  return (await entryRow(id))!
}

function entryBody(topic: string, extra: Record<string, unknown> = {}) {
  return {
    topic,
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    generateAt: FUTURE(),
    postAction: 'HOLD',
    ...extra,
  }
}

async function addEntry(campaignId: string, topic: string, extra: Record<string, unknown> = {}) {
  const res = await admin.post(`/api/campaigns/${campaignId}/queue`, entryBody(topic, extra))
  expect(res.status(), await res.text()).toBe(201)
  return res.json() as Promise<{ id: string }>
}

test.beforeAll(async ({ request }) => {
  admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
  editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
  const kit = await (await admin.post('/api/admin/brandkits', { name: `PS Kit ${tag()}`, colors: ['#0284c7'] })).json()
  kitId = kit.id
  campA = (await (await admin.post('/api/campaigns', { name: `PS Camp A ${tag()}`, brandKitId: kitId })).json()).id
  campB = (await (await admin.post('/api/campaigns', { name: `PS Camp B ${tag()}`, brandKitId: kitId })).json()).id
  if (dbAvailable) {
    // Stale due entries from earlier suites would be claimed by the tick's small batch.
    await prisma!.scheduledGeneration.updateMany({ where: { status: 'PENDING' }, data: { status: 'CANCELLED' } })
  }
})

test.afterAll(async () => {
  if (dbAvailable) {
    await prisma!.scheduledGeneration.updateMany({
      where: { campaignId: { in: [campA, campB] }, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    })
  }
  await admin?.dispose()
  await editor?.dispose()
})

// ── The inputs: POST /api/briefs ────────────────────────────────────────────

test.describe('Post style inputs: briefs', () => {
  test('TC-PS-01: a style is stored with the style goal, the resolved tone and the default image of the style; the goal sent is ignored', async () => {
    // 028 T7: hiring now defaults to full-bleed-scene (TC-LOOK-13 to 16); 031 T18: promotion and milestone default to spotlight (OP-031); tip still defaults to classic.
    const res = await postBrief(admin, { postStyle: 'promotion', goal: 'x-ignored' })
    expect(res.status()).toBe(201)
    const brief = await res.json()
    expect(brief.postStyle).toBe('promotion')
    expect(brief.goal).toBeTruthy()
    expect(brief.goal).not.toBe('x-ignored')
    expect(brief.tone).toBeTruthy()
    expect(brief.imageStyle).toBe('spotlight')
    expect((await (await postBrief(admin, { postStyle: 'milestone' })).json()).imageStyle).toBe('spotlight')
    expect((await (await postBrief(admin, { postStyle: 'tip' })).json()).imageStyle).toBe('classic')

    // An explicit tone is kept as sent.
    const toned = await (await postBrief(admin, { postStyle: 'event', tone: 'casual' })).json()
    expect(toned.postStyle).toBe('event')
    expect(toned.tone).toBe('casual')
  })

  test('TC-PS-02: with no style, a legacy goal of hiring or announcement picks one; anything else, and nothing, is General', async () => {
    const pick = async (extra: Record<string, unknown>) => (await (await postBrief(admin, extra)).json()).postStyle
    expect(await pick({ goal: 'hiring' })).toBe('hiring')
    expect(await pick({ goal: 'Announcement' })).toBe('announcement')
    expect(await pick({ goal: 'conversion' })).toBe('general')
    expect(await pick({ goal: 'a free-text goal' })).toBe('general')
    expect(await pick({})).toBe('general')
    // An explicit style wins over the legacy goal.
    expect(await pick({ postStyle: 'tip', goal: 'hiring' })).toBe('tip')
  })

  test('TC-PS-03: a pre-027 body (goal and tone, no style) is 201 and keeps its tone', async () => {
    const res = await postBrief(admin, { goal: 'Awareness', tone: 'professional' })
    expect(res.status()).toBe(201)
    const brief = await res.json()
    expect(brief.postStyle).toBe('general')
    expect(brief.tone).toBe('professional')
  })

  test('TC-PS-04: an unknown key is 400 UNKNOWN_POST_STYLE and creates nothing; a non-string is 400; a blank one is absent', async () => {
    const before = dbAvailable ? await prisma!.brief.count() : 0
    const unknown = await postBrief(admin, { postStyle: 'nope' })
    expect(unknown.status()).toBe(400)
    const body = await unknown.json()
    expect(body.code).toBe('UNKNOWN_POST_STYLE')
    expect(body.error).toContain('nope')
    for (const bad of ['constructor', '__proto__', 'GENERAL', 'launch-x']) {
      const res = await postBrief(admin, { postStyle: bad })
      expect(res.status(), `postStyle ${bad}`).toBe(400)
    }
    const notString = await postBrief(admin, { postStyle: 7 })
    expect(notString.status()).toBe(400)
    expect((await notString.json()).error).toContain('postStyle must be a string')
    if (dbAvailable) expect(await prisma!.brief.count()).toBe(before)

    const blank = await postBrief(admin, { postStyle: '  ' })
    expect(blank.status()).toBe(201)
    expect((await blank.json()).postStyle).toBe('general')
  })
})

// ── The campaign default style ──────────────────────────────────────────────

test.describe('Post style inputs: the campaign default', () => {
  // Campaign A is shared by later cases that expect no default (TC-PS-17 reads
  // a General stamp), so every case here leaves it cleared, pass or fail.
  test.afterEach(async () => {
    await admin.patch(`/api/campaigns/${campA}`, { defaultPostStyle: null })
  })

  test('TC-PS-05: an admin sets it, a brief on that campaign uses it, another campaign is unaffected, an editor gets 403', async () => {
    const set = await admin.patch(`/api/campaigns/${campA}`, { defaultPostStyle: 'event' })
    expect(set.status()).toBe(200)
    expect((await set.json()).defaultPostStyle).toBe('event')

    const onA = await (await postBrief(admin, { campaignId: campA })).json()
    expect(onA.postStyle).toBe('event')
    const onB = await (await postBrief(admin, { campaignId: campB })).json()
    expect(onB.postStyle).toBe('general')
    // An explicit style still wins over the default.
    expect((await (await postBrief(admin, { campaignId: campA, postStyle: 'tip' })).json()).postStyle).toBe('tip')

    const denied = await editor.patch(`/api/campaigns/${campA}`, { defaultPostStyle: 'launch' })
    expect(denied.status()).toBe(403)
    expect((await (await admin.get(`/api/campaigns/${campA}`)).json()).defaultPostStyle).toBe('event')

    const unknown = await admin.patch(`/api/campaigns/${campA}`, { defaultPostStyle: 'nope' })
    expect(unknown.status()).toBe(400)
    expect((await unknown.json()).code).toBe('UNKNOWN_POST_STYLE')
    expect((await (await admin.get(`/api/campaigns/${campA}`)).json()).defaultPostStyle).toBe('event')
  })

  test('TC-PS-06: campaign create takes a default and refuses an unknown one; null clears it', async () => {
    const bad = await admin.post('/api/campaigns', { name: `PS bad ${tag()}`, defaultPostStyle: 'nope' })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).code).toBe('UNKNOWN_POST_STYLE')

    // The one extra campaign this case needs; it is not reused.
    const created = await admin.post('/api/campaigns', { name: `PS C ${tag()}`, brandKitId: kitId, defaultPostStyle: 'milestone' })
    expect(created.status()).toBe(201)
    const camp = await created.json()
    expect(camp.defaultPostStyle).toBe('milestone')
    expect((await (await postBrief(admin, { campaignId: camp.id })).json()).postStyle).toBe('milestone')

    const cleared = await admin.patch(`/api/campaigns/${camp.id}`, { defaultPostStyle: null })
    expect(cleared.status()).toBe(200)
    expect((await cleared.json()).defaultPostStyle).toBeNull()
    expect((await (await postBrief(admin, { campaignId: camp.id })).json()).postStyle).toBe('general')
    await admin.del(`/api/campaigns/${camp.id}`)

    // Restore campaign A for the cases below that read its default.
    await admin.patch(`/api/campaigns/${campA}`, { defaultPostStyle: null })
  })
})

// ── The inputs: the queue ───────────────────────────────────────────────────

test.describe('Post style inputs: the queue', () => {
  test('TC-PS-07: create resolves the style (explicit, legacy goal, campaign default, General) and refuses an unknown key', async () => {
    const explicit = await addEntry(campA, `PS q explicit ${tag()}`, { postStyle: 'promotion', goal: 'hiring' })
    expect(await admin.get(`/api/campaigns/${campA}/queue`).then((r) => r.json())).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: explicit.id, postStyle: 'promotion' })]),
    )

    const legacy = (await (await admin.post(`/api/campaigns/${campA}/queue`, entryBody(`PS q legacy ${tag()}`, { goal: 'hiring', tone: 'Friendly' }))).json()) as {
      id: string
      postStyle: string
      tone: string
    }
    expect(legacy.postStyle).toBe('hiring')
    expect(legacy.tone).toBe('Friendly')

    const plain = await (await admin.post(`/api/campaigns/${campA}/queue`, entryBody(`PS q plain ${tag()}`))).json()
    expect(plain.postStyle).toBe('general')

    await admin.patch(`/api/campaigns/${campA}`, { defaultPostStyle: 'tip' })
    const viaDefault = await (await admin.post(`/api/campaigns/${campA}/queue`, entryBody(`PS q default ${tag()}`))).json()
    expect(viaDefault.postStyle).toBe('tip')
    await admin.patch(`/api/campaigns/${campA}`, { defaultPostStyle: null })

    const before = dbAvailable ? await prisma!.scheduledGeneration.count({ where: { campaignId: campA } }) : 0
    const unknown = await admin.post(`/api/campaigns/${campA}/queue`, entryBody(`PS q bad ${tag()}`, { postStyle: 'nope' }))
    expect(unknown.status()).toBe(400)
    expect((await unknown.json()).code).toBe('UNKNOWN_POST_STYLE')
    if (dbAvailable) expect(await prisma!.scheduledGeneration.count({ where: { campaignId: campA } })).toBe(before)

    for (const id of [explicit.id, legacy.id, plain.id, viaDefault.id]) await admin.del(`/api/campaigns/${campA}/queue/${id}`)
  })

  test('TC-PS-08: edit takes a style, refuses an unknown one and leaves the entry unchanged', async () => {
    const entry = await addEntry(campA, `PS q edit ${tag()}`, { postStyle: 'general' })
    const ok = await admin.patch(`/api/campaigns/${campA}/queue/${entry.id}`, entryBody('PS q edited', { postStyle: 'milestone', tone: 'bold' }))
    expect(ok.status()).toBe(200)
    const updated = await ok.json()
    expect(updated.postStyle).toBe('milestone')
    expect(updated.tone).toBe('bold')

    const bad = await admin.patch(`/api/campaigns/${campA}/queue/${entry.id}`, entryBody('PS q edited again', { postStyle: 'nope' }))
    expect(bad.status()).toBe(400)
    const list = (await (await admin.get(`/api/campaigns/${campA}/queue`)).json()) as { id: string; postStyle: string; topic: string }[]
    const row = list.find((e) => e.id === entry.id)!
    expect(row.postStyle).toBe('milestone')
    expect(row.topic).toBe('PS q edited')
    await admin.del(`/api/campaigns/${campA}/queue/${entry.id}`)
  })

  test('TC-PS-08b: an edit that sends no style keeps the stored postStyle, goal and tone (a legacy null stays null)', async () => {
    test.skip(!dbAvailable, 'needs the test database to read the stored columns')
    const styled = await addEntry(campA, `PS keep ${tag()}`, { postStyle: 'hiring', tone: 'bold' })
    const before = (await entryRow(styled.id))!
    expect(before.postStyle).toBe('hiring')
    const edit = await admin.patch(`/api/campaigns/${campA}/queue/${styled.id}`, entryBody('PS keep edited', { generateAt: LATER() }))
    expect(edit.status()).toBe(200)
    const after = (await entryRow(styled.id))!
    expect(after.topic).toBe('PS keep edited')
    expect([after.postStyle, after.goal, after.tone]).toEqual([before.postStyle, before.goal, before.tone])

    // A pre-027 entry (null key, its own goal and tone) is not given a style by an edit.
    const legacy = await addEntry(campA, `PS keep legacy ${tag()}`)
    await prisma!.scheduledGeneration.update({ where: { id: legacy.id }, data: { postStyle: null, goal: 'Awareness', tone: 'Friendly' } })
    expect((await admin.patch(`/api/campaigns/${campA}/queue/${legacy.id}`, entryBody('PS keep legacy edited'))).status()).toBe(200)
    const kept = (await entryRow(legacy.id))!
    expect([kept.postStyle, kept.goal, kept.tone]).toEqual([null, 'Awareness', 'Friendly'])

    // Sending a style does re-resolve.
    await admin.patch(`/api/campaigns/${campA}/queue/${legacy.id}`, entryBody('PS keep legacy edited', { postStyle: 'tip' }))
    expect((await entryRow(legacy.id))!.postStyle).toBe('tip')
    for (const e of [styled, legacy]) await admin.del(`/api/campaigns/${campA}/queue/${e.id}`)
  })

  test('TC-PS-09: batch names the failing entry, writes nothing on an error, and resolves defaults on success', async () => {
    const before = dbAvailable ? await prisma!.scheduledGeneration.count({ where: { campaignId: campA } }) : 0
    const bad = await admin.post(`/api/campaigns/${campA}/queue/batch`, {
      entries: [entryBody(`PS b1 ${tag()}`), entryBody(`PS b2 ${tag()}`, { postStyle: 'nope' })],
    })
    expect(bad.status()).toBe(400)
    const body = await bad.json()
    expect(body.code).toBe('UNKNOWN_POST_STYLE')
    expect(body.error).toBe("Entry 2: Unknown post style 'nope'")
    if (dbAvailable) expect(await prisma!.scheduledGeneration.count({ where: { campaignId: campA } })).toBe(before)

    await admin.patch(`/api/campaigns/${campA}`, { defaultPostStyle: 'event' })
    const ok = await admin.post(`/api/campaigns/${campA}/queue/batch`, {
      entries: [
        entryBody(`PS b3 ${tag()}`),
        entryBody(`PS b4 ${tag()}`, { postStyle: 'hiring' }),
        // A pre-027 plan entry: goal and tone only.
        entryBody(`PS b5 ${tag()}`, { goal: 'announcement', tone: 'professional' }),
      ],
    })
    expect(ok.status()).toBe(201)
    const created = (await ok.json()).created as { id: string; postStyle: string }[]
    expect(created.map((e) => e.postStyle)).toEqual(['event', 'hiring', 'announcement'])
    await admin.patch(`/api/campaigns/${campA}`, { defaultPostStyle: null })
    for (const e of created) await admin.del(`/api/campaigns/${campA}/queue/${e.id}`)
  })
})

// ── Generation: the style on the draft, and the facts check ─────────────────

test.describe('Generation and the facts check', () => {
  test.skip(!MOCKED(), NOT_MOCKED)

  test('TC-PS-10: the draft carries the post style and a facts check; GET returns { key, label, version }', async () => {
    const draft = await generate(admin, { postStyle: 'promotion' })
    expect(draft.status).toBe('EXPORTED')
    expect(draft.postStyle).toMatchObject({ key: 'promotion', version: 2 })
    expect(draft.postStyle!.label).toBeTruthy()
    expect(draft.factsCheck).toMatchObject({ status: 'clear', flagged: [] })
  })

  test('TC-PS-11: each invented value is flagged exactly, with where; nothing else is', async () => {
    const cases: [string, string[]][] = [
      // sentinel → the flagged set as `where:value`
      ['__MOCK_FACT_PRICE__', ['INSTAGRAM:$49', 'LINKEDIN:$49', 'headline:$49']],
      ['__MOCK_FACT_PCT__', ['INSTAGRAM:35%', 'LINKEDIN:35%', 'headline:35%']],
      ['__MOCK_FACT_DATE__', ['INSTAGRAM:30 March 2027', 'LINKEDIN:30 March 2027', 'headline:30 March 2027']],
      ['__MOCK_FACT_NUM__', ['INSTAGRAM:1,250', 'LINKEDIN:1,250', 'headline:1,250']],
      ['__MOCK_FACT_HEADLINE__', ['headline:$49']],
    ]
    for (const [sentinel, expected] of cases) {
      const draft = await generate(admin, { topic: `${sentinel} PS facts ${tag()}`, campaignId: campA })
      expect(draft.status, sentinel).toBe('EXPORTED')
      expect(draft.factsCheck?.status, sentinel).toBe('flagged')
      expect(pairs(draft.factsCheck), sentinel).toEqual([...expected].sort())
    }
  })

  test('TC-PS-12: a value stated in the topic, the description, the campaign briefing or a campaign document is not flagged; the same value elsewhere is', async () => {
    // Campaign B states 35% and 1,250 in its briefing and 30 March 2027 in a document; it never states $49.
    const briefing = await admin.post(`/api/campaigns/${campB}/briefing`, {
      content: 'We now serve 1,250 customers. Launch offer: 35% off for the first month.',
    })
    expect([200, 201]).toContain(briefing.status())
    const doc = await admin.multipart(`/api/campaigns/${campB}/documents`, {
      file: { name: 'event.txt', mimeType: 'text/plain', buffer: Buffer.from('The webinar is on 30 March 2027 at the main hall.') },
    })
    expect(doc.status()).toBe(201)

    const inTopic = await generate(admin, { topic: `__MOCK_FACT_PRICE__ Only $49 today ${tag()}` })
    expect(inTopic.factsCheck?.status).toBe('clear')

    const inDescription = await generate(admin, {
      topic: `__MOCK_FACT_PRICE__ PS desc ${tag()}`,
      description: 'The price is $49 per seat.',
    })
    expect(inDescription.factsCheck?.status).toBe('clear')

    const inBriefing = await generate(admin, { topic: `__MOCK_FACT_PCT__ __MOCK_FACT_NUM__ PS brf ${tag()}`, campaignId: campB })
    expect(inBriefing.factsCheck).toMatchObject({ status: 'clear', flagged: [] })

    const inDocument = await generate(admin, { topic: `__MOCK_FACT_DATE__ PS doc ${tag()}`, campaignId: campB })
    expect(inDocument.factsCheck).toMatchObject({ status: 'clear', flagged: [] })

    // Negative control on the same campaign: $49 is stated nowhere there.
    const control = await generate(admin, { topic: `__MOCK_FACT_PRICE__ PS ctl ${tag()}`, campaignId: campB })
    expect(values(control.factsCheck)).toEqual(['$49'])
  })

  test('TC-PS-13: an ordinary brief (24/7, a list marker, a step count) is clear', async () => {
    const draft = await generate(admin, { topic: `Support is open 24/7. Three steps: 1. plan 2. write 3. ship ${tag()}` })
    expect(draft.factsCheck).toMatchObject({ status: 'clear', flagged: [] })
  })

  test('TC-PS-14: a check that cannot run is stored as error and the draft still finishes', async () => {
    const draft = await generate(admin, { topic: `__MOCK_FACT_ERROR__ PS err ${tag()}` })
    expect(draft.status).toBe('EXPORTED')
    expect(draft.factsCheck?.status).toBe('error')
    expect(draft.factsCheck?.flagged).toEqual([])
  })

  test('TC-PS-15: a manual caption edit recomputes the check; so does a regenerate', async () => {
    const draft = await generate(admin, { topic: `__MOCK_FACT_PRICE__ PS edit ${tag()}`, campaignId: campA })
    expect(values(draft.factsCheck)).toEqual(['$49'])

    // Replace the Instagram caption with one that states no number: its flag goes.
    const clean = await admin.patch(`/api/drafts/${draft.id}`, { channel: 'INSTAGRAM', text: 'A caption with no figures at all.' })
    expect(clean.status()).toBe(200)
    let after = (await (await admin.get(`/api/drafts/${draft.id}`)).json()) as DraftJson
    expect(pairs(after.factsCheck)).toEqual(['LINKEDIN:$49', 'headline:$49'])

    // Type an invented value into it: flagged again, with the new value.
    const dirty = await admin.patch(`/api/drafts/${draft.id}`, { channel: 'INSTAGRAM', text: 'Now only $99 for everyone.' })
    expect(dirty.status()).toBe(200)
    after = (await (await admin.get(`/api/drafts/${draft.id}`)).json()) as DraftJson
    expect(pairs(after.factsCheck)).toEqual(['INSTAGRAM:$99', 'LINKEDIN:$49', 'headline:$49'])

    // A headline edit recomputes too.
    expect((await admin.patch(`/api/drafts/${draft.id}`, { headline: 'No numbers here' })).status()).toBe(200)
    after = (await (await admin.get(`/api/drafts/${draft.id}`)).json()) as DraftJson
    expect(pairs(after.factsCheck)).toEqual(['INSTAGRAM:$99', 'LINKEDIN:$49'])

    // Regenerating the Instagram caption brings back the mock's own text: $99 goes, the $49 returns.
    const regen = await admin.post(`/api/drafts/${draft.id}/regenerate-copy`, { channel: 'INSTAGRAM' })
    expect(regen.status()).toBe(202)
    let settled: DraftJson
    for (let i = 0; ; i++) {
      settled = (await (await admin.get(`/api/drafts/${draft.id}`)).json()) as DraftJson & { pendingAction: string | null }
      if ((settled as unknown as { pendingAction: string | null }).pendingAction == null || i > 60) break
      await new Promise((r) => setTimeout(r, 250))
    }
    expect(pairs(settled.factsCheck)).toEqual(['INSTAGRAM:$49', 'LINKEDIN:$49'])
  })

  test('TC-PS-16: a brief with no style (a pre-027 row) gets no checklist stamp but still gets a facts check', async () => {
    test.skip(!dbAvailable, 'needs the test database to age a brief')
    const res = await postBrief(admin, { topic: `__MOCK_FACT_PRICE__ PS legacy ${tag()}`, campaignId: campA })
    const brief = await res.json()
    await prisma!.brief.update({ where: { id: brief.id }, data: { postStyle: null } })
    const assembled = await admin.post('/api/generate/assemble-b', { briefId: brief.id })
    expect(assembled.status()).toBe(202)
    const draft = (await waitForDraft(admin, (await assembled.json()).draftId)) as unknown as DraftJson
    expect(draft.status).toBe('EXPORTED')
    expect(draft.postStyle).toBeNull()
    expect(values(draft.factsCheck)).toEqual(['$49'])
    const row = await prisma!.draft.findUnique({ where: { id: draft.id }, select: { postStyle: true } })
    expect(row!.postStyle).toBeNull()
  })
})

// ── The scheduler: the HOLD downgrade ───────────────────────────────────────

test.describe('The scheduler: facts check gates auto-publish', () => {
  test.skip(!MOCKED() || !dbAvailable, NOT_MOCKED)

  const FLAGGED_REASON = 'Not published: the facts check flagged $49. Review the draft, then publish it by hand.'
  const COULD_NOT_RUN = 'Not published: the facts check could not run. Review the draft, then publish it by hand.'

  for (const postAction of ['SCHEDULE_PUBLISH', 'PUBLISH_NOW'] as const) {
    test(`TC-PS-17 (${postAction}): a flagged check holds the post: COMPLETED with a draft, no Post row, heldReason, postAction unchanged`, async () => {
      const extra = postAction === 'SCHEDULE_PUBLISH' ? { postAction, publishAt: LATER() } : { postAction }
      const entry = await addEntry(campA, `__MOCK_FACT_PRICE__ PS held ${postAction} ${tag()}`, extra)
      const after = await tickUntilSettled(admin, entry.id)
      expect(after.status).toBe('COMPLETED')
      expect(after.draftId).toBeTruthy()
      expect(after.postAction).toBe(postAction)
      expect(after.heldReason).toBe(FLAGGED_REASON)
      expect(await prisma!.post.count({ where: { draftId: after.draftId! } })).toBe(0)

      // The draft is there for a person: flagged, and the entry's own style is stamped.
      const draft = (await (await admin.get(`/api/drafts/${after.draftId}`)).json()) as DraftJson
      expect(draft.status).toBe('EXPORTED')
      expect(values(draft.factsCheck)).toEqual(['$49'])
      expect(draft.postStyle).toMatchObject({ key: 'general', version: 1 })
    })
  }

  test('TC-PS-18: a clear check runs the post action exactly as before (the clean pair publishes)', async () => {
    const sched = await addEntry(campA, `__MOCK_FACT_PRICE__ Only $49 sched ${tag()}`, { postAction: 'SCHEDULE_PUBLISH', publishAt: LATER() })
    const afterSched = await tickUntilSettled(admin, sched.id)
    expect(afterSched.status).toBe('COMPLETED')
    expect(afterSched.heldReason).toBeNull()
    const posts = await prisma!.post.findMany({ where: { draftId: afterSched.draftId! } })
    expect(posts).toHaveLength(1)
    expect(posts[0].status).toBe('SCHEDULED')

    const now = await addEntry(campA, `__MOCK_FACT_PRICE__ Only $49 now ${tag()}`, { postAction: 'PUBLISH_NOW' })
    const afterNow = await tickUntilSettled(admin, now.id)
    expect(afterNow.status).toBe('COMPLETED')
    expect(afterNow.heldReason).toBeNull()
    expect(await prisma!.post.count({ where: { draftId: afterNow.draftId! } })).toBe(1)
  })

  test('TC-PS-19: a HOLD entry is unaffected by a flagged check (no post action, nothing held)', async () => {
    const entry = await addEntry(campA, `__MOCK_FACT_PRICE__ PS hold ${tag()}`, { postAction: 'HOLD' })
    const after = await tickUntilSettled(admin, entry.id)
    expect(after.status).toBe('COMPLETED')
    expect(after.heldReason).toBeNull()
    expect(await prisma!.post.count({ where: { draftId: after.draftId! } })).toBe(0)
  })

  test('TC-PS-20: a check forced to error holds the post with the "could not run" reason', async () => {
    const entry = await addEntry(campA, `__MOCK_FACT_ERROR__ PS err ${tag()}`, { postAction: 'PUBLISH_NOW' })
    const after = await tickUntilSettled(admin, entry.id)
    expect(after.status).toBe('COMPLETED')
    expect(after.heldReason).toBe(COULD_NOT_RUN)
    expect(await prisma!.post.count({ where: { draftId: after.draftId! } })).toBe(0)
  })

  test('TC-PS-21: a held entry is re-run through the route: heldReason is cleared and a new draft is generated', async () => {
    const entry = await addEntry(campA, `__MOCK_FACT_PRICE__ PS rerun ${tag()}`, { postAction: 'PUBLISH_NOW' })
    const held = await tickUntilSettled(admin, entry.id)
    expect(held.status).toBe('COMPLETED')
    expect(held.heldReason).toBe(FLAGGED_REASON)
    const firstDraft = held.draftId!
    expect(await prisma!.post.count({ where: { draftId: firstDraft } })).toBe(0)

    const rerun = await admin.post(`/api/campaigns/${campA}/queue/${entry.id}/rerun`, {})
    expect(rerun.status()).toBe(200)
    const body = await rerun.json()
    expect(body.status).toBe('PENDING')
    expect(body.heldReason).toBeNull()
    expect(body.errorReason).toBeNull()

    // It regenerates: a second draft, held again for the same invented value.
    const again = await tickUntilSettled(admin, entry.id)
    expect(again.status).toBe('COMPLETED')
    expect(again.draftId).toBeTruthy()
    expect(again.draftId).not.toBe(firstDraft)
    expect(again.heldReason).toBe(FLAGGED_REASON)

    // An ordinary COMPLETED entry (nothing held) is still refused.
    const plain = await addEntry(campA, `PS rerun plain ${tag()}`, { postAction: 'HOLD' })
    expect((await tickUntilSettled(admin, plain.id)).status).toBe('COMPLETED')
    expect((await admin.post(`/api/campaigns/${campA}/queue/${plain.id}/rerun`, {})).status()).toBe(409)
  })

  test('TC-PS-22: a stored key that no longer resolves fails the entry with the named reason; no brief, no draft, no Post (AC-22)', async () => {
    const topic = `PS ghost ${tag()}`
    const entry = await addEntry(campA, topic, { postAction: 'PUBLISH_NOW' })
    // The API refuses an unknown key, so seed it the way a retired or removed style would be left.
    await prisma!.scheduledGeneration.update({ where: { id: entry.id }, data: { postStyle: 'ghost' } })
    const after = await tickUntilSettled(admin, entry.id)
    expect(after.errorReason).toBe('Post style "ghost" is not available')
    expect(after.status).toBe('PENDING') // the existing retry path, with that reason
    expect(after.retryCount).toBe(1)
    expect(after.draftId).toBeNull()
    expect(after.briefId).toBeNull()
    expect(after.heldReason).toBeNull()
    expect(await prisma!.brief.count({ where: { topic } })).toBe(0)
    expect(await prisma!.post.count({ where: { draft: { brief: { topic } } } })).toBe(0)
    await prisma!.scheduledGeneration.update({ where: { id: entry.id }, data: { status: 'CANCELLED', nextRetryAt: null } })
  })

  test('TC-PS-23: a pre-027 entry (null key) runs with its own goal and tone, no style, and is still gated', async () => {
    const entry = await addEntry(campA, `__MOCK_FACT_PRICE__ PS pre027 ${tag()}`, { postAction: 'PUBLISH_NOW', goal: 'Awareness', tone: 'Friendly' })
    await prisma!.scheduledGeneration.update({
      where: { id: entry.id },
      data: { postStyle: null, goal: 'Awareness', tone: 'Friendly' },
    })
    const after = await tickUntilSettled(admin, entry.id)
    expect(after.status).toBe('COMPLETED')
    expect(after.heldReason).toBe(FLAGGED_REASON)
    expect(await prisma!.post.count({ where: { draftId: after.draftId! } })).toBe(0)
    const brief = await prisma!.brief.findUnique({ where: { id: after.briefId! } })
    expect(brief).toMatchObject({ postStyle: null, goal: 'Awareness', tone: 'Friendly', imageStyle: 'classic' })
    const draft = await prisma!.draft.findUnique({ where: { id: after.draftId! }, select: { postStyle: true } })
    expect(draft!.postStyle).toBeNull()
  })

  test('TC-PS-24: a styled entry writes its key, the style goal and the entry tone to the brief; the image stays classic', async () => {
    const entry = await addEntry(campA, `PS styled ${tag()}`, { postStyle: 'launch', tone: 'bold', postAction: 'HOLD' })
    const after = await tickUntilSettled(admin, entry.id)
    expect(after.status).toBe('COMPLETED')
    const brief = await prisma!.brief.findUnique({ where: { id: after.briefId! } })
    expect(brief).toMatchObject({ postStyle: 'launch', tone: 'bold', imageStyle: 'classic' })
    const draft = (await (await admin.get(`/api/drafts/${after.draftId}`)).json()) as DraftJson
    expect(draft.postStyle).toMatchObject({ key: 'launch', version: 1 })
  })
})

// ── MCP and ACP ─────────────────────────────────────────────────────────────
// The MCP stdio server has no HTTP surface; its tool is the same generatePost
// function the ACP route calls (covered in tests/unit/mcpGetDraft.test.ts).

test.describe('ACP generate_post', () => {
  test.skip(!MOCKED(), NOT_MOCKED)
  let key: string
  let keyId: string

  test.beforeAll(async () => {
    const created = await (await admin.post('/api/team/api-keys', { label: `PS ACP ${tag()}` })).json()
    key = created.plaintext
    keyId = created.id
  })
  test.afterAll(async () => {
    if (keyId) await admin.del(`/api/team/api-keys/${keyId}`)
  })

  const run = (request: APIRequestContext, input: Record<string, unknown>) =>
    request.post('/api/acp/run', {
      headers: { 'x-bistec-api-key': key },
      data: { capability: 'generate_post', input: { channels: ['INSTAGRAM'], designMode: 'GENERATE', ...input } },
    })

  test('TC-PS-25: goal and tone are optional; the result names the style and carries the check', async ({ request }) => {
    const res = await run(request, { topic: `PS acp plain ${tag()}` })
    expect(res.status(), await res.text()).toBe(200)
    const out = (await res.json()).output
    expect(out.postStyle).toBe('general')
    expect(out.factsCheck).toEqual({ status: 'clear', flagged: [] })
    expect(out.draftId).toBeTruthy()
  })

  test('TC-PS-26: an explicit postStyle wins over the legacy goal; a legacy goal alone picks hiring or announcement', async ({ request }) => {
    const styled = (await (await run(request, { topic: `PS acp styled ${tag()}`, postStyle: 'event', goal: 'hiring', tone: 'casual' })).json()).output
    expect(styled.postStyle).toBe('event')
    const legacy = (await (await run(request, { topic: `PS acp legacy ${tag()}`, goal: 'hiring', tone: 'professional' })).json()).output
    expect(legacy.postStyle).toBe('hiring')
    const other = (await (await run(request, { topic: `PS acp other ${tag()}`, goal: 'Drive signups', tone: 'professional' })).json()).output
    expect(other.postStyle).toBe('general')
  })

  test('TC-PS-27: an invented value comes back as a flagged check', async ({ request }) => {
    const out = (await (await run(request, { topic: `__MOCK_FACT_PRICE__ PS acp facts ${tag()}` })).json()).output
    expect(out.factsCheck.status).toBe('flagged')
    expect(values(out.factsCheck)).toEqual(['$49'])
  })

  test('TC-PS-28: an unknown key is the named error (422); a non-string key is a 400', async ({ request }) => {
    const unknown = await run(request, { topic: `PS acp bad ${tag()}`, postStyle: 'nope' })
    expect(unknown.status()).toBe(422)
    expect((await unknown.json()).error).toBe("Unknown post style 'nope'")
    const notString = await run(request, { topic: `PS acp bad ${tag()}`, postStyle: 5 })
    expect(notString.status()).toBe(400)
    const noTopic = await run(request, { postStyle: 'tip' })
    expect(noTopic.status()).toBe(400)
  })

  test('TC-PS-29: the manifest is 1.2.0, lists postStyle, and no longer requires goal or tone', async ({ request }) => {
    const res = await request.get('/api/acp/manifest', { headers: { 'x-bistec-api-key': key } })
    expect(res.status()).toBe(200)
    const manifest = await res.json()
    expect(manifest.version).toBe('1.2.0')
    const cap = manifest.capabilities.find((c: { name: string }) => c.name === 'generate_post')
    expect(cap.input.required).toEqual(['topic', 'channels', 'designMode'])
    expect(cap.input.properties.postStyle.enum).toContain('general')
    expect(Object.keys(cap.output.properties)).toEqual(expect.arrayContaining(['postStyle', 'factsCheck']))
  })
})

// ── The UI cases (027 T6): the wizard, the campaign default, the queue and the draft page ──

const WIZARD_PROMPT = 'Announce the new post styles with a short call to action for the team.'

const nextPost = (page: Page, suffix: string) =>
  page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith(suffix))

const summary = (page: Page, label: string) =>
  page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')

// Step 0 -> step 1 (Size & Design), optionally under a campaign, with the suite's kit.
async function openStepOne(page: Page, campaignName?: string) {
  await pageLogin(page)
  await page.goto('/brief')
  await expect(page.getByRole('heading', { name: 'Select a campaign' })).toBeVisible({ timeout: 20_000 })
  if (campaignName) await page.getByRole('button', { name: new RegExp(campaignName) }).click()
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
  const kit = page.getByRole('combobox', { name: 'Brand kit' })
  await expect(kit.locator(`option[value="${kitId}"]`)).toBeAttached()
  await kit.selectOption(kitId)
}

const styleCard = (page: Page, key: string) => page.getByTestId(`post-style-${key}`)
const lookCard = (page: Page, key: string) => page.getByTestId(`image-style-${key}`)

async function toContentStep(page: Page) {
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page.getByRole('heading', { name: 'Description & caption direction' })).toBeVisible()
}

async function fillContent(page: Page, topic: string) {
  await page.getByPlaceholder('e.g. Q3 product launch').fill(topic)
  await page.locator('textarea').fill(WIZARD_PROMPT)
}

test.describe('The wizard: the post style picker on step 1', () => {
  test.skip(!MOCKED(), NOT_MOCKED)
  let before: Set<string>
  test.beforeEach(async () => {
    before = new Set(await briefDraftIds(admin))
  })
  test.afterEach(async () => {
    for (const id of await briefDraftIds(admin)) if (!before.has(id)) await admin.del(`/api/brief-drafts/${id}`)
  })

  test('TC-PS-30: the picker sits above the size choices with General selected, moves by arrow keys, and the Content step has no Goal select', async ({ page }) => {
    await openStepOne(page)
    const picker = page.getByTestId('post-style-picker')
    await expect(picker).toBeVisible()
    await expect(picker.getByRole('radio')).toHaveCount(8)
    await expect(styleCard(page, 'general')).toHaveAttribute('aria-checked', 'true')

    // Above the size choices.
    const pickerBox = (await picker.boundingBox())!
    const sizeBox = (await page.getByText('Post size', { exact: true }).boundingBox())!
    expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(sizeBox.y)

    // One tab stop; the arrow keys move the choice and the focus.
    await styleCard(page, 'general').focus()
    await page.keyboard.press('ArrowRight')
    await expect(styleCard(page, 'launch')).toHaveAttribute('aria-checked', 'true')
    await expect(styleCard(page, 'launch')).toBeFocused()
    await expect(styleCard(page, 'general')).toHaveAttribute('aria-checked', 'false')
    await expect(styleCard(page, 'general')).toHaveAttribute('tabindex', '-1')
    await page.keyboard.press('ArrowLeft')
    await expect(styleCard(page, 'general')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('End')
    await expect(styleCard(page, 'milestone')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Home')
    await expect(styleCard(page, 'general')).toHaveAttribute('aria-checked', 'true')

    await expectNoAxeViolations(page, 'brief step 1 with the post style picker', { settle: true })
    await page.setViewportSize({ width: 390, height: 900 })
    await expectNoHorizontalScroll(page, 'brief step 1 with the picker at 390px')
    await page.setViewportSize({ width: 1440, height: 900 })

    // The Content step: Tone, and no Goal.
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await toContentStep(page)
    await expect(page.getByRole('combobox', { name: 'Tone' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Goal' })).toHaveCount(0)
  })

  test('TC-PS-31: the image style on step 1 is pre-filled from the style, a look picked by hand is kept (also across 9:16), Path A has none', async ({ page }) => {
    await openStepOne(page)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await expect(lookCard(page, 'classic')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('image-style-from-style')).toHaveCount(0)

    await styleCard(page, 'launch').click()
    await expect(lookCard(page, 'product-showcase')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('image-style-from-style')).toBeVisible()
    await styleCard(page, 'announcement').click()
    await expect(lookCard(page, 'editorial-split')).toHaveAttribute('aria-pressed', 'true')

    // A look picked by hand is kept when the style changes.
    await lookCard(page, 'product-showcase').click()
    await expect(page.getByTestId('image-style-from-style')).toHaveCount(0)
    await styleCard(page, 'event').click()
    await expect(lookCard(page, 'product-showcase')).toHaveAttribute('aria-pressed', 'true')
    // Choosing Classic by hand is a choice too.
    await lookCard(page, 'classic').click()
    await styleCard(page, 'launch').click()
    await expect(lookCard(page, 'classic')).toHaveAttribute('aria-pressed', 'true')

    // 9:16 (028): the looks are available there too, so a hand-picked Classic
    // stays Classic across the size change, both ways.
    await lookCard(page, 'classic').click()
    await styleCard(page, 'announcement').click()
    await page.getByRole('button', { name: /9:16 Story/ }).click()
    await expect(lookCard(page, 'classic')).toHaveAttribute('aria-pressed', 'true')
    await expect(lookCard(page, 'editorial-split')).toBeEnabled()
    await page.getByRole('button', { name: /1:1 Square/ }).click()
    // The size change dropped nothing: the hand-pick is still Classic.
    await expect(lookCard(page, 'classic')).toHaveAttribute('aria-pressed', 'true')

    // Path A has no image style at all.
    await page.getByRole('button', { name: /^Template/ }).click()
    await expect(page.getByTestId('image-style-section')).toHaveCount(0)
  })

  test('TC-PS-32: the style pre-fills the Tone, a Tone changed by hand is kept, and the Review shows the resolved rows', async ({ page }) => {
    await openStepOne(page)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await styleCard(page, 'promotion').click()
    await toContentStep(page)
    const tone = page.getByRole('combobox', { name: 'Tone' })
    await expect(tone).toHaveValue('bold')
    await expect(page.getByTestId('tone-from-style')).toBeVisible()

    // A tone changed by hand survives a different style.
    await tone.selectOption('casual')
    await expect(page.getByTestId('tone-from-style')).toHaveCount(0)
    await page.getByRole('button', { name: /back/i }).click()
    await styleCard(page, 'launch').click()
    await toContentStep(page)
    await expect(tone).toHaveValue('casual')
    await fillContent(page, `PS wizard rows ${tag()}`)
    await page.getByRole('button', { name: /continue/i }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()
    await expect(summary(page, 'Post style')).toHaveText('Launch / new offer')
    await expect(summary(page, 'Tone')).toHaveText('casual')
    await expect(summary(page, 'Image style')).toHaveText('Product showcase (from the post style)')
    await expect(page.getByRole('term').filter({ hasText: /^Goal$/ })).toHaveCount(0)

    // 9:16 (028): the Launch style still pre-fills its look on the Review (Path A has no image-style field to read: TC-PS-31).
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /back/i }).click()
    await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
    await page.getByRole('button', { name: /9:16 Story/ }).click()
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()
    await expect(summary(page, 'Image style')).toHaveText('Product showcase (from the post style)')
  })

  test('TC-PS-33: the request carries postStyle always, and tone and imageStyle only when touched', async ({ page }) => {
    await openStepOne(page)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await styleCard(page, 'launch').click()
    await toContentStep(page)
    await fillContent(page, `PS wizard body ${tag()}`)
    await page.getByRole('button', { name: /continue/i }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()

    // The brief POST is stubbed so no generation starts: this case is about what is sent.
    const bodies: Record<string, unknown>[] = []
    await page.route('**/api/briefs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      bodies.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'stubbed' }) })
    })
    // The listener is created before the click that triggers the request.
    let posted = nextPost(page, '/api/briefs')
    await page.getByRole('button', { name: 'Generate Post' }).click()
    await posted
    expect(bodies[0].postStyle).toBe('launch')
    expect('tone' in bodies[0]).toBe(false)
    expect('imageStyle' in bodies[0]).toBe(false)
    expect('goal' in bodies[0]).toBe(false)

    // Touch the tone and the look, then send again.
    await expect(page.getByRole('button', { name: 'Generate Post' })).toBeEnabled()
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /back/i }).click()
    await lookCard(page, 'editorial-split').click()
    await toContentStep(page)
    await page.getByRole('combobox', { name: 'Tone' }).selectOption('casual')
    await page.getByRole('button', { name: /continue/i }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    posted = nextPost(page, '/api/briefs')
    await page.getByRole('button', { name: 'Generate Post' }).click()
    await posted
    expect(bodies[1]).toMatchObject({ postStyle: 'launch', tone: 'casual', imageStyle: 'editorial-split' })
    await page.unroute('**/api/briefs')
  })

  test('TC-PS-34: the stored style resumes (an unknown key and an old row open as General)', async ({ page }) => {
    await openStepOne(page)
    await page.getByRole('button', { name: /^Freeform/ }).click()
    await styleCard(page, 'event').click()
    await toContentStep(page)
    await fillContent(page, `PS wizard resume ${tag()}`)
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' &&
        new URL(r.url()).pathname === '/api/brief-drafts' &&
        (r.request().postDataJSON() as { payload: Record<string, unknown> }).payload.postStyle === 'event',
    )
    const draftId = ((await (await saved).json()) as { id: string }).id

    const row = (await (await admin.get(`/api/brief-drafts/${draftId}`)).json()) as { payload: Record<string, unknown> }
    expect(row.payload.postStyle).toBe('event')
    expect('goal' in row.payload).toBe(false)
    const put = (payload: Record<string, unknown>) => admin.put('/api/brief-drafts', { id: draftId, payload: { ...payload, step: 4 } })
    const reviewStyle = async () => {
      await page.goto(`/brief?resume=${draftId}`)
      await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible({ timeout: 20_000 })
      return summary(page, 'Post style')
    }

    expect((await put(row.payload)).status()).toBe(200)
    await expect(await reviewStyle()).toHaveText('Event')
    expect((await put({ ...row.payload, postStyle: 'ghost-style' })).status()).toBe(200)
    await expect(await reviewStyle()).toHaveText('General')

    // An old row: a goal, no style.
    const { postStyle: _gone, ...old } = row.payload
    expect((await put({ ...old, goal: 'hiring' })).status()).toBe(200)
    await expect(await reviewStyle()).toHaveText('General')
  })
})

test.describe('The campaign default post style', () => {
  test.skip(!MOCKED(), NOT_MOCKED)
  let name = ''
  let nameB = ''
  test.beforeAll(async () => {
    name = ((await (await admin.get(`/api/campaigns/${campA}`)).json()) as { name: string }).name
    nameB = ((await (await admin.get(`/api/campaigns/${campB}`)).json()) as { name: string }).name
  })
  test.afterEach(async () => {
    await admin.patch(`/api/campaigns/${campA}`, { defaultPostStyle: null })
  })

  test('TC-PS-35: the wizard opens with the campaign default selected; a campaign with none gives General', async ({ page }) => {
    const set = await admin.patch(`/api/campaigns/${campA}`, { defaultPostStyle: 'hiring' })
    expect(set.status()).toBe(200)
    await openStepOne(page, name)
    await expect(styleCard(page, 'hiring')).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: /back/i }).click()
    await page.getByRole('button', { name: new RegExp(nameB) }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
    await expect(styleCard(page, 'general')).toHaveAttribute('aria-checked', 'true')
  })

  test('TC-PS-36: an admin sets and clears the default on the detail page; the list shows it; an editor sees text only', async ({ page, browser }) => {
    await pageLogin(page)
    await page.goto(`/campaigns/${campA}`)
    const select = page.getByTestId('campaign-default-post-style')
    await expect(select).toBeVisible()
    await expect(select).toHaveValue('')
    const patched = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === `/api/campaigns/${campA}`)
    await select.selectOption('event')
    expect((await patched).status()).toBe(200)
    expect(((await (await admin.get(`/api/campaigns/${campA}`)).json()) as { defaultPostStyle: string }).defaultPostStyle).toBe('event')

    await page.goto('/campaigns')
    await expect(page.getByTestId('campaign-post-style').first()).toContainText('Event')

    // An editor: the value as text, no select.
    const ctx = await browser.newContext()
    const editorPage = await ctx.newPage()
    await editorPage.goto('/login')
    await editorPage.getByPlaceholder('Username').fill(EDITOR_EMAIL)
    await editorPage.getByPlaceholder('Password').fill(PASSWORD)
    await editorPage.getByRole('button', { name: 'Sign in' }).click()
    await editorPage.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
    await editorPage.goto(`/campaigns/${campA}`)
    await expect(editorPage.getByTestId('campaign-default-post-style-text')).toHaveText('Event')
    await expect(editorPage.getByTestId('campaign-default-post-style')).toHaveCount(0)
    await ctx.close()

    // Clearing it.
    await page.goto(`/campaigns/${campA}`)
    const cleared = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === `/api/campaigns/${campA}`)
    await page.getByTestId('campaign-default-post-style').selectOption('')
    expect((await cleared).status()).toBe(200)
    expect(((await (await admin.get(`/api/campaigns/${campA}`)).json()) as { defaultPostStyle: string | null }).defaultPostStyle).toBeNull()
  })

  test('TC-PS-37: the create form takes a default post style', async ({ page }) => {
    await pageLogin(page)
    await page.goto('/campaigns')
    await page.getByRole('button', { name: 'New Campaign' }).click()
    const nm = `PS created ${tag()}`
    await page.getByLabel('Campaign name').fill(nm)
    await page.getByRole('combobox', { name: 'Default post style' }).selectOption('tip')
    const created = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/campaigns')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    const body = (await (await created).json()) as { id: string; defaultPostStyle: string }
    expect(body.defaultPostStyle).toBe('tip')
    await admin.del(`/api/campaigns/${body.id}`)
  })
})

test.describe('The queue: the post style field and the held line', () => {
  test.skip(!MOCKED() || !dbAvailable, NOT_MOCKED)

  test('TC-PS-38: the modal sends postStyle (and no goal); an entry shows its held line, with the values in its title', async ({ page }) => {
    await pageLogin(page)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`/campaigns/${campA}`)
    await page.getByRole('button', { name: 'Plan a post' }).click()
    const modal = page.getByRole('dialog', { name: 'Plan a post' })
    await expect(modal).toBeVisible()
    const topic = `PS modal ${tag()}`
    await modal.getByLabel('Topic').fill(topic)
    await modal.getByTestId('queue-post-style').selectOption('event')
    await modal.getByLabel('Generate at').fill('2031-01-01T10:00')
    const posted = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === `/api/campaigns/${campA}/queue`)
    await modal.getByRole('button', { name: 'Add to queue' }).click()
    const body = (await posted).postDataJSON() as Record<string, unknown>
    expect(body.postStyle).toBe('event')
    expect('goal' in body).toBe(false)
    await expect(page.getByText(topic)).toBeVisible()
    const row = await prisma!.scheduledGeneration.findFirst({ where: { campaignId: campA, topic } })
    expect(row?.postStyle).toBe('event')
    await prisma!.scheduledGeneration.update({ where: { id: row!.id }, data: { status: 'CANCELLED' } })

    // A held entry shows the amber line.
    const heldTopic = `__MOCK_FACT_PRICE__ PS held line ${tag()}`
    const held = await addEntry(campA, heldTopic, { postAction: 'PUBLISH_NOW' })
    const after = await tickUntilSettled(admin, held.id)
    expect(after.heldReason).toBeTruthy()
    await page.reload()
    const line = page.getByRole('row', { name: new RegExp(heldTopic) }).getByTestId('queue-held-reason')
    await expect(line).toContainText('Not published: the facts check flagged $49')
    await expect(line).toHaveAttribute('title', /\$49/)
    await expectNoAxeViolations(page, 'the queue with a held entry', { settle: true })
    await page.setViewportSize({ width: 390, height: 900 })
    await expectNoHorizontalScroll(page, 'the campaign page with a held entry at 390px')
  })
})

test.describe('The draft page: the facts notice and the style line', () => {
  test.skip(!MOCKED(), NOT_MOCKED)

  test('TC-PS-39: a flagged draft shows the notice, a clear one does not, the check that could not run says so, and Publish stays enabled', async ({ page }) => {
    await pageLogin(page)
    await page.setViewportSize({ width: 1440, height: 900 })

    const flagged = await generate(admin, { topic: `__MOCK_FACT_PRICE__ __MOCK_FACT_DATE__ PS notice ${tag()}`, postStyle: 'promotion' })
    expect(flagged.factsCheck?.status).toBe('flagged')
    await page.goto(`/drafts/${flagged.id}`)
    const notice = page.getByTestId('facts-check-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveAttribute('role', 'status')
    await expect(notice).toHaveAttribute('data-status', 'flagged')
    await expect(notice).toContainText('$49')
    await expect(notice).toContainText('30 March 2027')
    await expect(notice).toContainText('(Instagram caption)')
    await expect(notice).toContainText('These are not in your brief, campaign or brand voice. Check them before publishing.')
    await expect(page.getByRole('button', { name: /^publish$/i })).toBeEnabled()
    await expect(page.getByTestId('post-style-line')).toHaveText('Post style: Promotion / deal')
    await expectNoAxeViolations(page, '/drafts/[id] with the facts notice', { settle: true })
    await page.setViewportSize({ width: 390, height: 900 })
    await expect(notice).toBeVisible()
    await expectNoHorizontalScroll(page, '/drafts/[id] with the facts notice at 390px')
    await page.setViewportSize({ width: 1440, height: 900 })

    // A clear check shows nothing.
    const clear = await generate(admin, { topic: `PS clear ${tag()}` })
    expect(clear.factsCheck?.status).toBe('clear')
    await page.goto(`/drafts/${clear.id}`)
    await expect(page.getByTestId('post-style-line')).toBeVisible()
    await expect(page.getByTestId('facts-check-notice')).toHaveCount(0)

    // A null check (never checked) shows nothing.
    if (dbAvailable) {
      await prisma!.draft.update({ where: { id: clear.id }, data: { factsCheck: Prisma.DbNull } })
      await page.reload()
      await expect(page.getByTestId('post-style-line')).toBeVisible()
      await expect(page.getByTestId('facts-check-notice')).toHaveCount(0)
    }

    // A check that could not run.
    const errored = await generate(admin, { topic: `__MOCK_FACT_ERROR__ PS error ${tag()}` })
    expect(errored.factsCheck?.status).toBe('error')
    await page.goto(`/drafts/${errored.id}`)
    await expect(page.getByTestId('facts-check-notice')).toContainText('The facts check could not run for this post.')
    await expect(page.getByRole('button', { name: /^publish$/i })).toBeEnabled()
  })
})

test.describe('The insights page: Post styles', () => {
  test.skip(!MOCKED(), NOT_MOCKED)

  const SEAM = '/api/test/analytics-events'
  test.afterAll(async () => {
    if (admin) await admin.del(SEAM)
  })

  test('TC-PS-40: the section equals a hand count over seeded events, an unchosen style shows zeros, and an editor is refused', async ({ page }) => {
    expect((await admin.del(SEAM)).status()).toBe(204)
    const team = await findTeamIdByName(admin, 'Bistec')
    const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
    const row = (name: string, postStyle: string | null, outcome: string | null, extra: Record<string, unknown> = {}, h = 1) => ({
      name, source: name === 'scheduled_generation.settled' ? 'scheduler' : 'web', teamId: team, userId: null, outcome, at: at(h),
      payload: { postStyle, ...extra },
    })
    const gen = (style: string | null, factsStatus: string | null) =>
      row('generation.finished', style, 'ok', factsStatus ? { factsStatus, factsFlagCount: factsStatus === 'flagged' ? 2 : 0 } : {})
    const rows = [
      // launch: chosen 3, generations 4 (2 flagged, 1 error, 1 clear), held 2
      ...Array.from({ length: 3 }, () => row('brief.submitted', 'launch', null)),
      gen('launch', 'flagged'), gen('launch', 'flagged'), gen('launch', 'error'), gen('launch', 'clear'),
      row('scheduled_generation.settled', 'launch', 'completed', { held: true }),
      row('scheduled_generation.settled', 'launch', 'completed', { held: true }),
      row('scheduled_generation.settled', 'launch', 'completed', { held: false }),
      // tip: chosen 1, generations 1 (clear)
      row('brief.submitted', 'tip', null), gen('tip', 'clear'),
      // hiring: generations 2 with no chosen brief (a queued one), 1 flagged
      gen('hiring', 'flagged'), gen('hiring', 'clear'),
      // not counted: no style, and out of the range
      gen(null, 'flagged'),
      { ...gen('event', 'flagged'), at: at(100 * 24) },
    ]
    expect((await admin.post(SEAM, { seed: rows })).status()).toBe(200)

    const api = await (await admin.get('/api/admin/insights?range=30d')).json()
    const byKey = Object.fromEntries(api.postStyles.map((r: { style: string }) => [r.style, r]))
    expect(api.postStyles).toHaveLength(8)
    expect(byKey.launch).toMatchObject({ chosen: 3, generations: 4, flagged: 2, flagRate: 0.5, held: 2 })
    expect(byKey.tip).toMatchObject({ chosen: 1, generations: 1, flagged: 0, flagRate: 0, held: 0 })
    expect(byKey.hiring).toMatchObject({ chosen: 0, generations: 2, flagged: 1, flagRate: 0.5, held: 0 })
    for (const k of ['general', 'promotion', 'event', 'announcement', 'milestone']) {
      expect(byKey[k]).toMatchObject({ chosen: 0, generations: 0, flagged: 0, flagRate: null, held: 0 })
    }

    await pageLogin(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/insights')
    const section = page.getByTestId('section-post-styles')
    await expect(section).toBeVisible()
    await expect(page.getByTestId('post-style-launch')).toContainText('3')
    await expect(page.getByTestId('post-style-rate-launch')).toHaveText('50%')
    await expect(page.getByTestId('post-style-rate-tip')).toHaveText('0%')
    await expect(page.getByTestId('post-style-rate-milestone')).toHaveText('–')
    await expect(page.getByTestId('post-style-milestone')).toContainText('0')
    await expectNoAxeViolations(page, '/admin/insights post styles', { settle: true })

    // The review captures (gitignored): 1440 px and 390 px, light and dark.
    for (const [width, height] of [[1440, 900], [390, 900]]) {
      await page.setViewportSize({ width, height })
      if (width === 390) await expectNoHorizontalScroll(page, '/admin/insights post styles at 390px')
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await section.screenshot({ path: `ui-captures/027/post-styles-${width}-${scheme}.png` })
      }
    }

    const ed = await loginAs(page.request, EDITOR_EMAIL, PASSWORD)
    try {
      expect((await ed.get('/api/admin/insights')).status()).toBe(403)
    } finally {
      await ed.dispose()
    }
    expect((await admin.del(SEAM)).status()).toBe(204)
  })
})
