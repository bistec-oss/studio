# Spec: Name the Claude CLI usage limit when a run fails on it

**Change:** 029-cli-usage-limit-message · **Size:** bounded · **Proposal:** [proposal.md](proposal.md) (approved 2026-10-25, no party panel by the user's choice)

## Overview

A text-mode `claude -p` run that fails on a plan usage limit must say so. Today CLI 2.1.310 prints `You've hit your weekly limit · resets …` on stdout and exits 1. The classifier misses that wording and the error message quotes only stderr, which is empty, so the failure reason reads `Claude CLI exited with code 1: `.

## Approach

- **Decision:** classify inside `finalizeText`, then build the message from the class. A usage limit gets a fixed text; an empty stderr with no class gets a fixed text; otherwise the message is unchanged. stdout is never quoted into the message, which keeps the `ClaudeCliError` field contract (`claudeCli.ts:266`: "never `diagnostic`, never model text").
- **File map:**
  - `src/lib/agent/claudeCli.ts`: `USAGE_LIMIT_RE` (`:275-276`) and its comment (`:273-274`), and `finalizeText` (`:617-622`).
  - `tests/unit/usageLimit.test.ts`: new cases (its fake `spawn` already drives the real text-mode finalizer through `runClaudeCli`).

## Functional Requirements

- **FR-01: the 2.1.310 wording is a usage limit.** `USAGE_LIMIT_RE` also matches "hit your … limit", optionally with `weekly`, `daily`, `session` or `usage` before "limit", case-insensitive, for example `You've hit your weekly limit · resets Oct 27, 10:30am (Asia/Colombo)`. Every existing alternative stays. The comment records the observed line and the CLI version (2.1.310, 2026-10-25), replacing "unverified".
- **FR-02: the classifier order is unchanged.** `isClaudeUsageLimit` still returns false for exit 0, for an auth failure (checked first), and for any structured status other than 429.
- **FR-03: a usage-limit message.** When `finalizeText` sees a non-zero exit and the built error is a usage limit (`isClaudeUsageLimit`), the thrown message is exactly:
  `Claude CLI exited with code <code>: Claude usage limit reached. Try again after the plan limit resets, or connect another account's token at /settings.`
- **FR-04: an empty-stderr message.** On a non-zero exit that is not a usage limit and has empty or whitespace-only stderr, the message is `Claude CLI exited with code <code>: (no error output on stderr)`.
- **FR-05: otherwise unchanged.** With non-empty stderr and no usage limit, the message is today's `Claude CLI exited with code <code>: <stderr trimmed, first 500 chars>`. The error's `exitCode`, `stderr` and `stdout` fields are unchanged in every case, so auth-failure detection and its retry still read stdout.
- **FR-06: stdout never reaches the message.** No branch puts any stdout text into `message`.

## Non-Functional Requirements

- **NFR-01:** no new model call, no new spawn site, no change to `finalizeStreamJson`, retry, backoff or the scheduler.
- **NFR-02:** every existing unit test passes unchanged. In particular, `claudeCliAuth.test.ts` asserts the `Claude CLI exited with code 1` prefix, which every new message keeps.

## Acceptance Criteria

- **AC-01 (FR-01, FR-02):** `isClaudeUsageLimit(new ClaudeCliError('x', 1, '', "You've hit your weekly limit · resets Oct 27, 10:30am (Asia/Colombo)"))` is true. The same text with `apiErrorStatus: 401`, or with a 401 auth phrase in stderr, is false. Exit 0 is false.
- **AC-02 (FR-03, FR-06):** a scripted text-mode run (exit 1, empty stderr, stdout = the 2.1.310 line) through `runClaudeCli` rejects with exactly the FR-03 message. The message does not contain `weekly`, `Oct 27` or `Asia/Colombo` (the CLI line's own words; FR-03's fixed text itself says "resets", amended 2026-10-25 at build), and the error's `stdout` field still holds the line.
- **AC-03 (FR-04):** a scripted run with exit 1, empty stderr and an unclassified stdout (`something odd`) rejects with `Claude CLI exited with code 1: (no error output on stderr)`, and the message does not contain `something odd`.
- **AC-04 (FR-05):** a scripted run with exit 1 and stderr `boom` rejects with `Claude CLI exited with code 1: boom`.
- **AC-05 (NFR-01, NFR-02):** tsc, lint (0 errors) and the full unit suite pass. `git diff` touches only the two files in the file map plus this change's folder.

## Out of Scope

Stream-json mode, the scheduler's prefix text, the UI, analytics redaction, and pinning the local CLI (proposal "Out of Scope").
