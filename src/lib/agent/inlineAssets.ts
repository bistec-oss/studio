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
// empty. It can only restore a token that is still in the HTML: when the model
// DROPS a token, its location is gone with it, so that image is simply missing
// from the result (nothing marks where it was — surfaced via missingTokens()).
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

// Matches a placeholder token anywhere it appears in text, built from the same
// TOKEN_PREFIX/TOKEN_SUFFIX used to mint tokens above — one token pattern for
// the whole module. Deliberately context-free (not anchored to src=""/url()):
// a token found inside an unrelated attribute still counts as present. The
// middle is a lazy wildcard rather than `\d+` so a renamed token (the prefix/
// suffix wrapper kept, the index replaced with something never sent, e.g.
// `__INLINE_ASSET_RENAMED__`) is still recognized as a token-shaped string —
// and therefore as an unknown token — rather than looking like a clean
// absence.
const TOKEN_RE = new RegExp(`${TOKEN_PREFIX}.*?${TOKEN_SUFFIX}`, "g")

export type ReconcileResult =
  | { kind: "clean" }
  | { kind: "restored"; missing: string[] }
  | { kind: "mismatch"; reason: string }

// FR-20: placeholder handling is reconciliation, not detection. Compares the
// multiset of tokens sent out against the multiset found in the model's reply.
// - Every sent token present exactly once, nothing else → clean (commit as-is).
// - A strict subset of sent tokens, each present exactly once, no unknown
//   tokens → restored, with `missing` listing the absent ones. The name is
//   historical: an absent token CANNOT be spliced back in — its location in
//   the document is gone. The refine caller (drafts/refineAttempt.ts, T17
//   Ruling C) therefore commits the absence only when a replace/remove
//   supersedes fragment names the token (the image was meant to go); any
//   other absence is a preservation miss that takes the FR-11 retry path.
// - Anything else — a token that was never sent (renamed/reindexed) or a sent
//   token appearing more than once (duplicated) — is not applied: the caller
//   takes the FR-11 fallback path rather than trusting a corrupted result.
export function reconcileInlineAssets(sentTokens: string[], replyHtml: string): ReconcileResult {
  const sent = new Set(sentTokens)
  const found = replyHtml.match(TOKEN_RE) ?? []

  const counts = new Map<string, number>()
  for (const token of found) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }

  const unknown = [...counts.keys()].filter((token) => !sent.has(token))
  if (unknown.length > 0) {
    return { kind: "mismatch", reason: `reply contains unrecognized token(s): ${unknown.join(", ")}` }
  }

  const duplicated = [...counts.entries()].filter(([, count]) => count > 1).map(([token]) => token)
  if (duplicated.length > 0) {
    return { kind: "mismatch", reason: `reply contains duplicated token(s): ${duplicated.join(", ")}` }
  }

  const missing = sentTokens.filter((token) => !counts.has(token))
  return missing.length > 0 ? { kind: "restored", missing } : { kind: "clean" }
}
