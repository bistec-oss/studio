// The per-class instruction table for AGUI refine (change 004 Phase 2).
//
// A refine instruction is one or more of four classes — add / replace / remove /
// constrain — declared by the refine model in its reply envelope
// (refineEnvelope.ts). This module is the ONLY definition of what each class
// means. It has two consumers:
//
//   - the refine prompt renders each class's `semantics` plus the fragment rules
//     (renderClassSemantics),
//   - the verifier runs each class's `postCondition` (checkPostConditions)
//     against facts extracted from the rendered DOM before and after the edit.
//
// Because both read the same table, editing a class here changes the prompt
// AND the verification criteria together (FR-06, AC-19). Do not restate the
// semantics or the fragment rules anywhere else.
//
// ── Post-conditions ──────────────────────────────────────────────────────────
// Post-conditions are pure functions over DomFacts — never over raw HTML. The
// fact extractor runs against the rendered DOM in Chromium (T14) and produces
// the DomFacts shape defined below. `add` has no deterministic post-condition
// (nothing measurable says "a human character is now present"), so it is
// verified by a model call that also receives DomFacts (FR-09).
//
// Every post-condition sees the full set of classes the instruction carried,
// because multi-clause instructions (AC-11) are verified class by class over the
// SAME document. Where a co-present class is `additive` in the table (add,
// replace) it legitimately grows the document, so the whole-document growth /
// shrink checks of the other classes stand down — remove's word count is then
// narrowed to the named passages' shapes rather than dropped (see Known limits,
// I3). The per-fragment and per-target checks never stand down.
//
// ── Fragments ────────────────────────────────────────────────────────────────
// `supersedes` entries and `constrains[].fragment` are verbatim identifying
// fragments copied from the ORIGINAL document (HTML entities such as &amp; are
// decoded before matching). Each is resolved against the `before` facts into
// the CONTENT it identifies:
//   - `#id` / `.class` matching an element → that element's image sources AND,
//     when it is a leaf (no other element's non-empty text is a strictly
//     shorter substring of its text) or carries no image, its visible text. The
//     element itself may survive an edit — swapping the image on the same `.bg`
//     element is a correct replace, but a badge whose image is swapped while its
//     old text stays is not. (DomFacts has no parent links; the leaf test keeps
//     an image-bearing container from being identified by its children's
//     text.) A token that
//     matches no element falls through to the rules below, so a hashtag such as
//     "#IRP" is matched as visible text.
//   - a substring of an image source (URL, filename, `url('…')`, or an
//     __INLINE_ASSET_n__ token) → that image.
//   - a phrase of visible text (case- and whitespace-insensitive, because
//     rendered text honours text-transform) → the phrase, plus the full text of
//     its innermost containing element (the "passage").
// A fragment that resolves to nothing in `before` is always a miss: the model
// named something that is not there, so its absence afterwards proves nothing.
//
// Finding the passage afterwards (counterpart): a surviving phrase is followed
// to the shortest element holding it with the passage's own tag+classes; a
// vanished phrase to the same-shape element sharing at least half the
// passage's words; otherwise the passage is "gone". Known limits:
//   - N5 (open, minor): a passage that is re-tagged (a <p class="body-copy">
//     rewritten as <div class="lead">) with its phrase reworded out has no
//     counterpart and counts as gone — a remove passes it.
//   - A constrain whose target phrase vanishes and whose passage keeps under
//     half its words reads as gone (a miss). The constrain semantics ask for a
//     target phrase that stays in the result.
//   - N7 (accepted, fail-closed): an image-bearing container whose only text is
//     a single child (section.hero wrapping just an <h1>) is indistinguishable
//     from a leaf, so "replace .hero" that keeps the headline misses. The
//     prompt steers backgrounds to image-URL fragments, which do not hit this.
//   - The overlap counts DISTINCT shared words, so a newcomer repeating one
//     passage word ("join join join …") is not taken for the passage (R3).
//   - Remove with an additive class co-present (I3): the counterpart alone can
//     be fooled — a passage split into same-shape halves, or a new same-shape
//     element repeating the phrase, gives a shorter "counterpart". So the
//     stood-down whole-document word count is replaced by the words summed
//     over every element with each text passage's tag+classes, which must
//     strictly decrease. Accepted consequence (fail-closed): a deliberately
//     added paragraph of the passage's own shape counts against the reduction.
//     Nested same-shape elements (a class-less <div> inside another) are
//     counted once per level, before and after alike.
//   - Flat supersedes (T17): replace+remove share one supersedes list, so a
//     fragment cannot say which clause it serves. A text/token fragment whose
//     passage was rewritten WHOLESALE (phrase gone, under half its distinct
//     words kept by any same-shape element — the id is not followed, since
//     replace may reuse the element) is attributed to replace and exempt from
//     remove's checks. So "change the headline to X and remove the logo"
//     passes when applied, however long X is. Accepted consequence (fail-
//     open, narrow): in a replace+remove, a passage that the remove clause
//     should have SHORTENED but that was instead rewritten wholesale — longer
//     — passes remove; a rewording that keeps half the words still has to
//     shrink. Per-clause supersedes ({fragment, clause}) is the upgrade path
//     if that proves to matter. The exemption is replace-only: remove+add
//     still requires the reduction. Final F1 / I-2 narrows the fail-open
//     case: when the instruction is in TEXT_REDUCTION_LEXICON ("reduce the
//     text"), the visible word count must fall whatever the classes, and the
//     exemption does not apply to that check.
//
// A text passage counts as reduced only when it no longer appears INTACT in the
// document's text (re-wrapping a phrase in <strong>, or splitting a paragraph
// into several elements, shrinks the innermost container without removing a
// character, and must not pass) AND its innermost container lost words or is
// gone — whether or not the named phrase survives, since rewording the phrase
// out while growing the passage is not a reduction.
//
// ── AC-08 relies on a text fragment ──────────────────────────────────────────
// "reduce the text" is verified by visible word count, which only applies when
// the model names a TEXT fragment in supersedes. The remove semantics tell the
// model so. Image/element shrinkage satisfies remove only when every supersedes
// fragment is an image.
//
// ── Worked constrain example (party-ba) ──────────────────────────────────────
// Instruction: "make the headline smaller".
// Envelope:    classes ["constrain"], supersedes [],
//              constrains [{"fragment": "#headline", "direction": "decrease"}].
// before:      h1#headline fontSizePx 96, box 900×200.
//   ✓ after: h1#headline 72px, box 900×150, nothing else changed → ok.
//   ✗ after: h1#headline 140px → miss: font-size moved in the wrong direction.
//   ✗ after: headline at 72px but a "NEW" badge added → miss: constrain was the
//     only class, and elements and text were added.
//   ✗ after: headline untouched (with or without other clauses applied) → miss.
// Measured attributes: fontSizePx, box area, text length, word count. A bound on
// anything else (colour, weight, spacing) is not measurable from facts; the
// semantics steer those instructions to `add`, which the model verifier checks.
// The bound's VALUE ("under 12 words") is not checked — only its direction.
//
// Pure — no I/O.

export const INSTRUCTION_CLASS_KEYS = ['add', 'replace', 'remove', 'constrain'] as const
export type InstructionClass = (typeof INSTRUCTION_CLASS_KEYS)[number]

// The class every ambiguous, defaulted or downgraded classification resolves to
// (FR-05): it preserves all existing content.
export const PRESERVING_CLASS: InstructionClass = 'add'

export type ConstrainDirection = 'decrease' | 'increase'
export interface ConstrainTarget {
  fragment: string
  direction?: ConstrainDirection
}

// ── DomFacts — the contract the T14 extractor implements ─────────────────────

export interface DomElementFact {
  tag: string // lowercase tag name
  id: string | null
  classes: string[] // class tokens, in attribute order
  // Rendered visible text of the element's subtree (innerText), whitespace
  // collapsed. Ancestors therefore contain their descendants' text; the
  // innermost container of a phrase is the one with the shortest text.
  text: string
  // Image sources ON THIS ELEMENT: <img> currentSrc/src, and every url(…) in
  // its computed background-image. Resolved URLs. Data URIs that the model saw
  // as __INLINE_ASSET_n__ tokens must be reported as those tokens, so the
  // model's fragment vocabulary and the facts' vocabulary agree.
  imageSources: string[]
  fontSizePx: number | null // computed font-size, rounded to an integer
  box: { width: number; height: number } | null // rendered size, rounded to integers
}

export interface DomFacts {
  // All visible text of the rendered document (body innerText), whitespace
  // collapsed.
  text: string
  // Every image source in the rendered document, in document order, duplicates
  // kept (an image used twice is two sources).
  imageSources: string[]
  // Count of rendered (display != none) elements under <body>.
  elementCount: number
  // Every rendered element that carries visible text or an image source, in
  // document (pre-)order — an element's descendants immediately follow it. The
  // leaf test in this module relies on that order.
  elements: DomElementFact[]
}

export interface PostConditionInput {
  before: DomFacts
  after: DomFacts
  supersedes: string[]
  constrains: ConstrainTarget[]
  // Every class the instruction carried (after effectiveClasses), including the
  // one being checked.
  classes: InstructionClass[]
  // The user's instruction. Only the zero-call text-reduction lexicon
  // (TEXT_REDUCTION_LEXICON) reads it; replace's move exemption never does
  // (final F1d). Omitted → no text-reduction check.
  instruction?: string
}

export type PostConditionResult = { ok: true } | { ok: false; reason: string }
// The table is passed in so that per-class flags (`additive`) are read from the
// same table the prompt was rendered from.
export type PostCondition = (input: PostConditionInput, table: InstructionClassTable) => PostConditionResult

export interface InstructionClassDefinition {
  semantics: string
  // What this class covers, as one clause, for the add-verifier prompt. The
  // prompt names the classes whose post-conditions already ran and tells the
  // verifier to judge every OTHER class's scope (refineVerify.ts
  // buildVerifierPrompt) — this field is the only definition of that scope
  // (AC-19).
  verifierScope: string
  postCondition: PostCondition | null
  // Deletes content; permitted only with a non-empty supersedes (FR-04 —
  // enforced by the route via effectiveClasses).
  destructive: boolean
  // Legitimately grows the document; while one is co-present, the other
  // classes' whole-document growth/shrink checks stand down.
  additive: boolean
}

export type InstructionClassTable = Readonly<Record<InstructionClass, InstructionClassDefinition>>

// ── Text / fragment helpers ──────────────────────────────────────────────────

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
const fold = (s: string) => collapse(s).toLowerCase()
const textLength = (s: string) => collapse(s).length
const wordCount = (s: string) => (collapse(s) ? collapse(s).split(' ').length : 0)

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

// Strip a CSS url(…) wrapper and surrounding quotes from an image fragment.
function unwrapUrl(fragment: string): string {
  const m = /^url\(\s*(['"]?)(.*?)\1\s*\)$/i.exec(fragment)
  return (m ? m[2] : fragment).replace(/^['"]|['"]$/g, '')
}

const isTokenFragment = (f: string) => /^[#.][\w-]+$/.test(f)

function tokenElements(facts: DomFacts, token: string): DomElementFact[] {
  const name = token.slice(1)
  return facts.elements.filter((e) => (token.startsWith('#') ? e.id === name : e.classes.includes(name)))
}

// Innermost element(s) containing a folded phrase, and their text length.
function innermost(facts: DomFacts, phrase: string): { elements: DomElementFact[]; length: number | null } {
  let best: number | null = null
  let els: DomElementFact[] = []
  for (const e of facts.elements) {
    if (!fold(e.text).includes(phrase)) continue
    const len = textLength(e.text)
    if (best === null || len < best) {
      best = len
      els = [e]
    } else if (len === best) els.push(e)
  }
  return { elements: els, length: best }
}

const unique = <T>(xs: T[]) => [...new Set(xs)]

// A leaf carries text of its own rather than only its descendants' text.
// DomFacts has no parent links, but `elements` is in pre-order, so an
// element's descendants are the contiguous run right after it. The scan walks
// that run and stops at the first element that cannot be a descendant:
//   - its text is not contained in the element's text, or
//   - the document text shows it FOLLOWING the element (the element's text
//     immediately followed by its own) — a next sibling such as a "SEATS" label
//     right after a "LIMITED SEATS" badge.
// Inside the run, a non-empty strictly shorter text means the element wraps a
// child's text: a container, not a leaf. Unrelated labels elsewhere in the
// document no longer matter.
function isLeaf(facts: DomFacts, el: DomElementFact): boolean {
  const t = fold(el.text)
  if (!t) return false
  const doc = fold(facts.text)
  const i = facts.elements.indexOf(el)
  for (let j = i + 1; j < facts.elements.length; j++) {
    const ot = fold(facts.elements[j].text)
    if (!t.includes(ot)) break
    if (ot && (doc.includes(`${t} ${ot}`) || doc.includes(t + ot))) break
    if (ot.length > 0 && ot.length < t.length) return false
  }
  return true
}

// What a fragment identified in `before`.
interface ResolvedFragment {
  raw: string
  kind: 'token' | 'image' | 'text'
  // Image content. `imageSubstring` = match any source containing one of these
  // (a URL/filename fragment); otherwise exact sources (a token's images).
  images: string[]
  imageSubstring: boolean
  phrase: string | null // folded phrase (text kind)
  passages: string[] // folded text content that must not survive intact
  elements: DomElementFact[] // the elements identified (constrain targets)
}

function resolveFragment(facts: DomFacts, rawFragment: string): ResolvedFragment | null {
  const raw = rawFragment.trim()
  const needle = decodeHtmlEntities(raw).trim()
  if (!needle) return null

  if (isTokenFragment(needle)) {
    const els = tokenElements(facts, needle)
    if (els.length > 0) {
      const images = unique(els.flatMap((e) => e.imageSources))
      const passages = unique(
        els.filter((e) => e.imageSources.length === 0 || isLeaf(facts, e)).map((e) => fold(e.text)).filter(Boolean),
      )
      return { raw, kind: 'token', images, imageSubstring: false, phrase: null, passages, elements: els }
    }
  }

  const url = unwrapUrl(needle)
  if (url && facts.imageSources.some((s) => s.includes(url))) {
    const els = facts.elements.filter((e) => e.imageSources.some((s) => s.includes(url)))
    return { raw, kind: 'image', images: [url], imageSubstring: true, phrase: null, passages: [], elements: els }
  }

  const phrase = fold(needle)
  if (fold(facts.text).includes(phrase)) {
    const { elements } = innermost(facts, phrase)
    const passages = elements.length ? unique(elements.map((e) => fold(e.text))) : [phrase]
    return { raw, kind: 'text', images: [], imageSubstring: false, phrase, passages, elements }
  }
  return null
}

// A token's exact sources are compared normalised (final F1b, normalisedSource):
// the old image back as `OLD?v=1` is still the old image.
function imagesPresent(after: DomFacts, r: ResolvedFragment): boolean {
  return r.imageSubstring
    ? after.imageSources.some((s) => r.images.some((u) => s.includes(u)))
    : after.imageSources.some((s) => r.images.some((u) => normalisedSource(u) === normalisedSource(s)))
}

const passageIntact = (after: DomFacts, r: ResolvedFragment) => r.passages.some((p) => fold(after.text).includes(p))

// The identified content is entirely gone from `after`.
function contentAbsent(after: DomFacts, r: ResolvedFragment): boolean {
  if (imagesPresent(after, r)) return false
  if (r.kind === 'text') return !fold(after.text).includes(r.phrase!)
  return !passageIntact(after, r)
}

// The identified content is gone, or (text) shortened such that the original
// passage no longer survives intact.
function contentReduced(before: DomFacts, after: DomFacts, r: ResolvedFragment): boolean {
  if (imagesPresent(after, r)) return false
  if (r.passages.length === 0) return true // image-only content, and it is gone
  if (passageIntact(after, r)) return false // re-wrapped or split, not reduced
  const words = (els: DomElementFact[]) => els.reduce((n, e) => n + wordCount(e.text), 0)
  if (r.kind === 'text') {
    // The phrase crossed element boundaries: only its disappearance counts.
    if (r.elements.length === 0) return !fold(after.text).includes(r.phrase!)
    // Each innermost container must lose words or be gone — whether or not the
    // named phrase survives (rewording it out while growing the passage is not
    // a reduction).
    return r.elements.every((e) => {
      const now = counterpart(before, after, e, r.raw, 'text')
      return !now || wordCount(now.text) < wordCount(e.text)
    })
  }
  // Token with text content: the element is gone, or its text lost words.
  const now = tokenElements(after, decodeHtmlEntities(r.raw))
  return now.length === 0 || words(now) < words(r.elements)
}

const hasText = (r: ResolvedFragment) => r.passages.length > 0

const distinctWords = (s: string) => new Set(fold(s).split(' ').filter(Boolean))
// How many DISTINCT words of `text` are in `words`.
const sharedWords = (words: Set<string>, text: string) => new Set(fold(text).split(' ').filter((w) => words.has(w))).size
// `text` keeps at least half of the passage's distinct words (the counterpart threshold).
const keepsMostOf = (passage: string, text: string) => {
  const words = distinctWords(passage)
  return words.size > 0 && sharedWords(words, text) * 2 >= words.size
}

// replace+remove share ONE flat supersedes list, so a text fragment cannot say
// which clause it serves. A fragment whose text was rewritten WHOLESALE is the
// replace clause's: its images are gone, its passage no longer appears intact,
// the named phrase (text kind) is gone, and no element of the passage's
// tag+classes — for a token, no element still carrying the token — keeps at
// least half of the passage's distinct words. Unlike counterpart(), the id is
// NOT followed: replace may reuse the same element (a new headline in the same
// h1#headline), and following the id would read the new text as a passage that
// failed to shrink. See Known limits (flat supersedes).
function replacedWholesale(after: DomFacts, r: ResolvedFragment): boolean {
  if (imagesPresent(after, r) || !hasText(r) || passageIntact(after, r)) return false
  if (r.kind === 'text') {
    if (fold(after.text).includes(r.phrase!)) return false
    return r.elements.every((was) => !after.elements.some((e) => shapeKey(e) === shapeKey(was) && keepsMostOf(was.text, e.text)))
  }
  if (r.kind === 'token') {
    const now = tokenElements(after, decodeHtmlEntities(r.raw))
    return r.passages.every((p) => !now.some((e) => keepsMostOf(p, e.text)))
  }
  return false
}

// An element's shape: its tag plus its SORTED class list (class order is not
// meaningful, so `div.bg.full` and `div.full.bg` are one shape).
const shapeKey = (e: DomElementFact) => [e.tag, ...[...e.classes].sort()].join('.')

// For a TEXT fragment: each shape (tag+classes) of its passage elements whose
// total word count, summed over EVERY element of that shape, did not strictly
// decrease. Splitting the passage into same-shape halves, or re-adding its
// phrase in a new same-shape element, cannot pass. Tokens are already measured
// over every element carrying them (contentReduced); image fragments carry no
// passage; a phrase that crossed element boundaries has no shape.
function shapesNotShrunk(before: DomFacts, after: DomFacts, r: ResolvedFragment): string[] {
  if (r.kind !== 'text') return []
  const total = (facts: DomFacts, key: string) =>
    facts.elements.filter((e) => shapeKey(e) === key).reduce((n, e) => n + wordCount(e.text), 0)
  return unique(r.elements.map(shapeKey)).flatMap((key) => {
    const w0 = total(before, key)
    const w1 = total(after, key)
    return w1 < w0 ? [] : [`${key} ${w0} → ${w1} words`]
  })
}
const quoted = (fs: string[]) => fs.map((f) => JSON.stringify(f)).join(', ')

const othersAdditive = (input: PostConditionInput, table: InstructionClassTable, self: InstructionClass) =>
  input.classes.some((c) => c !== self && table[c].additive)

// Resolves supersedes for a destructive class: non-empty, every fragment found
// in `before`.
function resolveSupersedes(cls: InstructionClass, input: PostConditionInput): ResolvedFragment[] | PostConditionResult {
  const fragments = input.supersedes.map((s) => s.trim()).filter(Boolean)
  if (fragments.length === 0) {
    return { ok: false, reason: `${cls}: no superseded element was named, so nothing can be ${cls === 'replace' ? 'replaced' : 'removed'}` }
  }
  const resolved = fragments.map((f) => resolveFragment(input.before, f))
  const missing = fragments.filter((_, i) => resolved[i] === null)
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `${cls}: ${quoted(missing)} does not appear in the original design — a supersedes entry must be copied verbatim from the current document`,
    }
  }
  return resolved as ResolvedFragment[]
}

// ── Constrain target measurement ─────────────────────────────────────────────

// The `after` element corresponding to a `before` element identified by a
// fragment. Returns null when it is gone.
//
// TEXT fragment (the element is the phrase's innermost container, the passage):
//   - phrase survives → the SHORTEST after element holding the phrase with the
//     same tag+classes as the passage — not an innermost <strong> wrapper or a
//     new pull-quote repeating it; the innermost holder only if none has that
//     shape;
//   - phrase gone → the same-tag+classes element sharing the most words with the
//     original passage, provided it shares at least half of them (an inserted
//     caption ahead of it is not the passage); else the same id; else gone.
// Other fragments: same id; else the same tag+classes at the same ordinal; else
// the fragment re-resolved in after.
function counterpart(
  before: DomFacts,
  after: DomFacts,
  el: DomElementFact,
  fragment: string,
  kind: ResolvedFragment['kind'],
): DomElementFact | null {
  const sameShape = (e: DomElementFact) => e.tag === el.tag && e.classes.join(' ') === el.classes.join(' ')
  const again = resolveFragment(after, fragment)

  if (kind === 'text') {
    const phrase = fold(decodeHtmlEntities(fragment).trim())
    const holders = after.elements.filter((e) => fold(e.text).includes(phrase))
    if (holders.length > 0) {
      const same = holders.filter(sameShape).sort((a, b) => textLength(a.text) - textLength(b.text))[0]
      return same ?? (again?.kind === 'text' ? again.elements[0] : undefined) ?? holders[0]
    }
    const passageWords = distinctWords(el.text)
    // DISTINCT shared words — a newcomer repeating one passage word is not the passage.
    const overlap = (e: DomElementFact) => sharedWords(passageWords, e.text)
    const best = after.elements.filter(sameShape).sort((a, b) => overlap(b) - overlap(a))[0]
    if (best && overlap(best) * 2 >= passageWords.size) return best
    if (el.id) return after.elements.find((e) => e.id === el.id) ?? null
    return null
  }

  if (el.id) return after.elements.find((e) => e.id === el.id) ?? null
  const ordinal = before.elements.filter(sameShape).indexOf(el)
  const candidate = after.elements.filter(sameShape)[ordinal]
  if (candidate) return candidate
  return again?.elements[0] ?? null
}

function measures(e: DomElementFact): Record<string, number | null> {
  return {
    'font-size': e.fontSizePx,
    'box area': e.box ? e.box.width * e.box.height : null,
    'text length': textLength(e.text),
    'word count': wordCount(e.text),
  }
}

// null = the target satisfies the bound; otherwise the reason it does not.
function targetMiss(was: DomElementFact, now: DomElementFact, direction?: ConstrainDirection): string | null {
  const a = measures(was)
  const b = measures(now)
  const up: string[] = []
  const down: string[] = []
  for (const k of Object.keys(a)) {
    if (a[k] === null || b[k] === null) continue
    if (b[k]! > a[k]!) up.push(`${k} ${a[k]}→${b[k]}`)
    if (b[k]! < a[k]!) down.push(`${k} ${a[k]}→${b[k]}`)
  }
  if (up.length === 0 && down.length === 0) return 'is unchanged (font-size, size, text length and word count all identical)'
  if (direction === 'decrease' && (up.length > 0 || down.length === 0)) return `did not decrease (${[...up, ...down].join(', ')})`
  if (direction === 'increase' && (down.length > 0 || up.length === 0)) return `did not increase (${[...up, ...down].join(', ')})`
  return null
}

// ── Post-conditions ──────────────────────────────────────────────────────────

// ── Image multiplicity and moves (replace, final F1 / C-1, final F1b) ────────
//
// The reported duplicate is "the uploaded image applied as the background AND
// kept as a separate inset" (proposal.md:18). Refine carries no upload, so that
// image is already in the design, and checking only that the NAMED source is
// gone got the shape backwards: supersedes = the old background URL passed the
// duplicate (the old URL is gone), and supersedes = the moved image missed the
// correct move (it is, rightly, still present). Two rules close it:
//   1. Multiplicity: in a replace, no image source present in BEFORE may appear
//      more often in AFTER. The duplicate raises the moved image 1 → 2.
//   2. A superseded image may still be present only as a MOVE: its count did
//      not grow, and EVERY AFTER element carrying it occupies a VACATED SLOT
//      (final F1b). A slot is a shape — tag plus sorted class list (shapeKey).
//      Shape S is vacated for a carrier when, in BEFORE, some element of shape
//      S carried an image X other than the superseded image(s) this carrier
//      now holds, and in AFTER no element of shape S carries X. So
//      div.bg(OLD) + img.inset(UP) → div.bg(UP) + img.inset(OLD) ("use the
//      upload as the background and put the old one in the inset") is a move:
//      each image sits in a slot the other left. Anything else that survives
//      is a miss, as before F1:
//        - a NEW shape — a renamed carrier, an underlay, a `.bg-old` — was
//          never vacated (F1 counted tag+classes, so a rename passed);
//        - a shape that still carries what it carried before (kept alongside,
//          layered) is not vacated.
//      A class-less carrier's shape is just its tag (`div`, `img`), which is
//      not enough on its own: it must also carry an id whose BEFORE element
//      carried such an X that no AFTER element with that id still carries.
//      An id'd BEFORE carrier keeps the F1 id logic: no element may keep that
//      id (the identified element must be gone).
//   3. PURE MOVES ONLY (final F1d, a binding controller ruling). The
//      vacated-slot rule alone certified the swap above whatever the user
//      asked; for a plain "use the upload as the background" that swap is the
//      AC-09 failure (the old background kept, moved into the inset). A
//      surviving superseded image therefore passes only as a PURE move: every
//      image displaced from the vacated slot must be gone from the whole AFTER
//      design. The canonical correct edit — the inset upload becomes the
//      background and the old background is gone, with supersedes [old
//      background, ".inset"] as the replace example steers — is a pure move and
//      passes; a swap or any relocation (the displaced image survives
//      somewhere) misses, vacated slot or not.
//      A REQUESTED swap misses too, by design ("swap the background and the
//      inset", "… and put the old one in the inset"). Final F1c let explicit
//      move intent in the instruction exempt a swap, through a zero-call
//      lexicon; it was repeatedly gameable — "…but keep the original logo",
//      "move the current photo to the background", "switch the background over
//      to the upload", "avoid moving the old background into the inset" all
//      read as intent and passed the swap with zero calls. No wording of the
//      instruction is consulted here: a requested swap fails closed, and the
//      user gets "not applied" + Use anyway.
// URLs are compared normalised (normalisedSource): an http(s) URL without its
// query string or fragment, so `UP?v=1` or `UP#bg` is still UP. Inline-asset
// tokens and data URIs are compared as-is.
// Known limits (fail closed — a false miss offers "Use anyway"):
//   - a replace that legitimately reuses an image already in the design in a
//     second place ("replace the second photo with the first") misses;
//   - a correct move whose target element was ALSO renamed (the upload moved
//     onto a `div.backdrop` that replaced `div.bg`) misses — the new shape was
//     never vacated;
//   - a swap onto a class-less, id-less element misses, and so does an in-place
//     swap on id'd elements (the id'd carrier survives);
//   - a moved image whose old element was the body/html misses when it
//     survives on it;
//   - two distinct CDN images that differ only by query string (`img?w=400`
//     vs `img?w=800`) count as ONE image, so showing both misses as a
//     duplicate; srcset candidates are not counted at all;
//   - every swap misses, including one the user explicitly asked for (rule 3).
// Known limit (fail OPEN): structure cannot tell which image the user meant to
// keep. A pure move passes whenever every image displaced from the slot the old
// image now occupies is gone from the design — whichever image that was. So:
//   - the model deletes an UNRELATED image (a logo, a second photo) and puts
//     the old background in its slot: it passes as a pure move;
//   - the model deletes the UPLOAD ITSELF and moves the old background into
//     the upload's old inset slot: every image displaced from that slot (the
//     upload) is gone, so it passes as a pure move too — although the image
//     the user wanted as the background is the one that was deleted.
// Both need the model to delete an image unasked; the reported AC-09 shape (the
// old background kept alongside the upload) is not one of them.

// An http(s) URL with its query string and fragment stripped; any other source
// (an __INLINE_ASSET_n__ token, a data: URI) unchanged.
const normalisedSource = (s: string) => (/^https?:\/\//i.test(s) ? s.replace(/[?#][\s\S]*$/, '') : s)

const countOf = (sources: string[], s: string) => {
  const key = normalisedSource(s)
  return sources.reduce((n, x) => (normalisedSource(x) === key ? n + 1 : n), 0)
}

// BEFORE image sources that appear more often in AFTER, described with counts.
function multipliedImages(before: DomFacts, after: DomFacts): string[] {
  const seen = new Set<string>()
  return before.imageSources.flatMap((s) => {
    const key = normalisedSource(s)
    if (seen.has(key)) return []
    seen.add(key)
    const n0 = countOf(before.imageSources, s)
    const n1 = countOf(after.imageSources, s)
    return n1 > n0 ? [`${JSON.stringify(s)} (${n0} → ${n1})`] : []
  })
}

// The BEFORE sources a resolved fragment identifies.
function identifiedSources(before: DomFacts, r: ResolvedFragment): string[] {
  return unique(
    before.imageSources.filter((s) => (r.imageSubstring ? r.images.some((u) => s.includes(u)) : r.images.includes(s))),
  )
}

// Rules 2 and 3 above: the fragment's images are still present, but only
// because they moved into slots other images vacated, and every image they
// displaced is gone from the design (a pure move). The instruction is never
// consulted: a swap misses even when it was asked for.
function movedAway(before: DomFacts, after: DomFacts, r: ResolvedFragment): boolean {
  const sources = identifiedSources(before, r)
  if (sources.length === 0) return false
  if (sources.some((s) => countOf(after.imageSources, s) > countOf(before.imageSources, s))) return false
  const superseded = new Set(sources.map(normalisedSource))
  const heldBy = (e: DomElementFact) => unique(e.imageSources.map(normalisedSource))
  const carries = (e: DomElementFact) => heldBy(e).some((s) => superseded.has(s))

  // The F1 id logic: an id'd BEFORE carrier must be gone.
  if (before.elements.some((was) => was.id && carries(was) && after.elements.some((e) => e.id === was.id))) return false

  const afterSources = new Set(after.imageSources.map(normalisedSource))
  // In BEFORE, elements matching `slot` carried an image X outside `held`, and
  // in AFTER none of them carries X. Every such displaced X must also be gone
  // from the whole design (rule 3) — a pure move, not a swap or a relocation.
  const vacated = (slot: (e: DomElementFact) => boolean, held: Set<string>) => {
    const prior = unique(before.elements.filter(slot).flatMap(heldBy)).filter((x) => !held.has(x))
    const displaced = prior.filter((x) => !after.elements.some((e) => slot(e) && heldBy(e).includes(x)))
    if (displaced.length === 0) return false
    return displaced.every((x) => !afterSources.has(x))
  }
  const carriers = after.elements.filter(carries)
  // The image is present but on no element: nothing shows it moved.
  if (carriers.length === 0) return false
  return carriers.every((now) => {
    const held = new Set(heldBy(now).filter((s) => superseded.has(s)))
    const key = shapeKey(now)
    if (!vacated((e) => shapeKey(e) === key, held)) return false
    if (now.classes.length > 0) return true
    // A class-less shape (`div`, `img`) is not enough on its own: the id slot
    // must have been vacated too.
    return !!now.id && vacated((e) => e.id === now.id, held)
  })
}

// The fragment with its image content set aside (already judged by the caller).
const textPart = (r: ResolvedFragment): ResolvedFragment => ({ ...r, images: [] })

// replace: every superseded fragment's content was present before and is
// absent after. The element may be reused (same .bg, new image). A superseded
// image may survive only as a move (movedAway), and no BEFORE image may appear
// more often (multipliedImages). When remove is co-present the one flat
// supersedes list serves both clauses, so a text fragment that was shortened
// (per contentReduced) or rewritten wholesale (per replacedWholesale)
// satisfies replace; an image must still be gone or moved.
const supersededElementAbsent: PostCondition = (input) => {
  const resolved = resolveSupersedes('replace', input)
  if (!Array.isArray(resolved)) return resolved
  const { before, after } = input
  const withRemove = input.classes.includes('remove')
  const kept = resolved.filter((r) => {
    if (imagesPresent(after, r) && !movedAway(before, after, r)) return true
    const t = textPart(r)
    return withRemove ? !contentReduced(before, after, t) && !replacedWholesale(after, t) : !contentAbsent(after, t)
  })
  const grown = multipliedImages(before, after)
  const problems = [
    ...(kept.length > 0
      ? [
          `the content of ${quoted(kept.map((r) => r.raw))} is still present after the edit — the superseded content must be gone, not kept alongside the new one`,
        ]
      : []),
    ...(grown.length > 0
      ? [
          `image ${grown.join(', ')} now appears more often than before — an image already in the design must not be duplicated; one that moves (for example an inset that becomes the background) must leave its old place`,
        ]
      : []),
  ]
  return problems.length === 0 ? { ok: true } : { ok: false, reason: `replace: ${problems.join('; and ')}` }
}

// remove: every named fragment's content is reduced, AND the document shrank:
//   - if any fragment carries text → visible WORD COUNT strictly lower;
//   - if every fragment is image-only → fewer image sources or fewer elements.
// While an additive class is co-present the whole document may legitimately
// grow, so that check is replaced by one scoped to each TEXT passage's shape:
// the words across all elements with the passage's tag+classes must strictly
// decrease. The per-fragment check (which requires the original passage to be
// broken, not merely re-wrapped) always applies — except to a fragment the
// co-present replace clause rewrote wholesale (replacedWholesale): one flat
// supersedes list serves both clauses, and that fragment is replace's.
const targetTextShorter: PostCondition = (input, table) => {
  const resolved = resolveSupersedes('remove', input)
  if (!Array.isArray(resolved)) return resolved
  const { before, after } = input
  const withReplace = input.classes.includes('replace')
  const ours = resolved.filter((r) => !(withReplace && replacedWholesale(after, r)))
  const unreduced = ours.filter((r) => !contentReduced(before, after, r))
  if (unreduced.length > 0) {
    return {
      ok: false,
      reason: `remove: ${quoted(unreduced.map((r) => r.raw))} was neither removed nor shortened by whole words (the original passage is still intact, or its element lost no words)`,
    }
  }
  if (othersAdditive(input, table, 'remove')) {
    // The whole document may grow (the add/replace clause), so the count is
    // scoped to the elements shaped like each named passage.
    const grown = ours.flatMap((r) => shapesNotShrunk(before, after, r).map((d) => `${JSON.stringify(r.raw)} (${d})`))
    return grown.length === 0
      ? { ok: true }
      : {
          ok: false,
          reason: `remove: the text shaped like the named passage did not lose words overall — ${grown.join(', ')}; shortened text must not be split up or repeated in another element of the same kind`,
        }
  }
  if (resolved.some(hasText)) {
    const w0 = wordCount(before.text)
    const w1 = wordCount(after.text)
    return w1 < w0
      ? { ok: true }
      : { ok: false, reason: `remove: the visible word count did not go down (${w0} → ${w1}) — removed text must not be replaced by new text elsewhere` }
  }
  const shrank = after.imageSources.length < before.imageSources.length || after.elementCount < before.elementCount
  return shrank
    ? { ok: true }
    : {
        ok: false,
        reason: `remove: the design is not smaller (${before.imageSources.length} → ${after.imageSources.length} images, ${before.elementCount} → ${after.elementCount} elements)`,
      }
}

// constrain: every named target changed measurably, in the stated direction;
// and, when constrain is the only class, nothing was added (no new image
// source, element count not increased, visible text not longer).
const boundedAttributeHolds: PostCondition = (input) => {
  const { before, after } = input
  const targets = input.constrains.filter((t) => t.fragment.trim())
  if (targets.length === 0) return { ok: false, reason: 'constrain: no target was named, so the bound cannot be checked' }

  for (const t of targets) {
    const r = resolveFragment(before, t.fragment)
    if (!r || r.elements.length === 0) {
      return { ok: false, reason: `constrain: target ${JSON.stringify(t.fragment)} does not identify an element in the original design` }
    }
    for (const el of r.elements) {
      const now = counterpart(before, after, el, t.fragment, r.kind)
      if (!now) return { ok: false, reason: `constrain: target ${JSON.stringify(t.fragment)} is gone — a constrain must not delete` }
      const miss = targetMiss(el, now, t.direction)
      if (miss) return { ok: false, reason: `constrain: target ${JSON.stringify(t.fragment)} ${miss}` }
    }
  }

  if (input.classes.every((c) => c === 'constrain')) {
    const prior = new Set(before.imageSources)
    const newSources = after.imageSources.filter((s) => !prior.has(s))
    if (newSources.length > 0) {
      return { ok: false, reason: `constrain: a new image was added (${newSources.join(', ')}) — a constrain bounds existing content and never adds` }
    }
    if (after.elementCount > before.elementCount) {
      return { ok: false, reason: `constrain: elements were added (${before.elementCount} → ${after.elementCount}) — a constrain bounds existing content and never adds` }
    }
    if (textLength(after.text) > textLength(before.text)) {
      return {
        ok: false,
        reason: `constrain: visible text grew (${textLength(before.text)} → ${textLength(after.text)} chars) — a constrain bounds existing content and never adds`,
      }
    }
  }
  return { ok: true }
}

// ── The table ────────────────────────────────────────────────────────────────

export const INSTRUCTION_CLASSES: InstructionClassTable = {
  add: {
    semantics:
      'Add what the instruction asks for and preserve everything else — every existing element, image and line of text stays where it is. Also use add for changes to colour, weight, style or spacing. Example: "include a human character" → add a figure; the headline, copy, logo and background all remain.',
    verifierScope: 'anything the instruction adds, or any change to colour, weight, style or spacing',
    postCondition: null,
    destructive: false,
    additive: true,
  },
  replace: {
    semantics:
      'Put new content in place of existing content. The superseded content — the old image, the old text — must be GONE from the result: not hidden, not layered underneath, not moved to another element, not kept alongside the new one. You may reuse the same element (for example, swap the image on the same background element). No image already in the design may appear more often afterwards: an image that moves (for example a photo in the design that becomes the background) must leave its old place. List what is replaced in supersedes. Example: "use the uploaded image as the background" → supersedes ["<the current background image URL, copied exactly from its url(...) or src>", "<the uploaded image\'s old element, as its #id or .class, when it moves from there>"]; the old background is gone and the uploaded image appears once, as the background.',
    verifierScope: 'content the instruction replaces (the superseded content is gone, and no existing image appears more often)',
    postCondition: supersededElementAbsent,
    destructive: true,
    additive: true,
  },
  remove: {
    semantics:
      'Delete or shorten the named content. The result must contain measurably less: removed content is gone, shortened text loses whole words, and nothing new is added elsewhere to compensate. List each thing you remove or shorten in supersedes. For a text reduction, name a TEXT phrase from each passage you shorten — text reductions are checked by word count, and only when a text phrase is named. Example: "reduce the text" → supersedes ["<a phrase unique to each passage you shorten>"]; each of those passages must come out shorter.',
    verifierScope: 'content the instruction removes or shortens (it is gone, or its text has fewer words)',
    postCondition: targetTextShorter,
    destructive: true,
    additive: false,
  },
  constrain: {
    semantics:
      'Bound a measurable size or length of existing content — font size, element size, text length or word count — without adding anything: no new elements, images or text. Name the target in constrains with the direction of the change; a text phrase used as the target must still be present after your edit. Examples: "make the headline smaller" → constrains [{"fragment": "<the headline\'s #id, .class or a phrase of its text>", "direction": "decrease"}] and reduce its font-size; "keep the body text under 12 words" → constrains [{"fragment": "<a phrase of the body text>", "direction": "decrease"}]. supersedes stays empty — a constrain deletes nothing.',
    verifierScope: 'a size or length the instruction bounds (font size, element size, text length or word count moved the way it asks)',
    postCondition: boundedAttributeHolds,
    destructive: false,
    additive: false,
  },
}

// ── Fragment rules — stated once, rendered into the prompt ───────────────────

export const FRAGMENT_RULE = `A fragment is copied verbatim from the CURRENT document and must identify one thing in it specifically enough that the verifier can find it: an image URL exactly as it appears in src="…" or url(…), an element's id or class written as #id or .class, or a phrase of visible text that is unique to that passage (a phrase appearing in several places identifies the wrong one).`

export const SUPERSEDES_RULE = `supersedes (required for replace and remove): a list of fragments, one for each piece of content you replace or remove. Example: ["https://example.com/images/old-background.png", ".promo-badge", "Limited seats available"]. With no supersedes entry, replace and remove are not permitted and nothing will be deleted.`

export const CONSTRAINS_RULE = `constrains (required for constrain): a list of {"fragment": …, "direction": "decrease" | "increase"}, one for each element whose size or length you bound. Example: [{"fragment": "#headline", "direction": "decrease"}]. With no constrains entry, a constrain is treated as add.`

// ── Consumers ────────────────────────────────────────────────────────────────

// Renders the class semantics block for the refine prompt (wired in by T17).
// The table is a parameter so AC-19 is testable: editing the table edits this.
export function renderClassSemantics(table: InstructionClassTable = INSTRUCTION_CLASSES): string {
  const lines = INSTRUCTION_CLASS_KEYS.map((k) => `- ${k}: ${table[k].semantics}`)
  return `Instruction classes — classify the instruction before editing. It is one or more of these; a multi-clause instruction gets every class it contains, and each one must be satisfied:
${lines.join('\n')}

If you cannot cleanly classify the instruction, or cannot split a multi-clause instruction into these classes, use ${PRESERVING_CLASS} — the preserving class. Never guess a destructive class.

${FRAGMENT_RULE}

${SUPERSEDES_RULE}

${CONSTRAINS_RULE}`
}

// ── Text-reduction lexicon (final F1 / I-2, final F1b, final F1d) ────────────
//
// The model classifies its own instruction, so "reduce the text" answered as
// replace (the phrase is gone — contentAbsent is satisfied by a LONGER
// rewrite), as replace+remove (the wholesale exemption, Known limits: flat
// supersedes), or defaulted to add (FR-05) could pass without the text getting
// shorter. When the INSTRUCTION itself asks for less text, one extra
// deterministic post-condition runs, whatever the classes and with no
// wholesale exemption: the document's visible word count must strictly
// decrease. It is structural — zero model calls (AC-12).
//
// Governing principle: WHEN IN DOUBT, DON'T TRIGGER. The check is additive —
// when it does not fire, the classes and the Haiku judge still decide — while
// a false trigger is a guaranteed miss on a correct edit, on both attempts.
//
// The lexicon is deliberately NARROW. A text object — text(s), copy, word(s),
// word count, wording, paragraph(s), caption(s), body, description(s) — must
// be followed by a CLAUSE BOUNDARY (final F1b), optionally after up to four
// TAILS (final F1d).
// The clause boundary is one of:
//   - the end of the instruction;
//   - . ; : ! ? or a quote or closing bracket — but never an apostrophe-s
//     ("the text's size");
//   - a comma, or a conjunction: and, but, so, then, while, or ("reduce the
//     text so it fits" triggers, as it should);
//   - a new chat-style clause: it / this / that / there + is / 's / looks /
//     feels / seems ("reduce the text it is too busy");
//   - a location tail: on|in|within|inside|across|throughout|from|at +
//     the|this|that|my|our + a word ("reduce the text on the right panel",
//     "… inside the card"; "in size" is not one);
//   - a purpose clause from a closed list: "to make it" + cleaner / clearer /
//     simpler / tidier / more readable / easier to read / less busy /
//     cluttered / crowded / wordy / dense, then a boundary ("to make it
//     smaller" is not one).
// A tail is a degree or scope word, or an amount of content, and none is a
// size word (final F1d):
//   - a bit, a little, a lot, slightly, further, significantly, considerably,
//     drastically, substantially, please, more, even / much / far / way +
//     more / further, again, overall, here, everywhere, down, in half, for
//     mobile ("reduce the text a bit more", "cut the text down", "cut the copy
//     in half");
//   - by + an amount of CONTENT, optionally after about / around / roughly /
//     approximately / nearly / almost / at least / over / more than / up to:
//     half, a half, a third, a quarter, a lot, a bit, a little, much, or N
//     words / lines / sentences ("reduce the text by about half"). "by 2px",
//     "by 4pt", "by 0.5rem" are sizes and never trigger; a percentage is
//     ambiguous between content and size, so "by 20%" never triggers.
// Tails chain ("trim the text down a bit", "reduce the text by half again"),
// but the last must be followed by a boundary, so "reduce the text a bit
// smaller", "reduce the text down to 12px" and "reduce the text more than the
// logo" do not trigger.
// SIZE VOID (final F1d): after a comma, a conjunction or a chat-style clause,
// a SIZE WORD — size(s), smaller, bigger, larger, font(s), scale, tiny, huge —
// in the same clause voids that boundary: a coordinated resize, not a
// reduction. "The same clause" is the next six words, stopping at . ; ? or !,
// and stopping at a NEW VERB (make, keep, move, add, use, change, put), which
// starts a clause about something else. So "reduce the text and logo size",
// "reduce the text and image size a little" and "reduce the text, the font is
// too big" do not trigger, while "reduce the body text, and make the logo
// bigger" does. One exception to the new-verb stop: a new verb whose object is
// it / them / this / that / these / those refers back to the text, so "reduce
// the text, make it smaller" (and "…, and make them bigger") is voided too.
// So a content noun used as a MODIFIER — "the body text size", "the caption
// text size", "the body copy font size", "the text overlay", "the
// text-shadow", "the text's size" — is followed by a visual word, a hyphen or
// an apostrophe-s, none of which is a boundary, and does not trigger.
//
// The phrasings (all case-insensitive, anchored on word boundaries):
//   1. a reducing verb — reduce, shorten, trim, cut, condense (optionally
//      "down"/"back"/"out") — then optional determiners/quantities (the, all
//      of the, the amount of, the number of, …), then at most ONE arbitrary
//      word ("the supporting text", "the long text", "the body text"), then
//      the text object and a boundary;
//   2. less / fewer, then optional determiners/quantities, then the text
//      object and a boundary ("use less text", "fewer words please") — no
//      arbitrary word, so "less bold text" never triggers;
//   3. "shorter" / "briefer" / "more concise" said of a text object — after
//      make/keep/get/have or at the start ("make the copy more concise", "the
//      caption should be shorter"), then a boundary;
//   4. "shorter" / "briefer" / "more concise" before the text object, with
//      optional determiners only ("shorter text", "more concise copy"), then a
//      boundary.
//
// Known limits (the boundary): phrasings outside the lexicon — "tighten the
// copy", "shorten the headline", "too much text", "minimise the text", "make
// the text concise", "too wordy", other languages — remain
// classifier-dependent: they are checked only by the classes the model
// declared. So does a clause ending in a boundary or tail the list does not
// name (an em dash, "reduce the text massively", "reduce the text to the
// essentials"). A match inside it can false-miss (fail closed): "shorten the
// caption and add a tagline" must still lower the whole document's word
// count; new copy quoted in the instruction ("change the headline to \"Less
// text, more impact\"") matches; "reduce the text slightly" or "reduce the
// text so it does not overlap the logo" may have meant a resize.
// A size clause after the boundary never switches the check off (F1d
// re-review): for replace/constrain no judge runs, so a switched-off check is
// a zero-call PASS — "less text, bigger font" answered with a longer rewrite
// passed under F1d's "size void". A real reduction plus a resize still passes
// (the word count falls); a coordinated pure resize ("reduce the text and logo
// size", "reduce the text, make it smaller") false-misses — fail closed, Use
// anyway.
export const TEXT_REDUCTION_CHECK = 'text-reduction' as const

const REDUCING_VERB = String.raw`(?:reduce|reducing|shorten|shortening|trim|trimming|cut|cutting|condense|condensing)(?:\s+(?:down|back|out))?`
const FEWER = String.raw`(?:less|fewer)`
const SHORTER = String.raw`(?:shorter|briefer|more\s+concise)`
// Determiners and quantities, any number of them ("all of the", "the amount of").
const DETERMINERS = String.raw`(?:(?:the|this|that|these|those|all|some|of|a|bit|little|lot|amount|number|length|my|our|your)\s+)*`
// At most one arbitrary word before the object ("supporting", "body", "sub-heading").
const ONE_WORD = String.raw`(?:[\p{L}\p{N}][\p{L}\p{N}-]*\s+)?`
const TEXT_OBJECT = String.raw`(?:word[\s-]+counts?|texts?|copy|words?|wording|paragraphs?|captions?|body|descriptions?)`
const PRONOUN_CLAUSE = String.raw`(?:it|this|that|there)(?:\s+(?:is|looks|feels|seems)\b|['’]s\b)`
const CLAUSE_END = String.raw`(?:\s*$|\s*[.;:!?)\]}"“”«»]|\s*['‘’](?!s\b)|(?:\s*,|\s+(?:and|but|so|then|while|or)\b|\s+${PRONOUN_CLAUSE}))`
const LOCATION_TAIL = String.raw`\s+(?:on|in|within|inside|across|throughout|from|at)\s+(?:the|this|that|my|our)\s+[\p{L}\p{N}]`
const PURPOSE_TAIL = String.raw`\s+to\s+make\s+it\s+(?:cleaner|clearer|simpler|tidier|more\s+readable|easier\s+to\s+read|less\s+(?:busy|cluttered|crowded|wordy|dense))${CLAUSE_END}`
const APPROX = String.raw`(?:about|around|roughly|approximately|nearly|almost|at\s+least|over|more\s+than|up\s+to)`
const CONTENT_AMOUNT = String.raw`by\s+(?:${APPROX}\s+)?(?:(?:a\s+|one\s+)?half|a\s+third|one\s+third|a\s+quarter|one\s+quarter|a\s+(?:lot|bit|little)|much|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a\s+few|a\s+couple\s+of)\s+(?:words?|lines?|sentences?))`
const DEGREE_WORD = String.raw`(?:a\s+(?:bit|little|lot)|slightly|further|significantly|considerably|drastically|substantially|please|(?:even|much|far|way)\s+(?:more|further)|more|again|overall|here|everywhere|down|in\s+half|for\s+mobile)`
// Up to four tails ("a bit more", "down a bit", "by half again").
const DEGREE_TAIL = String.raw`(?:\s+(?:${DEGREE_WORD}|${CONTENT_AMOUNT})){0,4}`
// What must follow the text object: optional tails, then a clause boundary.
const BOUNDARY = String.raw`(?=${DEGREE_TAIL}(?:${CLAUSE_END}|${LOCATION_TAIL}|${PURPOSE_TAIL}))`
const COPULA = String.raw`(?:(?:should|must|could|can)\s+be\s+|needs?\s+to\s+be\s+|is\s+|are\s+)?`
const DEGREE = String.raw`(?:(?:a\s+)?(?:bit|little|lot|much|far)\s+)?`

export const TEXT_REDUCTION_LEXICON: readonly RegExp[] = [
  new RegExp(String.raw`\b${REDUCING_VERB}\s+${DETERMINERS}${ONE_WORD}${TEXT_OBJECT}\b${BOUNDARY}`, 'iu'),
  new RegExp(String.raw`\b${FEWER}\s+${DETERMINERS}${TEXT_OBJECT}\b${BOUNDARY}`, 'iu'),
  new RegExp(String.raw`(?:^\s*|\b(?:make|keep|get|have)\s+)${DETERMINERS}${ONE_WORD}${TEXT_OBJECT}\s+${COPULA}${DEGREE}${SHORTER}\b${BOUNDARY}`, 'iu'),
  new RegExp(String.raw`\b${SHORTER}\s+${DETERMINERS}${TEXT_OBJECT}\b${BOUNDARY}`, 'iu'),
]

export function asksForTextReduction(instruction: string): boolean {
  return TEXT_REDUCTION_LEXICON.some((re) => re.test(instruction))
}

function visibleWordCountDecreased(before: DomFacts, after: DomFacts): PostConditionResult {
  const w0 = wordCount(before.text)
  const w1 = wordCount(after.text)
  return w1 < w0
    ? { ok: true }
    : {
        ok: false,
        reason: `text reduction: the instruction asks for less text, but the visible word count did not go down (${w0} → ${w1}) — the result must have fewer words, not a rewrite of the same length or longer`,
      }
}

// Runs every class's post-condition from the table (the verifier consumer;
// classes with a null post-condition — add — are skipped for the model
// verifier), plus the text-reduction check when the instruction is in the
// lexicon — whatever the classes.
export function checkPostConditions(
  input: PostConditionInput,
  table: InstructionClassTable = INSTRUCTION_CLASSES,
): Array<{ class: InstructionClass | typeof TEXT_REDUCTION_CHECK; result: PostConditionResult }> {
  const results: Array<{ class: InstructionClass | typeof TEXT_REDUCTION_CHECK; result: PostConditionResult }> =
    input.classes.flatMap((c) => {
      const pc = table[c].postCondition
      return pc ? [{ class: c, result: pc(input, table) }] : []
    })
  if (input.instruction && asksForTextReduction(input.instruction)) {
    results.push({ class: TEXT_REDUCTION_CHECK, result: visibleWordCountDecreased(input.before, input.after) })
  }
  return results
}
