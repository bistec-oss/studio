// T10 — the refine route's wiring of classification, verification, retry-once
// and the not-applied outcome.
//
// Split deliberately in two. The parts that are PURE (FR-04's downgrade, the
// prompt the model is given, and whether that prompt's format is the one the
// parser reads) are exercised for real. The parts that need a database — the
// negative revision-number allocation and the not-applied write — live in a
// route module that cannot be imported without its auth wrapper and a live
// client, so they are asserted against the route's source, following the
// precedent set by revisionChain.test.ts for exactly the same reason.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildRefineSystemPrompt,
  buildRefineUserMessage,
  resolveEffectiveClasses,
} from '@/lib/agent/prompts/refine'
import { parseRefineEnvelope } from '@/lib/agent/refineEnvelope'
import { INSTRUCTION_CLASSES, INSTRUCTION_CLASS_KEYS } from '@/lib/agent/instructionClasses'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'

// ── FR-04: a destructive class with no named target does not delete ─────────

describe('resolveEffectiveClasses (FR-04 / AC-10)', () => {
  it('keeps a destructive class that named a target', () => {
    const r = resolveEffectiveClasses(['replace'], ['hero-banner'])
    expect(r.classes).toEqual(['replace'])
    expect(r.downgraded).toEqual([])
  })

  it('downgrades replace with an empty supersedes to the preserving default', () => {
    const r = resolveEffectiveClasses(['replace'], [])
    expect(r.classes).toEqual(['add'])
    expect(r.downgraded).toEqual(['replace'])
  })

  it('downgrades remove with an empty supersedes to the preserving default', () => {
    const r = resolveEffectiveClasses(['remove'], [])
    expect(r.classes).toEqual(['add'])
    expect(r.downgraded).toEqual(['remove'])
  })

  it('treats a whitespace-only locator as no locator at all', () => {
    const r = resolveEffectiveClasses(['remove'], ['   ', '\t'])
    expect(r.classes).toEqual(['add'])
    expect(r.downgraded).toEqual(['remove'])
  })

  it('discards the WHOLE classification, not just the destructive half', () => {
    // Keeping `constrain` here would judge the edit by a rule the model only
    // half stated — the same strictness refineEnvelope applies to an
    // unrecognized class name.
    const r = resolveEffectiveClasses(['remove', 'constrain'], [])
    expect(r.classes).toEqual(['add'])
    expect(r.downgraded).toEqual(['remove'])
  })

  it('leaves preserving classes alone with no locator — they never needed one', () => {
    expect(resolveEffectiveClasses(['add', 'constrain'], []).classes).toEqual(['add', 'constrain'])
    expect(resolveEffectiveClasses(['add', 'constrain'], []).downgraded).toEqual([])
  })

  it('does not mutate its input', () => {
    const classes: ReturnType<typeof resolveEffectiveClasses>['classes'] = ['replace']
    resolveEffectiveClasses(classes, [])
    expect(classes).toEqual(['replace'])
  })
})

// ── The prompt the model is actually given ──────────────────────────────────

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Test kit',
  colors: ['#0f172a', '#22d3ee'],
  fonts: [{ name: 'Inter', url: 'https://fonts.googleapis.com/css2?family=Inter' }],
  logoUrl: 'https://cdn.test/logo.png',
  voicePrompt: null,
  artifacts: [],
} as unknown as ResolvedBrandKit

const cliPrompt = buildRefineSystemPrompt({
  kit,
  mode: 'cli',
  width: 1080,
  height: 1080,
  hasInlineAssets: false,
})

describe('refine system prompt (FR-03 / FR-06 / AC-19)', () => {
  it('renders every class semantics string VERBATIM from the one table', () => {
    // Verbatim is the requirement, not a nicety: the semantics define
    // `supersedes` as a verbatim substring of the current HTML and the
    // post-conditions match those locators literally. Paraphrase the locator
    // sentences away and replace/remove miss almost every time.
    for (const key of INSTRUCTION_CLASS_KEYS) {
      expect(cliPrompt).toContain(INSTRUCTION_CLASSES[key].semantics)
    }
  })

  it('keeps the locator sentences intact for both destructive classes', () => {
    expect(cliPrompt).toContain('put one verbatim substring of the current HTML that identifies it')
    expect(cliPrompt).toContain('must not appear anywhere in your output')
    expect(cliPrompt).toContain('must be absent from your output')
  })

  it('drops the blanket preserve rule that licensed the duplicate-background bug', () => {
    expect(cliPrompt).not.toContain('Preserve everything the instruction does not touch')
  })

  it('does not countermand the envelope with the old HTML-only output rule', () => {
    expect(cliPrompt).not.toContain('Output ONLY the complete updated HTML document')
  })

  it('leaves API mode — and its conflict protocol — untouched', () => {
    const apiPrompt = buildRefineSystemPrompt({
      kit,
      mode: 'api',
      width: 1080,
      height: 1080,
      hasInlineAssets: false,
    })
    expect(apiPrompt).toContain('"conflict": true')
    expect(apiPrompt).not.toContain('REFINE-CLASSES')
  })
})

describe('the requested reply format is the format the parser reads (FR-01)', () => {
  it('asks for exactly the two header lines refineEnvelope matches', () => {
    expect(cliPrompt).toContain('REFINE-CLASSES:')
    expect(cliPrompt).toContain('REFINE-SUPERSEDES:')
  })

  it('round-trips a reply written the way the prompt asks', () => {
    const reply = [
      'REFINE-CLASSES: replace, constrain',
      'REFINE-SUPERSEDES: hero-banner; old-tagline',
      '<!DOCTYPE html><html><body>new</body></html>',
    ].join('\n')
    const parsed = parseRefineEnvelope(reply)
    expect(parsed?.classes).toEqual(['replace', 'constrain'])
    expect(parsed?.supersedes).toEqual(['hero-banner', 'old-tagline'])
    expect(parsed?.defaulted).toBe(false)
    expect(parsed?.html).toContain('<body>new</body>')
  })

  it("reads the prompt's own 'none' answer as an empty supersedes", () => {
    const parsed = parseRefineEnvelope(
      'REFINE-CLASSES: add\nREFINE-SUPERSEDES: none\n<!DOCTYPE html><html></html>',
    )
    expect(parsed?.supersedes).toEqual([])
    // …which the route then downgrades if the class was destructive.
    expect(resolveEffectiveClasses(parsed!.classes, parsed!.supersedes).classes).toEqual(['add'])
  })

  it('semicolons keep a comma-bearing locator in one piece, as the prompt demands', () => {
    const parsed = parseRefineEnvelope(
      'REFINE-CLASSES: remove\nREFINE-SUPERSEDES: the headline, top left\n<!DOCTYPE html><html></html>',
    )
    expect(parsed?.supersedes).toEqual(['the headline, top left'])
  })
})

describe('retry prompt (FR-11)', () => {
  const base = { slimHtml: '<html></html>', hasHtml: true, instruction: 'reduce the text', width: 1080, height: 1080 }

  it('says nothing about a retry on the first attempt', () => {
    expect(buildRefineUserMessage(base)).not.toContain('SECOND AND FINAL ATTEMPT')
  })

  it('makes the measured miss explicit on the retry', () => {
    const miss = "[remove] The content \"Our mission\" is still present in the output."
    const msg = buildRefineUserMessage({ ...base, priorMiss: miss })
    expect(msg).toContain('SECOND AND FINAL ATTEMPT')
    expect(msg).toContain(miss)
  })

  it('caps the miss text — an add miss carries verifier model prose', () => {
    const msg = buildRefineUserMessage({ ...base, priorMiss: 'x'.repeat(5_000) })
    expect(msg).toContain('x'.repeat(1_000))
    expect(msg).not.toContain('x'.repeat(1_001))
  })

  it('ignores a blank miss rather than rendering an empty retry block', () => {
    expect(buildRefineUserMessage({ ...base, priorMiss: '   ' })).not.toContain('SECOND AND FINAL ATTEMPT')
  })
})

// ── The DB-bound half, asserted against the route source ────────────────────

const refineRoute = fs.readFileSync(
  path.resolve(__dirname, '../../src/app/api/drafts/[id]/refine/route.ts'),
  'utf8',
)

describe('the hard cap is structural (AC-15)', () => {
  it('bounds refine calls with a loop constant, not a conditional', () => {
    expect(refineRoute).toContain('const MAX_REFINE_ATTEMPTS = 2')
    expect(refineRoute).toContain('for (let attempt = 1; attempt <= MAX_REFINE_ATTEMPTS; attempt += 1)')
  })

  it('bounds verifier calls by spending verifyRefine’s own reported modelCalls', () => {
    expect(refineRoute).toContain('const MAX_VERIFIER_CALLS = 2')
    expect(refineRoute).toContain('verifierCallsSpent >= MAX_VERIFIER_CALLS')
    expect(refineRoute).toContain('verifierCallsSpent += verification.modelCalls')
  })

  it('calls the verifier at most once per iteration', () => {
    expect(refineRoute.match(/await verifyRefine\(/g) ?? []).toHaveLength(1)
  })

  it('calls a design agent at most once per iteration, per mode', () => {
    expect(refineRoute.match(/await runDesignAgentCli\(/g) ?? []).toHaveLength(1)
    expect(refineRoute.match(/await runDesignAgent\(/g) ?? []).toHaveLength(1)
  })
})

describe('rejected-render retention (FR-12/13, AC-16/17)', () => {
  const retain = refineRoute.slice(
    refineRoute.indexOf('async function retainRejectedRender'),
    refineRoute.indexOf('async function commitRevision'),
  )

  it('allocates min(revisionNumber) - 1, floored at -1', () => {
    expect(retain).toContain('Math.min(-1, (lowest?.revisionNumber ?? 0) - 1)')
    expect(retain).toContain("orderBy: { revisionNumber: 'asc' }")
  })

  it('reads ALL rows — the one query that must not exclude rejected ones', () => {
    expect(retain).toContain('where: { draftId },')
    expect(retain).not.toContain('rejected: false')
  })

  it('does not reuse withNextRevisionNumber, which allocates positive numbers', () => {
    // The name appears in the comment explaining why it is NOT used; what must
    // be absent is the call.
    expect(retain).not.toContain('withNextRevisionNumber(')
  })

  it('retries the allocation on a P2002 collision, as the positive allocator does', () => {
    expect(retain).toContain("err.code === 'P2002'")
    expect(retain).toContain('attempt < REJECTED_ALLOC_ATTEMPTS')
  })

  it('labels the row with the instruction, its classes and the stated miss', () => {
    expect(retain).toContain('rejected: true')
    expect(retain).toContain('rejectionReason: rejected.reason')
    expect(retain).toContain('instructionClasses: rejected.classes')
    expect(retain).toContain('htmlSnapshot: rejected.html')
    expect(retain).toContain('exportUrl: rejected.exportUrl || null')
  })

  it('never advances the pointer and never commits a chain revision', () => {
    expect(retain).not.toContain('currentRevisionNumber')
    expect(retain).not.toContain('commitDraftRevision')
    expect(retain).not.toContain('commitRevision(')
  })

  it('writes the not-applied outcome to its own field, not pendingActionError', () => {
    expect(retain).toContain('data: { notAppliedReason: rejected.reason }')
    expect(retain).not.toContain('pendingActionError')
  })
})

describe('the MOCK_AI stub guard is narrow and self-retiring', () => {
  it('needs the stub AND an exactly unchanged document — inert in production', () => {
    expect(refineRoute).toContain('if (MOCK_AI && before === after)')
  })

  it('is the only place MOCK_AI is consulted in this route', () => {
    expect(refineRoute.match(/MOCK_AI &&/g) ?? []).toHaveLength(1)
  })
})

describe('not-applied is cleared when the next action starts (FR-14)', () => {
  it('clears on claim and on the override commit', () => {
    expect(refineRoute.match(/await clearNotApplied\(draft\.id\)/g) ?? []).toHaveLength(2)
  })
})
