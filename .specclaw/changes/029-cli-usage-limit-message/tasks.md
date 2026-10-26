# Tasks: 029-cli-usage-limit-message

## Wave 1

- [x] `T1` — Recognise the 2.1.310 usage-limit wording and name it in the text-mode error
  - Files: `src/lib/agent/claudeCli.ts`, `tests/unit/usageLimit.test.ts`
  - Estimate: small
  - Kind: impl
  - Model: sonnet
  - Depends: none
  - Notes:
    - **Covers:** FR-01 to FR-06, AC-01 to AC-05.
    - Widen `USAGE_LIMIT_RE`; rewrite `finalizeText` to classify and pick the message (spec FR-03 to FR-05, exact strings); update the regex comment with the observed line and version.
    - Tests in `usageLimit.test.ts`, using its existing scripted `spawn` for AC-02 to AC-04.
    - **Gate:** tsc, lint, unit; push `v2` and check CI. No E2E (no route, UI or seam changes).

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred
