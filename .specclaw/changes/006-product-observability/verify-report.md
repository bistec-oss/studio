# Verify Report: 006-product-observability

**Verified:** 2026-10-24 · **Model:** Sonnet · **HEAD:** `851f224` (T1 `0c199b0`, T2 `98f3c62`, T3 `f94eb17`, T4 `28540b7`, T5 `a19a8b0`, T6 `851f224`)
**Verdict:** PASS (17/17 ACs)

I read spec.md, the T1 to T6 reports, the T1 to T5 reviews, and the code and tests behind each AC. I opened the bodies of E2E TC-OBS-01 to 05, 10, 11, 14 to 16, 23, 26 to 28, and the T1 `track.ts` fix. I re-ran five unit files (analyticsTrack, analyticsCoverage, analyticsUsage, redactText, analyticsCatalogue): 41/41 pass. Diffs are against `2c70eb7`, the commit before T1. I did not run E2E, build or any DB command; those figures are the orchestrator's.

## Acceptance Criteria

- ✅ **AC-01 (migration).** `git diff --name-only 2c70eb7 HEAD -- prisma/migrations` lists only `20261024120000_analytics_events`. The T1 review read the SQL against the schema: columns, 4 indexes, no FK. The down script reverses it exactly. The T1 report records deploy, down, re-apply and a clean `migrate diff --exit-code` on scratch DBs. `test:upgrade` also passes.
- ✅ **AC-02 (wrapper).** `analyticsTrack.test.ts` covers: valid event writes one row; invalid payload counts `rejected` and does not throw; `AnalyticsSchemaError` under `MOCK_AI`; hanging insert returns at `INSERT_TIMEOUT_MS` and counts `dropped` (fake timers, lines 108-122); a hanging or failing counter does not throw (lines 124, 143). The T1 WARN (the counter was awaited on the timeout path, giving about 2.5 s) is fixed: `track.ts:153` is now `void count('dropped', ...)`.
- ✅ **AC-03 (vocabularies imported).** `analyticsCoverage.test.ts:66-71` asserts the planted `Channel` copy on a fixture (`findCopiedVocabulary` returns `Channel:INSTAGRAM, Channel:LINKEDIN`), and the other vocabularies. The real catalogue passes the same test.
- ✅ **AC-04 (caps and redaction).** `analyticsCatalogue.test.ts:26` cuts a 5 000-char instruction to 2 000. `redactText.test.ts` covers the rules, and the T1 review confirmed that redaction runs before the cap. TC-OBS-02 asserts the failure reason holds no URL and is at most 500 characters. TC-OBS-22 runs last and checks every collected event for brief text, captions, headline and HTML.
- ✅ **AC-05 (one event per operation).** TC-OBS-01 (one `generation.finished` ok, web), 02 (one failed), 03/04/05 (one settled each for `ok`, `not-applied`, `conflict`; adopt and override one event each), 06 (regenerate design and caption), 07 (inline edit and restore), 08 (publish ok and failed), 09 (scheduler source plus `scheduled_generation.settled`). The MCP generation case is the unit test `analyticsGeneration.test.ts:158-166` (ok and failed, `source: 'mcp'`). Each case asserts a length of 1. The T2 review checked there is no route-plus-lib double emission, and that a lost claim emits nothing.
- ✅ **AC-06 (refine trace).** TC-OBS-03 asserts the instruction, at least one attempt with classes, a last verdict of `pass`, a verifier model id and `verifierPromptVersion`. TC-OBS-04 asserts 2 attempts, none `pass`. The golden hash of `VERIFIER_SYSTEM` is at `analyticsRefineTrace.test.ts:255`.
- ✅ **AC-07 (durations).** TC-OBS-01, 02 and 03 assert `durationMs > 0`. Swept events are seeded or emitted with null (T2 review: swept only on `count === 1`, no duration). Held at the unit level and in the seeded set; I did not find an E2E that triggers a real sweep, which the lazy 15-minute rule makes impractical.
- ✅ **AC-08 (failure isolation).** TC-OBS-10 uses the `failNext` seam. A generation ends EXPORTED, a refine still advances the revision pointer by one with no error, and a publish is still PUBLISHED. In each case the event is absent and `AnalyticsDrop.dropped` grows (`waitDrop`).
- ✅ **AC-09 (wizard events and client route).** TC-OBS-23 (one `wizard.step` per step, back and forward adds none, `brief.submitted`), 24 (resumed), 25 (Discard gives `discarded` with last step, a foreign id and the Generate delete write nothing), 26 (a draft aged 8 days, swept on dashboard read, gives `expired`, step 2). TC-OBS-27: session fields override a body `teamId`/`userId`/`source`; 400 for a server name or bad payload; 413 over 2 KB; 404 for a foreign draft id; 401 with a bogus session. TC-OBS-28: the first 60 are stored, the excess is dropped and counted (`dropped: 3`, `lastReason: rate-limit`) and shown on the page. No-session is a redirect for a cookie-less request (the existing proxy behaviour, noted in the T3 review); a bogus cookie gets 401.
- ✅ **AC-10 (tokens).** `analyticsUsage.test.ts` (in the 41/41 re-run): API-mode actions sum usage, CLI records null, a failed action still reports. TC-OBS-30 seeds events through the seam, because `MOCK_AI` bypasses `createMessage`, and checks the page total and the not-reported share. The summing itself is proven by the unit test only; this is a declared and accepted split.
- ✅ **AC-11 (page).** TC-OBS-11 seeds a hand-counted set of 20-plus rows and compares every API figure (refine, failures, styles, durations) and then the page. TC-OBS-13 covers events lost and an empty store. TC-OBS-16 and TC-OBS-12 cover retention health. TC-OBS-19 asserts 403 for an editor and a team admin, and 401 for a bogus session. TC-OBS-20 asserts the gate and no nav item. TC-OBS-21 asserts the nav item for the super admin.
- ✅ **AC-12 (applied rate).** TC-OBS-11 asserts the overall rate is 3 ÷ (3 + 2) = 0.6, per-class rates 2/3, 1 and 0.5, and two verifier lines (`verifier-a` and `verifier-b`) whose summed counts equal the hand count. The formula follows AC-12, which differs from FR-10's looser "ok ÷ settled REFINE". The T3 review flagged this. The page shows conflict and failed beside the rate. The T6 docs should (and the AC table does) name the denominator.
- ✅ **AC-13 (retention).** TC-OBS-14: rows at 181 and 179 days; a sweep deletes 2 and the 179-day rows remain; the next sweep deletes 0. TC-OBS-15: 12 000 old rows drain 5000, 5000, 2000, 0. The page shows the oldest age (TC-OBS-12: 100 days; TC-OBS-16: `0 days`). `git diff 2c70eb7 HEAD` over `heartbeatStatus.ts`, `heartbeat.ts` and `src/app/api/scheduler` is empty, and TC-OBS-16 shows a retention heartbeat stopped for an hour leaves `offline: false` and `loops == [scheduler, generation]`.
- ✅ **AC-14 (deletes and purge).** TC-OBS-17: after a draft delete the events remain with `draftId` null. TC-OBS-18: a team soft-delete removes only that team's events. The purge script has no automated test. T3 report evidence: `--dry-run` printed the database name and the count (0 here) and deleted nothing, and with no `DATABASE_URL` it exited 2. The same report records a seeded `--user` run deleting exactly the one matching row. The T3 review read the guard (it runs before the prisma import). That is manual evidence for this one clause, stated here.
- ✅ **AC-15 (generation untouched).** `PROMPT_VERSION` is `2026-10-21.1` (`shared.ts:20`). `git diff 2c70eb7 HEAD -- src/lib/agent/prompts` is empty. `claudeCli.ts` is untouched. A grep of the added `src` lines finds no new `createMessage(`, `runClaudeCli(` or `recordModelCall(` call. The verifier prompt golden hash passes. The T5 report records the `model-selection` and refine suites passing unchanged. The T2 review notes the `heroPrompts` whitelist gained `refineVerify.ts` for the new constant only.
- ✅ **AC-16 (design system).** A grep of the added `src` and `scripts` lines finds 0 `ui-exception`. `uiTokenGuard` runs within the 3283 unit pass. TC-OBS-21 asserts no horizontal scroll at 390 px and the axe rules. The T3 report has four screenshots (light and dark, 1440 and 390; scrollWidth equals clientWidth, focus visible). Note: the screenshots were taken at T3, before the T4 funnel and T5 token sections were added. The T21 axe and scroll assertion runs on the final page.
- ✅ **AC-17 (gate), with a stated judgement on the flaky case.** tsc clean; lint 0 errors / 7 warnings; unit 3283/3283 (3147 plus 136 new); render 47/47; build passes; `test:upgrade` ALL PASS; full clean mock E2E 473/3/0/1; CI green at `f94eb17` (run 40081178222) and at `851f224` (run 40084041397). The one flaky case, `regression.test.ts:53` (§K H7), failed on the first attempt with `worker process exited unexpectedly (code=3221226505)`. That is a Windows process crash code (0xC0000409), not an assertion, and the case passed on retry. That suite then ran alone 3 times clean (11 passed / 3 skipped each), and CI's full run on the same code passed. The crash is in the Playwright worker, not in the code under test. Note that H7 exercises refine and publish paths that this change instrumented. The three clean re-runs and CI green cover that, so I do not count it as a regression. I count it as an environmental flake on this machine, and it is recorded here, not hidden. The baseline in the AC text (442/3/0/0) is exceeded: 473 passed is 442 plus the 31 new §AD cases.

## FR and NFR not covered by an AC

- **FR-07 (the seam)** is exercised by every §AD case and its gate by the T2 review (404 in production, 404 without `MOCK_AI`, admin only).
- **FR-13** is covered by AC-03.
- **NFR-04 (privacy)** is AC-04 plus the TC-OBS-22 final check. The T1 review notes that `instruction` is capped but not redacted (a pasted credential in a refine instruction would be stored). This is within FR-03 and NFR-04 as written, and the owner decided to keep the instruction text.
- **NFR-06 (volume)** is asserted by the catalogue test (largest payload under 4 KB).
- **NFR-08 (read seam)** holds: the insights API calls `queries.ts` only, using tagged `$queryRaw` with bound values (T3 review).
- No requirement looks unmet.

## Per-task reviews

- T1 — WARN(1) → fixed by the orchestrator (counter write not awaited; verified at `track.ts:153`)
- T2 — NOTE
- T3 — NOTE (two display fixes applied)
- T4 — WARN(2) → fixed (streamed 2 KB cap; funnel resumed split)
- T5 — NOTE
- T6 — no task review (docs and gate)

## Known limits

- A timed-out insert is not cancelled: if the database recovers, the row is stored and also counted `dropped`, so "events lost" can slightly overcount (T1 NOTE-2).
- A run that mixes routes (CLI caption, API-mode design) reports only the API calls' tokens and counts as "reported" (T5 NOTE). Cache tokens are not counted (no `cache_control` in `src` today).
- `meanRefines` counts REFINE settles on the draft with no date bound, over succeeded generations only (T3 NOTE).
- The sweep events (`generation.swept`, `draft_action.swept`) are proven by unit tests and the seeded set, not by a real E2E sweep.
- The purge script is verified by hand (T3 report), not by an automated test.
- A `verdict` field in the refine attempt payload is a bounded free string, not an imported constant (T1 NOTE-1, still open).
- The screenshots predate the T4 and T5 sections.

PASS
