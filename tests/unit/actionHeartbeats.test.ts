// 008 T9 — AC-10 (FR-12): the liveness writes sit where the action budget
// (src/lib/models/budget.ts) says its segments start and end. Each case is
// shown by the ORDER of the mocked Prisma calls (and the mocked model steps)
// in one log; no timers, no clock.
//
//   async generation: captions saved → background → touchGeneration → design
//   generateDraftForBrief: background → onBeforeDesign → design (the hook the
//                          scheduler renews its lease through)
//   regenerate-design: claim → background → touchDraftAction → design
//   refine: attempt touch → refine → pre-settle touch → commit (or reject)
//
// The real generateDraft, runPathBDesign, draftActions and settleRefine run;
// Prisma, the model steps, the renderer and the resolver are faked (the
// resolver as decideModel on the default policy in API mode, so the local
// .env's mode never matters).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const log: string[] = []
  const state = {
    draft: null as null | Record<string, unknown>,
    template: null as null | Record<string, unknown>,
    refineResult: null as null | Record<string, unknown>,
  }
  const client = {
    draft: {
      findUnique: async () => state.draft,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        log.push('draft created')
        return { id: 'd-new', ...data }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        log.push(`draft.update:${String(data.status ?? '')}`)
        return { id: 'd1', ...data }
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if ('updatedAt' in data) log.push(`touch:${String(where.status ?? where.pendingAction)}`)
        else if ('headline' in data) log.push('captions saved')
        // Regenerate design's final write is a claim-guarded updateMany (019).
        else if (data.status === 'EXPORTED') log.push('draft.update:EXPORTED')
        else if (data.pendingAction === null) log.push('release')
        else if (data.pendingAction) log.push('claim')
        return { count: 1 }
      },
    },
    draftCaption: { updateMany: async () => ({ count: 1 }) },
    draftRevision: {
      create: async () => {
        log.push('revision')
        return { id: 'rev' }
      },
      updateMany: async () => ({ count: 0 }),
    },
    brandKitArtifact: { findMany: async () => [] },
    brandKitTemplate: { findFirst: async () => state.template },
  }
  const prisma = {
    ...client,
    $transaction: async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (t: typeof client) => Promise<unknown>)(client),
  }
  return { log, state, prisma }
})

vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/brandkit/resolve', () => ({
  resolveBrandKit: async () => ({ id: 'kit', name: 'Kit', colors: [], fonts: [], logos: [], artifacts: [] }),
}))
vi.mock('@/lib/campaign/briefing', () => ({ getActiveCampaignBriefing: async () => null }))
vi.mock('@/providers/registry', () => ({
  resolveCopyProvider: async () => ({
    generateCaptions: async (_b: unknown, _t: unknown, model: { arg: string }) => ({
      raw: JSON.stringify({ headline: 'Applications are open', instagram: 'IG', linkedin: 'LI' }),
      modelId: model.arg,
    }),
  }),
}))
vi.mock('@/lib/models/policy', async () => {
  const { decideModel } = await import('@/lib/models/resolve')
  const { DEFAULT_POLICY } = await import('@/lib/models/policyRules')
  return {
    resolveModel: async (surface: never, opts: { designPath?: 'A' | 'B' }) =>
      decideModel(surface, { policy: DEFAULT_POLICY, credential: 'n/a', mode: 'api', designPath: opts.designPath }),
  }
})
vi.mock('@/lib/agent/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/config')>()
  return { ...actual, isCliMode: () => false, pipelineMode: () => 'api' as const }
})
const NO_BACKGROUND = { url: null, skip: 'NOT_NEEDED', detail: null }
vi.mock('@/lib/agent/background', () => ({
  generateBackgroundForBrief: async () => {
    h.log.push('background')
    return NO_BACKGROUND
  },
  generateBackgroundForRefine: async () => {
    h.log.push('background')
    return NO_BACKGROUND
  },
}))
vi.mock('@/lib/agent/prompts/pathB', () => ({
  buildPathBSystemPrompt: () => 'system',
  buildPathBUserMessage: () => 'user',
}))
const DESIGN = { htmlContent: '<html>new</html>', exportUrl: 'exports/new.png' }
vi.mock('@/lib/agent/designAgent', () => ({
  runDesignAgent: async () => {
    h.log.push('design')
    return DESIGN
  },
  runDesignAgentRefine: async () => {
    h.log.push('refine')
    return '<html>refined</html>'
  },
}))
vi.mock('@/lib/agent/designAgentCli', () => ({
  runDesignAgentCli: async () => {
    h.log.push('design')
    return DESIGN
  },
  runDesignAgentCliRefine: async () => {
    h.log.push('refine')
    return '<html>refined</html>'
  },
}))
vi.mock('@/lib/agent/pathA', () => ({
  runPathADesign: async () => {
    h.log.push('design')
    return DESIGN
  },
  assertTemplateMatchesBrief: () => {},
}))
vi.mock('@/lib/api/handler', () => ({
  parseBody: async (req: Request) => ({ data: await req.json() }),
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' }),
}))
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async (k: string | null) => k }))
vi.mock('@/lib/agent/userToken', () => ({ resolveClaudeAuth: async () => null }))
vi.mock('@/lib/agent/claudeAuth', () => ({ runWithClaudeAuth: (_auth: unknown, fn: () => unknown) => fn() }))
vi.mock('@/lib/drafts/refineVerify', () => ({ verifyRefine: vi.fn(), VERIFIER_PROMPT_VERSION: 'test-verifier' }))
vi.mock('@/lib/renderer/domFacts', () => ({ extractDomFacts: async () => ({ elements: [] }) }))
// One attempt through the route's real runRefine (so its attempt heartbeat is
// in the log), then the scripted outcome; settleRefine is the real one.
vi.mock('@/lib/drafts/refineAttempt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drafts/refineAttempt')>()
  return {
    ...actual,
    runRefineAttempts: async (
      input: { model: unknown },
      deps: { runRefine: (r: { attempt: 1; model: unknown }) => Promise<string> },
    ) => {
      await deps.runRefine({ attempt: 1, model: input.model })
      return h.state.refineResult
    },
  }
})
vi.mock('@/lib/drafts/revisions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drafts/revisions')>()
  return {
    ...actual,
    commitDraftRevision: async () => {
      h.log.push('commit')
      return { revisionId: 'rev', exportKey: 'exports/r.png' }
    },
    recordRejectedRender: async () => {
      h.log.push('reject')
    },
    withNextRevisionNumber: async (_id: string, body: (tx: unknown, n: number) => Promise<unknown>) =>
      body(h.prisma, 2),
  }
})

const { runGenerationForDraft, generateDraftForBrief } = await import('@/lib/agent/generateDraft')
const { POST: regenerateDesign } = await import('@/app/api/drafts/[id]/regenerate-design/route')
const { POST: refine } = await import('@/app/api/drafts/[id]/refine/route')

const actor = { userId: 'u1', teamId: 'team1', source: 'web' as const }
const ctx = { params: { id: 'd1' } } as never

function brief(designMode: 'GENERATE' | 'TEMPLATE' = 'GENERATE') {
  return {
    id: 'b1',
    teamId: 'team1',
    userId: 'u1',
    topic: 'Topic',
    description: '',
    goal: null,
    tone: null,
    channels: [],
    campaignId: null,
    brandKitId: null,
    referenceTemplateId: null,
    briefImages: null,
    designMode,
    aspectRatio: 'SQUARE',
    copyProviderKey: null,
    captionModel: null,
    designModel: null,
  }
}

function existingDraft() {
  return {
    id: 'd1',
    teamId: 'team1',
    brief: brief(),
    headline: 'Stored headline',
    htmlContent: '<html>v1</html>',
    exportUrl: 'exports/v1.png',
    currentRevisionNumber: 1,
    promptVersion: null,
    fontSet: null,
    designModel: null,
    designModelSubstitutedFrom: null,
    pendingConflict: null,
  }
}

// The routes run their work fire-and-forget: wait for the claim's release.
const settled = () => vi.waitFor(() => expect(h.log).toContain('release'))

beforeEach(() => {
  h.log.length = 0
  h.state.draft = null
  h.state.template = null
  h.state.refineResult = null
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('async generation (runGenerationForDraft)', () => {
  it('Path B: touchGeneration runs after the captions are saved and the background step, right before the design', async () => {
    h.state.draft = { id: 'd1', templateId: null, brief: brief() }
    await runGenerationForDraft('d1', actor)
    expect(h.log).toEqual([
      'captions saved',
      'background',
      'touch:IN_PROGRESS',
      'design',
      'draft.update:EXPORTED',
      'revision',
    ])
  })

  it('Path A (no background step): touchGeneration runs after the captions, right before the template fill', async () => {
    h.state.draft = { id: 'd1', templateId: 'tpl', brief: brief('TEMPLATE') }
    h.state.template = { id: 'tpl', aspectRatio: 'SQUARE', htmlTemplate: '<html></html>' }
    await runGenerationForDraft('d1', actor)
    expect(h.log).toEqual(['captions saved', 'touch:IN_PROGRESS', 'design', 'draft.update:EXPORTED', 'revision'])
  })
})

describe('sync generation (generateDraftForBrief: the scheduler, MCP, ACP)', () => {
  it("runs the caller's onBeforeDesign after the background step, right before the design", async () => {
    await generateDraftForBrief(brief() as never, { userId: null, teamId: 'team1', source: 'scheduler' }, {
      onBeforeDesign: async () => {
        h.log.push('hook')
      },
    })
    expect(h.log).toEqual(['background', 'hook', 'design', 'draft created', 'revision'])
  })

  it('without a hook, behaves as before', async () => {
    await generateDraftForBrief(brief() as never, { userId: null, teamId: 'team1', source: 'scheduler' })
    expect(h.log).toEqual(['background', 'design', 'draft created', 'revision'])
  })
})

describe('regenerate-design', () => {
  it('touches the REGENERATE_DESIGN claim after the background step, right before the design', async () => {
    h.state.draft = existingDraft()
    const res = (await regenerateDesign(new Request('http://test/x', { method: 'POST' }) as never, ctx)) as Response
    expect(res.status).toBe(202)
    await settled()
    expect(h.log).toEqual([
      'claim',
      'background',
      'touch:REGENERATE_DESIGN',
      'design',
      'revision',
      'draft.update:EXPORTED',
      'release',
    ])
  })
})

describe('refine', () => {
  const post = () =>
    refine(new Request('http://test/x', { method: 'POST', body: JSON.stringify({ instruction: 'Make it blue' }) }) as never, ctx) as Promise<Response>

  it('an accepted refine touches the claim again before the commit render', async () => {
    h.state.draft = existingDraft()
    h.state.refineResult = { kind: 'accepted', html: '<html>refined</html>', refineCalls: 1, verifierCalls: 0, attempts: [] }
    expect((await post()).status).toBe(202)
    await settled()
    expect(h.log).toEqual(['claim', 'background', 'touch:REFINE', 'refine', 'touch:REFINE', 'commit', 'release'])
  })

  it('a not-applied refine touches the claim before the rejected render too', async () => {
    h.state.draft = existingDraft()
    h.state.refineResult = {
      kind: 'not-applied',
      reason: 'missed twice',
      html: '<html>rejected</html>',
      unusableHtml: null,
      diagnostics: { version: 1, refineCalls: 2, verifierCalls: 0, attempts: [], reasons: [] },
    }
    expect((await post()).status).toBe(202)
    await settled()
    expect(h.log).toEqual(['claim', 'background', 'touch:REFINE', 'refine', 'touch:REFINE', 'reject', 'release'])
  })
})
