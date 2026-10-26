import { describe, it, expect } from 'vitest'
import {
  parseRefineEnvelope,
  effectiveClasses,
  renderEnvelopeProtocol,
  REFINE_ENVELOPE_EXAMPLE,
} from '@/lib/agent/refineEnvelope'
import { INSTRUCTION_CLASS_KEYS, SUPERSEDES_RULE, CONSTRAINS_RULE } from '@/lib/agent/instructionClasses'

const DOC = `<!DOCTYPE html>
<html><head><style>body{margin:0} .hero{background-image:url('http://minio.local/images/new.jpg')}</style></head>
<body><h1>INDUSTRY READINESS PROGRAMME</h1></body>
</html>`

const FENCED = (json: string) => `\`\`\`json\n${json}\n\`\`\`\n${DOC}`

describe('parseRefineEnvelope — the documented wire format', () => {
  it('parses a fenced JSON header followed by the document', () => {
    const out = parseRefineEnvelope(FENCED('{"classes":["replace"],"supersedes":["http://minio.local/images/old.png"]}'))
    expect(out).toEqual({
      classes: ['replace'],
      supersedes: ['http://minio.local/images/old.png'],
      constrains: [],
      html: DOC,
      discarded: '',
      classificationDefaulted: false,
    })
  })

  it('parses a bare (unfenced) JSON header', () => {
    const out = parseRefineEnvelope(`{"classes":["remove"],"supersedes":["Join us for"]}\n${DOC}`)
    expect(out?.classes).toEqual(['remove'])
    expect(out?.supersedes).toEqual(['Join us for'])
    expect(out?.html).toBe(DOC)
    expect(out?.classificationDefaulted).toBe(false)
  })

  it('parses the example the protocol text shows the model', () => {
    const out = parseRefineEnvelope(REFINE_ENVELOPE_EXAMPLE)
    expect(out).not.toBeNull()
    expect(out?.classificationDefaulted).toBe(false)
    expect(out?.classes.length).toBeGreaterThan(0)
    expect(renderEnvelopeProtocol()).toContain(REFINE_ENVELOPE_EXAMPLE)
  })

  it('returns a multi-clause classification in order (AC-11)', () => {
    const out = parseRefineEnvelope(FENCED('{"classes":["replace","add"],"supersedes":["old.png"]}'))
    expect(out?.classes).toEqual(['replace', 'add'])
  })
})

describe('parseRefineEnvelope — tolerating a narrating model', () => {
  it('finds the header after a chat preamble and keeps the preamble in discarded', () => {
    const raw = `Sure — here is the updated design.\n\n${FENCED('{"classes":["constrain"],"supersedes":[]}')}`
    const out = parseRefineEnvelope(raw)
    expect(out?.classes).toEqual(['constrain'])
    expect(out?.html).toBe(DOC)
    expect(out?.discarded).toContain('here is the updated design')
    expect(out?.discarded).not.toContain('classes')
    expect(out?.discarded).not.toContain('```')
  })

  it('ignores brace-y narration that is not the envelope', () => {
    const raw = `I kept the {headline} styles and the {"note": 1} block.\n${FENCED('{"classes":["remove"],"supersedes":["a"]}')}`
    const out = parseRefineEnvelope(raw)
    expect(out?.classes).toEqual(['remove'])
    expect(out?.supersedes).toEqual(['a'])
  })

  it('survives an unbalanced brace in the narration', () => {
    const raw = `Oops { unbalanced.\n{"classes":["remove"],"supersedes":["b"]}\n${DOC}`
    expect(parseRefineEnvelope(raw)?.supersedes).toEqual(['b'])
  })

  it('handles braces and escaped quotes inside JSON strings', () => {
    const out = parseRefineEnvelope(FENCED(String.raw`{"classes":["replace"],"supersedes":["a}b{c","say \"hi\""]}`))
    expect(out?.supersedes).toEqual(['a}b{c', 'say "hi"'])
  })

  it('falls back to a header placed after the document', () => {
    const out = parseRefineEnvelope(`${DOC}\n\n{"classes":["remove"],"supersedes":["x"]}`)
    expect(out?.classes).toEqual(['remove'])
    expect(out?.html).toBe(DOC)
    expect(out?.classificationDefaulted).toBe(false)
  })

  it('never reads an envelope out of the document itself', () => {
    const docWithJson = DOC.replace('</body>', '<script type="application/json">{"classes":["remove"],"supersedes":["x"]}</script></body>')
    const out = parseRefineEnvelope(docWithJson)
    expect(out?.classes).toEqual(['add'])
    expect(out?.classificationDefaulted).toBe(true)
    expect(out?.html).toBe(docWithJson)
  })

  it('cuts the document with extractHtmlDocument (fences around the document fall away)', () => {
    const raw = `{"classes":["add"],"supersedes":[]}\n\`\`\`html\n${DOC}\n\`\`\`\nLet me know!`
    const out = parseRefineEnvelope(raw)
    expect(out?.html).toBe(DOC)
    expect(out?.discarded).toContain('Let me know!')
  })
})

describe('parseRefineEnvelope — defaults (FR-05)', () => {
  it('defaults a missing header to the preserving class, flagged', () => {
    const out = parseRefineEnvelope(DOC)
    expect(out).toMatchObject({ classes: ['add'], supersedes: [], html: DOC, classificationDefaulted: true })
  })

  it('defaults unparseable JSON', () => {
    const out = parseRefineEnvelope(FENCED('{"classes":["remove",],"supersedes":}'))
    expect(out?.classes).toEqual(['add'])
    expect(out?.classificationDefaulted).toBe(true)
  })

  it('defaults a header with no classes key, keeping any supersedes', () => {
    const out = parseRefineEnvelope(FENCED('{"supersedes":["old.png"]}'))
    expect(out?.classes).toEqual(['add'])
    expect(out?.supersedes).toEqual(['old.png'])
    expect(out?.classificationDefaulted).toBe(true)
  })

  it('drops unknown class values and defaults when none survive', () => {
    expect(parseRefineEnvelope(FENCED('{"classes":["remove","recolour"],"supersedes":["a"]}'))?.classes).toEqual(['remove'])
    const none = parseRefineEnvelope(FENCED('{"classes":["recolour", 3, null],"supersedes":["a"]}'))
    expect(none?.classes).toEqual(['add'])
    expect(none?.classificationDefaulted).toBe(true)
  })

  it('normalises case/whitespace and de-duplicates classes', () => {
    const out = parseRefineEnvelope(FENCED('{"classes":[" Remove ","remove","CONSTRAIN"],"supersedes":["a"]}'))
    expect(out?.classes).toEqual(['remove', 'constrain'])
  })

  it('accepts a single class string', () => {
    expect(parseRefineEnvelope(FENCED('{"classes":"replace","supersedes":"old.png"}'))).toMatchObject({
      classes: ['replace'],
      supersedes: ['old.png'],
      classificationDefaulted: false,
    })
  })

  it('defaults a missing supersedes to [] and cleans the list', () => {
    expect(parseRefineEnvelope(FENCED('{"classes":["add"]}'))?.supersedes).toEqual([])
    const out = parseRefineEnvelope(FENCED('{"classes":["remove"],"supersedes":["  a  ", "", 7, "a", null, "b"]}'))
    expect(out?.supersedes).toEqual(['a', 'b'])
  })

  it('returns null when no document can be cut', () => {
    expect(parseRefineEnvelope('{"classes":["remove"],"supersedes":["a"]}\nI could not apply that.')).toBeNull()
    expect(parseRefineEnvelope('')).toBeNull()
  })
})

describe('parseRefineEnvelope — constrains (fix round 1, ruling 4)', () => {
  it('parses constrain targets with directions', () => {
    const out = parseRefineEnvelope(
      FENCED('{"classes":["constrain"],"supersedes":[],"constrains":[{"fragment":"#headline","direction":"decrease"},{"fragment":".logo","direction":"increase"}]}'),
    )
    expect(out?.constrains).toEqual([
      { fragment: '#headline', direction: 'decrease' },
      { fragment: '.logo', direction: 'increase' },
    ])
  })

  it('accepts a bare string target, drops an invalid direction, and cleans the list', () => {
    const out = parseRefineEnvelope(
      FENCED('{"classes":["constrain"],"constrains":["#headline",{"fragment":" .logo ","direction":"Smaller"},{"fragment":""},{"direction":"decrease"},7,null,{"fragment":"#headline"}]}'),
    )
    expect(out?.constrains).toEqual([{ fragment: '#headline' }, { fragment: '.logo' }])
  })

  it('normalises direction case', () => {
    const out = parseRefineEnvelope(FENCED('{"classes":["constrain"],"constrains":[{"fragment":"#h","direction":" DECREASE "}]}'))
    expect(out?.constrains).toEqual([{ fragment: '#h', direction: 'decrease' }])
  })

  it('defaults a missing constrains to []', () => {
    expect(parseRefineEnvelope(FENCED('{"classes":["add"]}'))?.constrains).toEqual([])
  })

  it('recognises a header that carries only constrains', () => {
    const out = parseRefineEnvelope(FENCED('{"constrains":[{"fragment":"#h"}]}'))
    expect(out?.constrains).toEqual([{ fragment: '#h' }])
    expect(out?.classificationDefaulted).toBe(true)
  })
})

describe('parseRefineEnvelope — narration that mentions a doctype (fix round 1, minor #5)', () => {
  it('re-cuts the document after a header that extractHtmlDocument swallowed', () => {
    const raw = `I'll return the header and then the full <!DOCTYPE html> document.
${FENCED('{"classes":["remove"],"supersedes":["Join us for"]}')}`
    const out = parseRefineEnvelope(raw)
    expect(out?.classes).toEqual(['remove'])
    expect(out?.supersedes).toEqual(['Join us for'])
    expect(out?.classificationDefaulted).toBe(false)
    expect(out?.html).toBe(DOC)
    expect(out?.discarded).toContain("I'll return the header")
  })

  it('handles a mention of <html> with an unfenced header', () => {
    const raw = `Here is your <html> page:
{"classes":["constrain"],"constrains":[{"fragment":"#h","direction":"decrease"}]}
${DOC}`
    const out = parseRefineEnvelope(raw)
    expect(out?.classes).toEqual(['constrain'])
    expect(out?.html).toBe(DOC)
  })

  it('still ignores JSON inside the real document body', () => {
    const docWithJson = DOC.replace('</body>', '<script type="application/json">{"classes":["remove"],"supersedes":["x"]}</script></body>')
    const out = parseRefineEnvelope(`Mentioning <!DOCTYPE html> here.
${docWithJson}`)
    expect(out?.classificationDefaulted).toBe(true)
  })
})

describe('effectiveClasses — FR-04 downgrade, for the route to call', () => {
  it('leaves a destructive class with a named element alone', () => {
    expect(effectiveClasses({ classes: ['replace', 'add'], supersedes: ['old.png'] })).toEqual({
      classes: ['replace', 'add'],
      downgraded: [],
    })
  })

  // AC-10: an empty supersedes deletes nothing — it resolves to preserving.
  it('downgrades replace/remove with empty supersedes to the preserving class and reports it', () => {
    expect(effectiveClasses({ classes: ['replace'], supersedes: [] })).toEqual({ classes: ['add'], downgraded: ['replace'] })
    expect(effectiveClasses({ classes: ['remove', 'constrain'], supersedes: [], constrains: [{ fragment: '#headline' }] })).toEqual({
      classes: ['add', 'constrain'],
      downgraded: ['remove'],
    })
  })

  it('treats whitespace-only supersedes as empty', () => {
    expect(effectiveClasses({ classes: ['remove'], supersedes: ['  '] }).downgraded).toEqual(['remove'])
  })

  it('de-duplicates after downgrading', () => {
    expect(effectiveClasses({ classes: ['replace', 'remove', 'add'], supersedes: [] })).toEqual({
      classes: ['add'],
      downgraded: ['replace', 'remove'],
    })
  })

  it('leaves add alone with empty supersedes', () => {
    expect(effectiveClasses({ classes: ['add'], supersedes: [], constrains: [] })).toEqual({ classes: ['add'], downgraded: [] })
  })

  // Fix round 1, ruling 4: an untargeted constrain cannot be verified.
  it('downgrades a constrain with no usable target to add and reports it', () => {
    expect(effectiveClasses({ classes: ['constrain'], supersedes: [], constrains: [] })).toEqual({ classes: ['add'], downgraded: ['constrain'] })
    expect(effectiveClasses({ classes: ['constrain'], supersedes: [], constrains: [{ fragment: '   ' }] }).downgraded).toEqual(['constrain'])
    expect(effectiveClasses({ classes: ['constrain', 'add'], supersedes: [] })).toEqual({ classes: ['add'], downgraded: ['constrain'] })
  })

  it('keeps a targeted constrain', () => {
    expect(
      effectiveClasses({ classes: ['constrain'], supersedes: [], constrains: [{ fragment: '#headline', direction: 'decrease' }] }),
    ).toEqual({ classes: ['constrain'], downgraded: [] })
  })
})

describe('renderEnvelopeProtocol — the output protocol T17 puts in the prompt', () => {
  it('names every class key and both fields, and demands the header before the document', () => {
    const p = renderEnvelopeProtocol()
    for (const k of INSTRUCTION_CLASS_KEYS) expect(p).toContain(k)
    expect(p).toContain('"classes"')
    expect(p).toContain('"supersedes"')
    expect(p).toMatch(/before the (HTML )?document/i)
    expect(p).toContain('"constrains"')
  })

  // Minor #8: the fragment rules are stated once, in renderClassSemantics.
  it('does not restate the supersedes / constrains rules', () => {
    const p = renderEnvelopeProtocol()
    expect(p).not.toContain(SUPERSEDES_RULE)
    expect(p).not.toContain(CONSTRAINS_RULE)
    expect(p).not.toMatch(/verbatim/i)
  })
})

describe('parseRefineEnvelope — the doctype survives the header rescue (fix round 2, finding 4)', () => {
  it('keeps the doctype when the header sits in a comment between <!DOCTYPE html> and <html>', () => {
    const tail = '<html><head></head><body>a</body></html>'
    const out = parseRefineEnvelope(`<!DOCTYPE html>\n<!-- {"classes":["remove"],"supersedes":["Hi"]} -->\n${tail}`)
    expect(out?.html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(out?.html.endsWith(tail)).toBe(true)
    expect(out?.html).not.toContain('"classes"')
  })

  it('keeps the doctype when narration is only a doctype followed by the header and an <html> document', () => {
    const tail = '<html><head><style>h1{}</style></head><body><h1>Hi</h1></body></html>'
    const out = parseRefineEnvelope(`<!DOCTYPE html>\n{"classes":["remove"],"supersedes":["Hi"]}\n${tail}`)
    expect(out?.html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(out?.html).not.toContain('"classes"')
    expect(out?.classes).toEqual(['remove'])
  })

  it('does not double the doctype when the re-cut document carries its own', () => {
    const out = parseRefineEnvelope(`Returning a <!DOCTYPE html> page.\n{"classes":["remove"],"supersedes":["Hi"]}\n${DOC}`)
    expect(out?.html).toBe(DOC)
  })
})
