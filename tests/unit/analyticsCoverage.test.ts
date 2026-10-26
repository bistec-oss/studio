// 006 FR-13: the guard that keeps the catalogue honest. It fails when a draft
// action, a channel or a source has no event that can carry it, and when a
// payload copies a vocabulary that already has an owner.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AspectRatio, CaptionRoute, Channel, DraftAction } from '@prisma/client'
import { CATALOGUE, EVENT_NAMES } from '@/lib/analytics/catalogue'
import { MODEL_KEYS } from '@/lib/models/catalogue'
import { INSTRUCTION_CLASS_KEYS } from '@/lib/agent/instructionClasses'
import { archetypes, FALLBACK_REASONS } from '@/lib/designData'
import { POST_STYLE_KEYS } from '@/lib/postStyles'
import { HEADLINE_CHECKS, HEADLINE_STATES } from '@/lib/renderedText/vocab'

const SOURCES = ['web', 'scheduler', 'mcp'] as const

// Every value that has an owner elsewhere. A quoted copy of one of these inside
// the catalogue means a vocabulary was copied rather than imported.
const OWNED: Record<string, readonly string[]> = {
  DraftAction: Object.values(DraftAction),
  Channel: Object.values(Channel),
  AspectRatio: Object.values(AspectRatio),
  CaptionRoute: Object.values(CaptionRoute),
  MODEL_KEYS,
  INSTRUCTION_CLASS_KEYS,
  FALLBACK_REASONS,
  archetypes: Object.keys(archetypes),
  POST_STYLE_KEYS,
  HEADLINE_STATES,
  HEADLINE_CHECKS,
}

/** Quoted strings in `source`, comments removed, that equal an owned value. */
function findCopiedVocabulary(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const found: string[] = []
  for (const m of code.matchAll(/(['"])([^'"\n]+)\1/g)) {
    for (const [vocab, values] of Object.entries(OWNED)) {
      if (values.includes(m[2])) found.push(`${vocab}:${m[2]}`)
    }
  }
  return found
}

describe('analytics coverage guard (006 FR-13, AC-03)', () => {
  it('has an event that carries every DraftAction value', () => {
    for (const action of Object.values(DraftAction)) {
      expect(CATALOGUE['draft_action.settled'].schema.safeParse({ action }).success).toBe(true)
      expect(CATALOGUE['draft_action.swept'].schema.safeParse({ action }).success).toBe(true)
    }
  })

  it('has an event that carries every Channel value', () => {
    for (const channel of Object.values(Channel)) {
      expect(CATALOGUE['publish.settled'].schema.safeParse({ channel, terminal: true }).success).toBe(true)
    }
  })

  it('has an event that can carry every source value', () => {
    for (const source of SOURCES) {
      const carriers = EVENT_NAMES.filter((n) => (CATALOGUE[n].source as readonly string[]).includes(source))
      expect(carriers.length, `source ${source}`).toBeGreaterThan(0)
    }
  })

  it('copies no owned vocabulary into the catalogue source', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/analytics/catalogue.ts'), 'utf8')
    expect(findCopiedVocabulary(src)).toEqual([])
  })

  it('catches a planted copy of the Channel list (asserted on a fixture)', () => {
    const planted = `const channel = z.enum(['INSTAGRAM', 'LINKEDIN'])`
    expect(findCopiedVocabulary(planted)).toEqual(['Channel:INSTAGRAM', 'Channel:LINKEDIN'])
  })

  it('catches planted copies of the other vocabularies', () => {
    expect(findCopiedVocabulary(`z.enum(['REFINE'])`)).toEqual(['DraftAction:REFINE'])
    expect(findCopiedVocabulary(`z.enum(['SONNET'])`)).toEqual(['MODEL_KEYS:SONNET'])
    expect(findCopiedVocabulary(`z.enum(['replace'])`)).toEqual(['INSTRUCTION_CLASS_KEYS:replace'])
    expect(findCopiedVocabulary(`z.enum(['editorial-split'])`)).toEqual(['archetypes:editorial-split'])
  })

  it('catches a planted copy of the post style keys', () => {
    expect(findCopiedVocabulary(`z.enum(['launch'])`)).toEqual(['POST_STYLE_KEYS:launch'])
  })

  it('catches a planted copy of the headline vocabularies', () => {
    expect(findCopiedVocabulary(`z.enum(['unconfirmed'])`)).toEqual(['HEADLINE_STATES:unconfirmed'])
    expect(findCopiedVocabulary(`z.enum(['painted'])`)).toEqual(['HEADLINE_CHECKS:painted'])
  })

  it('ignores owned words in comments', () => {
    expect(findCopiedVocabulary(`// REFINE and INSTAGRAM\n/* 'SONNET' */ const a = 1`)).toEqual([])
  })
})

// 030 FR-18: every headline state and check has an event field that can carry it,
// and no payload of these events can hold the headline text (NFR-05).
describe('analytics coverage guard: the headline vocabularies (030 FR-18)', () => {
  it('carries every HEADLINE_STATES value in publish.settled and draft.headline_edited', () => {
    for (const headlineState of HEADLINE_STATES) {
      expect(
        CATALOGUE['publish.settled'].schema.safeParse({ channel: 'LINKEDIN', terminal: true, headlineState }).success,
        `publish.settled ${headlineState}`,
      ).toBe(true)
      expect(
        CATALOGUE['draft.headline_edited'].schema.safeParse({ via: 'edit', state: headlineState, scheduledPending: false })
          .success,
        `draft.headline_edited ${headlineState}`,
      ).toBe(true)
    }
    expect(CATALOGUE['publish.settled'].schema.safeParse({ channel: 'LINKEDIN', terminal: true, headlineState: 'x' }).success).toBe(false)
  })

  it('carries every HEADLINE_CHECKS value in generation.finished', () => {
    for (const headlineCheck of HEADLINE_CHECKS) {
      expect(CATALOGUE['generation.finished'].schema.safeParse({ headlineCheck }).success, headlineCheck).toBe(true)
    }
    expect(CATALOGUE['generation.finished'].schema.safeParse({ headlineCheck: 'x' }).success).toBe(false)
  })

  it('draft.headline_edited is a web event with no outcome', () => {
    expect(CATALOGUE['draft.headline_edited'].source).toEqual(['web'])
    expect(CATALOGUE['draft.headline_edited'].outcomes).toEqual([])
  })

  it('no payload schema of these events accepts a headline text field (NFR-05)', () => {
    const TEXT = { headline: 'Secret line', text: 'Secret line', renderedHeadline: 'Secret line', renderedText: { headline: { text: 'Secret line' } } }
    const bases: Record<string, Record<string, unknown>> = {
      'draft.headline_edited': { via: 'edit', state: 'stale', scheduledPending: true },
      'publish.settled': { channel: 'LINKEDIN', terminal: true, headlineState: 'stale' },
      'generation.finished': { headlineCheck: 'painted' },
    }
    for (const [name, base] of Object.entries(bases)) {
      const schema = CATALOGUE[name as keyof typeof CATALOGUE].schema
      const parsed = schema.safeParse({ ...base, ...TEXT })
      expect(parsed.success, name).toBe(true)
      expect(JSON.stringify(parsed.success && parsed.data), name).not.toContain('Secret line')
      const keys = Object.keys((schema as unknown as { shape: Record<string, unknown> }).shape)
      expect(keys.filter((k) => /headline(?!State|Check)|text|html/i.test(k)), name).toEqual([])
    }
  })
})
