import { describe, it, expect } from 'vitest'
import {
  INSTRUCTION_CLASSES,
  INSTRUCTION_CLASS_KEYS,
  isInstructionClass,
  visibleText,
  countOccurrences,
  type PostCondition,
  type PostConditionInput,
} from '@/lib/agent/instructionClasses'

// A small but realistic design: a headline, a paragraph, and one decorative
// element with an id a `supersedes` locator can name.
const BEFORE = `<!DOCTYPE html>
<html><head><style>.hero{font-size:72px}</style></head>
<body>
  <h1 class="hero">INDUSTRY READINESS PROGRAMME</h1>
  <p class="sub">Applications are open.</p>
  <div id="starburst"></div>
</body></html>`

function input(after: string, overrides: Partial<PostConditionInput> = {}): PostConditionInput {
  return { before: BEFORE, after, instruction: 'do the thing', supersedes: [], ...overrides }
}

// Named rather than re-derived in every case, so a table edit surfaces here once.
function postConditionOf(key: keyof typeof INSTRUCTION_CLASSES): PostCondition {
  const fn = INSTRUCTION_CLASSES[key].postCondition
  if (!fn) throw new Error(`${key} has no post-condition`)
  return fn
}

describe('INSTRUCTION_CLASSES — the table is the single source (FR-06, AC-19)', () => {
  it('defines exactly the four classes, each with prompt-ready semantics', () => {
    expect(INSTRUCTION_CLASS_KEYS.sort()).toEqual(['add', 'constrain', 'remove', 'replace'])
    for (const key of INSTRUCTION_CLASS_KEYS) {
      const semantics = INSTRUCTION_CLASSES[key].semantics
      expect(semantics.length).toBeGreaterThan(0)
      // The prompt renderer joins these verbatim, so each must name its own class.
      expect(semantics.startsWith(`${key} —`)).toBe(true)
    }
  })

  it('gives exactly one class a null post-condition, and it is add (FR-08)', () => {
    const nulls = INSTRUCTION_CLASS_KEYS.filter((k) => INSTRUCTION_CLASSES[k].postCondition === null)
    expect(nulls).toEqual(['add'])
  })

  // AC-12: the three structural classes must verify with zero model calls. A
  // synchronous return is what makes that unfakeable.
  it('returns a plain result synchronously from every structural post-condition', () => {
    for (const key of ['replace', 'remove', 'constrain'] as const) {
      const result = postConditionOf(key)(input(BEFORE, { supersedes: ['#starburst'] }))
      expect(result).not.toBeInstanceOf(Promise)
      expect(typeof result.holds).toBe('boolean')
      expect(result.detail.length).toBeGreaterThan(0)
    }
  })

  it('recognises only its own keys', () => {
    expect(isInstructionClass('replace')).toBe(true)
    expect(isInstructionClass('rewrite')).toBe(false)
    expect(isInstructionClass('toString')).toBe(false)
    expect(isInstructionClass(null)).toBe(false)
  })
})

describe('replace — supersededElementAbsent', () => {
  const holds = postConditionOf('replace')

  it('holds when the named element was present and is now gone', () => {
    const after = BEFORE.replace('<div id="starburst"></div>', '<img src="https://cdn.test/bg.png">')
    const out = holds(input(after, { supersedes: ['id="starburst"'] }))
    expect(out.holds).toBe(true)
  })

  // The reported duplicate-background failure: the new visual is added and the
  // old one is left underneath (AC-09).
  it('does not hold when the superseded element survives in the output', () => {
    const after = BEFORE.replace('</body>', '<img src="https://cdn.test/bg.png"></body>')
    const out = holds(input(after, { supersedes: ['id="starburst"'] }))
    expect(out.holds).toBe(false)
    expect(out.detail).toContain('still present')
  })

  it('does not hold when the model names an element that never existed', () => {
    const after = `${BEFORE}`
    const out = holds(input(after, { supersedes: ['id="confetti"'] }))
    expect(out.holds).toBe(false)
    expect(out.detail).toContain('does not appear in the current design')
  })

  it('fails closed when nothing was named', () => {
    expect(holds(input(BEFORE, { supersedes: [] })).holds).toBe(false)
    expect(holds(input(BEFORE, { supersedes: ['   '] })).holds).toBe(false)
  })

  it('requires every named element to be gone, not just the first', () => {
    const after = BEFORE.replace('<div id="starburst"></div>', '')
    const out = holds(input(after, { supersedes: ['id="starburst"', 'class="sub"'] }))
    expect(out.holds).toBe(false)
    expect(out.detail).toContain('class="sub"')
  })
})

describe('remove — targetTextShorter', () => {
  const holds = postConditionOf('remove')

  // AC-08: "reduce the text".
  it('holds when named copy is gone and the document got shorter', () => {
    const after = BEFORE.replace('<p class="sub">Applications are open.</p>', '')
    const out = holds(input(after, { supersedes: ['<p class="sub">Applications are open.</p>'] }))
    expect(out.holds).toBe(true)
  })

  it('does not hold when the named copy survives', () => {
    const out = holds(input(BEFORE, { supersedes: ['<p class="sub">Applications are open.</p>'] }))
    expect(out.holds).toBe(false)
    expect(out.detail).toContain('still present')
  })

  // Absence alone would call this a success: the named sentence really is gone,
  // and a longer one took its place.
  it('does not hold when the deletion is compensated by longer copy elsewhere', () => {
    const after = BEFORE.replace(
      '<p class="sub">Applications are open.</p>',
      '<p class="sub2">Applications are open right now for the next intake of undergraduates.</p>',
    )
    const out = holds(input(after, { supersedes: ['<p class="sub">Applications are open.</p>'] }))
    expect(out.holds).toBe(false)
    expect(out.detail).toContain('visible characters')
  })

  // Deleting a decorative node cannot shorten any text, so it is held to
  // no-growth rather than to strict shrinkage.
  it('holds for a non-textual deletion when nothing grew', () => {
    const after = BEFORE.replace('<div id="starburst"></div>', '')
    const out = holds(input(after, { supersedes: ['<div id="starburst"></div>'] }))
    expect(out.holds).toBe(true)
  })

  it('does not hold when a non-textual deletion is accompanied by new copy', () => {
    const after = BEFORE.replace('<div id="starburst"></div>', '<p>Brand new tagline added anyway.</p>')
    const out = holds(input(after, { supersedes: ['<div id="starburst"></div>'] }))
    expect(out.holds).toBe(false)
    expect(out.detail).toContain('more visible text')
  })

  it('fails closed when nothing was named', () => {
    expect(holds(input(BEFORE, { supersedes: [] })).holds).toBe(false)
  })
})

describe('constrain — boundedAttributeHolds (the worked example)', () => {
  const holds = postConditionOf('constrain')

  // "make the headline bigger" — a value moves, nothing else does.
  it('holds when only a value changed', () => {
    const after = BEFORE.replace('font-size:72px', 'font-size:96px')
    const out = holds(input(after, { instruction: 'make the headline bigger' }))
    expect(out.holds).toBe(true)
  })

  it('does not hold when the model added an element while satisfying the bound', () => {
    const after = BEFORE.replace('font-size:72px', 'font-size:96px').replace(
      '</body>',
      '<div class="balance-panel"></div></body>',
    )
    const out = holds(input(after, { instruction: 'make the headline bigger' }))
    expect(out.holds).toBe(false)
    expect(out.detail).toContain('same elements')
  })

  it('does not hold when the copy was reworded', () => {
    const after = BEFORE.replace('font-size:72px', 'font-size:96px').replace(
      'Applications are open.',
      'Apply now.',
    )
    const out = holds(input(after, { instruction: 'make the headline bigger' }))
    expect(out.holds).toBe(false)
    expect(out.detail).toContain('visible text changed')
  })

  it('does not hold when nothing was applied at all', () => {
    const out = holds(input(BEFORE, { instruction: 'make the headline bigger' }))
    expect(out.holds).toBe(false)
    expect(out.detail).toContain('identical')
  })

  it('ignores pure reformatting of the markup', () => {
    // Whitespace-only churn is not a change the user asked for, and must not
    // pass as one.
    const out = holds(input(BEFORE.replace(/\n/g, '\n  '), { instruction: "don't use red" }))
    expect(out.holds).toBe(false)
  })
})

describe('measurement primitives', () => {
  it('reads visible text, ignoring markup, comments, script and style bodies', () => {
    const html = '<style>.a{content:"hidden"}</style><!-- <p>note</p> --><h1>Hi</h1>\n<p>  there </p>'
    expect(visibleText(html)).toBe('Hi there')
  })

  it('counts literal, non-overlapping occurrences', () => {
    expect(countOccurrences('aXbXc', 'X')).toBe(2)
    expect(countOccurrences('aaaa', 'aa')).toBe(2)
    expect(countOccurrences('abc', 'z')).toBe(0)
    expect(countOccurrences('abc', '')).toBe(0)
  })
})
