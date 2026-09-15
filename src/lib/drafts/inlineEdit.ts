// Pure, node-safe helpers shared by the inline-edit route (sanitize + guard) and
// the InlineEditModal client (chrome-strip). Regex-based on purpose: no DOM
// parser is available server-side, and this is defense-in-depth — the renderer
// egress is already allowlisted and edited HTML is never served back as HTML.

// Remove <script>…</script> elements and on*="…" event-handler attributes.
// Regex-based defense-in-depth with known limits (e.g. an unclosed <script>,
// or a handler attribute not preceded by whitespace, can slip past). The real
// safety net is structural: the iframe never sets allow-scripts, the renderer's
// egress is allowlisted (MinIO + Google Fonts only), and this HTML is never
// re-served to a browser as a live document — only rendered to a PNG.
export function sanitizeInlineHtml(html: string): string {
  return (
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/>/gi, '')
      // on<event>="…" | on<event>='…' | on<event>=unquoted
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
  )
}

// Remove editor-injected chrome so the saved HTML is structurally a normal
// snapshot: contenteditable attrs, the injected style block, the banner, and
// the replace-photo wrappers (unwrapped to leave the <img> in place).
export function stripEditingChrome(html: string): string {
  return html
    .replace(/\scontenteditable(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
    .replace(/<style\b[^>]*id\s*=\s*["']inline-edit-style["'][^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(
      /<div\b[^>]*data-inline-edit-chrome\s*=\s*["']banner["'][^>]*>[\s\S]*?<\/div\s*>/gi,
      '',
    )
    .replace(/<button\b[^>]*data-inline-edit-chrome\s*=\s*["']img-btn["'][^>]*>[\s\S]*?<\/button\s*>/gi, '')
    .replace(
      /<span\b[^>]*data-inline-edit-chrome\s*=\s*["']img-wrap["'][^>]*>([\s\S]*?)<\/span\s*>/gi,
      '$1',
    )
}

export function inlineEditBlockReason(status: string, pendingAction: string | null): string | null {
  if (pendingAction !== null) return 'Another action is already running on this draft'
  if (status !== 'EXPORTED' && status !== 'PUBLISHED') {
    return 'Only exported drafts can be edited inline'
  }
  return null
}

// ===========================================================================
// Element-targeted edit inputs — closed allow-list grammars (FR-15, FR-16)
// ===========================================================================
//
// These are NOT sanitizers and must not be read as hardening the two functions
// above. `sanitizeInlineHtml` cleans a whole edited document and keeps every one
// of its documented regex limits; it is unchanged. The functions below serve a
// different, deliberately NARROWER mode: the user picks one node and supplies
// one value, and that value is matched against a closed grammar and
// RE-SERIALIZED from the parsed parts. Nothing the user typed is ever echoed
// into the document verbatim. A value that does not match is REJECTED — there
// is no pass-through branch and no "clean it up and continue" branch, because
// the only inputs that exist here are a text run, a colour and a size, and all
// three are small enough to state exhaustively.
//
// Threat model, stated honestly.
//   * The renderer's egress is already allowlisted (`src/lib/renderer/puppeteer.ts`
//     — "Only our own MinIO endpoints… and Google Fonts are reachable; everything
//     else is aborted"), so refusing `url(` here is about CSS DECLARATION
//     BREAK-OUT and defence in depth. It is NOT an SSRF control, and nothing
//     here should be cited as one.
//   * The edited HTML is still never re-served to a browser as a live document
//     — it is rendered to a PNG. The structural safety net described at the top
//     of this file is what carries that risk, not these parsers.
//
// Pure — no I/O — so every grammar decision below is unit-testable.

/**
 * The result of parsing one element-edit input.
 *
 * A discriminated union rather than `string | null` on purpose. `null` for
 * "rejected" reads as absence, and absence has an idiomatic escape hatch:
 * `parseElementColor(raw) ?? ''` compiles, looks tidy, and silently writes an
 * empty declaration on exactly the hostile input this exists to stop. Here
 * `value` does not exist on the failing member, so a caller that does not
 * narrow on `ok` first gets a type error rather than a default. T15 writes the
 * declaration; this shape is what stops T15 from writing one by accident.
 *
 * `reason` is a fixed sentence and NEVER interpolates the input — a rejection
 * string is on its way to a UI and to logs, and reflecting a hostile value into
 * either is how a rejected payload gets a second life.
 */
export type ParsedCssValue =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: string }

const ok = (value: string): ParsedCssValue => ({ ok: true, value })
const reject = (reason: string): ParsedCssValue => ({ ok: false, reason })

// A typed value is a colour or a length, never a stylesheet. Anything longer is
// not a near-miss worth diagnosing; it is a payload. The cap also keeps an
// oversized input out of the logs.
const MAX_VALUE_LENGTH = 64

// Defence-in-depth gate, required by the task notes, and DELIBERATELY REDUNDANT:
// every grammar below is fully anchored, so no accepted value could contain
// `url(` anyway. Kept because it makes the refusal explicit at the boundary
// instead of implicit in three regexes. Intentionally looser than CSS (CSS does
// not permit whitespace before the paren) — a deny-gate should over-match.
const URL_FUNCTION_RE = /url\s*\(/i

// CSS escape sequences (`\75 rl(` for `url(`) are OUT OF SCOPE and need no
// handling: unescaping them would require a CSS tokenizer, and it would buy
// nothing, because a backslash cannot appear in any value these grammars
// accept. `#rrggbb`, `rgb(…)` and `<number><unit>` have no backslash position,
// so an escaped payload fails the grammar as a whole rather than being decoded.
// Same reasoning retires CSS comments (`/*…*/`), semicolons, braces and
// newlines: none of them has a position in an accepted value.

// --- Text ------------------------------------------------------------------

/**
 * Escape user text so it lands as a TEXT NODE (FR-15, AC-21).
 *
 * `&` is replaced FIRST. Any other order re-escapes the ampersands this
 * function just introduced, so `<` would emerge as `&amp;lt;` and display as
 * the literal string "&lt;" instead of "<".
 *
 * Safe for: HTML text content, and double- or single-quoted attribute values.
 *
 * NOT safe for, and callers must not use it in: unquoted attribute values (a
 * space or `/` still ends the value), attribute *names* or tag positions, the
 * content of `<script>`/`<style>` (raw-text elements, where entities are not
 * decoded and this output is meaningless rather than safe), and URL/`javascript:`
 * contexts. It also does not strip control characters, normalize Unicode, or
 * cap length. T15 must place the result in a text position — between a `>` and
 * a `<` — and that placement, not this function, is what makes it a text node.
 */
export function escapeElementText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// --- Colour ----------------------------------------------------------------

// The 16 CSS Level 1 names, mapped to hex so a name is resolved and never
// echoed. A closed 16-row table, not a colour library: `rebeccapurple` and the
// other ~130 extended names are rejected, and so is `transparent` (it has no
// hex form, and an invisible element is not a colour edit).
// A Map, not an object literal: a plain-object lookup inherits from
// Object.prototype, so `NAMED_COLORS['constructor']` would be truthy and the
// parser would "accept" a colour named constructor/toString/__proto__. A Map
// has no prototype keys, which removes the class rather than guarding it.
const NAMED_COLORS = new Map<string, string>([
  ['black', '#000000'],
  ['silver', '#c0c0c0'],
  ['gray', '#808080'],
  ['white', '#ffffff'],
  ['maroon', '#800000'],
  ['red', '#ff0000'],
  ['purple', '#800080'],
  ['fuchsia', '#ff00ff'],
  ['green', '#008000'],
  ['lime', '#00ff00'],
  ['olive', '#808000'],
  ['yellow', '#ffff00'],
  ['navy', '#000080'],
  ['blue', '#0000ff'],
  ['teal', '#008080'],
  ['aqua', '#00ffff'],
])

// `#rgb` and `#rrggbb` only. `#rgba`/`#rrggbbaa` are rejected: the export is an
// opaque fixed canvas, every `<input type="color">` emits six digits, and alpha
// on a hex literal is the one hex form with meaningful browser variance.
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

// Legacy comma syntax with integer channels. Rejected on purpose: percentage
// channels (`rgb(100%, 0%, 0%)`), the modern space-separated form
// (`rgb(255 0 0 / 50%)`), `calc()`, and `var()`. Alpha is accepted on either
// function name because the output is re-serialized into whichever name the
// alpha actually calls for.
const RGB_RE =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?\)$/i

/**
 * Parse a colour input into `#rrggbb`, `rgb(r, g, b)` or `rgba(r, g, b, a)`.
 *
 * The grammar matches the WHOLE trimmed input, which is why AC-22's
 * `red; background: url(http://evil.test/x)` is rejected: it is not a colour
 * token at all, so it fails the grammar. The `url(` gate above is a second,
 * independent refusal of the same string — either one alone would reject it.
 */
export function parseElementColor(raw: string): ParsedCssValue {
  const input = raw.trim()
  if (!input) return reject('Enter a colour')
  if (input.length > MAX_VALUE_LENGTH) return reject('That colour value is too long')
  if (URL_FUNCTION_RE.test(input)) return reject('Colours cannot reference a URL')

  const named = NAMED_COLORS.get(input.toLowerCase())
  if (named) return ok(named)

  const hex = HEX_RE.exec(input)
  if (hex) {
    const digits = hex[1].toLowerCase()
    // Re-serialized, not echoed: `#ABC` leaves here as `#aabbcc`.
    return ok(digits.length === 3 ? `#${digits.replace(/./g, (d) => d + d)}` : `#${digits}`)
  }

  const rgb = RGB_RE.exec(input)
  if (rgb) {
    const channels = [rgb[1], rgb[2], rgb[3]].map(Number)
    if (channels.some((c) => c > 255)) return reject('Colour channels must be between 0 and 255')
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4])
    if (alpha > 1) return reject('Colour opacity must be between 0 and 1')
    const [r, g, b] = channels
    return ok(alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`)
  }

  return reject('Use a hex colour like #1a2b3c, or rgb(0, 0, 0)')
}

// --- Size ------------------------------------------------------------------

/**
 * The closed unit set. The canvas is a fixed 1080×1080 export, so `px` is
 * absolute truth, `rem`/`em` are the relative idioms the brand templates
 * already use, and `%` covers proportional sizing. `vh`/`vw` are excluded as
 * redundant with `%` on a fixed viewport; `pt`/`cm`/`in` import a print scale
 * that has no meaning here; `ch`/`ex` depend on a font metric the editor cannot
 * show the user. Exported so T16 can build the unit picker from the same list
 * the parser enforces, rather than a second copy that can drift.
 */
export const ELEMENT_SIZE_UNITS = ['px', 'rem', 'em', '%'] as const

// No sign position: a leading `-` or `+` fails the match. Negatives are
// rejected because every property this mode is expected to expose (font-size,
// width, height, padding, radius) treats one as invalid anyway. If a
// negative-capable property is ever added (letter-spacing, margin), extending
// this must be a DELIBERATE grammar change with its own tests — not a silent
// widening. No exponent position either, so `1e3px` is rejected.
const SIZE_RE = /^(\d+(?:\.\d+)?|\.\d+)\s*(px|rem|em|%)$/i

// A sanity bound, not a layout rule: 10000 is roughly 9× the canvas in px and
// absurd in every other unit. It stops a fat-fingered value from producing a
// render nobody can interpret; it does not claim the value is sensible.
const MAX_SIZE_MAGNITUDE = 10000

/**
 * Parse a size input into `<number><unit>` (FR-16, AC-23).
 *
 * The unit is required — bare `0` is rejected even though CSS permits it, since
 * "number + unit from an allowed unit set" is the whole grammar. `NaN` and
 * `Infinity` cannot reach the numeric check: the regex has no letter position,
 * so they are refused as non-numeric before any `Number()` call.
 */
export function parseElementSize(raw: string): ParsedCssValue {
  const input = raw.trim()
  if (!input) return reject('Enter a size')
  if (input.length > MAX_VALUE_LENGTH) return reject('That size value is too long')
  if (URL_FUNCTION_RE.test(input)) return reject('Sizes cannot reference a URL')

  const match = SIZE_RE.exec(input)
  if (!match) return reject(`Use a number and a unit, one of: ${ELEMENT_SIZE_UNITS.join(', ')}`)

  // Re-serialized through Number, so `.50` and `007` leave as `0.5` and `7`,
  // and any inner whitespace the human typed ("24 px") is dropped.
  const amount = Number(match[1])
  if (amount > MAX_SIZE_MAGNITUDE) return reject(`Sizes must be at most ${MAX_SIZE_MAGNITUDE}`)

  return ok(`${amount}${match[2].toLowerCase()}`)
}

// ===========================================================================
// Element-targeted edit — server-side addressing + the write (FR-17/18/19)
// ===========================================================================
//
// The whole of this section is PURE: `html` in, `html` out. The route does the
// auth, the guards and the single `commitDraftRevision` call; nothing here
// touches the database, which is what makes the addressing rules below
// unit-testable at all (a route module cannot be imported under vitest here).
//
// WHAT AN ADDRESS IS, AND WHY IT IS NOT A SELECTOR (FR-17 / AC-26)
// ----------------------------------------------------------------
// The click payload carries a tag name from a closed allow-list and the TEXT
// THE USER SAW in that node at click time. It is a *description of content*,
// not an instruction about where to write. The server ignores anything else the
// client sends — there is no selector, id, XPath or document offset in
// `ElementEditRequest`, so an extra `selector` key on the wire is structurally
// unreadable here, not merely unused. Resolution re-scans the CURRENT
// server-side HTML for that content and demands EXACTLY ONE match:
//
//   * zero matches  → the address is stale (a refine rewrote the markup, or
//                     another edit landed first) → REJECTED, nothing written.
//   * two or more   → the address is ambiguous  → REJECTED, nothing written.
//
// Both directions fail closed. Guessing between two candidates is precisely
// AC-25's failure mode, so there is no "closest match" branch and no fallback
// to document order. Nothing about the address is persisted anywhere: it is not
// written to the draft, not written to the revision, and not put in the
// instruction string (which is built from a closed set of literals below), so a
// later refine cannot invalidate a stored address — there is none (FR-18).
//
// WHAT REGEX-LEVEL RESOLUTION CANNOT GUARANTEE — stated plainly, because T16's
// E2E has to know where the honest edges are:
//   * `[^>]*` for an opening tag's attributes ends at the first `>`, so a tag
//     carrying `>` inside a quoted attribute value (`<p title="a>b">`) is
//     mis-parsed and simply will not resolve. It fails closed, but it fails.
//   * Only TEXT-LEAF nodes are addressable — the content pattern is `[^<]*`, so
//     an element containing any child element never matches. This is deliberate
//     (it removes same-tag nesting ambiguity outright) but it does mean "click
//     any node" is a promise the server cannot keep; the client must only offer
//     leaves.
//   * Entity comparison decodes the SOURCE side only, against the DOM
//     `textContent` the client observed. An exotic encoding the decoder below
//     does not know simply fails to match — again closed, but a real miss.
//   * Two nodes with identical visible text are indistinguishable here, by
//     construction. That is the ambiguity rejection, not a bug to fix later.
//   * `sanitizeInlineHtml` is deliberately NOT run in this mode. The base
//     document is the server's own stored HTML, never client input, and
//     sanitizing it would mutate bytes outside the clicked node — which FR-17
//     forbids. The only client-derived bytes that enter are the escaped text
//     run and the re-serialized declaration value.

// Text-leaf-capable tags only. The exclusions matter more than the inclusions:
// `script`, `style`, `title` and `textarea` are raw-text elements where
// `escapeElementText` produces meaningless output rather than safe output (its
// own doc comment says so), and `pre` is excluded because the whitespace
// collapsing used for matching would misread significant whitespace. An
// allow-list, not a deny-list, so a tag added to HTML later is not silently
// addressable.
export const ELEMENT_EDITABLE_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'span',
  'div',
  'li',
  'a',
  'strong',
  'em',
  'small',
  'blockquote',
  'figcaption',
  'label',
  'td',
  'th',
] as const

// The property allow-list (FR-16). T14's parsers validate a VALUE and say
// nothing about which property it is written into — that ownership lands here.
// One row per exposed edit; the CSS property name is a literal in this table and
// is NEVER taken from the request, so no property-name escaping is needed or
// possible to get wrong. Adding a row is a deliberate widening and needs its own
// test; there is no free-form declaration path (FR-16).
//
// A Map for the same reason NAMED_COLORS above is one: a plain-object lookup
// inherits from Object.prototype, so `kind: "constructor"` would resolve to a
// truthy row whose `parse` is undefined — a crash on hostile input rather than a
// refusal. A Map has no prototype keys, which removes the class.
const ELEMENT_STYLE_PROPERTIES = new Map<
  string,
  { readonly property: string; readonly parse: (raw: string) => ParsedCssValue }
>([
  ['color', { property: 'color', parse: parseElementColor }],
  ['fontSize', { property: 'font-size', parse: parseElementSize }],
])

export const ELEMENT_EDIT_KINDS = ['text', 'color', 'fontSize'] as const
export type ElementEditKind = (typeof ELEMENT_EDIT_KINDS)[number]

// Flat and all-strings on purpose: this is what arrives over the wire, so every
// field is validated here rather than trusted by shape. There is deliberately no
// selector/id/index field — see the AC-26 note above.
export interface ElementEditRequest {
  readonly tag: string
  readonly text: string
  readonly kind: string
  readonly value: string
}

// `status` travels with the reason so the route does not have to re-derive it:
// 400 means the input was malformed, 409 means the input was fine but the
// document moved underneath it (stale or ambiguous address). Same discriminated
// -union discipline as ParsedCssValue — `html` does not exist on the failing
// member.
export type ElementEditOutcome =
  | { readonly ok: true; readonly html: string; readonly instruction: string }
  | { readonly ok: false; readonly reason: string; readonly status: 400 | 409 }

// A headline is not a document. The cap is on the replacement text (what gets
// written) and, more loosely, on the address text (what gets compared), so an
// oversized payload is refused before any scanning.
const MAX_ELEMENT_TEXT = 2000
const MAX_ADDRESS_TEXT = 4000

const NAMED_ENTITIES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  // Decoded to a PLAIN space, not U+00A0: the normalizer below collapses runs of
  // whitespace and `\s` matches U+00A0, so both sides fold to the same string
  // whichever the source used.
  ['nbsp', ' '],
])

// Decode for COMPARISON ONLY — the result is never written back into the
// document. A single pass with a callback, not chained replaces, because
// chaining would decode `&amp;lt;` twice and turn a literal "&lt;" into "<".
// An entity this table does not know is left verbatim, so it fails to match
// rather than matching something else.
function decodeTextEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    const key = body.toLowerCase()
    if (key.startsWith('#')) {
      const code = key.startsWith('#x') ? parseInt(key.slice(2), 16) : Number(key.slice(1))
      if (!Number.isInteger(code) || code < 1 || code > 0x10ffff) return whole
      try {
        return String.fromCodePoint(code)
      } catch {
        return whole
      }
    }
    return NAMED_ENTITIES.get(key) ?? whole
  })
}

// HTML collapses whitespace when it paints, and the client reads `textContent`
// off a DOM that has already done so, so matching has to collapse too or a
// pretty-printed source would never match what the user saw.
function normalizeAddressText(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

export interface ElementMatch {
  readonly attrs: string
  readonly attrsStart: number
  readonly attrsEnd: number
  readonly innerStart: number
  readonly innerEnd: number
}

/**
 * Re-resolve a content address against the CURRENT html. Exported for tests —
 * the uniqueness rule is the load-bearing half of AC-25 and deserves its own
 * assertions independent of the write.
 *
 * `tag` must already be a member of ELEMENT_EDITABLE_TAGS; the regex is built
 * from that closed list, never from raw input, so there is no pattern injection.
 */
export function findElementMatches(html: string, tag: string, text: string): ElementMatch[] {
  // `[^<]*` for the content is what makes this unambiguous: an element holding
  // any child element cannot match, so same-tag nesting has no say here.
  const re = new RegExp(`<${tag}\\b([^>]*)>([^<]*)</${tag}\\s*>`, 'gi')
  const wanted = normalizeAddressText(text)
  const out: ElementMatch[] = []
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    if (normalizeAddressText(decodeTextEntities(m[2])) !== wanted) continue
    const attrsStart = m.index + 1 + tag.length
    const attrsEnd = attrsStart + m[1].length
    out.push({
      attrs: m[1],
      attrsStart,
      attrsEnd,
      // +1 steps over the `>` that closes the opening tag, so the span below is
      // exactly the run between a `>` and a `<` — the text position
      // escapeElementText documents as its only safe placement (FR-15/AC-21).
      innerStart: attrsEnd + 1,
      innerEnd: attrsEnd + 1 + m[2].length,
    })
  }
  return out
}

// Matches a quoted style attribute. An UNQUOTED one (`style=color:red`) is not
// matched on purpose — rewriting it would need unquoted-value rules, and
// appending a second `style` attribute instead would be worse than useless
// (HTML keeps the first, so the edit would silently not apply). That case is
// rejected below rather than guessed at.
const STYLE_ATTR_RE = /(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/i
const HAS_STYLE_ATTR_RE = /\sstyle\s*=/i

/**
 * Set one declaration inside an opening tag's attribute string, preserving every
 * other attribute and every other declaration byte-for-byte.
 *
 * Existing declarations of the same property are dropped rather than left to be
 * overridden by source order — otherwise repeated edits accumulate dead
 * declarations in the saved HTML. The original quote character is preserved: a
 * value inside a `'…'` attribute may legally contain `"`, so re-emitting with
 * `"` could break the tag. The value we add cannot contain either quote — it
 * comes back re-serialized from T14's closed grammars.
 */
export function setStyleDeclaration(
  attrs: string,
  property: string,
  value: string,
): { ok: true; attrs: string } | { ok: false; reason: string } {
  const declaration = `${property}: ${value}`
  const match = STYLE_ATTR_RE.exec(attrs)
  if (!match) {
    if (HAS_STYLE_ATTR_RE.test(attrs)) {
      return { ok: false, reason: "This element's style could not be updated safely" }
    }
    return { ok: true, attrs: `${attrs} style="${declaration}"` }
  }

  const quote = match[2] !== undefined ? '"' : "'"
  const existing = match[2] ?? match[3] ?? ''
  const kept = existing
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d !== '' && d.slice(0, d.indexOf(':')).trim().toLowerCase() !== property)
  const next = [...kept, declaration].join('; ')
  return {
    ok: true,
    attrs:
      attrs.slice(0, match.index) +
      `${match[1]}${quote}${next}${quote}` +
      attrs.slice(match.index + match[0].length),
  }
}

function fail(reason: string, status: 400 | 409): ElementEditOutcome {
  return { ok: false, reason, status }
}

/**
 * Apply one element-scoped edit to `html` and return the new document.
 *
 * Confined to the clicked node (FR-17): a text edit rewrites only the span
 * between that element's `>` and `</`, and a style edit rewrites only that
 * element's attribute string. Every other byte of the document is carried
 * through by slicing, so nothing outside the resolved match can change — which
 * is also why the whole-document sanitizer is not run here.
 */
export function applyElementEdit(html: string, request: ElementEditRequest): ElementEditOutcome {
  const { tag, text, kind, value } = request
  if (
    typeof tag !== 'string' ||
    typeof text !== 'string' ||
    typeof kind !== 'string' ||
    typeof value !== 'string'
  ) {
    return fail('Invalid element edit request', 400)
  }

  const lowerTag = tag.toLowerCase()
  if (!(ELEMENT_EDITABLE_TAGS as readonly string[]).includes(lowerTag)) {
    return fail('That element cannot be edited directly', 400)
  }
  if (!text.trim()) return fail('Invalid element edit request', 400)
  if (text.length > MAX_ADDRESS_TEXT) return fail('That element is too large to edit directly', 400)

  const matches = findElementMatches(html, lowerTag, text)
  // Fail closed in BOTH directions — see the AC-25 note at the top of this
  // section. Neither branch writes anything.
  if (matches.length === 0) {
    return fail('That element is no longer in the design — reopen the editor and try again', 409)
  }
  if (matches.length > 1) {
    return fail('That element could not be identified uniquely — edit it in the full editor', 409)
  }
  const target = matches[0]

  if (kind === 'text') {
    const next = value.trim()
    if (!next) return fail('Enter some text', 400)
    if (next.length > MAX_ELEMENT_TEXT) return fail('That text is too long', 400)
    return {
      ok: true,
      // Spliced between the opening tag's `>` and the closing `<`, so the
      // escaped run lands as a text node and markup in it cannot escape the
      // element (FR-15 / AC-21).
      html:
        html.slice(0, target.innerStart) + escapeElementText(next) + html.slice(target.innerEnd),
      instruction: 'Manual element edit (text)',
    }
  }

  const rule = ELEMENT_STYLE_PROPERTIES.get(kind)
  if (!rule) return fail('That kind of edit is not supported', 400)

  const parsed = rule.parse(value)
  // Narrowing on `ok` is mandatory, not stylistic: ParsedCssValue has no `value`
  // on its failing member, so there is no `?? ''` to fall into here.
  if (!parsed.ok) return fail(parsed.reason, 400)

  const rewritten = setStyleDeclaration(target.attrs, rule.property, parsed.value)
  if (!rewritten.ok) return fail(rewritten.reason, 409)

  return {
    ok: true,
    html: html.slice(0, target.attrsStart) + rewritten.attrs + html.slice(target.attrsEnd),
    // Built from a closed set of literals — the kind, never the address and
    // never the user's value, so no address reaches the revision row (FR-18).
    instruction: `Manual element edit (${kind === 'color' ? 'colour' : 'size'})`,
  }
}
