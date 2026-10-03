# Verification Report: 004-design-instruction-fidelity

**Verified:** 2026-10-01
**Model:** Claude Opus 5.5 (claude-opus-5-5[1m])
**Verdict:** PARTIAL

Target: branch `v2`, HEAD `f8a6aa3f`. This was a read-only verify. The only commands run were focused vitest files (7 files, 673/673 passed), greps and reads, and read-only `gh` queries.

**Why PARTIAL:**

- Phases 1–3 pass 28 of 29 ACs. AC-06 passes under the amended spec; AC-20 passes by controller ruling. AC-04 is only partly met.
- Phase 0 is not on `v2`. At this HEAD, `src/app/api/health` doesn't exist, the Dockerfile is still on `node:20-alpine`, and `engines` is still `>=20.6`. Phase 0 lives on `fix/ci-deploy-pipeline` (PR #42, not merged).
- AC-P0-2 can't pass until T1 (rotating the Coolify token) is done and #42 is merged to `main`.
- The spec says "Each criterion must pass for the change to be considered complete", so the change isn't complete yet.

## Acceptance Criteria

### Phase 1

- ✅ **AC-01: a `★` renders as a visible star in the built runner image.**
  - **Verification method:** `ci-docker-build`. PR #43's build job, [run 36361971755](https://github.com/bistec-oss/studio/actions/runs/36361971755): the glyph check passed for ★ ✓ ✦ → • inside the CI-built runner image (2026-09-28).
  - **Where it's wired:** `.github/workflows/e2e.yml:238-239` runs `scripts/glyph-check/check-glyphs.mjs` in `bistec-studio:ci`. The font line is `Dockerfile:74` (`font-noto-sinhala font-noto-symbols`).
  - **Still valid at HEAD:** `Dockerfile` and `scripts/glyph-check/` are unchanged since 2026-09-27 (`7f880b07`, `404b0030`).
  - This was **not** run locally, and it is not recorded as `local`.
- ✅ **AC-02: the harness fails an uncovered glyph and passes covered ones, whatever the glyph.**
  - `tests/render/render-fidelity.test.ts:37-68` tests that it fails codepoints no font covers, passes covered glyphs of very different shapes, and doesn't flag thin rectangular glyphs (size is judged relative to the control).
  - `npm run test:render`: 15/15.
- ✅ **AC-03: the harness runs the real `renderHtmlToPng` with `MOCK_PUPPETEER` off.**
  - `tests/render/rasterize.ts:52-56` throws if `MOCK_PUPPETEER` is set or if it gets back `MOCK_PNG_BUFFER`; otherwise it calls `renderHtmlToPng`.
  - Asserted at `render-fidelity.test.ts:18`.
- ⚠️ **AC-04 (partial): a draft carries the font-set id used for its render, readable alongside `promptVersion`.**
  - **Met in code:**
    - `Draft.fontSet String?` (`prisma/schema.prisma:464`, migration `20260927120000_draft_font_set`);
    - it is stamped next to `promptVersion` at generation (`generateDraft.ts:119,170`), at revision commit (`revisions.ts:318-319`) and at regenerate-design (`regenerate-design/route.ts:114`).
  - **Not met:**
    - **Restore leaves the stamp stale.** It reuses an older revision's PNG but keeps the newer `fontSet`.
    - **Adopt stamps the current `fontSet`/`promptVersion`**, not the rejected render's own.
    - **No test checks a stamp is written.** `tests/unit/draftRevisions.test.ts:251` mocks `getFontSetId → 'fonts-test'` but never asserts the value. `fontSet.test.ts` covers only the apk-db parser.
  - Outside an Alpine image the stamp is `null`, which the spec allows. A non-null stamp inside the image has not been observed.
- ✅ **AC-05: a reply with the same N placeholder tokens reconciles clean and commits.**
  - Unit: `refineAttempt.test.ts:226`.
  - E2E: TC-FID-11, second half (`agui-refinement.test.ts:741`).
- ✅ **AC-06 (met under the amended spec, Ruling C): an absent placeholder.** It commits with the asset gone only when a `replace`/`remove` supersedes names it; otherwise it is a preservation miss, retried and then not applied.
  - Code: `refineAttempt.ts:129-156` (`reconcileTokens`) and `:242-243`.
  - Unit: `refineAttempt.test.ts:249`, `:261` and `:270`.
  - ⚠️ Unit-only. No E2E case covers an absent token.
- ✅ **AC-07: a renamed, duplicated or reindexed placeholder is treated as not applied, and nothing is committed.**
  - Unit: `refineAttempt.test.ts:233-238` and `inlineAssets.test.ts:120`.
  - E2E: TC-FID-11.
- ✅ **AC-07a: the shared design prompt says covered symbols, never emoji, and `PROMPT_VERSION` is bumped.**
  - The rule is at `prompts/shared.ts:26`. `PROMPT_VERSION` went from `2026-07-28.1` to `2026-10-01.2` (`shared.ts:13`).
  - It also reaches the prod CLI refine branch (`prompts/refine.ts:61,77`). Tested in `prompts.test.ts` and `refinePrompt.test.ts`.

### Phase 2

**E2E qualifier for every Phase 2 AC:** E2E runs with `MOCK_AI`, so the refine replies (classes, supersedes, html) are canned. E2E proves the route, reconciliation, verification and settle mechanics, not live-model classification. No live-model refine ran in this verify.

- ✅ **AC-08: "reduce the text" gives shorter text, or retries once and reports not applied.**
  - E2E: TC-FID-01, TC-FID-02 and TC-FID-03.
  - Unit: `refineAttempt.test.ts:418` and `refineVerify.test.ts:800`.
  - ⚠️ Outside the text-reduction lexicon it still depends on the classifier (I-2 residual).
- ✅ **AC-09: using the uploaded image as the background leaves the superseded element absent, and the reported duplicate shape fails.**
  - E2E: TC-FID-04, TC-FID-05, TC-FID-05b (the reported duplicate shape is not applied) and TC-FID-05c (the correct move commits).
  - Unit: `refineAttempt.test.ts:401,408`.
  - ⚠️ A requested swap always fails closed. A pure move passes even when the deleted image was the upload.
- ✅ **AC-10: a `replace`/`remove` with empty supersedes deletes nothing and preserves instead.**
  - Code: `refineAttempt.ts:237-241`.
  - E2E: TC-FID-06.
  - Unit: `refineAttempt.test.ts:191,202`.
- ✅ **AC-11: a multi-clause instruction gets more than one class, and every class is verified.**
  - E2E: TC-FID-07 and TC-FID-08.
  - Unit: `refineAttempt.test.ts:437`.
  - ⚠️ The multi-class reply is a mock.
- ✅ **AC-12: `remove`, `constrain` and `replace` verify with zero model calls.**
  - Code: `refineVerify.ts:454` and `instructionClasses.ts:796-826`.
  - Remove and replace are proven over HTTP with zero verifier calls (TC-FID-01, TC-FID-04/05).
  - **Constrain is proven by unit tests only** (`refineVerify.test.ts:191-251`), because `MOCK_PUPPETEER` can't resolve constrain targets.
- ✅ **AC-13: an `add` refine ("include a human character") spends one verifier call and reports not applied when the element is still absent.**
  - E2E: TC-FID-16.
  - Unit: `refineVerify.test.ts:259-284` and `refineAttempt.test.ts:427`.
  - ⚠️ **Mock-verified only.** The positive path needs a live Haiku smoke test.
- ✅ **AC-14: a verifier timeout, empty reply or unparseable reply counts as a miss.**
  - Code: `refineVerify.ts:407-477` and `refineAttempt.ts:255-262,297-300`.
  - Unparseable, empty and forced-unavailable are covered over HTTP (TC-FID-17 ×2, TC-FID-10).
  - **The timeout case is unit-only** (`refineVerify.test.ts:356`).
- ✅ **AC-15: a refine makes at most 2 refine calls and 2 verifier calls.**
  - Code: `refineAttempt.ts:62` and `:277-314`.
  - Unit: `refineAttempt.test.ts:292-316`, the full grid, plus `:473`.
  - E2E: TC-FID-13.
- ✅ **AC-16: after a twice-failed refine, the pointer is unchanged and no numbered revision is added.**
  - Code: `refineAttempt.ts:338-353`.
  - Unit: `refineAttempt.test.ts:318`.
  - E2E: TC-FID-01, TC-FID-13 and `rejected-revisions.test.ts:97`.
- ✅ **AC-17: the rejected render is retrievable with its instruction, classes and the verifier's miss.**
  - E2E: TC-FID-01 and `refine-not-applied.test.ts:80`.
- ✅ **AC-18: the poll exposes "not applied" separately from success and from the error channel, and the UI shows it as a failure.**
  - Code: `drafts/[id]/route.ts:136,158` and `NotAppliedCard.tsx:41`.
  - E2E: `refine-not-applied.test.ts:72-150` and TC-FID-15.
- ✅ **AC-19: one table drives both the refine prompt and the verifier criteria.**
  - Code: `instructionClasses.ts:796`, `prompts/refine.ts:22` and `refineVerify.ts:326-333`.
  - Unit: `instructionClasses.test.ts:150` and `refineVerify.test.ts:779`.
- ✅ **AC-20 (met by ruling): regenerate-design and regenerate-copy keep their request and response shapes.**
  - The shapes are byte-identical (`202 {ok:true}`), the route diffs are 2–4 lines, and §Q TC-ASYNC plus TC-FID-14 are green.
  - **Behaviour is not literally byte-identical.** Four ruled deltas reach these routes through shared modules:
    - (a) a claim no longer nulls `pendingActionError`;
    - (b) completion clears and discards a live not-applied outcome;
    - (c) `withNextRevisionNumber` waits up to 10 s for a pool connection;
    - (d) regenerate-design stamps the bumped `PROMPT_VERSION`.
- ✅ **AC-20a: "Use anyway" adopts the rejected render.** It creates exactly one revision and advances the pointer; a second adopt is 409.
  - Code: `NotAppliedCard.tsx:52-71` and `rejected/[revisionId]/adopt/route.ts:96`.
  - E2E: TC-FID-15, plus `refine-not-applied.test.ts` cases `:186`, `:229`, `:337`, `:249` and `:262`.
- ✅ **AC-20b: every `add` verifier call runs on Haiku, and the retry uses the requested refine model.**
  - Code: `refineVerify.ts:131,372-373` (`pinModel: true`) and `refineAttempt.ts:281`.
  - **The CLI pin is unit-only** (`refineVerify.test.ts:265`).
  - API mode is proven by `refineAttempt.test.ts:427`.

### Phase 3

- ✅ **AC-21: a text edit containing `<script>alert(1)</script>` shows as literal visible text.**
  - Unit: `inlineEditElement.test.ts:292`.
  - E2E: TC-INLINE-15.
- ✅ **AC-22: a colour input that tries to inject CSS (`red; background: url(…)`) is rejected and nothing is written.**
  - Unit: `inlineEditElement.test.ts:370,379`.
  - E2E: TC-INLINE-06 and TC-INLINE-15.
- ✅ **AC-23: a size with a disallowed unit or a non-numeric value is rejected.**
  - Unit: `inlineEditElement.test.ts:112,387`.
  - E2E: TC-INLINE-12.
- ✅ **AC-24: an element edit commits through `commitDraftRevision` as exactly one revision, with no second writer.**
  - Code: `inline-edit/route.ts:75,175`.
  - E2E: TC-INLINE-15 and TC-INLINE-07.
- ✅ **AC-25: no element address is persisted, so an edit can't land on the wrong node after a refine.**
  - Unit: `inlineEditElement.test.ts:405-421`.
  - E2E: TC-INLINE-13, TC-INLINE-08 and TC-INLINE-15.
- ✅ **AC-26: a client-supplied selector never picks the write target.**
  - Unit: `inlineEditElement.test.ts:166`.
  - E2E: TC-INLINE-05 and TC-INLINE-14.

### Phase 0 (on `fix/ci-deploy-pipeline` / PR #42, not on `v2`)

- ⚠️ **AC-P0-1 (partial): an invalid token makes the redeploy fail with "token rejected", and the scheduler redeploy is still attempted.**
  - It is proven only by running the extracted `run:` block against a local HTTP stub (`.superpowers/sdd/tasks/wave1-A-report.md:41-48`).
  - No real `workflow_dispatch` or fork run is recorded.
- ❌ **AC-P0-2 (not met; blocked on ops): a merge to `main` ends green only when prod's `/api/health` reports the merged SHA.**
  - It needs T1 (the Coolify token rotated with `deploy`+`read`) and PR #42 merged on the user's go-ahead.
- ✅ **AC-P0-3 (on the PR #42 branch): `/api/health` returns 200 without a session and exactly `{ ok, commit }`.**
  - TC-AUTH-08; the PR #42 E2E workflow is green (run 36361943073).
- ⚠️ **AC-P0-4 (partial): no Node-20 deprecation warnings.**
  - `e2e.yml` is clean.
  - `docker-publish.yml` only runs on `main` or `workflow_dispatch`, so it has never run with its new action majors.
- ✅ **AC-P0-5 (`docker-build-local`, at `5f44828d`): `node:22-alpine` works.**
  - The image builds. Inside it, `node` is v22.23.3, `claude` is 2.1.283, and the Prisma musl engines load.
  - A real Chromium render produced a 1080×1080 PNG.
  - Mock E2E: 180/4/0. CI E2E on Node 22 is green.
  - ⚠️ The in-image render was a throwaway `puppeteer-core` script, not the app's full Path B pipeline.

## Test Results (HEAD `f8a6aa3f`, 2026-10-01)

| Gate                    | Command                                                                              | Result                                       | Source                                                       |
| ----------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------ |
| Unit                    | `npm run test:unit`                                                                  | 52 files, **1307/1307**                      | `specclaw-verify collect`                                    |
| Lint                    | `npm run lint`                                                                       | **0 errors, 7 pre-existing warnings**        | collect                                                      |
| Build                   | `npm run build`                                                                      | **passed**                                   | collect                                                      |
| Real render             | `npm run test:render` (`MOCK_PUPPETEER` off)                                         | **15/15**                                    | controller-run                                               |
| Mock E2E                | `npm run test:e2e:mock`, run clean: `.next` removed, test DB recreated, fresh server | **231 passed, 4 skipped, 0 failed, 0 flaky** | controller-run; log in `.superpowers/sdd/tasks/e2e-full.log` |
| Focused unit (verifier) | 7 files                                                                              | **673/673**                                  | verifier-run                                                 |

- `specclaw.build.e2e_command` is not configured, so `collect` did not run E2E. The E2E and render results are controller-run evidence.
- The 4 skips are the intentional ones: TC-GEN-05 and TC-REG-H11a/b/c.
- **Non-blocking build warning:** Turbopack reports "unexpected file in NFT list", traced through `claudeCli.ts`. It is most likely pre-existing; this was not confirmed.

## Known limits (stated plainly; not proven)

Unless marked "fails open", each limit fails closed: the result is a false "not applied", and **Use anyway** is available.

**Correct refines that always miss:**

- decorative elements with no text or image;
- a constrain that is already satisfied;
- a replace whose new text contains the old phrase;
- legitimate reuse of an inline token.

**Image swaps and moves:**

- **A requested swap always fails closed** (F1d ruling). This is deliberate: the move-intent lexicon was repeatedly gameable.
- **A pure move passes even when the deleted image was the upload itself.** Fails open.
- **Deleting an unrelated image and reusing its slot** for the superseded image passes as a pure move. Fails open.
- An id'd-inset supersedes is checked asymmetrically on a swap.
- E2E never exercises the swap or move path; unit tests are the only proof.

**Image multiplicity:**

- It runs only under `replace`. An `add` classification, or a downgraded replace, leaves a duplicate image to the Haiku judge, which is best effort. Can fail open.
- srcset variants aren't unified with background URLs.

**The text-reduction lexicon** (prefers triggering, because for replace and constrain no judge runs behind it):

- **I-2 residual:** a text-reduction instruction outside the lexicon depends on the classifier. Can fail open.
- It can match quoted new copy.
- Odd phrasings trigger it, such as "reduce the text, size it down" and "fewer words in the logo?".
- **Coordinated pure resizes false-miss** (deliberate, `f8a6aa3f`), such as "reduce the text and logo size".
- Some resize phrasings false-miss: "reduce the text it is too big", "reduce the text for mobile", "reduce the text more", "reduce the text inside the card to 12px".

**Gaps in structural checking (these can fail open):**

- **The N5 family:** a re-tagged passage can false-pass.
- **The flat-supersedes wholesale exemption** can pass a longer wholesale rewrite. It is no worse than before 004.
- **Add, and constrain combined with other classes, have no structural preservation check.**
- **A dropped image whose token survives** in a comment or attribute still reconciles clean.
- **`domFacts` runs in the page's main world**, so a design script could spoof its facts.

**Verifier evidence:**

- The per-section change budget is 1,600 chars, so one oversized row is dropped whole.
- The "judge every other scope" wording has not been run against live Haiku.

**Element mode:**

- A stylesheet `!important` can defeat an edit.
- A font size with more than 4 decimals can't be re-applied unchanged.
- The locator fails closed on tbody-less tables, block-in-`<p>`, noscript/select/math, and unknown entities.
- TC-INLINE-19's rich-paste count-0 assertion isn't load-bearing.

**Concurrency:**

- **The settle guards key on the action string, not the claim.** A late settle from a swept run of the same action can overwrite a newer claim. Follow-up: a claim token.
- **A swept run's content writes are unguarded** (`recordRejectedRender`, `commitDraftRevision`).
- **After a sweep, a late successful run doesn't clear the "interrupted" error.**
- **A concurrent element edit and refine** is unit-proven only.
- **Pre-existing races, not introduced by 004:** Override, whole-document edit, and refine reading before it claims.

**Evidence scope:**

- E2E covers Phases 2–3 under `MOCK_AI` and `MOCK_PUPPETEER`. Live-model classification, the live Haiku verifier and the live CLI verifier pin were not exercised.

## Migration / rollback

Migrations on `v2` are applied by a redeploy, through the entrypoint. Locally, run `npx prisma migrate deploy`.

- **`20260927120000_draft_font_set`:** a nullable `Draft.fontSet`, with no backfill. Down: `ALTER TABLE "Draft" DROP COLUMN "fontSet";` and delete its `_prisma_migrations` row.
- **`20260927130000_refine_not_applied`:** safe on a populated DB and compatible with the old container during a rolling deploy. The advisory lock makes it apply once.

**The down path is order-sensitive.** Delete the unnumbered (rejected) `DraftRevision` rows **before** any Phase 2 code revert, including a Coolify rollback to a pre-Phase-2 image.

- **Why the order matters:** pre-Phase-2 `withNextRevisionNumber` sorts NULLs first under DESC. A single rejected row makes it compute revision 1, which gives P2002 on every retry.
- **The steps, from the migration header:**
  1. `UPDATE "Draft" SET "notAppliedReason" = NULL, "notAppliedRevisionId" = NULL;`
  2. `DELETE FROM "DraftRevision" WHERE "revisionNumber" IS NULL;`
  3. Drop the FK, its index and the three CHECK constraints.
  4. Restore `revisionNumber NOT NULL`, drop the added columns, and delete the `_prisma_migrations` row.
- **Steps 1 and 2 alone make pre-Phase-2 code safe.**

**Phase independence (NFR-06):** the Phase 1 and Phase 2 migrations are separate, and the Node 22 bump is its own commit (`5f44828d`).

## Issues Found

1. **AC-04: the font-set stamp is wrong after restore and adopt, and no test checks a stamp is written.**
   - Fix: per-revision `fontSet`/`promptVersion`, copied back on restore and adopt.
   - Add a write assertion in `draftRevisions.test.ts`.
2. **Phase 0 isn't proven on `main`, and AC-P0-2 is blocked.** Fix, in order:
   1. T1, the Coolify token rotation;
   2. merge PR #42 on the user's go-ahead;
   3. an invalid-token `workflow_dispatch` (AC-P0-1);
   4. confirm a merge goes green only on the right `/api/health` SHA (AC-P0-2);
   5. check `docker-publish.yml`'s annotations (AC-P0-4);
   6. merge `main` into `v2`.
3. **The live-model paths are unproven: AC-13's positive path and the AC-20b CLI pin.** Fix: one live CLI-mode smoke test with an add-only refine that should pass and one that should miss, then check the log for `--model haiku`.
4. **The settle guards key on the action, not the claim.** Fix: a `pendingActionClaimId` threaded through the claim lifecycle, which also guards `recordRejectedRender`/`commitDraftRevision`.
5. **Two escapes fail open:** the flat-supersedes wholesale exemption, and add with no preservation check. Fix: per-clause supersedes, plus a structural preservation check for add.
6. **The Turbopack NFT trace warning** (non-blocking).

The deferred can-wait items are in `.superpowers/sdd/tasks/final-{1,2,3}-review.md`.

## Summary

**Phases 1–3 (on `v2`):**

- **Passed:** 28/29. AC-06 under Ruling C; AC-20 by ruling. Several passes are unit-only or mock-only, as noted against each AC.
- **Partial:** 1/29 (AC-04).
- **Failed:** 0/29.

**Phase 0 (PR #42 branch):**

- **Passed:** 2/5.
- **Partial:** 2/5.
- **Not met:** 1/5 (AC-P0-2, blocked on ops).

**All 34 criteria:** 30 passed, 3 partial, 1 not met, 0 failed.

**Gates:** unit 1307/1307, lint 0 errors, build passed, render 15/15, mock E2E 231/4/0/0. None blocking.

**Verdict:** PARTIAL

## Addendum (2026-10-01): AC-04 fixed after verify by F3 (`543e8efa`)

**Fix.** Each `DraftRevision` row now carries its own `fontSet` and `promptVersion`, added by migration `20261001120000_revision_render_stamps`: two nullable columns, with the down path in the header.

- **Stamped on every revision create:** generation v1, commit, the rejected render, and regenerate-design.
- **Restore** copies the restored revision's own stamp onto the draft, or null for a pre-F3 row. When the route re-renders a legacy row that has no stored PNG, it stamps the font set in use now.
- **Adopt** copies the rejected render's own stamp.

**Evidence.**

- Unit `tests/unit/draftRevisions.test.ts:1152-1290` and `tests/unit/renderStamps.test.ts` assert `'fonts-test'` and the real `PROMPT_VERSION` on every path.
- Unit 1326/1326.
- Full clean mock E2E 231/4/0/0.

**AC-04 is now ✅ for Phases 1–3: 29 of 29.**

**Residual, out of scope:** `POST /api/generate/export` re-renders a draft that has no `exportUrl` without updating `Draft.fontSet`. It creates no revision, and only legacy drafts reach it.

**The verdict stays PARTIAL, solely because of Phase 0:**

- AC-P0-1 and AC-P0-4 are partial;
- AC-P0-2 is not met;
- all three wait on PR #42's merge and the Coolify token rotation.
