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
      'Ask an admin to install a browser or set PUPPETEER_EXECUTABLE_PATH to an existing binary.'
    )
  }

  // CLI mode with no resolvable OAuth token.
  if (/no claude credential/i.test(raw)) {
    return 'No Claude token is connected — add a personal token in Settings, or a team token in Team Settings.'
  }

  // No copy provider and no fallback.
  if (/no copy provider configured/i.test(raw)) {
    return 'No AI copy provider is configured for this team — connect a Claude token (CLI mode) or register a provider in Team Settings.'
  }

  // Timeouts (CLI or API).
  if (/timed out/i.test(raw)) {
    return 'Generation timed out — please try again. If it keeps happening, the design may be too complex.'
  }

  return raw
}
