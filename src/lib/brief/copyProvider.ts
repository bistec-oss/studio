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
//
// 024 FR-05: once the team has CHOSEN a caption route, the route decides the
// credential and the brief's key is ignored: the stored key is the 'cli' marker
// ("use the team route"), with no existence check, in either mode. A team that
// has never chosen keeps the rules above exactly.

export type BriefCopyKeyDecision =
  | { key: string; validateExists: boolean }
  | { error: string }

export function resolveBriefCopyKey(
  provided: string | undefined,
  cliMode: boolean,
  routeChosen: boolean = false
): BriefCopyKeyDecision {
  if (routeChosen) return { key: 'cli', validateExists: false }
  const trimmed = provided?.trim()
  if (trimmed) return { key: trimmed, validateExists: true }
  if (cliMode) return { key: 'cli', validateExists: false }
  return { error: 'copyProviderKey is required' }
}

// The brief wizard's submit gate. Deliberately defined here, on top of
// resolveBriefCopyKey, rather than as a separate `if` in the wizard: the client
// used to carry its OWN rule ("a COPY provider must exist"), which silently
// stopped matching the route when CLI mode made the key optional. The Generate
// button stayed disabled and the API's CLI default was unreachable from the UI —
// the fix was server-side only. Sharing one function makes that drift
// impossible: if the route would accept the submission, the button is live.
export function canSubmitBrief(
  copyProviderKey: string | undefined,
  cliMode: boolean,
  routeChosen: boolean = false
): boolean {
  return !('error' in resolveBriefCopyKey(copyProviderKey, cliMode, routeChosen))
}
