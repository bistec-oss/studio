import { test, expect } from '@playwright/test'
import { login, post, get, del, loginAs } from '../helpers/api'

// §C — Projects, campaigns & brand-kit resolution (docs/e2e-test-plan.md).
//
// Contract (src/lib/brandkit/resolve.ts + GET /api/campaigns/[id]/brandkit):
//   precedence: explicit brief kit → campaign kit → project default → system default
//   GET /api/campaigns/[id]/brandkit → { kit: {id,name,...,source} | null, source }
//   source ∈ 'explicit' | 'campaign' | 'project' | 'system'
//   Soft-deleted kits are skipped at every tier.

const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'

test.describe('Brand-kit resolution', () => {
  test.beforeEach(async ({ request }) => { await login(request) })

  async function makeKit(request: Parameters<typeof post>[0], name: string) {
    return (await post(request, '/api/admin/brandkits', { name, colors: ['#0284c7'] })).json()
  }

  // TC-RES-01 — Campaign override wins over the project default.
  test('campaign kit takes precedence over the project default', async ({ request }) => {
    const projKit = await makeKit(request, 'Project Kit X')
    const campKit = await makeKit(request, 'Campaign Kit Y')
    const project = await (await post(request, '/api/projects', { name: 'Res P1', defaultBrandKitId: projKit.id })).json()
    const campaign = await (await post(request, '/api/campaigns', {
      name: 'Res C1', brandKitId: campKit.id, projectId: project.id,
    })).json()

    const { kit, source } = await (await get(request, `/api/campaigns/${campaign.id}/brandkit`)).json()
    expect(source).toBe('campaign')
    expect(kit.id).toBe(campKit.id)
  })

  // TC-RES-02 — Inherit from the project when the campaign has no kit.
  test('campaign with no kit inherits the project default', async ({ request }) => {
    const projKit = await makeKit(request, 'Project Kit X2')
    const project = await (await post(request, '/api/projects', { name: 'Res P2', defaultBrandKitId: projKit.id })).json()
    const campaign = await (await post(request, '/api/campaigns', { name: 'Res C2', projectId: project.id })).json()

    const { kit, source } = await (await get(request, `/api/campaigns/${campaign.id}/brandkit`)).json()
    expect(source).toBe('project')
    expect(kit.id).toBe(projKit.id)
  })

  // TC-RES-03 — System default fallback when neither tier sets a kit.
  test('a standalone campaign falls back to the system default kit', async ({ request }) => {
    const campaign = await (await post(request, '/api/campaigns', { name: 'Res C3 standalone' })).json()
    const { kit, source } = await (await get(request, `/api/campaigns/${campaign.id}/brandkit`)).json()
    expect(source).toBe('system')
    // The seeded "Bistec" kit is the system default.
    expect(kit.id).toBeTruthy()
    expect(kit.isDefault === undefined || kit.isDefault === true).toBe(true)
  })

  // TC-RES-04 — A soft-deleted campaign kit is skipped; resolution falls through. Guards M4.
  test('a soft-deleted campaign kit is skipped and resolution falls through', async ({ request }) => {
    const projKit = await makeKit(request, 'Project Kit X4')
    const deletedKit = await makeKit(request, 'Soon-Deleted Kit Y4')
    const project = await (await post(request, '/api/projects', { name: 'Res P4', defaultBrandKitId: projKit.id })).json()
    const campaign = await (await post(request, '/api/campaigns', {
      name: 'Res C4', brandKitId: deletedKit.id, projectId: project.id,
    })).json()

    // Soft-delete the campaign's kit.
    expect((await del(request, `/api/admin/brandkits/${deletedKit.id}`)).status()).toBe(204)

    const { kit, source } = await (await get(request, `/api/campaigns/${campaign.id}/brandkit`)).json()
    expect(kit.id).not.toBe(deletedKit.id) // never resolves to the deleted kit
    expect(source).toBe('project')
    expect(kit.id).toBe(projKit.id)
  })

  // TC-RES-05 — Campaign→project reassignment is admin-only. Guards H4.
  test('an editor cannot reassign a campaign to a project', async ({ request }) => {
    const project = await (await post(request, '/api/projects', { name: 'Res P5' })).json()
    const campaign = await (await post(request, '/api/campaigns', { name: 'Res C5' })).json()

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    const res = await editor.patch(`/api/campaigns/${campaign.id}`, { projectId: project.id })
    expect(res.status()).toBe(403)
  })

  // TC-RES-06 — List endpoints are bounded (take:200). Guards M11.
  test('campaign and project lists are bounded arrays', async ({ request }) => {
    const campaigns = await (await get(request, '/api/campaigns')).json()
    const projects = await (await get(request, '/api/projects')).json()
    expect(Array.isArray(campaigns)).toBe(true)
    expect(Array.isArray(projects)).toBe(true)
    expect(campaigns.length).toBeLessThanOrEqual(200)
    expect(projects.length).toBeLessThanOrEqual(200)
  })
})
