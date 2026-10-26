// Map a generation failure to a clear, user-facing message for the draft's
// inline error card (Draft.failureReason). Generation runs fire-and-forget, so
// the raw exception is all the UI has — and puppeteer/CLI/provider errors read
// as gibberish to a marketer. Known infra failures get an actionable message;
// anything unrecognized passes through unchanged (never hide a novel error).

export function humanizeGenerationError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)

  // Renderer: puppeteer "Browser was not found at the configured executablePath"
  // or our resolver's "Chromium not found".
  if (/browser was not found|chromium not found|executablepath/i.test(raw)) {
    return (
      'Image rendering is unavailable: no Chrome/Chromium browser is configured on the server. ' +
      'Ask the person who runs the server to install a browser or point it at an existing one.'
    )
  }

  // CLI mode with no resolvable OAuth token.
  if (/no claude credential/i.test(raw)) {
    return 'No Claude token is connected — add a personal token in Settings, or a team token under Team settings.'
  }

  // No caption provider and no fallback.
  if (/no (copy|caption) provider (configured|is set up)/i.test(raw)) {
    return 'No caption provider is set up for this team — connect a Claude token (CLI mode) or add a provider under Team settings > AI providers.'
  }

  // Timeouts (CLI or API).
  if (/timed out/i.test(raw)) {
    return 'Generation timed out — please try again. If it keeps happening, the design may be too complex.'
  }

  // ModelRefusalError (008, src/lib/models/anthropicCall.ts) lands here: its
  // message ("The model declined this request (<category>).") is already
  // readable, so it passes through unchanged — no pattern above matches it.
  // A refusal is never retried on another model (A13).
  return raw
}
