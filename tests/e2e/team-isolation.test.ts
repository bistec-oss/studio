import { test, expect } from '@playwright/test'
import {
  loginAs,
  findTeamIdByName,
  addTeamMember,
  waitForDraft,
  type ApiClient,
} from '../helpers/api'

// §R — Cross-tenant isolation (D7 guardrail; docs/superpowers/specs/2026-07-21-team-tenancy-design.md).
//
// Fixtures (scripts/seed-teams.mjs, run by test:e2e:db): two teams —
// "Bistec" (adminBTG=ADMIN, editor=EDITOR) and "ClientX" (clientx.admin=ADMIN,
// fixed test password) — each with one BrandKit ("<Team> Kit"), one Campaign
// ("<Team> Campaign"), one uncategorized EXPORTED brief+draft
// ("<Team> Uncategorized Post"), and one campaign-linked EXPORTED brief+draft
// ("<Team> Campaign Post"). This suite asserts NOTHING from one team is ever
// visible, readable, or writable from the other — by id-absence, not counts
// (other suites/dev-machine data may add unrelated rows to either team), and
// every test is independent (no shared mutable state across test bodies —
// each resolves or creates whatever fixture id it needs itself).

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'
const CLIENTX_PASSWORD = 'BistecStudio2026!'

interface DraftRow {
  id: string
  brief: { topic: string }
}

// /api/library caps pageSize at 50 and orders by createdAt desc — by the time
// this suite runs (near the end of the whole catalog, alphabetically), the
// Bistec team has accumulated far more than 50 EXPORTED drafts from every
// other suite that ran before it, so an unfiltered top-50 scan can miss a
// long-seeded fixture entirely. Use the route's own ?search= (a DB-level
// WHERE, not a post-pagination filter) to find a SPECIFIC known-topic draft
// regardless of how many other rows exist.
async function findDraftBySearch(api: ApiClient, topic: string): Promise<{ id: string } | undefined> {
  const body = await (await api.get(`/api/library?pageSize=50&search=${encodeURIComponent(topic)}`)).json()
  return (body.drafts as DraftRow[]).find((d) => d.brief.topic === topic)
}

async function findByTopic(api: ApiClient, topic: string): Promise<string> {
  const hit = await findDraftBySearch(api, topic)
  if (!hit) throw new Error(`team-isolation fixture missing: draft with topic "${topic}"`)
  return hit.id
}

async function findCampaignByName(api: ApiClient, name: string): Promise<string> {
  const campaigns = await (await api.get('/api/campaigns')).json()
  const hit = (campaigns as { id: string; name: string }[]).find((c) => c.name === name)
  if (!hit) throw new Error(`team-isolation fixture missing: campaign "${name}"`)
  return hit.id
}

async function findKitByName(api: ApiClient, name: string): Promise<string> {
  const kits = await (await api.get('/api/admin/brandkits')).json()
  const hit = (kits as { id: string; name: string }[]).find((k) => k.name === name)
  if (!hit) throw new Error(`team-isolation fixture missing: brand kit "${name}"`)
  return hit.id
}

test.describe('Cross-tenant isolation (D7)', () => {
  let bistecAdmin: ApiClient
  let bistecEditor: ApiClient
  let clientxAdmin: ApiClient

  // Bistec fixture ids, resolved once (from the seed's well-known names) or
  // created once, and reused read-only by every independent test below.
  let bistecUncategorizedDraftId: string
  let bistecCampaignDraftId: string
  let bistecCampaignId: string
  let bistecKitId: string
  let bistecProjectId: string

  test.beforeAll(async ({ request }) => {
    bistecAdmin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    bistecEditor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    clientxAdmin = await loginAs(request, CLIENTX_EMAIL, CLIENTX_PASSWORD, { team: 'ClientX' })

    bistecUncategorizedDraftId = await findByTopic(bistecAdmin, 'Bistec Uncategorized Post')
    bistecCampaignDraftId = await findByTopic(bistecAdmin, 'Bistec Campaign Post')
    bistecCampaignId = await findCampaignByName(bistecAdmin, 'Bistec Campaign')
    bistecKitId = await findKitByName(bistecAdmin, 'Bistec Kit')

    const project = await (
      await bistecAdmin.post('/api/projects', { name: `Isolation Project ${Date.now()}` })
    ).json()
    bistecProjectId = project.id
  })

  test.afterAll(async () => {
    await bistecAdmin.dispose()
    await bistecEditor.dispose()
    await clientxAdmin.dispose()
  })

  // ── List routes: zero Bistec rows visible from ClientX ─────────────────────
  test('/api/library, /api/campaigns, /api/admin/brandkits, /api/brandkits as ClientX contain zero Bistec ids', async () => {
    const library = await (await clientxAdmin.get('/api/library?pageSize=50')).json()
    const libraryIds = (library.drafts as { id: string }[]).map((d) => d.id)
    expect(libraryIds).not.toContain(bistecUncategorizedDraftId)
    expect(libraryIds).not.toContain(bistecCampaignDraftId)

    const campaigns = await (await clientxAdmin.get('/api/campaigns')).json()
    expect((campaigns as { id: string }[]).map((c) => c.id)).not.toContain(bistecCampaignId)

    const kits = await (await clientxAdmin.get('/api/admin/brandkits')).json()
    expect((kits as { id: string }[]).map((k) => k.id)).not.toContain(bistecKitId)

    const brandkits = await (await clientxAdmin.get('/api/brandkits')).json()
    expect((brandkits as { id: string }[]).map((k) => k.id)).not.toContain(bistecKitId)
  })

  test('/api/projects as ClientX contains zero Bistec ids', async () => {
    const clientxProjects = await (await clientxAdmin.get('/api/projects')).json()
    expect((clientxProjects as { id: string }[]).map((p) => p.id)).not.toContain(bistecProjectId)
  })

  test('/api/posts as ClientX contains zero Bistec ids', async () => {
    // Mint a Bistec post so /api/posts has a real Bistec row to prove absent.
    // Read the id straight off the create response (201) / the conflict body
    // (409, if a prior run already created one) rather than scanning the
    // list — /api/posts caps pageSize at 50 and the whole catalog can leave
    // Bistec with far more than 50 posts by the time this suite runs.
    const publish = await bistecAdmin.post('/api/posts', {
      draftId: bistecUncategorizedDraftId,
      channel: 'LINKEDIN',
    })
    expect([201, 409]).toContain(publish.status())
    const bistecPostId = (await publish.json()).postId as string
    expect(bistecPostId).toBeTruthy()

    const clientxPosts = await (await clientxAdmin.get('/api/posts?pageSize=50')).json()
    expect((clientxPosts.posts as { id: string }[]).map((p) => p.id)).not.toContain(bistecPostId)
  })

  test('/api/templates as ClientX contains zero Bistec ids', async () => {
    // "Hearts Talk" is a pre-existing Bistec-team kit with a template (seeded
    // by scripts/seed-hearts-talk.mjs, stamped onto the "Bistec" team).
    const bistecTemplates = await (await bistecAdmin.get('/api/templates')).json()
    const heartsTemplateId = (bistecTemplates as { id: string; name: string }[]).find((t) =>
      t.name.includes('Hearts Talk'),
    )?.id
    expect(heartsTemplateId).toBeTruthy()

    const clientxTemplates = await (await clientxAdmin.get('/api/templates')).json()
    expect((clientxTemplates as { id: string }[]).map((t) => t.id)).not.toContain(heartsTemplateId)
  })

  // ── By-id routes across the boundary → 404 (GET/PATCH/DELETE) ──────────────
  test('draft by-id (GET/PATCH/DELETE) 404s across the team boundary', async () => {
    expect((await clientxAdmin.get(`/api/drafts/${bistecUncategorizedDraftId}`)).status()).toBe(404)
    expect(
      (await clientxAdmin.patch(`/api/drafts/${bistecUncategorizedDraftId}`, { copyText: 'hijacked' })).status(),
    ).toBe(404)
    expect((await clientxAdmin.del(`/api/drafts/${bistecUncategorizedDraftId}`)).status()).toBe(404)

    // Prove the DELETE 404 didn't actually delete it — still visible to Bistec.
    expect((await bistecAdmin.get(`/api/drafts/${bistecUncategorizedDraftId}`)).status()).toBe(200)
  })

  test('brief by-id (via /api/generate/copy) 404s across the team boundary', async () => {
    const draft = await (await bistecAdmin.get(`/api/drafts/${bistecUncategorizedDraftId}`)).json()
    const briefId = draft.brief.id
    const res = await clientxAdmin.post('/api/generate/copy', { briefId })
    expect(res.status()).toBe(404)
  })

  test('campaign by-id (GET/PATCH/DELETE) 404s across the team boundary', async () => {
    expect((await clientxAdmin.get(`/api/campaigns/${bistecCampaignId}`)).status()).toBe(404)
    expect(
      (await clientxAdmin.patch(`/api/campaigns/${bistecCampaignId}`, { name: 'hijacked' })).status(),
    ).toBe(404)
    expect((await clientxAdmin.del(`/api/campaigns/${bistecCampaignId}`)).status()).toBe(404)
    expect((await bistecAdmin.get(`/api/campaigns/${bistecCampaignId}`)).status()).toBe(200)
  })

  test('project by-id (GET/PATCH/DELETE) 404s across the team boundary', async () => {
    expect((await clientxAdmin.get(`/api/projects/${bistecProjectId}`)).status()).toBe(404)
    expect(
      (await clientxAdmin.patch(`/api/projects/${bistecProjectId}`, { name: 'hijacked' })).status(),
    ).toBe(404)
    expect((await clientxAdmin.del(`/api/projects/${bistecProjectId}`)).status()).toBe(404)
    expect((await bistecAdmin.get(`/api/projects/${bistecProjectId}`)).status()).toBe(200)
  })

  test('brand-kit by-id (GET/PATCH/DELETE) 404s across the team boundary', async () => {
    expect((await clientxAdmin.get(`/api/admin/brandkits/${bistecKitId}`)).status()).toBe(404)
    expect(
      (await clientxAdmin.patch(`/api/admin/brandkits/${bistecKitId}`, { name: 'hijacked' })).status(),
    ).toBe(404)
    expect((await clientxAdmin.del(`/api/admin/brandkits/${bistecKitId}`)).status()).toBe(404)
    expect((await bistecAdmin.get(`/api/admin/brandkits/${bistecKitId}`)).status()).toBe(200)
  })

  // ── Editor visibility matrix inside Bistec (D6) ─────────────────────────────
  test('editor sees own + campaign-shared drafts, not the admin\'s private one; team admin sees all three', async () => {
    // Admin-owned, uncategorized (private) draft — MOCK_AI generation, no campaign.
    const brief = await (
      await bistecAdmin.post('/api/briefs', {
        topic: `Bistec Admin Private ${Date.now()}`,
        goal: 'Private',
        tone: 'professional',
        channels: ['INSTAGRAM'],
        designMode: 'GENERATE',
        copyProviderKey: 'cli',
      })
    ).json()
    const assembled = await bistecAdmin.post('/api/generate/assemble-b', { briefId: brief.id })
    expect(assembled.status()).toBe(202)
    const adminPrivateDraft = await waitForDraft(bistecAdmin, (await assembled.json()).draftId)
    expect(adminPrivateDraft.status).toBe('EXPORTED')
    const adminPrivateDraftId = adminPrivateDraft.id as string
    const adminPrivateTopic = brief.topic as string

    // Searched (not a blanket top-50 scan): Bistec accumulates far more than
    // 50 EXPORTED drafts across the whole catalog by the time this suite
    // runs, so a plain list scan could miss any of these regardless of team.
    expect((await findDraftBySearch(bistecEditor, 'Bistec Uncategorized Post'))?.id).toBe(
      bistecUncategorizedDraftId,
    ) // own
    expect((await findDraftBySearch(bistecEditor, 'Bistec Campaign Post'))?.id).toBe(bistecCampaignDraftId) // campaign-shared
    expect(await findDraftBySearch(bistecEditor, adminPrivateTopic)).toBeUndefined() // admin's private draft

    expect((await findDraftBySearch(bistecAdmin, 'Bistec Uncategorized Post'))?.id).toBe(
      bistecUncategorizedDraftId,
    )
    expect((await findDraftBySearch(bistecAdmin, 'Bistec Campaign Post'))?.id).toBe(bistecCampaignDraftId)
    expect((await findDraftBySearch(bistecAdmin, adminPrivateTopic))?.id).toBe(adminPrivateDraftId)
  })

  // ── Switcher + 409 team-choice-required (D8) ────────────────────────────────
  test('switching to a team the user is not a member of is 403', async () => {
    const clientxTeamId = await findTeamIdByName(bistecAdmin, 'ClientX')
    // bistecEditor is only a Bistec member.
    const res = await bistecEditor.post('/api/me/active-team', { teamId: clientxTeamId })
    expect(res.status()).toBe(403)
  })

  test('a multi-team user sees different /api/library results after switching the active-team cookie', async ({
    request,
  }) => {
    const clientxTeamId = await findTeamIdByName(bistecAdmin, 'ClientX')
    const bistecTeamId = await findTeamIdByName(bistecAdmin, 'Bistec')
    // Grant adminBTG membership in ClientX too (super-admin API) — matches
    // the brief's literal fixture ("add adminBTG to ClientX in-test"). A
    // super admin can already switch to any live team by cookie regardless
    // of membership rows, but this documents real membership as the
    // supported path and proves the same behavior either way. Idempotent
    // (upsert), so safe to run every time this suite runs.
    const adminUserId = (await (await bistecAdmin.get('/api/me')).json()).userId
    await addTeamMember(bistecAdmin, clientxTeamId, adminUserId, 'ADMIN')

    // A fresh, isolated session (its own cookie jar) so switching its active
    // team can't affect bistecAdmin or any other test's session.
    const switcher = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: 'Bistec' })
    try {
      // Searched (not a blanket top-50 scan) — see findDraftBySearch's comment.
      expect((await findDraftBySearch(switcher, 'Bistec Uncategorized Post'))?.id).toBe(
        bistecUncategorizedDraftId,
      )

      const switchRes = await switcher.post('/api/me/active-team', { teamId: clientxTeamId })
      expect(switchRes.status()).toBe(200)

      expect(await findDraftBySearch(switcher, 'Bistec Uncategorized Post')).toBeUndefined()

      await switcher.post('/api/me/active-team', { teamId: bistecTeamId })
    } finally {
      await switcher.dispose()
    }
  })

  test('a multi-team user with no active-team cookie gets 409 team-choice-required on a team-scoped route', async ({
    request,
  }) => {
    const bistecTeamId = await findTeamIdByName(bistecAdmin, 'Bistec')
    const clientxTeamId = await findTeamIdByName(bistecAdmin, 'ClientX')

    const username = `multiteam${Date.now().toString(36)}`
    const created = await (
      await bistecAdmin.post('/api/admin/users', {
        name: 'Multi Team Editor',
        username,
        role: 'editor',
        password: 'MultiTeamPass1!',
      })
    ).json()
    await addTeamMember(bistecAdmin, bistecTeamId, created.id, 'EDITOR')
    await addTeamMember(bistecAdmin, clientxTeamId, created.id, 'EDITOR')

    const raw = await loginAs(request, `${username}@users.bistec.internal`, 'MultiTeamPass1!', {
      skipTeamSelect: true,
    })
    try {
      const res = await raw.get('/api/library')
      expect(res.status()).toBe(409)
      expect((await res.json()).code).toBe('team-choice-required')
    } finally {
      await raw.dispose()
    }
  })

  // ── ApiKey scoping via ACP (Task 13) ────────────────────────────────────────
  test('a ClientX ApiKey scopes ACP generation to ClientX and cannot touch Bistec drafts', async ({ request }) => {
    const created = await (
      await clientxAdmin.post('/api/team/api-keys', { label: `isolation-suite ${Date.now()}` })
    ).json()
    const plaintextKey = created.plaintext as string

    try {
      const manifest = await request.get('/api/acp/manifest', { headers: { 'x-bistec-api-key': plaintextKey } })
      expect(manifest.status()).toBe(200)

      if (process.env.MOCK_AI !== 'true') {
        test.skip(true, 'requires MOCK_AI for deterministic generation')
        return
      }
      const gen = await request.post('/api/acp/run', {
        headers: { 'x-bistec-api-key': plaintextKey },
        data: {
          capability: 'generate_post',
          input: {
            topic: `Isolation ACP gen ${Date.now()}`,
            goal: 'Drive signups',
            tone: 'professional',
            channels: ['INSTAGRAM'],
            designMode: 'GENERATE',
          },
        },
      })
      expect(gen.status()).toBe(200)
      const genBody = await gen.json()
      const newDraftId = genBody.output.draftId as string

      // ClientX admin (a real session, not the key) can see it — proves it
      // landed in ClientX.
      expect((await clientxAdmin.get(`/api/drafts/${newDraftId}`)).status()).toBe(200)
      // Bistec admin cannot.
      expect((await bistecAdmin.get(`/api/drafts/${newDraftId}`)).status()).toBe(404)

      // The same key must not surface Bistec data: publish_post against a
      // Bistec draft id is treated as "not found" (team-bound machine caller,
      // Task 13) — surfaced as ACP's generic 422 failure envelope.
      const crossTeamPublish = await request.post('/api/acp/run', {
        headers: { 'x-bistec-api-key': plaintextKey },
        data: {
          capability: 'publish_post',
          input: { draftId: bistecUncategorizedDraftId, channel: 'INSTAGRAM' },
        },
      })
      expect(crossTeamPublish.status()).toBe(422)
      expect((await crossTeamPublish.json()).error).toContain('not found')
    } finally {
      await clientxAdmin.del(`/api/team/api-keys/${created.id}`)
    }
  })

  // ── Brief-draft autosaves stay owner-only, no admin override (unchanged) ───
  test('Bistec team admin GET of the editor\'s brief-draft id is 404 (no admin override)', async () => {
    const payload = {
      step: 1,
      campaignId: '',
      aspectRatio: 'SQUARE',
      brandKitId: '',
      designMode: 'GENERATE',
      templateId: '',
      referenceTemplateId: '',
      topic: 'Isolation autosave topic',
      prompt: 'A prompt long enough to matter for the isolation suite',
      goal: 'awareness',
      tone: 'professional',
      images: [],
    }
    const created = await (await bistecEditor.put('/api/brief-drafts', { payload })).json()
    expect(created.id).toBeTruthy()

    try {
      expect((await bistecAdmin.get(`/api/brief-drafts/${created.id}`)).status()).toBe(404)
      // Sanity: the owner CAN read it.
      expect((await bistecEditor.get(`/api/brief-drafts/${created.id}`)).status()).toBe(200)
    } finally {
      await bistecEditor.del(`/api/brief-drafts/${created.id}`)
    }
  })
})
