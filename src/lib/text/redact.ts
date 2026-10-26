// Free text that may carry a credential or an internal endpoint, cleaned before
// it is stored or shown. Moved out of drafts/backgroundNotice.ts (005) so the
// analytics store (006 FR-03) shares the one rule set; redactSkipDetail there
// is now a re-export. Pure, no I/O.
//
// Order matters: whole URLs go first (a key in a query string goes with them),
// then bare keys, then key=… pairs outside a URL, then host:port pairs.
const REDACTIONS: Array<[RegExp, string]> = [
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>()]+/gi, '<url>'],
  [/\bsk-[\w*.-]+/g, '<redacted>'],
  [/\bAIza[\w-]+/g, '<redacted>'],
  // No leading \b: "api_key=" and "apikey=" must match too.
  [/(key=)[^&\s]+/gi, '$1<redacted>'],
  [/\b(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*):\d{2,5}\b/gi, '<host>'],
]

export function redactText(text: string): string {
  return REDACTIONS.reduce((out, [re, replacement]) => out.replace(re, replacement), text)
}
