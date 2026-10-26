# Proposal: Name the Claude CLI usage limit when a run fails on it

## Problem

During OP-028 (2026-10-25), a generation failed because the account's Claude subscription had hit its weekly limit. The draft's failure reason read only `Claude CLI exited with code 1: `, with nothing after the colon. The cause took a manual reproduction to find.

Two defects combine:

1. **The wording is not recognised.** With the locally installed CLI 2.1.310, a usage limit prints `You've hit your weekly limit · resets Oct 27, 10:30am (Asia/Colombo)` on **stdout** and exits 1. `USAGE_LIMIT_RE` (`src/lib/agent/claudeCli.ts:275-276`) matches `usage limit (reached|exceeded)`, `claude ai usage limit`, `rate limit` and `429`, not "hit your … limit". Its own comment says the phrase list was never checked against a real limited account (A11). So `isClaudeUsageLimit` returns false, and the scheduler's usage-limit prefix (`src/lib/scheduler/generationRunner.ts:245`) is never applied.
2. **The message is empty.** `finalizeText` (`claudeCli.ts:617-619`) builds the text-mode error message from stderr only. The CLI wrote nothing to stderr, so the message ends at the colon. That message becomes `Draft.failureReason` on interactive runs and `errorReason` on queue entries.

Evidence: the server log of the failed run (`[claudeCli:copy] first stdout byte at 1.8s`, `exited code=1 at 2.6s`), and a reproduction through the app's own `runClaudeCli` that showed the stdout line above.

## Proposed Solution

- Widen `USAGE_LIMIT_RE` to also match the CLI's "hit your … limit" wording: `hit your (weekly|daily|session|usage)? ?limit` in any case, plus `usage limit`. Keep every existing alternative.
- In `finalizeText`, classify the error once it is built. A usage limit gets a fixed, named message: `Claude CLI usage limit reached (exit code 1). Try again after the plan limit resets, or connect another account's token at /settings.` An auth failure keeps today's handling unchanged.
- When stderr is empty and the error is neither class, the message says `(no error output on stderr)` instead of ending at the colon.
- **stdout is never quoted into the message.** That keeps the existing `ClaudeCliError` field contract ("never `diagnostic`, never model text"): a failed run's stdout can hold model output. stdout stays on the error's `stdout` field for classification, as it does today.
- Unit tests:
  - the exact 2.1.310 line is classified as a usage limit, not as an auth failure;
  - `finalizeText`'s message names the usage limit and never contains the stdout text;
  - an empty-stderr, unclassified failure gets the "no error output" message;
  - every existing case in the classifier tests still passes.

## Scope

### In Scope

- `src/lib/agent/claudeCli.ts`: the regex, `finalizeText`, and the comment that records the observed wording and CLI version.
- The unit tests for the classifier and `finalizeText`, extending the existing test file.

### Out of Scope

- Stream-json mode (`finalizeStreamJson`): it already reads the result event and an `api_error_status`, and it was not involved.
- Retry or backoff behaviour, the scheduler, the analytics failure redaction, and any UI change.
- Pinning or upgrading the local CLI. Prod's Docker image pins 2.1.287, so the mismatch shows only on a dev machine whose native CLI auto-updated. The fix makes both versions work.

## Impact

- **Files:** 2 (`src/lib/agent/claudeCli.ts`, its unit test).
- **Size:** bounded. It alters the existing error path of `runClaudeCli`, a one-file fix.
- **Risk:** low. The change only reworks the message on a path that already throws. A broader regex could mark a non-limit failure as a usage limit, but its only effect is the scheduler's reason prefix, never retry timing (`generationRunner.ts:244`: "Retry and backoff are the same either way").
- No migration, no env var, no new model call.

## Open Questions

- None. Not quoting stdout is a deliberate choice; the alternative (quote the CLI line) would show the reset time but breaks the field contract.
