import { describe, it, expect } from 'vitest'
import {
  INSTRUCTION_CLASSES,
  INSTRUCTION_CLASS_KEYS,
  SUPERSEDES_RULE,
  CONSTRAINS_RULE,
  checkPostConditions,
  asksForTextReduction,
  TEXT_REDUCTION_CHECK,
  decodeHtmlEntities,
  renderClassSemantics,
  type DomElementFact,
  type DomFacts,
  type InstructionClass,
  type InstructionClassTable,
  type PostConditionInput,
} from '@/lib/agent/instructionClasses'
import * as instructionClassesModule from '@/lib/agent/instructionClasses'

// ── Hand-built facts ──────────────────────────────────────────────────────────

function el(partial: Partial<DomElementFact> & { tag: string }): DomElementFact {
  return {
    id: null,
    classes: [],
    text: '',
    imageSources: [],
    fontSizePx: null,
    box: null,
    ...partial,
  }
}

// Flat facts: every listed element is a sibling, so document text is the join
// of their texts. elementCount defaults to the list length.
function facts(elements: DomElementFact[], opts: { text?: string; elementCount?: number } = {}): DomFacts {
  return {
    text: opts.text ?? elements.map((e) => e.text).filter(Boolean).join(' '),
    imageSources: elements.flatMap((e) => e.imageSources),
    elementCount: opts.elementCount ?? elements.length,
    elements,
  }
}

// Nested facts, as T14's extractor produces them: an ancestor's text contains
// its descendants' text, so document text must be given explicitly (it is the
// body innerText, not a join of every element).
function nested(text: string, elements: DomElementFact[], elementCount = elements.length): DomFacts {
  return { text, imageSources: elements.flatMap((e) => e.imageSources), elementCount, elements }
}

const OLD_BG = 'http://minio.local/images/generated/old-bg.png'
const UPLOAD = 'http://minio.local/images/briefs/u1/upload.jpg'
const LOGO = 'http://minio.local/brand-kits/k1/logo.png'
const LONG_BODY =
  'Join us for an unforgettable evening of ideas, networking and hands-on workshops led by industry experts from across the region.'
const SHORT_BODY = 'Join us for an evening of ideas and workshops.'

const headline = (fontSizePx = 96, text = 'INDUSTRY READINESS PROGRAMME', box = { width: 900, height: 200 }) =>
  el({ tag: 'h1', id: 'headline', classes: ['title'], text, fontSizePx, box })
const body = (text = LONG_BODY) => el({ tag: 'p', classes: ['body-copy'], text, fontSizePx: 32, box: { width: 900, height: 160 } })
const logo = (box = { width: 200, height: 80 }) => el({ tag: 'img', classes: ['logo'], imageSources: [LOGO], box })
const bgLayer = (src = OLD_BG, cls = 'bg') => el({ tag: 'div', classes: [cls], imageSources: [src], box: { width: 1080, height: 1080 } })

const BEFORE = facts([bgLayer(), headline(), body(), logo()])

function check(
  cls: InstructionClass,
  input: Partial<PostConditionInput> & { after: DomFacts },
  table: InstructionClassTable = INSTRUCTION_CLASSES,
) {
  const pc = table[cls].postCondition
  if (!pc) throw new Error(`${cls} has no post-condition`)
  return pc({ before: BEFORE, supersedes: [], constrains: [], classes: [cls], ...input }, table)
}

// ── The table ─────────────────────────────────────────────────────────────────

describe('INSTRUCTION_CLASSES — the single per-class table', () => {
  it('is keyed by exactly the four classes', () => {
    expect(Object.keys(INSTRUCTION_CLASSES).sort()).toEqual(['add', 'constrain', 'remove', 'replace'])
    expect([...INSTRUCTION_CLASS_KEYS].sort()).toEqual(['add', 'constrain', 'remove', 'replace'])
  })

  it('gives add no deterministic post-condition (the model verifier owns it) and the rest a function', () => {
    expect(INSTRUCTION_CLASSES.add.postCondition).toBeNull()
    expect(typeof INSTRUCTION_CLASSES.replace.postCondition).toBe('function')
    expect(typeof INSTRUCTION_CLASSES.remove.postCondition).toBe('function')
    expect(typeof INSTRUCTION_CLASSES.constrain.postCondition).toBe('function')
  })

  it('marks replace/remove destructive and add/replace additive', () => {
    expect(INSTRUCTION_CLASS_KEYS.filter((k) => INSTRUCTION_CLASSES[k].destructive).sort()).toEqual(['remove', 'replace'])
    expect(INSTRUCTION_CLASS_KEYS.filter((k) => INSTRUCTION_CLASSES[k].additive).sort()).toEqual(['add', 'replace'])
  })

  it('carries non-empty semantics prose for every class', () => {
    for (const k of INSTRUCTION_CLASS_KEYS) {
      expect(INSTRUCTION_CLASSES[k].semantics.trim().length).toBeGreaterThan(40)
    }
  })

  it('tells the model, with examples, how to write fragments', () => {
    for (const k of ['replace', 'remove'] as const) {
      expect(INSTRUCTION_CLASSES[k].semantics).toMatch(/supersedes/)
      expect(INSTRUCTION_CLASSES[k].semantics).toMatch(/Example/i)
    }
    const block = renderClassSemantics()
    expect(block).toMatch(/verbatim/i)
    expect(block).toMatch(/url\(/)
    expect(block).toMatch(/#id/)
    expect(block).toMatch(/unique/i) // minor #7
  })

  it('says a replace may reuse the element but the superseded content must go (ruling 3)', () => {
    expect(INSTRUCTION_CLASSES.replace.semantics).toMatch(/must be GONE/)
    expect(INSTRUCTION_CLASSES.replace.semantics).toMatch(/reuse the same element/i)
  })

  it('tells the model a text reduction needs a text phrase (AC-08 relies on it)', () => {
    expect(INSTRUCTION_CLASSES.remove.semantics).toMatch(/TEXT phrase/)
    expect(INSTRUCTION_CLASSES.remove.semantics).toMatch(/word count/i)
  })

  it('includes the worked constrain example with a named target and direction (party-ba)', () => {
    expect(INSTRUCTION_CLASSES.constrain.semantics).toMatch(/make the headline smaller/i)
    expect(INSTRUCTION_CLASSES.constrain.semantics).toMatch(/constrains/)
    expect(INSTRUCTION_CLASSES.constrain.semantics).toMatch(/"direction": "decrease"/)
    expect(INSTRUCTION_CLASSES.constrain.semantics).toMatch(/still be present after/i) // fix round 3
  })
})

describe('renderClassSemantics — the prompt consumer', () => {
  it('renders every class key, its semantics verbatim, and each fragment rule once', () => {
    const block = renderClassSemantics()
    for (const k of INSTRUCTION_CLASS_KEYS) {
      expect(block).toContain(`${k}:`)
      expect(block).toContain(INSTRUCTION_CLASSES[k].semantics)
    }
    expect(block.split(SUPERSEDES_RULE).length).toBe(2)
    expect(block.split(CONSTRAINS_RULE).length).toBe(2)
  })

  it('names the preserving default for an instruction that cannot be cleanly classified (FR-05)', () => {
    expect(renderClassSemantics()).toMatch(/cannot cleanly classify[\s\S]*\badd\b/i)
  })
})

// AC-19: one table, two consumers — an edit reaches both.
describe('AC-19 — editing the table changes the prompt AND the verifier criteria', () => {
  it('changes the prompt text', () => {
    const edited = { ...INSTRUCTION_CLASSES, remove: { ...INSTRUCTION_CLASSES.remove, semantics: 'EDITED REMOVE SEMANTICS' } }
    const block = renderClassSemantics(edited)
    expect(block).toContain('EDITED REMOVE SEMANTICS')
    expect(block).not.toContain(INSTRUCTION_CLASSES.remove.semantics)
  })

  it('changes the verifier: swapping a post-condition changes checkPostConditions', () => {
    const after = facts([bgLayer(), headline(), body(), logo()]) // untouched
    const input: PostConditionInput = {
      before: BEFORE,
      after,
      supersedes: [],
      constrains: [{ fragment: '#headline', direction: 'decrease' }],
      classes: ['constrain', 'add'],
    }
    const [real] = checkPostConditions(input)
    expect(real).toMatchObject({ class: 'constrain', result: { ok: false } })
    const edited = { ...INSTRUCTION_CLASSES, constrain: { ...INSTRUCTION_CLASSES.constrain, postCondition: () => ({ ok: true as const }) } }
    expect(checkPostConditions(input, edited)).toEqual([{ class: 'constrain', result: { ok: true } }])
  })

  it('changes the verifier: the additive flag is read from the table', () => {
    // remove + add, where the add clause grew the word count.
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), el({ tag: 'p', text: 'A brand new caption that adds many more words than were ever removed from the body copy above it.' }), logo()])
    const input = { after, supersedes: ['Join us for an unforgettable'], classes: ['remove', 'add'] as InstructionClass[] }
    expect(check('remove', input)).toEqual({ ok: true })
    const notAdditive = { ...INSTRUCTION_CLASSES, add: { ...INSTRUCTION_CLASSES.add, additive: false } }
    expect(check('remove', input, notAdditive).ok).toBe(false)
  })

  it('skips add (no deterministic post-condition) in checkPostConditions', () => {
    const input: PostConditionInput = { before: BEFORE, after: BEFORE, supersedes: [], constrains: [], classes: ['add'] }
    expect(checkPostConditions(input)).toEqual([])
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes named and numeric entities and leaves unknown ones', () => {
    expect(decodeHtmlEntities('a&amp;b &quot;q&quot; &#39;s&#x27; &nbsp;&lt;&gt; &bogus;')).toBe(`a&b "q" 's'  <> &bogus;`)
  })
})

// ── replace ───────────────────────────────────────────────────────────────────

describe('replace — the superseded content is present before and gone after', () => {
  it('passes when the old background is gone and the upload took its place', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(), logo()])
    expect(check('replace', { after, supersedes: [OLD_BG] })).toEqual({ ok: true })
  })

  // AC-09: the reported failure — upload added, old background kept underneath.
  it('fails the duplicate-image regression (old background kept alongside the upload)', () => {
    const after = facts([bgLayer(), bgLayer(UPLOAD), headline(), body(), logo()])
    const r = check('replace', { after, supersedes: [OLD_BG] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain(OLD_BG)
  })

  it('fails when a fragment was never in the original (the model named something that is not there)', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(), logo()])
    const r = check('replace', { after, supersedes: [OLD_BG, 'http://minio.local/images/nope.png'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('nope.png')
  })

  it('fails closed on empty supersedes', () => {
    expect(check('replace', { after: BEFORE, supersedes: [] }).ok).toBe(false)
    expect(check('replace', { after: BEFORE, supersedes: ['   '] }).ok).toBe(false)
  })

  it('accepts an image fragment written as a CSS url(...) with quotes, or as a filename', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(), logo()])
    expect(check('replace', { after, supersedes: [`url('${OLD_BG}')`] })).toEqual({ ok: true })
    expect(check('replace', { after, supersedes: ['old-bg.png'] })).toEqual({ ok: true })
  })

  // Minor #6: a URL copied out of an attribute keeps its &amp;.
  it('decodes HTML entities in a fragment before matching', () => {
    const src = 'http://minio.local/images/bg.png?w=1080&h=1080'
    const before = facts([bgLayer(src), headline()])
    const after = facts([bgLayer(UPLOAD), headline()])
    expect(check('replace', { before, after, supersedes: ['http://minio.local/images/bg.png?w=1080&amp;h=1080'] })).toEqual({
      ok: true,
    })
    const textBefore = facts([el({ tag: 'p', text: 'Tom & Jerry' }), headline()])
    const textAfter = facts([el({ tag: 'p', text: 'Road Runner' }), headline()])
    expect(check('replace', { before: textBefore, after: textAfter, supersedes: ['Tom &amp; Jerry'] })).toEqual({ ok: true })
  })

  it('matches visible text case- and whitespace-insensitively (text-transform: uppercase renders differently)', () => {
    const after = facts([bgLayer(), headline(96, 'APPLY NOW'), body(), logo()])
    expect(check('replace', { after, supersedes: ['Industry   Readiness Programme'] })).toEqual({ ok: true })
    expect(check('replace', { after: BEFORE, supersedes: ['industry readiness programme'] }).ok).toBe(false)
  })

  it('matches #id and .class tokens by the content they identify', () => {
    const noLogo = facts([bgLayer(), headline(), body(), el({ tag: 'img', classes: ['badge'], imageSources: [UPLOAD] })])
    expect(check('replace', { after: noLogo, supersedes: ['.logo'] })).toEqual({ ok: true })
    expect(check('replace', { after: BEFORE, supersedes: ['.logo'] }).ok).toBe(false)
    const noHeadlineId = facts([bgLayer(), el({ tag: 'h1', text: 'NEW' }), body(), logo()])
    expect(check('replace', { after: noHeadlineId, supersedes: ['#headline'] })).toEqual({ ok: true })
  })

  // Ruling 3, probe D (false miss): swapping the image on the same .bg element
  // is the natural correct edit.
  it('passes when the image is swapped on the same .bg element (the element survives)', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(), logo()])
    expect(check('replace', { after, supersedes: ['.bg'] })).toEqual({ ok: true })
  })

  // Ruling 3, probe C (false pass): the old URL moved to another element and the
  // new image added alongside it.
  it('fails when the old image moves to another element and the new one is added alongside', () => {
    const after = facts([bgLayer(UPLOAD), bgLayer(OLD_BG, 'underlay'), headline(), body(), logo()])
    const r = check('replace', { after, supersedes: ['.bg'] })
    expect(r.ok).toBe(false)
  })

  it('a .class token does not substring-match image URLs; a hashtag matches visible text', () => {
    const dotted = 'http://minio.local/images/brand.logo.svg'
    const before = facts([logo(), el({ tag: 'img', classes: ['mark'], imageSources: [dotted] }), el({ tag: 'p', text: 'Apply now #IRP' })])
    // The .logo element and its image are gone; an unrelated image whose URL contains ".logo" stays.
    const after = facts([el({ tag: 'img', classes: ['mark'], imageSources: [dotted] }), el({ tag: 'p', text: 'Apply now' })])
    expect(check('replace', { before, after, supersedes: ['.logo'] })).toEqual({ ok: true })
    expect(check('replace', { before, after, supersedes: ['#IRP'] })).toEqual({ ok: true })
  })

  it('with remove co-present, a shortened (not deleted) text fragment satisfies replace too', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(SHORT_BODY), logo()])
    const input = { after, supersedes: [OLD_BG, 'Join us for'], classes: ['replace', 'remove'] as InstructionClass[] }
    expect(check('replace', input)).toEqual({ ok: true })
    const kept = facts([bgLayer(), bgLayer(UPLOAD), headline(), body(SHORT_BODY), logo()])
    expect(check('replace', { ...input, after: kept }).ok).toBe(false)
  })

  // Finding #1 via the replace-with-remove path.
  it('with remove co-present, a phrase merely re-wrapped in <strong> does not satisfy replace', () => {
    const passage = 'Join us for an evening of ideas'
    const before = nested(passage, [el({ tag: 'p', text: passage })])
    const after = nested(passage, [el({ tag: 'p', text: passage }), el({ tag: 'strong', text: 'Join us for' })], 2)
    const r = check('replace', { before, after, supersedes: ['Join us for'], classes: ['replace', 'remove'] })
    expect(r.ok).toBe(false)
  })
})

// ── remove ────────────────────────────────────────────────────────────────────

describe('remove — named content reduced, and the document measurably smaller', () => {
  // AC-08: "reduce the text".
  it('passes when the named passage loses words', () => {
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), logo()])
    expect(check('remove', { after, supersedes: ['Join us for'] })).toEqual({ ok: true })
  })

  it('passes when the named passage is deleted outright', () => {
    const after = facts([bgLayer(), headline(), logo()])
    expect(check('remove', { after, supersedes: ['hands-on workshops'] })).toEqual({ ok: true })
  })

  it('fails when the named passage is unchanged', () => {
    const after = facts([bgLayer(), headline(96, 'IRP'), body(), logo()])
    const r = check('remove', { after, supersedes: ['Join us for'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('Join us for')
  })

  it('fails when the passage shrank but the text was compensated elsewhere', () => {
    const after = facts([
      bgLayer(),
      headline(),
      body(SHORT_BODY),
      el({ tag: 'p', text: 'Plus unforgettable workshops led by industry experts from across the whole region, hands on, all evening, every evening, all week long.' }),
      logo(),
    ])
    expect(check('remove', { after, supersedes: ['Join us for'] }).ok).toBe(false)
  })

  // Finding #1, re-wrap probe: the innermost container shrinks, no character is removed.
  it('fails when the phrase is only re-wrapped in <strong> (nested facts, add co-present)', () => {
    const passage = 'Join us for an evening of ideas'
    const before = nested(`${passage} APPLY`, [el({ tag: 'p', text: passage }), el({ tag: 'span', text: 'APPLY' })])
    const after = nested(`${passage} APPLY and a new caption`, [
      el({ tag: 'p', text: passage }),
      el({ tag: 'strong', text: 'Join us for' }),
      el({ tag: 'span', text: 'APPLY' }),
      el({ tag: 'span', text: 'and a new caption' }),
    ])
    const r = check('remove', { before, after, supersedes: ['Join us for'], classes: ['remove', 'add'] })
    expect(r.ok).toBe(false)
  })

  // Finding #1, split probe: one paragraph becomes two with identical text.
  it('fails when a paragraph is only split into several elements', () => {
    const passage = 'Doors open at six. Talks start at seven.'
    const before = nested(passage, [el({ tag: 'div', text: passage }), el({ tag: 'p', text: passage })])
    const after = nested(passage, [
      el({ tag: 'div', text: passage }),
      el({ tag: 'p', text: 'Doors open at six.' }),
      el({ tag: 'p', text: 'Talks start at seven.' }),
    ])
    const r = check('remove', { before, after, supersedes: ['Doors open at six'], classes: ['remove', 'add'] })
    expect(r.ok).toBe(false)
  })

  it('passes a nested passage that genuinely lost words', () => {
    const passage = 'Doors open at six. Talks start at seven.'
    const before = nested(passage, [el({ tag: 'div', text: passage }), el({ tag: 'p', text: passage })])
    const after = nested('Doors open at six.', [el({ tag: 'div', text: 'Doors open at six.' }), el({ tag: 'p', text: 'Doors open at six.' })])
    expect(check('remove', { before, after, supersedes: ['Doors open at six'] })).toEqual({ ok: true })
  })

  // Finding #2: a 1-character trim is not "measurably shorter".
  it('fails a trim that removes characters but no words', () => {
    const after = facts([bgLayer(), headline(), body(LONG_BODY.replace('workshops', 'workshop')), logo()])
    const r = check('remove', { after, supersedes: ['hands-on workshops'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/word count|whole words/)
  })

  it('accepts an image removal ("remove the logo") when every fragment is an image', () => {
    const after = facts([bgLayer(), headline(), body()])
    expect(check('remove', { after, supersedes: [LOGO] })).toEqual({ ok: true })
    expect(check('remove', { after, supersedes: ['.logo'] })).toEqual({ ok: true })
  })

  // Finding #2: image shrinkage does not stand in for a text fragment.
  it('does not let an image removal satisfy a text fragment whose passage lost no words', () => {
    const after = facts([bgLayer(), headline(), body(LONG_BODY.replace('region.', 'region'))])
    const r = check('remove', { after, supersedes: ['hands-on workshops led', LOGO] })
    expect(r.ok).toBe(false)
  })

  it('fails when an image fragment is still present', () => {
    expect(check('remove', { after: BEFORE, supersedes: [LOGO] }).ok).toBe(false)
  })

  it('reduces a text-only .class token: shorter text on the surviving element passes, unchanged fails', () => {
    const badge = (text: string) => el({ tag: 'span', classes: ['promo-badge'], text })
    const before = facts([headline(), badge('Limited seats available now')])
    expect(check('remove', { before, after: facts([headline(), badge('Limited seats')]), supersedes: ['.promo-badge'] })).toEqual({ ok: true })
    expect(check('remove', { before, after: before, supersedes: ['.promo-badge'] }).ok).toBe(false)
  })

  it('fails when a fragment was never in the original', () => {
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), logo()])
    expect(check('remove', { after, supersedes: ['this phrase never existed'] }).ok).toBe(false)
  })

  it('fails closed on empty supersedes', () => {
    expect(check('remove', { after: facts([bgLayer(), headline()]), supersedes: [] }).ok).toBe(false)
  })

  it('stands the word-count check down when add is co-present, but still requires the passage reduced', () => {
    const after = facts([
      bgLayer(),
      headline(),
      body(SHORT_BODY),
      el({ tag: 'img', classes: ['person'], imageSources: [UPLOAD] }),
      el({ tag: 'p', text: 'A new caption line that is much longer than the text that was removed from the body.' }),
      logo(),
    ])
    const input = { after, supersedes: ['Join us for'], classes: ['remove', 'add'] as InstructionClass[] }
    expect(check('remove', input)).toEqual({ ok: true })
    expect(check('remove', { ...input, after: facts([...BEFORE.elements, el({ tag: 'p', text: 'extra' })]) }).ok).toBe(false)
  })
})

// ── constrain ─────────────────────────────────────────────────────────────────

describe('constrain — the named target changes in the stated direction, nothing added', () => {
  const smaller = [{ fragment: '#headline', direction: 'decrease' as const }]

  // The worked example: "make the headline smaller".
  it('passes when the headline font-size drops and nothing is added', () => {
    const after = facts([bgLayer(), headline(72, undefined, { width: 900, height: 150 }), body(), logo()])
    expect(check('constrain', { after, constrains: smaller })).toEqual({ ok: true })
  })

  // Probe E: "smaller" but 96px → 140px.
  it('fails when the target moves in the wrong direction', () => {
    const after = facts([bgLayer(), headline(140, undefined, { width: 900, height: 290 }), body(), logo()])
    const r = check('constrain', { after, constrains: smaller })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/did not decrease/)
  })

  // Probe F: constrain + add, the add clause applied, the headline untouched.
  it('fails constrain+add when the headline is untouched', () => {
    const after = facts([bgLayer(), headline(), body(), logo(), el({ tag: 'img', classes: ['person'], imageSources: [UPLOAD] })])
    const r = check('constrain', { after, constrains: smaller, classes: ['constrain', 'add'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/unchanged/)
  })

  it('passes constrain+add when the target shrank, even though the add clause added content', () => {
    const after = facts([bgLayer(), headline(72), body(), logo(), el({ tag: 'img', classes: ['person'], imageSources: [UPLOAD] })])
    expect(check('constrain', { after, constrains: smaller, classes: ['constrain', 'add'] })).toEqual({ ok: true })
  })

  it('fails when constrain is the only class and a badge is added', () => {
    const after = facts([bgLayer(), headline(72), el({ tag: 'span', text: 'NEW' }), body(), logo()])
    expect(check('constrain', { after, constrains: smaller }).ok).toBe(false)
  })

  it('fails when constrain is the only class and a new image source appears', () => {
    const after = facts([bgLayer(UPLOAD), headline(72), body(), logo()])
    const r = check('constrain', { after, constrains: smaller })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain(UPLOAD)
  })

  it('passes an increase ("make the logo bigger") and fails it when the logo shrinks', () => {
    const bigger = [{ fragment: '.logo', direction: 'increase' as const }]
    expect(check('constrain', { after: facts([bgLayer(), headline(), body(), logo({ width: 300, height: 120 })]), constrains: bigger })).toEqual({ ok: true })
    expect(check('constrain', { after: facts([bgLayer(), headline(), body(), logo({ width: 100, height: 40 })]), constrains: bigger }).ok).toBe(false)
  })

  it('with no direction, any measurable change passes', () => {
    const after = facts([bgLayer(), headline(), body(), logo({ width: 120, height: 48 })])
    expect(check('constrain', { after, constrains: [{ fragment: '.logo' }] })).toEqual({ ok: true })
  })

  it('passes a text-length bound ("keep the body under 12 words") targeted by a phrase', () => {
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), logo()])
    expect(check('constrain', { after, constrains: [{ fragment: 'Join us for', direction: 'decrease' }] })).toEqual({ ok: true })
  })

  it('fails when the target no longer exists', () => {
    const after = facts([bgLayer(), body(), logo()])
    const r = check('constrain', { after, constrains: smaller })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/gone/)
  })

  it('fails when the target does not identify anything in the original', () => {
    const after = facts([bgLayer(), headline(72), body(), logo()])
    expect(check('constrain', { after, constrains: [{ fragment: '#subtitle', direction: 'decrease' }] }).ok).toBe(false)
  })

  it('fails closed with no target named', () => {
    const after = facts([bgLayer(), headline(72), body(), logo()])
    expect(check('constrain', { after, constrains: [] }).ok).toBe(false)
    expect(check('constrain', { after, constrains: [{ fragment: '  ' }] }).ok).toBe(false)
  })
})

// ── Fix round 2 probes ────────────────────────────────────────────────────────

describe('fix round 2 — a named text passage must lose words (finding 1)', () => {
  const reworded = LONG_BODY.replace('an unforgettable evening', 'a truly memorable evening')

  // Probe I1a: the named phrase is reworded out, the passage gets LONGER, and an
  // add clause stands the whole-document word count down.
  it('remove+add: fails when the phrase is reworded out and the passage grows', () => {
    const after = facts([bgLayer(), headline(), body(reworded), el({ tag: 'p', classes: ['caption'], text: 'New caption here' }), logo()])
    const r = check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] })
    expect(r.ok).toBe(false)
  })

  it('replace+remove: fails the same rewording through the replace-with-remove path', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(reworded), logo()])
    const r = check('replace', { after, supersedes: [OLD_BG, 'unforgettable evening'], classes: ['replace', 'remove'] })
    expect(r.ok).toBe(false)
  })

  it('remove+add: fails when the phrase survives but the passage only swaps a word', () => {
    const after = facts([bgLayer(), headline(), body(LONG_BODY.replace('region', 'nation')), el({ tag: 'p', classes: ['caption'], text: 'Cap' }), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  it('remove+add: passes when the passage genuinely loses words (phrase kept)', () => {
    const after = facts([
      bgLayer(),
      headline(),
      body('Join us for an unforgettable evening of workshops.'),
      el({ tag: 'p', classes: ['caption'], text: 'A caption with many many many many many many many many many many words' }),
      logo(),
    ])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] })).toEqual({ ok: true })
  })

  it('remove: passes when the phrase is reworded out and the passage loses words', () => {
    const after = facts([bgLayer(), headline(), body('Join us for a memorable evening of workshops.'), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'] })).toEqual({ ok: true })
  })
})

describe('fix round 2 — a token on an element with an image AND its own text covers both (finding 2)', () => {
  const BADGE = 'http://minio.local/images/badge.png'
  const badge = (src: string | null, text = 'LIMITED SEATS') =>
    el({ tag: 'div', classes: ['promo-badge'], text, imageSources: src ? [src] : [] })
  const before = facts([bgLayer(), headline(), badge(BADGE)])

  it('replace .promo-badge: fails when the image is swapped but the old text kept', () => {
    const after = facts([bgLayer(), headline(), badge(UPLOAD)])
    expect(check('replace', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
  })

  it('replace .promo-badge: fails when the image is dropped and the old text moved to a <span> beside a new badge', () => {
    const after = facts([
      bgLayer(),
      headline(),
      el({ tag: 'span', text: 'LIMITED SEATS' }),
      el({ tag: 'div', classes: ['new-badge'], text: 'SOLD OUT' }),
    ])
    expect(check('replace', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
  })

  it('remove .promo-badge: fails when the image is gone but the text moved to a <span>', () => {
    const after = facts([bgLayer(), headline(), el({ tag: 'span', text: 'LIMITED SEATS' })], { elementCount: 3 })
    expect(check('remove', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
  })

  it('replace .promo-badge: passes when both the image and the text are replaced on the same element', () => {
    const after = facts([bgLayer(), headline(), badge(UPLOAD, 'SOLD OUT')])
    expect(check('replace', { before, after, supersedes: ['.promo-badge'] })).toEqual({ ok: true })
  })

  it('a container whose text contains a child element\'s shorter text is not a leaf: its images alone identify it', () => {
    // .hero carries the background AND wraps the headline (its text is the headline's).
    const hero = (src: string) => el({ tag: 'section', classes: ['hero'], imageSources: [src], text: 'INDUSTRY READINESS PROGRAMME Apply' })
    const b = facts([hero(OLD_BG), headline(), el({ tag: 'span', text: 'Apply' })], { text: 'INDUSTRY READINESS PROGRAMME Apply' })
    const a = facts([hero(UPLOAD), headline(), el({ tag: 'span', text: 'Apply' })], { text: 'INDUSTRY READINESS PROGRAMME Apply' })
    expect(check('replace', { before: b, after: a, supersedes: ['.hero'] })).toEqual({ ok: true })
  })
})

describe('fix round 2 — constrain measures the target, not a same-shape newcomer (finding 3)', () => {
  it('constrain+add: fails when the body is untouched and a short same-shape <p> is inserted before it', () => {
    const after = facts([bgLayer(), headline(), body('Short new caption.'), body(), logo()])
    const r = check('constrain', {
      after,
      constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }],
      classes: ['constrain', 'add'],
    })
    expect(r.ok).toBe(false)
  })

  it('phrase gone: a moderately cut passage is found by word overlap', () => {
    const after = facts([bgLayer(), headline(), body(LONG_BODY.replace('hands-on workshops', 'workshops')), logo()])
    expect(check('constrain', { after, constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }] })).toEqual({ ok: true })
  })

  // Fix round 3 ruling: with the phrase gone, a passage keeping under half its
  // words has no counterpart and reads as gone — fail-closed for a constrain.
  it('phrase gone: a passage that kept under half its words reads as gone (fail closed)', () => {
    const after = facts([bgLayer(), headline(), body('Join us for an evening.'), logo()])
    const r = check('constrain', { after, constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/gone/)
  })
})

// ── Fix round 3 probes ────────────────────────────────────────────────────────

describe('fix round 3 — the passage counterpart, not an innermost wrapper or a newcomer (findings 1 & 2)', () => {
  const swapped = LONG_BODY.replace('region', 'nation')
  const reworded = LONG_BODY.replace('an unforgettable evening', 'a truly memorable evening')
  const pullQuote = (text: string, fontSizePx = 40) =>
    el({ tag: 'blockquote', classes: ['pull-quote'], text, fontSizePx, box: { width: 600, height: 80 } })

  // N1: one word swapped in the body, the phrase also wrapped in <strong>, caption added.
  it('N1 remove+add: fails when the phrase is wrapped in <strong> and the body only swaps a word', () => {
    const after = nested(`INDUSTRY READINESS PROGRAMME ${swapped} Cap`, [
      bgLayer(),
      headline(),
      body(swapped),
      el({ tag: 'strong', text: 'unforgettable evening' }),
      el({ tag: 'p', classes: ['caption'], text: 'Cap' }),
    ])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  // N2: a new pull-quote repeats the phrase; the body only swaps a word.
  it('N2 remove+add: fails when a new pull-quote repeats the phrase and the body only swaps a word', () => {
    const after = facts([bgLayer(), headline(), body(swapped), pullQuote('An unforgettable evening'), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  // N3: the regression from the round-2 counterpart — the pull-quote was measured instead of the body.
  it('N3 constrain+add: fails when the body is untouched and a smaller pull-quote repeats the target phrase', () => {
    const after = facts([bgLayer(), headline(), body(), logo(), pullQuote('Hands-on workshops', 28)])
    const r = check('constrain', {
      after,
      constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }],
      classes: ['constrain', 'add'],
    })
    expect(r.ok).toBe(false)
  })

  // N4 / N4b: phrase reworded out, passage grows, a short same-shape <p> inserted BEFORE it.
  it('N4 remove+add: fails when the phrase is reworded out and a short same-shape <p> is inserted before the grown passage', () => {
    const after = facts([bgLayer(), headline(), body('Short new caption.'), body(reworded), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  it('N4b replace+remove: fails the same with the background swapped', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body('Short new caption.'), body(reworded), logo()])
    const input = { after, supersedes: [OLD_BG, 'unforgettable evening'], classes: ['replace', 'remove'] as InstructionClass[] }
    expect(check('replace', input).ok).toBe(false)
    expect(check('remove', input).ok).toBe(false)
  })

  it('phrase gone: finds the same-shape passage by word overlap past an inserted caption', () => {
    const cut = LONG_BODY.replace('hands-on workshops', 'workshops')
    const after = facts([bgLayer(), headline(), body('Short new caption.'), body(cut), logo()])
    expect(
      check('constrain', { after, constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }], classes: ['constrain', 'add'] }),
    ).toEqual({ ok: true })
  })

  it('phrase survives: the same-shape holder is measured even when a shorter wrapper also holds it', () => {
    const shorter = 'Join us for an unforgettable evening of workshops.'
    const after = nested(`INDUSTRY READINESS PROGRAMME ${shorter}`, [
      bgLayer(),
      headline(),
      body(shorter),
      el({ tag: 'strong', text: 'unforgettable evening' }),
    ])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] })).toEqual({ ok: true })
  })
})

describe('fix round 3 — a short label elsewhere does not make a badge a container (finding 3)', () => {
  const BADGE = 'http://minio.local/images/badge.png'
  const badge = (src: string, text: string) => el({ tag: 'div', classes: ['promo-badge'], text, imageSources: [src] })
  const cases: Array<[string, string]> = [
    ['LIMITED SEATS', 'SEATS'],
    ['APPLY NOW', 'Apply'],
    ['IRP 2026', 'IRP'],
  ]

  for (const [badgeText, labelText] of cases) {
    const label = el({ tag: 'span', classes: ['label'], text: labelText })

    it(`label "${labelText}" BEFORE badge "${badgeText}": image swapped, text kept → miss`, () => {
      const before = facts([label, headline(), badge(BADGE, badgeText)])
      const after = facts([label, headline(), badge(UPLOAD, badgeText)])
      expect(check('replace', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
    })

    it(`label "${labelText}" right AFTER badge "${badgeText}": image swapped, text kept → miss`, () => {
      const before = facts([headline(), badge(BADGE, badgeText), label])
      const after = facts([headline(), badge(UPLOAD, badgeText), label])
      expect(check('replace', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
    })
  }

  it('a badge whose text lives in a child <span> of the same text: image swapped, text kept → miss (N8)', () => {
    const span = el({ tag: 'span', text: 'LIMITED SEATS' })
    const before = nested('LIMITED SEATS', [badge(BADGE, 'LIMITED SEATS'), span])
    const after = nested('LIMITED SEATS', [badge(UPLOAD, 'LIMITED SEATS'), span])
    expect(check('replace', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
  })

  it('a container whose descendants follow it (pre-order) is still a container', () => {
    const hero = (src: string) =>
      el({ tag: 'section', classes: ['hero'], imageSources: [src], text: 'INDUSTRY READINESS PROGRAMME Apply now' })
    const kids = [headline(), el({ tag: 'a', classes: ['cta'], text: 'Apply now' })]
    const text = 'INDUSTRY READINESS PROGRAMME Apply now'
    expect(check('replace', { before: nested(text, [hero(OLD_BG), ...kids]), after: nested(text, [hero(UPLOAD), ...kids]), supersedes: ['.hero'] })).toEqual({
      ok: true,
    })
  })

  // N7 — accepted as fail-closed: an image container whose ONLY text is one child
  // is indistinguishable from a leaf, so "replace .hero" keeping the headline misses.
  it('N7: a hero wrapping only its headline counts as a leaf (fail-closed, accepted)', () => {
    const hero = (src: string) => el({ tag: 'section', classes: ['hero'], imageSources: [src], text: 'INDUSTRY READINESS PROGRAMME' })
    expect(check('replace', { before: facts([hero(OLD_BG), headline()]), after: facts([hero(UPLOAD), headline()]), supersedes: ['.hero'] }).ok).toBe(false)
  })
})

// ── Final fix wave (Wave 3) probes ────────────────────────────────────────────

describe('final fix — with an additive class co-present, remove counts words across the passage\'s shape (I3)', () => {
  const swapped = LONG_BODY.replace('region', 'nation')
  const reworded = LONG_BODY.replace('an unforgettable evening', 'a truly memorable evening')
  const tagline = el({ tag: 'div', classes: ['tagline'], text: 'Your future starts here' })

  // SPLIT: "reduce the text and add a tagline" — the body is split into two
  // same-shape paragraphs with one word inserted (20 → 21 words) and a tagline
  // added. The counterpart used to pick the shorter half.
  it('SPLIT remove+add: fails when the body is split into two same-shape halves that together gained a word', () => {
    const after = facts([
      bgLayer(),
      headline(),
      body('Join us for an unforgettable evening of ideas, networking and hands-on workshops'),
      body('led by top industry experts from across the region.'),
      tagline,
      logo(),
    ])
    const r = check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/p\.body-copy/)
  })

  it('R1 remove+add: fails when the body swaps one word and a new same-shape <p> repeats the phrase', () => {
    const after = facts([bgLayer(), headline(), body(swapped), body('An unforgettable evening awaits.'), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  it('R1b remove+add: fails when the body is reworded longer and a new same-shape <p> repeats the phrase', () => {
    const after = facts([bgLayer(), headline(), body(reworded), body('An unforgettable evening awaits.'), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  it('R1 mid-passage remove+replace: fails when the background is swapped, the body swaps a word and a same-shape <p> repeats a mid-passage phrase', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(swapped), body('Hands-on workshops await.'), logo()])
    const results = checkPostConditions({
      before: BEFORE,
      after,
      supersedes: [OLD_BG, 'hands-on workshops'],
      constrains: [],
      classes: ['replace', 'remove'],
    })
    expect(results.some((x) => !x.result.ok)).toBe(true)
  })

  // Guards: genuine reductions still pass with an additive class co-present.
  it('remove+add: passes a split whose same-shape halves together lost words', () => {
    const after = facts([
      bgLayer(),
      headline(),
      body('Join us for an unforgettable evening of ideas.'),
      body('Workshops led by industry experts.'),
      tagline,
      logo(),
    ])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] })).toEqual({ ok: true })
  })

  it('remove+replace: passes a shortened body with the background swapped', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(SHORT_BODY), logo()])
    const results = checkPostConditions({
      before: BEFORE,
      after,
      supersedes: [OLD_BG, 'Join us for'],
      constrains: [],
      classes: ['replace', 'remove'],
    })
    expect(results.every((x) => x.result.ok)).toBe(true)
  })

  // Accepted consequence of the ruling: a deliberately added paragraph with the
  // passage's own tag+classes counts against the reduction (fail closed).
  it('remove+add: a long same-shape paragraph added alongside a shortened body fails closed (accepted)', () => {
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), body('A brand new paragraph that the add clause asked for, written at length.'), logo()])
    expect(check('remove', { after, supersedes: ['Join us for'], classes: ['remove', 'add'] }).ok).toBe(false)
  })
})

describe('final fix — the phrase-gone word overlap counts DISTINCT words (R3)', () => {
  it('R3 constrain+add: fails when the passage is deleted and a same-shape <p> repeats one of its words', () => {
    const after = facts([bgLayer(), headline(), body('join join join join join join join join join join join'), logo()])
    const r = check('constrain', {
      after,
      constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }],
      classes: ['constrain', 'add'],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/gone/)
  })
})

// T17 — the flat supersedes list serves both clauses of a replace+remove
// instruction. A text/token fragment whose passage was rewritten WHOLESALE
// (under half its distinct words kept, phrase gone) is the replace clause's —
// replace may reuse the same element, so the id fallback must not re-identify
// the rewritten element as a passage that "failed to shrink".
describe('T17 — replace+remove with one flat supersedes: a wholesale-replaced text fragment is the replace clause\'s', () => {
  const NEW_HEADLINE = 'APPLY NOW FOR THE 2027 COHORT AND LAUNCH YOUR CAREER WITH US'
  const both = (supersedes: string[], after: DomFacts) =>
    checkPostConditions({ before: BEFORE, after, supersedes, constrains: [], classes: ['replace', 'remove'] })

  it('"change the headline to X and remove the logo" passes when correctly applied (phrase fragment, element reused by id)', () => {
    const after = facts([bgLayer(), headline(96, NEW_HEADLINE), body()])
    const results = both(['INDUSTRY READINESS PROGRAMME', '.logo'], after)
    expect(results.map((r) => [r.class, r.result])).toEqual([
      ['replace', { ok: true }],
      ['remove', { ok: true }],
    ])
  })

  it('passes the same with a #id token fragment for the headline', () => {
    const after = facts([bgLayer(), headline(96, NEW_HEADLINE), body()])
    expect(both(['#headline', '.logo'], after).every((r) => r.result.ok)).toBe(true)
  })

  it('still fails when the logo is kept (the remove clause did nothing)', () => {
    const after = facts([bgLayer(), headline(96, NEW_HEADLINE), body(), logo()])
    const results = both(['INDUSTRY READINESS PROGRAMME', '.logo'], after)
    expect(results.some((r) => !r.result.ok)).toBe(true)
  })

  it('still fails when the headline is kept (the replace clause did nothing)', () => {
    const after = facts([bgLayer(), headline(), body()])
    const results = both(['INDUSTRY READINESS PROGRAMME', '.logo'], after)
    expect(results.find((r) => r.class === 'replace')?.result.ok).toBe(false)
  })

  it('a rewording that keeps most of the passage is not a replacement — remove still requires fewer words', () => {
    const reworded = LONG_BODY.replace('an unforgettable evening', 'a truly memorable evening')
    const after = facts([bgLayer(UPLOAD), headline(), body(reworded), logo()])
    const results = both([OLD_BG, 'unforgettable evening'], after)
    expect(results.find((r) => r.class === 'remove')?.result.ok).toBe(false)
  })

  it('the exemption is replace-only: remove+add still rejects a passage rewritten wholesale and longer', () => {
    const after = facts([bgLayer(), headline(), body('Completely different words describing another thing entirely, at even greater length than before, so that this new passage runs well past the twenty words of the original body.'), logo()])
    const r = check('remove', { after, supersedes: ['Join us for'], classes: ['remove', 'add'] })
    expect(r.ok).toBe(false)
  })
})

// ── Final fix wave F1 (change 004 final review, slice 1) ─────────────────────

// C-1: the reported duplicate shape is "the uploaded image applied as the
// background AND kept as a separate inset" (proposal.md:18). Refine has no
// upload, so "the uploaded image" is an <img> already in the design. The check
// used to certify that duplicate (supersedes = the old background URL, which is
// gone) and miss the correct move whenever supersedes named the moved image.
describe('final F1 / C-1 — replace: no existing image may appear more often, and a moved image must leave its old place', () => {
  const inset = (src = UPLOAD, cls: string[] = ['inset']) => el({ tag: 'img', classes: cls, imageSources: [src], box: { width: 300, height: 300 } })
  const before = facts([bgLayer(OLD_BG), headline(), body(), inset()])
  // The duplicate: the upload is the background AND still the inset.
  const dup = facts([bgLayer(UPLOAD), headline(), body(), inset()])
  // The correct move: the upload is the background, the inset is gone.
  const moved = facts([bgLayer(UPLOAD), headline(), body()])
  const replace = (after: DomFacts, supersedes: string[], classes: InstructionClass[] = ['replace'], b: DomFacts = before) =>
    check('replace', { before: b, after, supersedes, classes })

  // Every supersedes form the replace semantics allow for this instruction.
  const FORMS: string[][] = [[OLD_BG], [UPLOAD], ['.inset'], [OLD_BG, '.inset'], [OLD_BG, UPLOAD], ['upload.jpg'], [`url('${OLD_BG}')`, '.inset']]

  for (const supersedes of FORMS) {
    it(`probe1 duplicate MISSES — supersedes ${JSON.stringify(supersedes)}`, () => {
      const r = replace(dup, supersedes)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/^replace: /)
    })
    it(`probe1 correct move PASSES — supersedes ${JSON.stringify(supersedes)}`, () => {
      expect(replace(moved, supersedes)).toEqual({ ok: true })
    })
  }

  it('the duplicate reason names the image whose count grew, and the counts', () => {
    const r = replace(dup, [OLD_BG])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toContain(UPLOAD)
      expect(r.reason).toMatch(/1 → 2/)
    }
  })

  it('a moved inset with no class of its own passes when it leaves (another <img> of a different shape stays)', () => {
    const b = facts([bgLayer(OLD_BG), headline(), inset(UPLOAD, []), logo()])
    const a = facts([bgLayer(UPLOAD), headline(), logo()])
    expect(replace(a, [UPLOAD], ['replace'], b)).toEqual({ ok: true })
    expect(replace(a, [OLD_BG, UPLOAD], ['replace'], b)).toEqual({ ok: true })
  })

  // Changed by final F1b (Important 1, the vacated-slot rule): a swap whose two
  // images trade places on the SAME slots ("use the upload as the background
  // and put the old one in the inset") is a correct move and passes in every
  // form. A swap onto a renamed/new slot still misses (see the F1b block).
  // Changed again by final F1c: only when the instruction asks for the move.
  // Changed a third time by final F1d (controller ruling): move intent is gone,
  // so the swap MISSES in every form whatever the instruction — even an
  // explicitly requested swap fails closed ("not applied" + Use anyway).
  it('final F1d: a SWAP onto the same slots (upload to .bg, old background into .inset) misses in every form, even when the instruction asks for it', () => {
    const swapped = facts([bgLayer(UPLOAD), headline(), body(), inset(OLD_BG)])
    for (const supersedes of [[OLD_BG], [UPLOAD], ['.inset'], [OLD_BG, '.inset']]) {
      for (const instruction of [
        undefined,
        'use the upload as the background',
        'use the upload as the background and put the old one in the inset',
        'swap the background and the inset',
      ]) {
        const r = check('replace', { before, after: swapped, supersedes, classes: ['replace'], instruction })
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toMatch(/^replace: .*still present/)
      }
    }
  })

  it('the old background layered underneath on a NEW element still misses by URL (the element it identified survives)', () => {
    const layered = facts([bgLayer(UPLOAD), bgLayer(OLD_BG, 'underlay'), headline(), body()])
    expect(replace(layered, [OLD_BG], ['replace'], facts([bgLayer(OLD_BG), headline(), body()])).ok).toBe(false)
  })

  it('a moved image kept on an element with the same id misses (the identified element survives)', () => {
    const b = facts([bgLayer(OLD_BG), el({ tag: 'img', id: 'photo', imageSources: [UPLOAD] })])
    const a = facts([bgLayer(UPLOAD), el({ tag: 'img', id: 'photo', imageSources: [UPLOAD] })])
    expect(replace(a, [UPLOAD], ['replace'], b).ok).toBe(false)
    const gone = facts([bgLayer(UPLOAD)])
    expect(replace(gone, [UPLOAD], ['replace'], b)).toEqual({ ok: true })
  })

  it('an unrelated existing image duplicated by a replace misses (multiplicity holds for every BEFORE image)', () => {
    const a = facts([bgLayer(UPLOAD), headline(), body(), logo(), logo()])
    const r = check('replace', { after: a, supersedes: [OLD_BG] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain(LOGO)
  })

  it('a NEW image may appear any number of times; an image kept at its count is fine', () => {
    const a = facts([bgLayer(UPLOAD), bgLayer(UPLOAD, 'echo'), headline(), body(), logo()])
    expect(check('replace', { after: a, supersedes: [OLD_BG] })).toEqual({ ok: true })
  })

  it('holds with remove co-present (replace+remove): the duplicate misses, the move passes', () => {
    const shorter = (f: DomFacts) => facts(f.elements.map((e) => (e.tag === 'p' ? body(SHORT_BODY) : e)))
    expect(replace(shorter(dup), [OLD_BG, 'Join us for'], ['replace', 'remove']).ok).toBe(false)
    expect(replace(shorter(moved), [OLD_BG, 'Join us for'], ['replace', 'remove'])).toEqual({ ok: true })
    expect(replace(shorter(moved), ['.inset', 'Join us for'], ['replace', 'remove'])).toEqual({ ok: true })
  })

  it('the replace example steers to the unambiguous form: name the old background AND the moved image\'s old place, and say an image may not appear more often', () => {
    const s = INSTRUCTION_CLASSES.replace.semantics
    expect(s).toMatch(/uploaded image as the background/)
    expect(s).toMatch(/more often/i)
    // The example lists both the old background and the image's previous element.
    expect(s).toMatch(/supersedes \["<the current background image URL[^\]]*", "<[^\]]*(old|previous|current) (element|place)/i)
  })
})

// I-2: a self-classified "reduce the text" could pass with a LONGER rewrite —
// as replace (contentAbsent only needs the phrase gone) or replace+remove (the
// wholesale exemption). A narrow lexicon on the instruction adds a
// deterministic word-count decrease, whatever the classes.
describe('final F1 / I-2 — the text-reduction lexicon adds a visible-word-count decrease', () => {
  const H = 'Join the Industry Readiness Programme'
  const P = 'Our twelve week programme gives undergraduates hands on experience with real client projects and mentors'
  const mk = (h: string, p: string) =>
    nested(`${h} ${p}`, [el({ tag: 'body', text: `${h} ${p}` }), el({ tag: 'h1', text: h }), el({ tag: 'p', classes: ['body-copy'], text: p })])
  const B = mk(H, P)
  // probe2: a 20→28-word rewrite.
  const LONGER = mk(H, 'This intensive and immersive twelve week journey equips every ambitious undergraduate with practical, hands on exposure to genuine client engagements alongside seasoned industry mentors and peers')
  // probe4: a wholesale rewrite, longer.
  const WHOLESALE = mk(H, 'Discover an immersive curriculum where ambitious students build genuine portfolios through practical engagements supervised by seasoned professionals across many sectors every single day')
  const SHORTER = mk(H, 'Twelve weeks of real client projects and mentors')
  const run = (after: DomFacts, classes: InstructionClass[], instruction = 'reduce the text') =>
    checkPostConditions({ before: B, after, supersedes: ['twelve week programme gives'], constrains: [], classes, instruction })
  const allOk = (rs: ReturnType<typeof run>) => rs.every((r) => r.result.ok)

  for (const [name, after] of [['probe2 longer rewrite', LONGER], ['probe4 wholesale rewrite', WHOLESALE]] as const) {
    for (const classes of [['replace'], ['replace', 'remove'], ['remove'], ['add'], ['replace', 'add']] as InstructionClass[][]) {
      it(`${name} under ${JSON.stringify(classes)} MISSES`, () => {
        const rs = run(after, classes)
        expect(allOk(rs)).toBe(false)
        const tr = rs.find((r) => r.class === TEXT_REDUCTION_CHECK)
        expect(tr?.result.ok).toBe(false)
        if (tr && !tr.result.ok) expect(tr.result.reason).toMatch(/^text reduction: .*\d+ → \d+/)
      })
    }
  }

  // final F1d (Important 2): the re-review's q3 — a longer rewrite under a
  // misclassified replace passed with zero calls for these phrasings.
  for (const instruction of ['cut the text in half', 'reduce the text a bit more', 'cut the text down', 'reduce the text more', 'reduce the text it is too busy', 'reduce the text to make it cleaner']) {
    it(`probe2 longer rewrite under ["replace"] MISSES for ${JSON.stringify(instruction)}`, () => {
      const tr = run(LONGER, ['replace'], instruction).find((r) => r.class === TEXT_REDUCTION_CHECK)
      expect(tr?.result.ok).toBe(false)
    })
  }

  it('a real reduction passes the lexicon check under every class set', () => {
    for (const classes of [['replace'], ['replace', 'remove'], ['remove'], ['add']] as InstructionClass[][]) {
      expect(run(SHORTER, classes).find((r) => r.class === TEXT_REDUCTION_CHECK)?.result).toEqual({ ok: true })
    }
  })

  it('without the instruction (or outside the lexicon) no lexicon check runs — the known limit', () => {
    const rs = checkPostConditions({ before: B, after: LONGER, supersedes: ['twelve week programme gives'], constrains: [], classes: ['replace'] })
    expect(rs.find((r) => r.class === TEXT_REDUCTION_CHECK)).toBeUndefined()
    expect(run(LONGER, ['replace'], 'rewrite the paragraph').find((r) => r.class === TEXT_REDUCTION_CHECK)).toBeUndefined()
  })

  const TRIGGERS = [
    'reduce the text',
    'Reduce the text',
    'please reduce the body text a bit',
    'shorten the description',
    'shorten the caption',
    'trim the copy',
    'cut down the wording',
    'cut the words "Limited seats" from the badge',
    'condense the paragraph',
    'reduce the amount of text',
    'reduce the number of words',
    'reduce the word count',
    'use less text',
    'fewer words please',
    'less copy on the poster',
    'make the text shorter',
    'make the copy more concise',
    'keep the caption shorter',
    'shorter text',
    'more concise copy',
    'make the body text a bit shorter',
    'shorten the paragraphs and add a logo',
    // final F1b (Minor 3 + the clause boundary):
    'reduce the supporting text.',
    'reduce the texts',
    'reduce the text on the right panel',
    'reduce the text by half',
    'reduce the body text, and make the logo bigger',
    // final F1d (Important 2): tails F1 caught that F1b's boundary dropped.
    'cut the text in half',
    'reduce the text a bit more',
    'cut the text down',
    'reduce the text more',
    'reduce the text even more',
    'reduce the text again',
    'reduce the text overall',
    'reduce the text here',
    'reduce the text everywhere',
    'reduce the text for mobile',
    'reduce the text by a lot',
    'reduce the text by about half',
    'reduce the text within the card',
    'reduce the text inside the card',
    'cut the copy in half',
    'shorten the copy a bit more',
    'reduce the text down',
    'reduce the text it is too busy',
    // final F1d (Minor 3): this one does trigger, and should.
    'reduce the text so it fits',
    // final F1d (optional): a closed list of purpose clauses.
    'reduce the text to make it cleaner',
    // final F1d: tails combine, and chat-style pronoun clauses.
    'trim the text down a bit',
    'reduce the text a lot more on the poster',
    'reduce the text by half again',
    "reduce the copy, it's too busy",
    'reduce the text that is far too much',
    'reduce the text there is too much',
    'reduce the text, and logo placement too',
  ]
  const NON_TRIGGERS = [
    'reduce the logo size',
    'make the image smaller',
    'reduce the padding',
    'reduce the text size',
    'reduce the font size of the body text',
    'make the headline smaller',
    'reduce the size of the text',
    'cut the image in half',
    'trim the photo',
    'less padding',
    'fewer images',
    'shorten the logo bar',
    'reduce the body padding',
    'make the text smaller',
    'reduce the text spacing',
    'reduce the text opacity',
    'include a human character',
    'reduce it',
    'make the caption navy',
    'reduce the line height of the text',
    // final F1b (Important 2): resize and style refines — no clause boundary
    // after the object, or the content noun is a modifier of a visual word.
    'reduce the body text size',
    'reduce the caption text size',
    'reduce the body copy font size',
    'reduce the description text size',
    'reduce the body text weight',
    'reduce the text overlay',
    'reduce the text background',
    'reduce the text letter-spacing',
    'reduce the text-shadow',
    'reduce the text border',
    'reduce the text outline',
    'reduce the text glow',
    'reduce the text container',
    'reduce the text panel',
    'reduce the text card',
    "reduce the text's size",
    'reduce the text’s size',
    'reduce the text in size',
    'reduce the text by 2px',
    'reduce the text by 4pt',
    'reduce the text by 0.5rem',
    'reduce the text by 20%',
    'reduce the text brightness',
    // final F1b: the re-review's "checked and correct" non-triggers, pinned.
    'cut to the chase in the headline',
    'trim the border',
    'reduce the gap between the text and the image',
    'fewer colours',
    'shorter line spacing',
    'make the caption area smaller',
    // final F1d: the new tails never carry a size, and need a boundary.
    'reduce the text a bit smaller',
    'reduce the text down to 12px',
    'reduce the text more than the logo',
    'reduce the text by about 2px',
    'reduce the text by about 20%',
    'reduce the text to make it smaller',
    'reduce the text for the logo size',
  ]
  for (const t of TRIGGERS) it(`lexicon matches: ${JSON.stringify(t)}`, () => expect(asksForTextReduction(t)).toBe(true))
  for (const t of NON_TRIGGERS) it(`lexicon does NOT match: ${JSON.stringify(t)}`, () => expect(asksForTextReduction(t)).toBe(false))

  // F1d re-review: the F1d "size void" (a size word in a later clause switched
  // the check off) is gone. For replace/constrain no judge runs, so a switched-off
  // check is a ZERO-CALL PASS — "less text, bigger font" with a longer rewrite
  // passed. A text-reduction phrase followed by a size clause therefore always
  // triggers: a real reduction plus a resize still passes (the count falls), and a
  // coordinated pure resize ("reduce the text and logo size") is a false miss —
  // fail closed, Use anyway.
  const COMPOUND_TRIGGERS = [
    'less text, bigger font',
    'less text and a bigger font',
    'fewer words, larger type',
    'less copy, bigger headline',
    'shorter copy, bigger font',
    'make the copy shorter and the font bigger',
    'fewer words please, bigger font',
    'reduce the text by half, bigger font',
    'reduce the text and increase the font size',
    'reduce the text and enlarge the font',
    'shorten the copy and increase the font size',
    'reduce the text, then bump up the font size',
    'reduce the text so the font can be bigger',
    'reduce the text so the headline can be larger',
    'reduce the text so it fits at this size',
    // the accepted fail-closed side: formerly voided coordinated resizes
    'reduce the text and logo size',
    'reduce the text and icon sizes',
    'reduce the text and image size a little',
    'reduce the text, make it smaller',
    'reduce the text, the font is too big',
    'reduce the text, and make them bigger',
    'reduce the text so the font is bigger',
    'reduce the text it is too huge',
  ]
  for (const t of COMPOUND_TRIGGERS) it(`lexicon matches a compound: ${JSON.stringify(t)}`, () => expect(asksForTextReduction(t)).toBe(true))

  it('"less text, bigger font" with a LONGER rewrite misses whatever the class (no zero-call pass)', () => {
    const longer = nested(`${H} ${P} plus several more words`, [el({ tag: 'body', text: `${H} ${P} plus several more words` }), el({ tag: 'h1', text: H }), el({ tag: 'p', classes: ['body-copy'], text: `${P} plus several more words` })])
    const rs = checkPostConditions({ before: B, after: longer, supersedes: [], constrains: [], classes: ['add'], instruction: 'less text, bigger font' })
    expect(rs.some((r) => !r.result.ok)).toBe(true)
  })

  it('size words never trigger the word-count check (a smaller headline with the same words passes structurally)', () => {
    const smaller = nested(`${H} ${P}`, [el({ tag: 'body', text: `${H} ${P}` }), el({ tag: 'h1', text: H, fontSizePx: 40 }), el({ tag: 'p', classes: ['body-copy'], text: P })])
    const rs = checkPostConditions({ before: B, after: smaller, supersedes: [], constrains: [], classes: ['add'], instruction: 'reduce the text size' })
    expect(rs).toEqual([])
  })
})

// M-1: the verifier's scope wording lives in the table (AC-19).
describe('final F1 / M-1 — every class carries its verifier scope in the table', () => {
  it('has a non-empty verifierScope per class', () => {
    for (const k of INSTRUCTION_CLASS_KEYS) expect(INSTRUCTION_CLASSES[k].verifierScope.trim().length).toBeGreaterThan(10)
  })
})

// ── Final fix wave F1b (change 004 final review, F1 re-review) ───────────────

// Important 1: the F1 move exemption decided "carrier gone" by counting
// tag+classes, so a class rename passed a kept, layered or swapped image with
// zero model calls (an AC-09 regression). A surviving superseded image now
// counts as MOVED only when every AFTER element carrying it occupies a VACATED
// slot: a shape (tag + sorted classes) that in BEFORE carried some other image
// X, and in AFTER carries X nowhere.
describe('final F1b / Important 1 — a superseded image survives only in a vacated slot', () => {
  const NEW = 'http://minio.local/images/generated/new.png'
  const div = (cls: string[], src: string, id: string | null = null) => el({ tag: 'div', id, classes: cls, imageSources: [src] })
  const img = (cls: string[], src: string, id: string | null = null) => el({ tag: 'img', id, classes: cls, imageSources: [src] })
  const bgOnly = facts([div(['bg'], OLD_BG), headline()])
  const bgInset = facts([div(['bg'], OLD_BG), headline(), img(['inset'], UPLOAD)])
  const replace = (before: DomFacts, after: DomFacts, supersedes: string[], instruction?: string) =>
    check('replace', { before, after, supersedes, classes: ['replace'], instruction })
  // Final F1d: move intent is gone. These instructions are run only to show the
  // result no longer depends on the wording — an explicit swap request included.
  const MOVE = 'use the upload as the background and put the old one in the inset'
  const NO_MOVE = 'use the upload as the background'
  const SWAP = 'swap the background and the inset'

  // The re-review's Important 1 table — every row MISSES, whatever the instruction.
  const MISSES: Array<[string, DomFacts, DomFacts, string[]]> = [
    ['rename + underlay (.hero-bg NEW, .underlay OLD), supersedes [OLD]', bgOnly, facts([div(['hero-bg'], NEW), div(['underlay'], OLD_BG), headline()]), [OLD_BG]],
    ['rename + underlay (.hero-bg NEW, .underlay OLD), supersedes [.bg]', bgOnly, facts([div(['hero-bg'], NEW), div(['underlay'], OLD_BG), headline()]), ['.bg']],
    ['kept alongside (.bg-new NEW, .bg-old OLD), supersedes [OLD]', bgOnly, facts([div(['bg-new'], NEW), div(['bg-old'], OLD_BG), headline()]), [OLD_BG]],
    ['swap onto renamed slots (.background UP, img.photo OLD), supersedes [OLD]', bgInset, facts([div(['background'], UPLOAD), headline(), img(['photo'], OLD_BG)]), [OLD_BG]],
    ['swap onto renamed slots (.background UP, img.photo OLD), supersedes [OLD, .inset]', bgInset, facts([div(['background'], UPLOAD), headline(), img(['photo'], OLD_BG)]), [OLD_BG, '.inset']],
    // Further shapes from the reviewer's probes (p1.ts).
    ['layered, same class (.bg NEW + .underlay OLD), supersedes [OLD]', bgOnly, facts([div(['bg'], NEW), div(['underlay'], OLD_BG), headline()]), [OLD_BG]],
    ['kept alongside on the same shape (.bg NEW + .bg OLD), supersedes [OLD]', bgOnly, facts([div(['bg'], NEW), div(['bg'], OLD_BG), headline()]), [OLD_BG]],
    ['id rename (#bg2 NEW, #under OLD), supersedes [OLD]', facts([div([], OLD_BG, 'bg'), headline()]), facts([div([], NEW, 'bg2'), div([], OLD_BG, 'under'), headline()]), [OLD_BG]],
    // A slot that still carries what it carried before is not vacated.
    ['old image added to an .inset that still carries its upload, supersedes [OLD]', bgInset, facts([div(['bg'], NEW), headline(), img(['inset'], UPLOAD), img(['inset'], OLD_BG)]), [OLD_BG]],
    // Accepted fail-closed: a correct move whose target class was also renamed.
    ['correct move but the target renamed (.backdrop UP), supersedes [OLD, .inset]', bgInset, facts([div(['backdrop'], UPLOAD), headline()]), [OLD_BG, '.inset']],
    ['correct move but the target renamed (.backdrop UP), supersedes [UP]', bgInset, facts([div(['backdrop'], UPLOAD), headline()]), [UPLOAD]],
    // A class-less carrier matches shape "img" only — not enough on its own.
    ['swap onto a class-less, id-less <img>, supersedes [OLD]', facts([div(['bg'], OLD_BG), headline(), img([], UPLOAD)]), facts([div(['bg'], UPLOAD), headline(), img([], OLD_BG)]), [OLD_BG]],
    // An id'd BEFORE carrier keeps the F1 id logic: it must be gone.
    ["id'd carrier survives (#photo now carries OLD), supersedes [UP]", facts([div(['bg'], OLD_BG), img([], UPLOAD, 'photo')]), facts([div(['bg'], UPLOAD), img([], OLD_BG, 'photo')]), [UPLOAD]],
  ]
  for (const [name, before, after, supersedes] of MISSES) {
    for (const instruction of [MOVE, SWAP, NO_MOVE, undefined]) {
      it(`MISSES: ${name} — instruction ${JSON.stringify(instruction ?? null)}`, () => {
        const r = replace(before, after, supersedes, instruction)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toMatch(/^replace: .*still present/)
      })
    }
  }

  // Moves and swaps (final F1d: one result per row, whatever the instruction).
  // A pure move — every image displaced from the vacated slot is gone — passes;
  // a swap (the displaced image survives) misses, even when it was asked for.
  // The 'miss' rows passed with move intent under F1c; they are flipped.
  const twoInsets = facts([div(['bg'], OLD_BG), headline(), img(['inset'], UPLOAD), img(['inset'], NEW)])
  const MOVES: Array<[string, DomFacts, DomFacts, string[], 'pass' | 'miss']> = [
    ['swap on the same slots (.bg UP, .inset OLD), supersedes [OLD]', bgInset, facts([div(['bg'], UPLOAD), headline(), img(['inset'], OLD_BG)]), [OLD_BG], 'miss'],
    ['swap on the same slots (.bg UP, .inset OLD), supersedes [UP]', bgInset, facts([div(['bg'], UPLOAD), headline(), img(['inset'], OLD_BG)]), [UPLOAD], 'miss'],
    ['swap on the same slots (.bg UP, .inset OLD), supersedes [OLD, .inset]', bgInset, facts([div(['bg'], UPLOAD), headline(), img(['inset'], OLD_BG)]), [OLD_BG, '.inset'], 'miss'],
    ['swap with classes in another order (div.bg.full ↔ div.full.bg)', facts([el({ tag: 'div', classes: ['bg', 'full'], imageSources: [OLD_BG] }), img(['inset'], UPLOAD)]), facts([el({ tag: 'div', classes: ['full', 'bg'], imageSources: [UPLOAD] }), img(['inset'], OLD_BG)]), [OLD_BG], 'miss'],
    ['inset moved to the background, inset gone, supersedes [UP]', bgInset, facts([div(['bg'], UPLOAD), headline()]), [UPLOAD], 'pass'],
    ['inset moved, its .inset slot now a caption, supersedes [UP]', bgInset, facts([div(['bg'], UPLOAD), headline(), el({ tag: 'p', classes: ['inset'], text: 'Photo credit' })]), [UPLOAD], 'pass'],
    ['one of two .inset images moved, supersedes [OLD]', twoInsets, facts([div(['bg'], UPLOAD), headline(), img(['inset'], NEW)]), [OLD_BG], 'pass'],
    ['one of two .inset images moved, supersedes [UP]', twoInsets, facts([div(['bg'], UPLOAD), headline(), img(['inset'], NEW)]), [UPLOAD], 'pass'],
    ['swap onto a class-less <img> whose id slot was vacated, supersedes [OLD]', facts([div(['bg'], OLD_BG), headline(), img([], UPLOAD, 'ph')]), facts([div(['bg'], UPLOAD), headline(), img([], OLD_BG, 'ph')]), [OLD_BG], 'miss'],
  ]
  for (const [name, before, after, supersedes, expected] of MOVES) {
    for (const instruction of [MOVE, SWAP, NO_MOVE, undefined]) {
      it(`${expected === 'pass' ? 'PASSES' : 'MISSES'} (instruction ${JSON.stringify(instruction ?? null)}): ${name}`, () => {
        const r = replace(before, after, supersedes, instruction)
        if (expected === 'pass') expect(r).toEqual({ ok: true })
        else {
          expect(r.ok).toBe(false)
          if (!r.ok) expect(r.reason).toMatch(/^replace: .*still present/)
        }
      })
    }
  }
})

// Minor 1: multiplicity compared exact URL strings, so UP?v=1 or UP#bg evaded it.
describe('final F1b / Minor 1 — multiplicity counts http(s) URLs without query string or fragment', () => {
  const inset = (src = UPLOAD) => el({ tag: 'img', classes: ['inset'], imageSources: [src] })
  const before = facts([bgLayer(OLD_BG), headline(), body(), inset()])
  for (const variant of [`${UPLOAD}?v=1`, `${UPLOAD}#bg`, `${UPLOAD}?v=2#bg`]) {
    it(`the background on ${JSON.stringify(variant.slice(UPLOAD.length))} with the inset still on the upload MISSES (supersedes [OLD])`, () => {
      const after = facts([bgLayer(variant), headline(), body(), inset()])
      const r = check('replace', { before, after, supersedes: [OLD_BG] })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/1 → 2/)
    })
  }
  it('the same variant still misses with supersedes [UP] (the count grew)', () => {
    const after = facts([bgLayer(`${UPLOAD}?v=1`), headline(), body(), inset()])
    expect(check('replace', { before, after, supersedes: [UPLOAD] }).ok).toBe(false)
  })
  it('a correct move whose new URL only adds a query string passes', () => {
    const after = facts([bgLayer(`${UPLOAD}?v=1`), headline(), body()])
    expect(check('replace', { before, after, supersedes: [OLD_BG] })).toEqual({ ok: true })
  })
  it('inline-asset tokens are compared as-is', () => {
    const tok = '__INLINE_ASSET_0__'
    const b = facts([bgLayer(OLD_BG), inset(tok)])
    expect(check('replace', { before: b, after: facts([bgLayer(tok), inset(tok)]), supersedes: [OLD_BG] }).ok).toBe(false)
    expect(check('replace', { before: b, after: facts([bgLayer(tok)]), supersedes: [OLD_BG] })).toEqual({ ok: true })
  })
})

// p4 (the re-review's end-to-end probe): "reduce the body text size" is a
// resize. As a passing constrain it must add NO text-reduction check, so no
// "(13 → 13)" miss.
describe('final F1b / Important 2 — a resize refine gets no text-reduction check (p4)', () => {
  const H = 'Join the programme'
  const P = 'Twelve weeks of real client projects with mentors and peers'
  const mk = (px: number) =>
    nested(`${H} ${P}`, [
      el({ tag: 'body', text: `${H} ${P}` }),
      el({ tag: 'h1', text: H, fontSizePx: 48 }),
      el({ tag: 'p', classes: ['body-copy'], text: P, fontSizePx: px }),
    ])
  for (const instruction of ['reduce the body text size', 'reduce the text size']) {
    it(`${JSON.stringify(instruction)} as a passing constrain: no text-reduction check, every result ok`, () => {
      const rs = checkPostConditions({
        before: mk(20),
        after: mk(16),
        supersedes: [],
        constrains: [{ fragment: '.body-copy', direction: 'decrease' }],
        classes: ['constrain'],
        instruction,
      })
      expect(rs.find((r) => r.class === TEXT_REDUCTION_CHECK)).toBeUndefined()
      expect(rs).toEqual([{ class: 'constrain', result: { ok: true } }])
    })
  }
})

// ── Final fix wave F1d (change 004): move intent is gone; a swap always misses ─

// F1c gated the swap on a move-intent lexicon over the instruction. The
// re-review showed it said yes too often ("…but keep the original logo",
// "move the current photo to the background", "switch the background over to
// the upload", "avoid moving the old background into the inset", …), so the
// swap passed again with zero calls. Controller ruling (binding): the lexicon is
// deleted, and a surviving superseded image passes only as a PURE move. A swap —
// the displaced image survives anywhere — misses, even an explicitly requested
// one. That fails closed: the user gets "not applied" + Use anyway.
describe('final F1d — no move-intent lexicon: the swap misses whatever the instruction', () => {
  const inset = (src: string) => el({ tag: 'img', classes: ['inset'], imageSources: [src], box: { width: 300, height: 300 } })
  const before = facts([bgLayer(OLD_BG), headline(), body(), inset(UPLOAD), logo()])
  const swapped = facts([bgLayer(UPLOAD), headline(), body(), inset(OLD_BG), logo()])
  // The canonical correct edit: the inset upload becomes the background, the old background is gone.
  const moved = facts([bgLayer(UPLOAD), headline(), body(), logo()])
  // Every supersedes form the re-review's q1 probe uses.
  const FORMS: string[][] = [
    [OLD_BG],
    [UPLOAD],
    ['.bg'],
    ['.inset'],
    [OLD_BG, '.inset'],
    [`url(${OLD_BG})`, '.inset'],
    ['upload.jpg'],
    ['old-bg.png'],
    [OLD_BG, UPLOAD],
    ['.bg', '.inset'],
  ]
  // F1c's move-intent triggers, then the re-review's Important 1 phrases
  // (each said "move intent" under F1c), then plain no-intent instructions.
  // The phrase no longer matters: every one misses on the swap shape.
  const INSTRUCTIONS: string[] = [
    'use the upload as the background and put the old one in the inset',
    'move the old background into the inset',
    'swap the background and the inset',
    'switch the two images',
    'keep the old background as the inset photo',
    'make the upload the background and move the current background to the small frame',
    'swap the photos round',
    'place the previous image in the corner',
    'use the upload as the background, but keep the original logo',
    'move the current photo to the background',
    'put the existing image in the background',
    'use the upload as the background — avoid moving the old background into the inset',
    "don't keep or move the old background, just use the upload as the background",
    'switch the background over to the upload',
    'swap the background over for the new photo',
    'use the upload as the background and move the existing logo to the top',
    'stop putting the old background in the inset',
    'refrain from keeping the old background',
    'shift the current picture to the background',
    'make the uploaded photo the background, keep the old logo',
    'use the upload as the background',
    'replace the background with the inset photo',
  ]
  const run = (after: DomFacts, supersedes: string[], instruction?: string) =>
    checkPostConditions({ before, after, supersedes, constrains: [], classes: ['replace'], instruction })

  it('the move-intent lexicon is no longer exported', () => {
    const mod = instructionClassesModule as Record<string, unknown>
    expect(mod.hasMoveIntent).toBeUndefined()
    expect(mod.MOVE_INTENT_LEXICON).toBeUndefined()
  })

  for (const supersedes of FORMS) {
    it(`the swap MISSES for every instruction — supersedes ${JSON.stringify(supersedes)}`, () => {
      for (const instruction of [...INSTRUCTIONS, undefined]) {
        const rs = run(swapped, supersedes, instruction)
        expect(rs).toHaveLength(1)
        expect(rs[0].class).toBe('replace')
        expect(rs[0].result.ok, `${JSON.stringify(instruction ?? null)} passed the swap`).toBe(false)
      }
    })
    it(`the canonical move (inset → background, old background gone) PASSES for every instruction — supersedes ${JSON.stringify(supersedes)}`, () => {
      for (const instruction of [...INSTRUCTIONS, undefined]) {
        expect(run(moved, supersedes, instruction), JSON.stringify(instruction ?? null)).toEqual([{ class: 'replace', result: { ok: true } }])
      }
    })
  }

  it('an explicit swap request does not excuse a duplicate (multiplicity still applies)', () => {
    const dup = facts([bgLayer(UPLOAD), headline(), body(), inset(UPLOAD), logo()])
    const r = run(dup, [OLD_BG], 'swap the background and the inset')[0].result
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/1 → 2/)
  })

  // Known limit (fail OPEN, the re-review's Minor 2 — pinned so a change is
  // seen): the pure-move test cannot tell which image the user meant to keep.
  // With the UPLOAD deleted and the old background moved into the inset slot,
  // every image displaced from that slot is gone, so it passes as a pure move.
  it('known limit: the upload deleted and the old background moved into its inset slot passes as a pure move', () => {
    const inverse = facts([headline(), body(), inset(OLD_BG), logo()])
    expect(run(inverse, [OLD_BG], 'use the upload as the background')).toEqual([{ class: 'replace', result: { ok: true } }])
  })
})
