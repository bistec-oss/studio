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

export type InlineAssetReconciliation =
  /** Every token sent came back exactly once. Splice and commit. */
  | { outcome: "clean" }
  /**
   * The reply carries a subset of what went out — nothing invented, nothing
   * doubled. Safe to splice and commit; `absent` names the placeholders the
   * model dropped so the caller can log which assets that revision lost.
   */
  | { outcome: "restored"; absent: string[] }
  /**
   * The reply carries a token that was never sent, or sent once and returned
   * more than once. The edit is not applied — a renamed token can't be spliced
   * and a doubled one would duplicate a multi-megabyte asset. `unexpected`
   * names the offending tokens: a narrating model is worth seeing in the logs.
   */
  | { outcome: "mismatch"; unexpected: string[] }

// Anything token-SHAPED, not only the tokens we actually minted. Scanning for
// just the sent tokens would read a reply that renamed __INLINE_ASSET_0__ to
// __INLINE_ASSET_00__ or __INLINE_ASSET_X__ as a clean absence, when in fact the
// model invented a placeholder nothing can be spliced into. The trailing (?!_)
// stops a suffix-mangled token from matching the shorter real one inside it.
const TOKEN_SHAPE_RE = /__INLINE_ASSET_[A-Za-z0-9_]*?__(?!_)/g

function tally(tokens: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
  return counts
}

// Reconciliation, not detection: the multiset of tokens sent out must equal the
// multiset that comes back. missingTokens() only answers "did the model drop
// one?" — enough to log a warning, not enough to decide whether the reply is
// applicable at all, which is what a refine needs before it commits a revision.
//
// Multiplicity is the subtle half. extractInlineAssets mints a FRESH token per
// `data:` occurrence, so every token goes out exactly once by construction; a
// token coming back twice therefore means the model copied a placeholder rather
// than filling the template, and splicing it would inline the same asset twice.
//
// `sentTokens` is the token list handed out (Object.keys of ExtractedAssets), so
// this stays pure token arithmetic — it never sees the `data:` URIs and does not
// return HTML. On clean/restored the caller splices with restoreInlineAssets as
// it already does; on mismatch it does not splice at all.
export function reconcileInlineAssets(
  sentTokens: readonly string[],
  replyHtml: string,
): InlineAssetReconciliation {
  const sent = tally(sentTokens)
  const back = tally(replyHtml.match(TOKEN_SHAPE_RE) ?? [])

  // Checked before absence: a reply that both dropped one token and invented
  // another is a mismatch, not a restorable subset.
  const unexpected = [...back]
    .filter(([token, count]) => count > (sent.get(token) ?? 0))
    .map(([token]) => token)
  if (unexpected.length > 0) return { outcome: "mismatch", unexpected }

  const absent = [...sent]
    .filter(([token, count]) => (back.get(token) ?? 0) < count)
    .map(([token]) => token)
  return absent.length > 0 ? { outcome: "restored", absent } : { outcome: "clean" }
}
