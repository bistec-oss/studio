// Parses the refine model's reply into { classes, supersedes, html } (FR-01).
//
// Wire format — two optional header lines, then the document, unchanged:
//
//   REFINE-CLASSES: add, constrain
//   REFINE-SUPERSEDES: the hero image; the old footer tagline
//   <!DOCTYPE html>
//   …
//   </html>
//
// Why a line header rather than a JSON envelope: the document is the bulk of the
// reply (often >100 KB, frequently carrying inline base64 and non-Latin copy), and
// a single-shot CLI model asked to put that inside a JSON string has to escape
// every quote, newline and backslash in it for thousands of lines without a single
// slip. That is the one part of the reply we cannot afford to have re-encoded. Two
// short lines in front of a document the model was already going to emit verbatim
// cost it nothing — and they land *outside* the document, which is exactly the
// region extractHtmlDocument already isolates. So the envelope parse adds no new
// boundary: it reuses the proven one and reads the header out of `discarded`.
//
// The governing lesson (CLAUDE.md, 2026-08-03 preamble incident): "a prompt rule
// is not an invariant… validate model output by extracting what you need, not by
// asserting that it's in there somewhere." Nothing here assumes the reply has the
// requested shape. Every way the envelope can be absent, partial, decorated or
// nonsense resolves to the preserving default (FR-05) — the parser can never
// upgrade a reply into a destructive class it did not unambiguously state.
//
// Pure — no I/O.

import { extractHtmlDocument } from '@/lib/agent/htmlDocument'
import {
  INSTRUCTION_CLASS_KEYS,
  isInstructionClass,
  type InstructionClass,
} from '@/lib/agent/instructionClasses'

// The closed set (FR-06) is defined ONCE, in `instructionClasses.ts`, which keys
// its semantics/post-condition table by exactly these names. This module imports
// that vocabulary rather than restating it: a second hand-maintained list is the
// drift AC-19 forbids ("no second definition exists to fall out of sync"), and a
// parser that accepted a class the table cannot verify would hand the route a
// class with no post-condition. Re-exported purely as a convenience alias so
// callers and tests can name the accept-list without a second import.
export const INSTRUCTION_CLASS_NAMES = INSTRUCTION_CLASS_KEYS

export type { InstructionClass }

// FR-05's resolution for every ambiguous case. `add` alone, not `add` + `constrain`:
// both are preserving, but `constrain` asserts a bounded attribute that an
// unclassifiable instruction has not named, so pairing it in would hand the
// verifier a post-condition with no target. `add` is the "keep everything, then do
// what was asked" class — today's unconditional behaviour, which is the safe floor.
export const DEFAULT_INSTRUCTION_CLASSES: readonly InstructionClass[] = ['add']

/** Why the preserving default was substituted — logged, never acted on. */
export type EnvelopeAmbiguity =
  /** Neither header line present: the model ignored the envelope entirely. */
  | 'no-envelope'
  /** A SUPERSEDES line but no CLASSES line — a partial envelope. */
  | 'missing-classes'
  /** CLASSES present but nothing survived normalization (blank, "none", stray comma). */
  | 'empty-classes'
  /** CLASSES carried at least one item outside the closed set — see `unrecognized`. */
  | 'unrecognized-class'

export interface ParsedRefineEnvelope {
  /** Never empty. Equals DEFAULT_INSTRUCTION_CLASSES whenever `defaulted` is true. */
  classes: InstructionClass[]
  /**
   * Named elements the model claims are superseded — untrusted model text,
   * normalized but not validated against the document. Reported as stated, and
   * MAY be empty alongside a destructive class: FR-04 ("replace/remove are
   * permitted only when supersedes is non-empty") is enforced by the refine
   * ROUTE, not here and not by the prompt. The parser reports; the route decides.
   */
  supersedes: string[]
  /** The document, cut by extractHtmlDocument. */
  html: string
  /** True when FR-05's preserving default replaced what the model said. */
  defaulted: boolean
  /** Present iff `defaulted` — which failure mode produced the default. */
  ambiguity?: EnvelopeAmbiguity
  /** Class items outside the closed set, verbatim, for logging. */
  unrecognized: string[]
  /**
   * Narration that surrounded the document, with the consumed header lines
   * removed so logs show only genuine model chatter — "a narrating model is
   * worth seeing" (CLAUDE.md).
   */
  discarded: string
}

// Header lines. Deliberately liberal about decoration (markdown bold, bullets,
// blockquote markers, backticks, the optional REFINE- prefix) because that is the
// noise a model adds for free, and strict about everything after the colon —
// where leniency could change the meaning. `m` so the line can sit anywhere in
// the surrounding text; only the first match is taken.
const CLASSES_LINE_RE = /^[ \t]*[-*>`\s]*(?:refine[-_ ]?)?\*{0,2}classes\*{0,2}[ \t]*:[ \t]*(.*)$/im
const SUPERSEDES_LINE_RE =
  /^[ \t]*[-*>`\s]*(?:refine[-_ ]?)?\*{0,2}supersedes\*{0,2}[ \t]*:[ \t]*(.*)$/im

// A model told "list the superseded elements, or nothing" writes one of these
// rather than leaving the line blank. All mean empty.
// (Purely punctuational answers — "-", "[]" — normalize to the empty string
// before this set is consulted, so they need no entry.)
const EMPTY_SENTINELS = new Set(['none', 'n/a', 'na', 'nil', 'null', 'empty'])

// Untrusted-input caps. Generous enough that no honest answer is clipped, small
// enough that a runaway reply cannot push megabytes of model text downstream.
const MAX_SUPERSEDES_ITEMS = 10
const MAX_SUPERSEDES_LENGTH = 200

/** Pulls the first matching header line out of `text`, returning it and the remainder. */
function takeHeaderLine(text: string, re: RegExp): { value: string | null; rest: string } {
  const m = re.exec(text)
  if (!m) return { value: null, rest: text }
  return { value: m[1], rest: text.slice(0, m.index) + text.slice(m.index + m[0].length) }
}

/** Strips surrounding decoration (quotes, backticks, asterisks, bullets, punctuation). */
function stripDecoration(item: string): string {
  return item.trim().replace(/^[^a-z0-9]+/i, '').replace(/[^a-z0-9)\]]+$/i, '')
}

function parseClasses(raw: string | null): {
  classes: InstructionClass[]
  unrecognized: string[]
  ambiguity?: EnvelopeAmbiguity
} {
  if (raw === null) return { classes: [], unrecognized: [], ambiguity: undefined }

  const classes: InstructionClass[] = []
  const unrecognized: string[] = []

  for (const item of raw.split(/[,;/]/)) {
    const token = stripDecoration(item).toLowerCase()
    // A blank item is punctuation noise ("add, ") — not evidence of confusion.
    if (!token || EMPTY_SENTINELS.has(token)) continue
    if (isInstructionClass(token)) {
      if (!classes.includes(token)) classes.push(token)
    } else {
      unrecognized.push(item.trim())
    }
  }

  // Strictness is free here because the failure direction is preservation. An item
  // the closed set does not contain — a misspelling, a synonym, a parenthetical,
  // "unsure", a whole sentence — is precisely FR-05's "a multi-clause instruction
  // the model cannot cleanly partition", so the WHOLE classification is discarded
  // rather than cherry-picking the tokens we happened to recognise. Keeping
  // `remove` out of "remove, restyle" would act destructively on a reply we only
  // half understood.
  if (unrecognized.length > 0) return { classes: [], unrecognized, ambiguity: 'unrecognized-class' }
  if (classes.length === 0) return { classes: [], unrecognized, ambiguity: 'empty-classes' }
  return { classes, unrecognized }
}

function parseSupersedes(raw: string | null): string[] {
  if (raw === null) return []

  const out: string[] = []
  const seen = new Set<string>()
  // Split on semicolons and newlines only — never commas. Element names are free
  // text written by the model ("the headline, top left") and a comma split would
  // saw one name into two half-names that match nothing.
  for (const item of raw.split(/[;\n]/)) {
    const value = stripDecoration(item).replace(/\s+/g, ' ').slice(0, MAX_SUPERSEDES_LENGTH)
    if (!value || EMPTY_SENTINELS.has(value.toLowerCase())) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
    if (out.length >= MAX_SUPERSEDES_ITEMS) break
  }
  return out
}

/**
 * Returns null when the reply contains no HTML document at all — same contract as
 * extractHtmlDocument, and for the same reason: a reply with no document is
 * unsalvageable, so there is nothing to default to. A reply WITH a document but
 * without an envelope is salvageable and takes the FR-05 preserving default,
 * because the document is the part that matters and today's behaviour (apply the
 * edit, preserve the rest) is exactly what the default encodes.
 */
export function parseRefineEnvelope(raw: string): ParsedRefineEnvelope | null {
  const doc = extractHtmlDocument(raw)
  if (!doc) return null

  // Only the text OUTSIDE the document is searched for the header. An envelope
  // line quoted inside the design's own markup — a post about this very feature,
  // a code sample, an alt attribute — is content, not instruction, and cannot
  // reclassify the edit.
  const fromClasses = takeHeaderLine(doc.discarded, CLASSES_LINE_RE)
  const fromSupersedes = takeHeaderLine(fromClasses.rest, SUPERSEDES_LINE_RE)

  const parsed = parseClasses(fromClasses.value)
  const supersedes = parseSupersedes(fromSupersedes.value)

  const ambiguity: EnvelopeAmbiguity | undefined =
    parsed.classes.length > 0
      ? undefined
      : (parsed.ambiguity ?? (fromSupersedes.value === null ? 'no-envelope' : 'missing-classes'))

  const defaulted = ambiguity !== undefined

  return {
    classes: defaulted ? [...DEFAULT_INSTRUCTION_CLASSES] : parsed.classes,
    supersedes,
    html: doc.html,
    defaulted,
    ...(ambiguity ? { ambiguity } : {}),
    unrecognized: parsed.unrecognized,
    discarded: fromSupersedes.rest.trim(),
  }
}
