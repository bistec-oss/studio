// Decide the copy-provider key stored on a new Brief.
//
// CLI mode (prod fix 2026-07-23): copy generation defaults to the local Claude
// CLI, billed via the OAuth chain (personal UserClaudeToken -> team token) —
// no registered COPY provider row is required. So the wizard need not send a
// copyProviderKey; when it's omitted we store the self-documenting 'cli' marker
// and skip the existence check (resolveCopyProvider treats it as the CLI default,
// and it also matches a legacy seeded 'cli' provider row where one exists).
//
// An explicitly provided key OVERRIDES and is existence-checked by the route.
// API mode still requires a key (there is no OAuth fallback outside CLI mode).

export type BriefCopyKeyDecision =
  | { key: string; validateExists: boolean }
  | { error: string }

export function resolveBriefCopyKey(
  provided: string | undefined,
  cliMode: boolean
): BriefCopyKeyDecision {
  const trimmed = provided?.trim()
  if (trimmed) return { key: trimmed, validateExists: true }
  if (cliMode) return { key: 'cli', validateExists: false }
  return { error: 'copyProviderKey is required' }
}
