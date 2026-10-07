// Parses the refine model's reply envelope (change 004 Phase 2, FR-01).
//
// The refine call returns its instruction classification and the edited
// document in ONE response — there is no separate classifier call.
//
// ── Wire format ──────────────────────────────────────────────────────────────
// A small JSON header, then the complete HTML document:
//
//   ```json
//   {"classes": ["replace", "constrain"],
//    "supersedes": ["https://…/old-background.png"],
//    "constrains": [{"fragment": "#headline", "direction": "decrease"}]}
//   ```
//   <!DOCTYPE html>
//   <html>…</html>
//
//   - `classes`    — one or more of add | replace | remove | constrain
//                    (instructionClasses.ts). Order is kept.
//   - `supersedes` — fragments of the ORIGINAL document naming what a
//                    replace/remove deletes (rules: instructionClasses.ts).
//   - `constrains` — optional; [{fragment, direction?: "decrease"|"increase"}]
//                    naming each element a constrain bounds. Same fragment
//                    rules. A bare string entry is accepted as {fragment}.
//   - The header comes BEFORE the document. The code fence is optional.
//
// Why this shape: the document is never inside JSON. A 50 KB HTML string in a
// JSON field would have to survive the model's JSON-escaping of every quote and
// newline; one slip and the whole reply is lost. Instead the document is cut by
// extractHtmlDocument — the same boundary every other design surface uses, which
// already tolerates chat narration and code fences (the 2026-08-03 preamble
// incident). The header is looked for only OUTSIDE that cut: first in the text
// before the document (the last JSON object there carrying `classes`,
// `supersedes` or `constrains`), then, as a fallback for a model that put it
// last, in the text after it. JSON inside the document (a <script
// type="application/json">, CSS braces) is never read as the envelope.
//
// One exception: narration that MENTIONS "<!DOCTYPE html>" or "<html>" before
// the header makes extractHtmlDocument cut from that mention, swallowing the
// header into the document. So if the cut contains a header before its first
// <head>/<body>/<style> (before any real document structure) and another
// document start follows that header, the document is re-cut after the header.
// A doctype that preceded the header is carried onto the re-cut document when
// it has none of its own — the header may sit in a comment between the real
// <!DOCTYPE html> and <html>, and dropping the doctype would put the render in
// quirks mode (the 2026-08-03 class).
//
// ── Defaults (FR-05) ─────────────────────────────────────────────────────────
// No header, unparseable JSON, a missing/non-array `classes`, or no known class
// value surviving → classes ['add'] (the preserving class) with
// classificationDefaulted: true. Unknown class values are dropped; values are
// matched case- and whitespace-insensitively. A missing `supersedes` or
// `constrains` → []; an unknown direction is dropped (the target is kept).
// No HTML document at all → null (the caller treats the refine as failed).
//
// The parser does NOT enforce FR-04 (destructive classes need a named element)
// or the constrain-needs-a-target rule. That is the route's decision;
// effectiveClasses() is the helper it calls.
//
// Pure — no I/O.

import { extractHtmlDocument } from '@/lib/agent/htmlDocument'
import {
  INSTRUCTION_CLASSES,
  INSTRUCTION_CLASS_KEYS,
  PRESERVING_CLASS,
  type ConstrainTarget,
  type InstructionClass,
} from '@/lib/agent/instructionClasses'

export interface RefineEnvelope {
  classes: InstructionClass[] // never empty
  supersedes: string[]
  constrains: ConstrainTarget[]
  html: string
  // Narration around the envelope and document (header and fences removed),
  // for logging only — never rendered.
  discarded: string
  // True when the classification could not be read and was defaulted to
  // ['add'] (FR-05).
  classificationDefaulted: boolean
}

// ── Header location ──────────────────────────────────────────────────────────

interface Span {
  start: number
  end: number
}

// The end (exclusive) of the balanced JSON object starting at `start`, or -1.
// Braces inside JSON strings are skipped.
function balancedObjectEnd(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return i + 1
  }
  return -1
}

const HEADER_KEYS = ['classes', 'supersedes', 'constrains']

interface Header {
  value: Record<string, unknown>
  span: Span
}

// Every JSON object in `text` that parses and carries `classes`, `supersedes`
// or `constrains`, in order. Each '{' is tried as a start independently, so an
// unbalanced brace in narration cannot swallow the envelope that follows it.
function findHeaders(text: string): Header[] {
  const found: Header[] = []
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    const end = balancedObjectEnd(text, start)
    if (end === -1) continue
    let value: unknown
    try {
      value = JSON.parse(text.slice(start, end))
    } catch {
      continue
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && HEADER_KEYS.some((k) => k in value)) {
      found.push({ value: value as Record<string, unknown>, span: { start, end } })
      start = end - 1 // do not re-find objects nested inside this one
    }
  }
  return found
}

// ── Field normalisation ──────────────────────────────────────────────────────

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function normaliseClasses(v: unknown): InstructionClass[] {
  const out: InstructionClass[] = []
  for (const item of asList(v)) {
    if (typeof item !== 'string') continue
    const key = item.trim().toLowerCase()
    if ((INSTRUCTION_CLASS_KEYS as readonly string[]).includes(key) && !out.includes(key as InstructionClass)) {
      out.push(key as InstructionClass)
    }
  }
  return out
}

function normaliseSupersedes(v: unknown): string[] {
  const out: string[] = []
  for (const item of asList(v)) {
    if (typeof item !== 'string') continue
    const s = item.trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

// Targets de-duplicate by fragment (first wins).
function normaliseConstrains(v: unknown): ConstrainTarget[] {
  const out: ConstrainTarget[] = []
  for (const item of asObject(v) ? [v] : asList(v)) {
    const obj = asObject(item)
    const fragment = typeof item === 'string' ? item : obj?.fragment
    if (typeof fragment !== 'string' || !fragment.trim()) continue
    const f = fragment.trim()
    if (out.some((t) => t.fragment === f)) continue
    const d = typeof obj?.direction === 'string' ? obj.direction.trim().toLowerCase() : ''
    out.push(d === 'decrease' || d === 'increase' ? { fragment: f, direction: d } : { fragment: f })
  }
  return out
}

const FENCE_LINE_RE = /^[ \t]*```[\w-]*[ \t]*$/gm
const withoutSpan = (text: string, span?: Span) => (span ? text.slice(0, span.start) + text.slice(span.end) : text)

// ── Parser ───────────────────────────────────────────────────────────────────

const DOC_START_RE = /<!doctype\b|<html\b/gi
const STRUCTURE_RE = /<(head|body|style)\b/i

// Where the document sits in raw: extractHtmlDocument's cut, re-cut once past a
// header it swallowed (see the header comment).
// `at`/`length` locate the raw slice the document came from; `html` may
// additionally carry a doctype rescued from before the header.
function locateDocument(raw: string): { at: number; length: number; html: string } | null {
  const doc = extractHtmlDocument(raw)
  if (!doc || !doc.html) return null
  // extractHtmlDocument's html is a slice of raw beginning at the first
  // doctype/<html> match, so its first occurrence is exactly where it was cut.
  const at = raw.indexOf(doc.html)

  const structure = STRUCTURE_RE.exec(doc.html)
  const region = doc.html.slice(0, structure ? structure.index : doc.html.length)
  const docStarts = [...region.matchAll(DOC_START_RE)].map((m) => m.index)
  const swallowed = findHeaders(region)
    .filter((h) => docStarts.some((i) => i >= h.span.end))
    .at(-1)
  if (!swallowed) return { at, length: doc.html.length, html: doc.html }

  const restAt = at + swallowed.span.end
  const rest = raw.slice(restAt)
  const recut = extractHtmlDocument(rest)
  if (!recut || !recut.html) return { at, length: doc.html.length, html: doc.html }
  const doctype = /<!doctype[^>]*>/i.exec(doc.html.slice(0, swallowed.span.start))
  const html = doctype && !/^<!doctype\b/i.test(recut.html) ? `${doctype[0]}\n${recut.html}` : recut.html
  return { at: restAt + rest.indexOf(recut.html), length: recut.html.length, html }
}

export function parseRefineEnvelope(raw: string): RefineEnvelope | null {
  const doc = locateDocument(raw)
  if (!doc) return null

  const before = raw.slice(0, doc.at)
  const after = raw.slice(doc.at + doc.length)

  const beforeHeader = findHeaders(before).at(-1)
  const afterHeader = beforeHeader ? undefined : findHeaders(after)[0]
  const header = beforeHeader ?? afterHeader

  const classes = normaliseClasses(header?.value.classes)
  const supersedes = normaliseSupersedes(header?.value.supersedes)
  const constrains = normaliseConstrains(header?.value.constrains)
  const discarded = `${withoutSpan(before, beforeHeader?.span)}\n${withoutSpan(after, afterHeader?.span)}`
    .replace(FENCE_LINE_RE, '')
    .trim()

  const classificationDefaulted = classes.length === 0
  return {
    classes: classificationDefaulted ? [PRESERVING_CLASS] : classes,
    supersedes,
    constrains,
    html: doc.html,
    discarded,
    classificationDefaulted,
  }
}

// ── FR-04 helper for the route ───────────────────────────────────────────────

export interface EffectiveClasses {
  classes: InstructionClass[]
  // Classes downgraded because they named nothing: a destructive class with an
  // empty supersedes, or a constrain with no usable constrains target.
  // Non-empty means the classification was ambiguous (FR-04 → FR-05).
  downgraded: InstructionClass[]
}

// A destructive class (replace/remove) with no named superseded element is not
// permitted (AC-10), and a constrain with no named target cannot be verified.
// Either becomes the preserving class (add — which T14 verifies with the model
// verifier), and the downgrade is reported so the route can treat the
// classification as ambiguous. Order is kept, duplicates collapse.
export function effectiveClasses(parsed: {
  classes: InstructionClass[]
  supersedes: string[]
  constrains?: ConstrainTarget[]
}): EffectiveClasses {
  const named = parsed.supersedes.some((s) => s.trim().length > 0)
  const targeted = (parsed.constrains ?? []).some((t) => t.fragment.trim().length > 0)
  const classes: InstructionClass[] = []
  const downgraded: InstructionClass[] = []
  for (const c of parsed.classes) {
    const unnamed = INSTRUCTION_CLASSES[c].destructive ? !named : c === 'constrain' && !targeted
    const resolved = unnamed ? PRESERVING_CLASS : c
    if (resolved !== c) downgraded.push(c)
    if (!classes.includes(resolved)) classes.push(resolved)
  }
  return { classes, downgraded }
}

// ── Prompt consumer ──────────────────────────────────────────────────────────

// The example reply shown to the model. Kept beside the parser, and parsed by
// the unit tests, so the protocol text and the parser cannot disagree.
export const REFINE_ENVELOPE_EXAMPLE = `\`\`\`json
{"classes": ["replace", "constrain"], "supersedes": ["https://example.com/images/old-background.png"], "constrains": [{"fragment": "#headline", "direction": "decrease"}]}
\`\`\`
<!DOCTYPE html>
<html>…the complete updated document…</html>`

// The output-protocol lines for the refine prompt. T17 renders them directly
// AFTER instructionClasses.renderClassSemantics(), which states the fragment,
// supersedes and constrains rules once — this block only names the fields.
export function renderEnvelopeProtocol(): string {
  return `Reply format — two parts, in this order, and nothing else:
1. A JSON header on its own, before the HTML document: {"classes": [...], "supersedes": [...], "constrains": [...]}. "classes" lists every class the instruction contains, from: ${INSTRUCTION_CLASS_KEYS.join(', ')}. "supersedes" and "constrains" follow the rules above; use [] for a field that does not apply.
2. The complete updated HTML document, starting with <!DOCTYPE html> and ending with </html>. Never put the HTML inside the JSON.
Example:
${REFINE_ENVELOPE_EXAMPLE}`
}
