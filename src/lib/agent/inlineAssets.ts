// Inline-asset externalization for the design agent.
//
// Brand templates can inline large assets (logos, background images) as base64
// `data:` URIs. The seeded "Hearts Talk" template is 1.81 MB for ~6 KB of actual
// HTML/CSS — the rest is three base64 PNGs. Feeding that to the model blows past
// the CLI prompt guard (600k) AND the Anthropic API context (~200k tokens).
//
// The fix: before the template goes into the prompt, swap every `data:` URI for a
// short placeholder token. The model only ever sees the tiny structural HTML. After
// the model returns the filled/edited HTML, the original `data:` URIs are spliced
// back in (by token) just before Puppeteer renders — so the rendered output is
// byte-for-byte the same as if the assets had stayed inline.
//
// This is template-agnostic: any oversized inline asset in any template is handled.

const TOKEN_PREFIX = "__INLINE_ASSET_"
const TOKEN_SUFFIX = "__"

// Matches a `data:` URI up to the first delimiter that ends an attribute or
// CSS url() value: a quote, a closing paren, or whitespace. Base64 payloads
// contain none of these, so this captures the whole URI in the common cases
// (`src="data:..."`, `url('data:...')`, `url(data:...)`).
const DATA_URI_RE = /data:[^\s"')]+/g

export interface ExtractedAssets {
  /** HTML with each inlined `data:` URI replaced by a placeholder token. */
  html: string
  /** token → original `data:` URI. Empty when nothing was externalized. */
  assets: Record<string, string>
}

// Replaces inlined `data:` URIs with placeholder tokens. Tokens sit in the exact
// position of the original value (e.g. `src="__INLINE_ASSET_0__"`), so the
// surrounding HTML/CSS is untouched and the model can fill the template normally.
export function extractInlineAssets(html: string): ExtractedAssets {
  const assets: Record<string, string> = {}
  let i = 0
  const out = html.replace(DATA_URI_RE, (match) => {
    const token = `${TOKEN_PREFIX}${i++}${TOKEN_SUFFIX}`
    assets[token] = match
    return token
  })
  return { html: out, assets }
}

// Splices the original `data:` URIs back in by token. A no-op when `assets` is
// empty. Tolerant of the model dropping a token (the placeholder simply stays,
// which would render as a broken image — surfaced via missingTokens()).
export function restoreInlineAssets(html: string, assets: Record<string, string> | undefined): string {
  if (!assets) return html
  let out = html
  for (const [token, uri] of Object.entries(assets)) {
    // Tokens are unique literal strings; split/join replaces every occurrence
    // without regex-escaping the (long) data URI.
    out = out.split(token).join(uri)
  }
  return out
}

// Tokens that were handed to the model but are absent from its output — i.e. the
// model dropped an asset placeholder. Lets callers log a warning rather than
// silently ship a broken image.
export function missingTokens(modelHtml: string, assets: Record<string, string>): string[] {
  return Object.keys(assets).filter((token) => !modelHtml.includes(token))
}
