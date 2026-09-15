import { describe, it, expect } from 'vitest'
import {
  parseRefineEnvelope,
  DEFAULT_INSTRUCTION_CLASSES,
  INSTRUCTION_CLASS_NAMES,
} from '@/lib/agent/refineEnvelope'

const DOC = `<!DOCTYPE html>
<html><head><style>body{margin:0}</style></head>
<body><h1>INDUSTRY READINESS PROGRAMME</h1></body>
</html>`

/** Every ambiguous branch must land here — FR-05. */
function expectPreservingDefault(out: ReturnType<typeof parseRefineEnvelope>) {
  expect(out?.classes).toEqual([...DEFAULT_INSTRUCTION_CLASSES])
  expect(out?.defaulted).toBe(true)
  // The default is preserving by construction: it can never carry a destructive class.
  expect(out?.classes).not.toContain('remove')
  expect(out?.classes).not.toContain('replace')
}

describe('parseRefineEnvelope', () => {
  it('parses a well-formed single-class envelope', () => {
    const out = parseRefineEnvelope(`REFINE-CLASSES: add\nREFINE-SUPERSEDES: none\n${DOC}`)
    expect(out?.classes).toEqual(['add'])
    expect(out?.supersedes).toEqual([])
    expect(out?.html).toBe(DOC)
    expect(out?.defaulted).toBe(false)
    expect(out?.ambiguity).toBeUndefined()
    expect(out?.discarded).toBe('')
  })

  it('parses a multi-clause instruction into multiple classes, order preserved', () => {
    const out = parseRefineEnvelope(
      `REFINE-CLASSES: replace, constrain\nREFINE-SUPERSEDES: the hero image; the old footer tagline\n${DOC}`
    )
    expect(out?.classes).toEqual(['replace', 'constrain'])
    expect(out?.supersedes).toEqual(['the hero image', 'the old footer tagline'])
    expect(out?.defaulted).toBe(false)
  })

  it('accepts every name in the closed set, however the model decorates it', () => {
    const out = parseRefineEnvelope(
      `**Classes**: \`add\`, "REPLACE", remove., constrain\nSupersedes: x\n${DOC}`
    )
    expect(out?.classes).toEqual([...INSTRUCTION_CLASS_NAMES])
    expect(out?.defaulted).toBe(false)
  })

  // --- FR-05: every ambiguous shape resolves to the preserving default ---

  it('defaults when the envelope is absent entirely', () => {
    const out = parseRefineEnvelope(DOC)
    expectPreservingDefault(out)
    expect(out?.ambiguity).toBe('no-envelope')
    expect(out?.html).toBe(DOC)
  })

  it('defaults on a malformed envelope the header regex cannot read', () => {
    const out = parseRefineEnvelope(`{ "classes" = [remove] }\n${DOC}`)
    expectPreservingDefault(out)
    expect(out?.ambiguity).toBe('no-envelope')
    // The unreadable envelope is still surfaced for logging.
    expect(out?.discarded).toContain('"classes"')
  })

  it('defaults on a partial envelope — supersedes without classes', () => {
    const out = parseRefineEnvelope(`REFINE-SUPERSEDES: the old logo\n${DOC}`)
    expectPreservingDefault(out)
    expect(out?.ambiguity).toBe('missing-classes')
    // The model's claim is still reported; the route decides what it licenses.
    expect(out?.supersedes).toEqual(['the old logo'])
  })

  it('defaults on an unknown or misspelled class name, and reports it', () => {
    const out = parseRefineEnvelope(`CLASSES: delete\nSUPERSEDES: the caption\n${DOC}`)
    expectPreservingDefault(out)
    expect(out?.ambiguity).toBe('unrecognized-class')
    expect(out?.unrecognized).toEqual(['delete'])
  })

  it('discards the WHOLE classification when one item of several is unrecognized', () => {
    // "remove, restyle" is a half-understood reply — cherry-picking `remove` out
    // of it would act destructively on exactly the ambiguity FR-05 guards.
    const out = parseRefineEnvelope(`CLASSES: remove, restyle\nSUPERSEDES: the subhead\n${DOC}`)
    expectPreservingDefault(out)
    expect(out?.unrecognized).toEqual(['restyle'])
  })

  it('defaults on an empty classes list, blank or "none"', () => {
    expectPreservingDefault(parseRefineEnvelope(`CLASSES:\n${DOC}`))
    expect(parseRefineEnvelope(`CLASSES:\n${DOC}`)?.ambiguity).toBe('empty-classes')
    expectPreservingDefault(parseRefineEnvelope(`CLASSES: none\n${DOC}`))
    expectPreservingDefault(parseRefineEnvelope(`CLASSES: ,,\n${DOC}`))
  })

  it('never upgrades prose into a destructive class', () => {
    const out = parseRefineEnvelope(
      `CLASSES: I could not cleanly split this instruction; probably remove\n${DOC}`
    )
    expectPreservingDefault(out)
  })

  // --- supersedes is untrusted model data ---

  it('reports a destructive class with empty supersedes verbatim (the route decides)', () => {
    // FR-04 is the ROUTE's check. The parser must not silently downgrade here, or
    // the route would never see what the model actually claimed.
    const out = parseRefineEnvelope(`CLASSES: remove\nSUPERSEDES: none\n${DOC}`)
    expect(out?.classes).toEqual(['remove'])
    expect(out?.supersedes).toEqual([])
    expect(out?.defaulted).toBe(false)
  })

  it('normalizes junk supersedes entries: blanks, duplicates, decoration, whitespace', () => {
    const out = parseRefineEnvelope(
      `CLASSES: replace\nSUPERSEDES: "the hero image" ;; the   hero    image ;  ; - the old footer ;\n${DOC}`
    )
    expect(out?.supersedes).toEqual(['the hero image', 'the old footer'])
  })

  it('keeps commas inside a superseded element name', () => {
    const out = parseRefineEnvelope(`CLASSES: replace\nSUPERSEDES: the headline, top left\n${DOC}`)
    expect(out?.supersedes).toEqual(['the headline, top left'])
  })

  it('caps supersedes count and per-item length', () => {
    const many = Array.from({ length: 30 }, (_, i) => `element ${i}`).join('; ')
    expect(parseRefineEnvelope(`CLASSES: remove\nSUPERSEDES: ${many}\n${DOC}`)?.supersedes).toHaveLength(10)
    const long = 'x'.repeat(5000)
    const capped = parseRefineEnvelope(`CLASSES: remove\nSUPERSEDES: ${long}\n${DOC}`)?.supersedes[0]
    expect(capped?.length).toBe(200)
  })

  // --- document boundary: delegated to extractHtmlDocument ---

  it('returns null when there is no HTML document at all', () => {
    expect(parseRefineEnvelope('CLASSES: add\nI cannot apply that instruction.')).toBeNull()
    expect(parseRefineEnvelope('')).toBeNull()
  })

  it('drops narration before the document and still reads the envelope (the prod shape)', () => {
    const raw = `The file write wasn't permitted, so here's the complete HTML document directly:\n\nREFINE-CLASSES: constrain\n${DOC}\n\nLet me know if you'd like it larger.`
    const out = parseRefineEnvelope(raw)
    expect(out?.classes).toEqual(['constrain'])
    expect(out?.html).toBe(DOC)
    expect(out?.html.startsWith('<!DOCTYPE html>')).toBe(true)
    // Narration is surfaced for logging, minus the header line we consumed.
    expect(out?.discarded).toContain("file write wasn't permitted")
    expect(out?.discarded).toContain('larger')
    expect(out?.discarded).not.toContain('REFINE-CLASSES')
  })

  it('ignores envelope text that appears INSIDE the document', () => {
    // A post about this very feature would otherwise reclassify its own edit.
    const doc = `<!DOCTYPE html>
<html><body>
<p>REFINE-CLASSES: remove</p>
<p>REFINE-SUPERSEDES: everything</p>
</body></html>`
    const out = parseRefineEnvelope(doc)
    expectPreservingDefault(out)
    expect(out?.supersedes).toEqual([])
    expect(out?.html).toBe(doc)
  })

  it('reads an envelope emitted after the document, and survives markdown fences', () => {
    const out = parseRefineEnvelope(`\`\`\`html\n${DOC}\n\`\`\`\n\nCLASSES: add\n`)
    expect(out?.classes).toEqual(['add'])
    expect(out?.html).toBe(DOC)
  })
})
