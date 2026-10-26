# T6 docs report: 030 stale-headline badge

## What changed, per file

- **`docs/handoff.md`.** The 030 "PICK UP HERE" section is replaced by `## ⏸️ 2026-10-26 — PICK UP HERE: 030 stale-headline badge is BUILT (T1 to T6); next is /specclaw:verify 030-stale-headline-badge`. It covers the state, what the badge does (the stamp, the four states, the badge, the publish line, the events), the commits (T1 `a643316`, T2 `315175e`, T3 `f714be0`, T4 `7a4dca1`, T5 `6562240`, lint fix `0069333`), the known limits L1 to L4 from the spec plus L5 and L6 from the T2 review, the migration `20261027120000_rendered_text` and its down script, the "Check before the merge" line, the gates as placeholders (`<U>`, `<R>`, `<E>`, `<run>`), the resume step and the deferred Apply-to-image work (gated on the three events, D1). The old 030 section sits below it, headed "(superseded as the pickup point by the section above)", trimmed to the problem, the measurement, the decisions and the panel link.
- **`CLAUDE.md`.** (a) A new "Architecture decisions to remember" bullet, **Stale-headline badge (030)**, after the 025 bullet. It covers the JSONB stamp and its null meaning, the in-page check in `renderPost` (FR-08, 5 s bound, never fails a render, the mock stand-in and the sentinel), the required fourth argument of `currentRenderStamp` and the writer guard, the read-time state, the badge and the non-blocking publish line, the three events, the client import rule (`renderedText/noticeText` and `renderedText/vocab`, never the index), and the migration and down script with no env var. (b) In "Outstanding work", the first bullet is replaced by a "BUILT (T1 to T6)" bullet whose next step is `/specclaw:verify 030-stale-headline-badge`. The old PROPOSED bullet stays below it with "(superseded as the pickup point by the entry above)" after its date. Nothing else in CLAUDE.md changed.
- **`.specclaw/ROADMAP.md`.** The 030 row now reads "🔨 BUILT (2026-10-26, T1 to T6); verify next". The top status line is updated to match, and the previous status is kept as "(Superseded)".
- **`docs/e2e-test-plan.md`.** One coverage-map row after the 009 row: "Change 030 stale-headline badge (AC-11 → AC-19)", mapped to §AH TC-HL-01…10 and the `a11y` case "AC-19: a draft page with the stale-headline badge".

## Not run (per the brief)

No E2E, dev server, build or database command. No commit. The gates in the handoff are placeholders for the orchestrator.

## Verification

Command: `npx prettier --check docs/handoff.md CLAUDE.md .specclaw/ROADMAP.md docs/e2e-test-plan.md`
Exit: 0
Output (tail):

```
All matched files use Prettier code style!
```

Note: the first check flagged `.specclaw/ROADMAP.md` and `docs/e2e-test-plan.md`. Both were already clean at HEAD, so `npx prettier --write` was run on the four files. The resulting `git diff --stat` is limited to the intended edits (handoff 93 lines reworked, CLAUDE.md 4 lines, ROADMAP 6 lines, e2e-test-plan 1 line).
