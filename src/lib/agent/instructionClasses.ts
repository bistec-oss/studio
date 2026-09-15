// The instruction taxonomy — ONE table, two consumers (FR-06).
//
// A refine instruction is not all one kind of change. "include a human
// character" must keep everything already on the canvas; "use the uploaded
// image as the background" must throw the old decorative visual away. The refine
// prompt used to say "Preserve everything the instruction does not touch" to
// every instruction alike, which is why a replacement produced two backgrounds
// instead of one — the prompt licensed exactly the wrong thing (FR-03).
//
// Each class therefore carries two halves of the same rule:
//   - `semantics`     — the prose prompts/refine.ts renders into the system
//                       prompt, telling the model what this class licenses.
//   - `postCondition` — the deterministic check drafts/refineVerify.ts runs
//                       afterwards, proving the model actually did it.
// Both come out of this object, so the rule the model is given and the rule it
// is judged by cannot drift apart (AC-19). There is no second copy to forget.
//
// The project's own recorded lesson is the reason the second half exists at all:
// "a prompt rule is not an invariant" — "validate model output by extracting
// what you need, not by asserting that it's in there somewhere". The semantics
// below are consequently written the way that lesson says sticks: MEASURABLE
// ("that substring must not appear anywhere in your output"), never adjectival
// ("remove the old visual cleanly"). Every rule in a `semantics` string is one
// its `postCondition` can actually measure.
//
// Pure, synchronous, no I/O. See the note on PostCondition for why the
// synchronous signature is load-bearing.

export type InstructionClass = 'add' | 'replace' | 'remove' | 'constrain'

// Everything a post-condition is allowed to look at. Assembled once by the
// caller and handed to whichever classes the model returned.
//
// Why before AND after: the structural questions are comparative, not
// absolute. "The target text is measurably shorter" has no meaning without the
// prior length, and "the superseded element is absent" is indistinguishable
// from "the model named an element that never existed" unless we can see that
// it WAS there first (the spec's own edge case: a supersedes entry naming
// something absent both before and after must fail, not pass).
//
// `supersedes` is the model's own naming of what it destroyed, and the
// semantics below require each entry to be a VERBATIM substring of the current
// HTML. That is the whole trick that makes destructive verification possible
// without a DOM: the check is then literal presence/absence, not a guess at
// what prose like "the decorative starburst" refers to.
//
// `instruction` is carried for completeness of the evidence bundle — no
// post-condition here reads it (each class's bound is proved structurally, not
// by parsing user prose), but `add` falls through to a model call in
// refineVerify.ts that does need it, and one input shape serves all four.
export interface PostConditionInput {
  /** The HTML as it was sent to the model. */
  before: string
  /** The HTML document extracted from the model's reply. */
  after: string
  /** The user's refine instruction, trimmed. */
  instruction: string
  /** Verbatim locators the model declared it superseded or deleted. */
  supersedes: string[]
}

export interface PostConditionResult {
  holds: boolean
  // Always populated, in both directions. On a miss this is the sentence made
  // explicit to the model on the single permitted retry (FR-11), so it states
  // the measurement that failed rather than a verdict — "the text 'Our mission'
  // is still present in the output", not "you did not do it properly".
  detail: string
}

// Synchronous on purpose. AC-12 requires `remove`, `constrain` and `replace` to
// verify with ZERO model calls; a Promise-returning signature would make a
// sneaked-in network call type-check. Keeping the return value plain makes the
// zero-call property structural rather than a convention someone has to respect.
export type PostCondition = (input: PostConditionInput) => PostConditionResult

export interface InstructionClassDefinition {
  /** Prompt prose. Rendered verbatim into the refine system prompt. */
  semantics: string
  /** null for `add` only — it is the one class with nothing deterministic to measure. */
  postCondition: PostCondition | null
}

// ---------------------------------------------------------------------------
// Measurement primitives
//
// There is no DOM parser in this project's dependencies and this change does
// not add one, so every structural check below is string-level over the HTML.
// Exported because refineVerify.ts extracts the same facts for `add`'s model
// call, and a second implementation there would measure differently.
//
// What these CANNOT see, stated plainly because the verifier's behaviour
// depends on knowing it:
//   - Anything computed. A rule in a <style> block, an inherited value, or an
//     element hidden by a selector that matches it is invisible here; only the
//     literal markup is read.
//   - Element identity. An element is a tag name and some text, not a node —
//     two <div>s that swapped places look identical to elementCounts().
//   - Entity vs character. `&amp;` and `&` are different strings, so a model
//     that re-encodes text changes the measured text without changing what a
//     reader sees.
//   - Tag-shaped text. A `<div>` written inside an attribute value counts as an
//     element; script and style bodies and comments are stripped first, which
//     removes the common cases, but attribute values are not parsed.
// ---------------------------------------------------------------------------

const COMMENT_RE = /<!--[\s\S]*?-->/g
// Non-rendered element bodies. Stripped before tags so that markup written
// inside a script string or a CSS content property is not counted as content.
const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const TAG_RE = /<[^>]*>/g
const OPEN_TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g

/** The text a reader would see, whitespace-collapsed so reformatting is not a change. */
export function visibleText(html: string): string {
  return html
    .replace(COMMENT_RE, ' ')
    .replace(SCRIPT_STYLE_RE, ' ')
    .replace(TAG_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Literal, non-overlapping occurrences of `needle` in `haystack`. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
    count += 1
  }
  return count
}

/** Multiset of opening-tag names, ignoring comments and script/style bodies. */
function elementCounts(html: string): Map<string, number> {
  const stripped = html.replace(COMMENT_RE, ' ').replace(SCRIPT_STYLE_RE, ' ')
  const counts = new Map<string, number>()
  for (let m = OPEN_TAG_RE.exec(stripped); m; m = OPEN_TAG_RE.exec(stripped)) {
    const tag = m[1].toLowerCase()
    counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  OPEN_TAG_RE.lastIndex = 0
  return counts
}

function sameElements(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false
  for (const [tag, n] of a) if (b.get(tag) !== n) return false
  return true
}

/** Locators the model actually named, with blanks discarded. */
function locators(supersedes: string[]): string[] {
  return supersedes.map((s) => s.trim()).filter((s) => s.length > 0)
}

// ---------------------------------------------------------------------------
// Post-conditions
// ---------------------------------------------------------------------------

// `replace`: every named locator was in the document and is now gone.
//
// Both halves matter. Present-before rejects a model that invented a locator to
// satisfy the format (the spec's edge case) — an element that never existed
// cannot have been superseded, and treating that as a pass would be exactly the
// silent success this change exists to stop. Absent-after is the actual claim.
//
// Reached only with a non-empty `supersedes`: the route downgrades a
// destructive class with no named target to the preserving behaviour before
// verification (FR-04/AC-10). An empty list arriving here anyway fails closed.
const supersededElementAbsent: PostCondition = ({ before, after, supersedes }) => {
  const named = locators(supersedes)
  if (named.length === 0) {
    return { holds: false, detail: 'No superseded element was named, so nothing could be proved absent.' }
  }
  for (const locator of named) {
    if (countOccurrences(before, locator) === 0) {
      return {
        holds: false,
        detail: `The superseded element was named as "${locator}", but that text does not appear in the current design, so nothing by that name was replaced.`,
      }
    }
    if (countOccurrences(after, locator) > 0) {
      return {
        holds: false,
        detail: `The superseded element "${locator}" is still present in the output. Delete its markup rather than hiding or covering it.`,
      }
    }
  }
  return { holds: true, detail: `All ${named.length} superseded element(s) are absent from the output.` }
}

// `remove`: the named content is gone and nothing grew to replace it.
//
// Named absence does the work (same locator rule as `replace`); the length
// comparison is the "measurably shorter" half of AC-08 and guards the failure
// mode that absence alone cannot see — the model deletes the named sentence and
// writes a longer one two lines down, so the deletion "happened" and the design
// reads the same. Strict inequality applies when the deleted locator carried
// visible text; a purely structural deletion (an <img>, a decorative <div>) is
// held to no-growth instead, because removing it cannot shorten any text.
const targetTextShorter: PostCondition = ({ before, after, supersedes }) => {
  const named = locators(supersedes)
  if (named.length === 0) {
    return { holds: false, detail: 'No deleted element was named, so nothing could be proved removed.' }
  }
  let removedText = false
  for (const locator of named) {
    if (countOccurrences(before, locator) === 0) {
      return {
        holds: false,
        detail: `The deleted content was named as "${locator}", but that text does not appear in the current design, so nothing by that name was removed.`,
      }
    }
    if (countOccurrences(after, locator) > 0) {
      return {
        holds: false,
        detail: `The content "${locator}" is still present in the output. Delete its markup rather than hiding it.`,
      }
    }
    if (visibleText(locator).length > 0) removedText = true
  }

  const beforeLength = visibleText(before).length
  const afterLength = visibleText(after).length
  if (removedText && afterLength >= beforeLength) {
    return {
      holds: false,
      detail: `The removed content carried text, but the output has ${afterLength} visible characters against the current design's ${beforeLength}. Do not add or lengthen other copy to compensate.`,
    }
  }
  if (afterLength > beforeLength) {
    return {
      holds: false,
      detail: `The output has more visible text than the current design (${afterLength} characters against ${beforeLength}). A removal adds nothing.`,
    }
  }
  return { holds: true, detail: `Named content removed; visible text went from ${beforeLength} to ${afterLength} characters.` }
}

// `constrain`: values moved, and nothing else did.
//
// WORKED EXAMPLE (the one the spec owed — `constrain` was the only class with no
// example, so the classifier boundary was a guess):
//
//   Instruction: "make the headline bigger"
//   Class:       constrain — it bounds a property (the headline's font-size) of
//                something already on the canvas and licenses nothing new.
//   Holds:       the output carries the same elements and the same visible text
//                as the current design, and is not byte-identical to it —
//                i.e. only values changed.
//   Fails:       the model enlarges the headline AND adds a decorative panel to
//                rebalance the composition. The element multiset grew, so the
//                edit was not a constraint; the user did not ask for a panel.
//   Fails:       the model returns the document unchanged. Nothing was applied.
//
// The boundary this draws against the other three classes, in the same terms:
//   "make the headline bigger"                 → constrain (a value moves)
//   "don't use red anywhere"                   → constrain (values move)
//   "add a subheading under the headline"      → add       (an element appears)
//   "use the uploaded image as the background" → replace   (an element goes)
//   "shorten the headline"                     → remove    (the copy changes)
// The test is mechanical: if satisfying the instruction requires a different set
// of elements or different words, it is not a constraint.
const boundedAttributeHolds: PostCondition = ({ before, after }) => {
  // Whitespace-collapsed, so re-indenting the document is not mistaken for
  // applying the instruction — it is the one change that alters every byte and
  // nothing a reader can see.
  const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
  if (collapse(after) === collapse(before)) {
    return { holds: false, detail: 'The output is identical to the current design — the instruction was not applied.' }
  }
  if (!sameElements(elementCounts(before), elementCounts(after))) {
    return {
      holds: false,
      detail:
        'The output does not contain the same elements as the current design. A constraint changes attribute and CSS values only — it adds and deletes nothing.',
    }
  }
  const beforeText = visibleText(before)
  const afterText = visibleText(after)
  if (beforeText !== afterText) {
    return {
      holds: false,
      detail: 'The visible text changed. A constraint changes values only — leave every word exactly as it is.',
    }
  }
  return { holds: true, detail: 'Same elements and same visible text as the current design; only values differ.' }
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export const INSTRUCTION_CLASSES: Record<InstructionClass, InstructionClassDefinition> = {
  add: {
    semantics: `add — the instruction introduces new content. Keep every existing element, its text, and its CSS exactly as they are: the only difference between the current design and your output is the new content the instruction asks for. Do not delete, reword, resize, restyle, or re-lay-out anything to make room for it. Leave "supersedes" empty.`,
    // The one class with no deterministic post-condition, and the reason FR-08
    // reserves exactly one model call: "is there a human character in this
    // design now" is not a string measurement, and the design may already have
    // contained something similar, so presence before and after proves nothing.
    postCondition: null,
  },

  replace: {
    semantics: `replace — the instruction supersedes something already in the design. Delete the superseded element's markup: hiding it with display:none, opacity, z-index, or by covering it with the new content does NOT count, and leaves the design carrying both. For every element you supersede, put one verbatim substring of the current HTML that identifies it — its id, its class attribute, or its exact opening tag — into "supersedes"; each of those substrings must not appear anywhere in your output. Everything the instruction does not supersede stays exactly as it is.`,
    postCondition: supersededElementAbsent,
  },

  remove: {
    semantics: `remove — the instruction deletes named content and puts nothing in its place. Delete the markup, not just its visibility. For every deletion, put one verbatim substring of the current HTML that identifies it into "supersedes"; each of those substrings must be absent from your output. Your output must contain less visible text than the current design — do not lengthen other copy or add elements to fill the gap.`,
    postCondition: targetTextShorter,
  },

  constrain: {
    semantics: `constrain — the instruction bounds a property of the design without changing what is in it. Change attribute and CSS values only: your output must contain the same elements as the current design, carrying the same visible text word for word, with only values — size, colour, weight, spacing, position — different. Your output must not be identical to the current design. If satisfying the instruction needs a new element or reworded copy, it is not a constraint: classify it as "add", "replace", or "remove" instead. Leave "supersedes" empty.`,
    postCondition: boundedAttributeHolds,
  },
}

// Derived from the table, never listed separately, so a fifth class is added in
// exactly one place.
export const INSTRUCTION_CLASS_KEYS = Object.keys(INSTRUCTION_CLASSES) as InstructionClass[]

/** Narrowing guard for the envelope parser — a class the model invented is not one. */
export function isInstructionClass(value: unknown): value is InstructionClass {
  return typeof value === 'string' && Object.hasOwn(INSTRUCTION_CLASSES, value)
}
