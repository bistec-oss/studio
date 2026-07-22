// Final whole-branch review, C2: the MCP brand-kit tools (setBrandKitPrompt,
// uploadBrandTemplate, listBrandKits, getBrandKit) ran with NO team check at
// all — a holder of Team X's ApiKey could overwrite Team Y's active brand
// voice prompt (cross-tenant write / prompt injection), attach templates to
// Team Y's kit, list every team's kits, or read any team's full kit
// (including its active voice prompt). Only createBrandKit was team-stamped.
// Focused unit tests on the tool functions themselves (mocked prisma),
// mirroring tests/unit/mcpGetDraft.test.ts's pattern for the same-shaped
// draft/publish fixes.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  brandKitFindFirst: vi.fn(),
  brandKitFindMany: vi.fn(),
  brandKitPromptFindFirst: vi.fn(),
  brandKitPromptUpdateMany: vi.fn(),
  brandKitPromptCreate: vi.fn(),
  brandKitTemplateCreate: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandKit: { findFirst: mocks.brandKitFindFirst, findMany: mocks.brandKitFindMany },
    brandKitPrompt: {
      findFirst: mocks.brandKitPromptFindFirst,
      updateMany: mocks.brandKitPromptUpdateMany,
      create: mocks.brandKitPromptCreate,
    },
    brandKitTemplate: { create: mocks.brandKitTemplateCreate },
  },
}))

import { setBrandKitPrompt, uploadBrandTemplate, listBrandKits, getBrandKit } from '@/mcp/tools/brandkit'

const TEAM_A = 'team-a'
const TEAM_B = 'team-b'

describe('MCP brand-kit tools — team scoping (final review C2)', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('setBrandKitPrompt', () => {
    it('rejects a brandKitId belonging to a different team (not-found, no leak)', async () => {
      mocks.brandKitFindFirst.mockResolvedValue(null) // team A's kit not found under team B's scope
      await expect(
        setBrandKitPrompt({ brandKitId: 'kit-a', content: 'hijacked voice', teamId: TEAM_B }),
      ).rejects.toThrow('Brand kit kit-a not found')
      expect(mocks.brandKitFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'kit-a', teamId: TEAM_B }) }),
      )
      expect(mocks.brandKitPromptCreate).not.toHaveBeenCalled()
    })

    it('succeeds when the kit belongs to the caller\'s own team', async () => {
      mocks.brandKitFindFirst.mockResolvedValue({ id: 'kit-a' })
      mocks.brandKitPromptFindFirst.mockResolvedValue(null)
      mocks.brandKitPromptCreate.mockResolvedValue({ id: 'prompt-1' })

      const result = await setBrandKitPrompt({ brandKitId: 'kit-a', content: 'on-brand voice', teamId: TEAM_A })
      expect(result).toEqual({ promptId: 'prompt-1' })
    })
  })

  describe('uploadBrandTemplate', () => {
    it('rejects attaching a template to another team\'s kit', async () => {
      mocks.brandKitFindFirst.mockResolvedValue(null)
      await expect(
        uploadBrandTemplate({ brandKitId: 'kit-a', name: 'Stolen', htmlTemplate: '<div/>', teamId: TEAM_B }),
      ).rejects.toThrow('Brand kit kit-a not found')
      expect(mocks.brandKitTemplateCreate).not.toHaveBeenCalled()
    })

    it('succeeds for the caller\'s own kit', async () => {
      mocks.brandKitFindFirst.mockResolvedValue({ id: 'kit-a' })
      mocks.brandKitTemplateCreate.mockResolvedValue({ id: 'tpl-1' })
      const result = await uploadBrandTemplate({
        brandKitId: 'kit-a',
        name: 'Own template',
        htmlTemplate: '<div/>',
        teamId: TEAM_A,
      })
      expect(result).toEqual({ templateId: 'tpl-1' })
    })
  })

  describe('listBrandKits', () => {
    it('filters by the caller\'s teamId — never lists another team\'s kits', async () => {
      mocks.brandKitFindMany.mockResolvedValue([{ id: 'kit-a', name: 'A', isDefault: true, _count: {} }])
      await listBrandKits({ teamId: TEAM_A })
      expect(mocks.brandKitFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ teamId: TEAM_A }) }),
      )
    })
  })

  describe('getBrandKit', () => {
    it('rejects reading another team\'s kit (not-found, no leak of its voice prompt)', async () => {
      mocks.brandKitFindFirst.mockResolvedValue(null)
      await expect(getBrandKit({ id: 'kit-a', teamId: TEAM_B })).rejects.toThrow('Brand kit kit-a not found')
    })

    it('returns the kit when it belongs to the caller\'s own team', async () => {
      mocks.brandKitFindFirst.mockResolvedValue({
        id: 'kit-a',
        name: 'A',
        templates: [],
        prompts: [{ content: 'voice', version: 1 }],
      })
      const result = await getBrandKit({ id: 'kit-a', teamId: TEAM_A })
      expect(result.activePrompt).toEqual({ content: 'voice', version: 1 })
    })
  })
})
