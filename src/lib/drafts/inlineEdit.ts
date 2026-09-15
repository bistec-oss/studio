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
