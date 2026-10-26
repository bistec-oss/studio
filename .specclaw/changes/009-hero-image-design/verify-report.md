# Verification Report: 009-hero-image-design

**Verified:** 2026-10-21
**Model:** Sonnet 5.5 (claude-sonnet-5-5)
**Verdict:** PASS (25/25 ACs met). Operator step OP-1 is pending and not counted.

The report covers HEAD `f8c5436` on `v2`. The last code commit is `f8f063c`; `ea1c36e` and `f8c5436` change only docs and specclaw files. The verifier read the code, ran the AC-23 greps and the scope diff itself, and spot-checked the other ACs in code, tests, docs and the task reports. It did not re-run the gates.

## Evidence provenance

- **Collected at verify:** lint 0 errors / 7 warnings (the baseline); build passes; unit 2947/2947.
- **E2E:** no `e2e_command` is configured. The evidence is the T6 full clean mock run at `f8f063c`: 422 passed, 3 skipped, 0 failed, 0 flaky (`reports/T6.md`). That is the 405 baseline plus §AA TC-HERO-01..16 and one a11y case. The targeted runs for T1–T5 are in their reports.
- **Render:** 47/47 (T6; T3 added 32 cases).
- **`test:upgrade`:** ALL PASS.
- **tsc:** clean.
- **CI at `f8f063c`:** 39604699552 (push) and 39604706638 (pull_request), both success.

## Acceptance criteria

- ✅ **AC-01 (migration and down script).**
  - `20261022120000_hero_composition` adds `Brief.imageStyle` (TEXT NOT NULL DEFAULT 'classic') and a nullable JSONB `composition` on `Draft` and on `DraftRevision`.
  - The down script drops all three columns and deletes the migration's own row.
  - The scratch-DB proof is in `reports/T1.md`: a pre-existing Brief reads `classic`, the down script returns `DELETE 1`, and `migrate diff` exits 0.
  - `git diff --name-only 2ad7431 -- prisma/migrations` lists only the new migration.
- ✅ **AC-02 (the pure `designData` module).** The module files exist, and `designData.test.ts` (including its purity guard) is green.
- ✅ **AC-03 (contracts).** `compositionPlan.test.ts` is green. The T2 BLOCK on the PORTRAIT subject wording was resolved on attempt 2.
- ✅ **AC-04 (API validation).** `validateImageStyle` (`src/lib/brief/imageStyle.ts`):
  - absent → classic;
  - a non-string, unknown, retired, or non-classic style on TEMPLATE → 400;
  - STORY is accepted.

  It is called in `briefs/route.ts`. Tests: `briefImageStyle.test.ts`, TC-HERO-12.

- ✅ **AC-05 (wizard).** The wizard files and `briefDraftPayload.ts` are covered; an unknown stored value resumes as classic. Tests: TC-HERO-13, `briefDraftPayload.test.ts`, the a11y case.
- ✅ **AC-06 (fallback table).** Every row settles through `settleComposition`; a URL with no check gives `check-error`.
- ✅ **AC-07 (closed decision).** `background.ts:77-80`: `decisionSchema` = `{ needed, prompt }`. The hero path ignores `needed`.
- ✅ **AC-08 (classic pinned).** `PROMPT_VERSION` = `2026-10-21.1`. `heroPrompts.test.ts` asserts the classic prompts are byte-identical to the pre-009 goldens and pins the classic fallback prompt.
- ✅ **AC-09 / AC-10 (region math, `evaluateRegions`).** `designRegions.test.ts` and `evaluateRegions.test.ts` are green.
- ✅ **AC-11 `[real]` (sampler).** `tests/render/hero-sampler.test.ts` on HTML fixtures rasterized at test time; render suite 47/47.
- ✅ **AC-12 (fail closed).** `checkHero` wraps the sampler, the seam and `evaluateRegions` together; any throw gives `check-error`, and only `ok === true` keeps the hero.
- ✅ **AC-13 (one image call).** A fallback reuses the hero URL. `openai.ts` sends `quality` only when it is given.
- ✅ **AC-14 `[real]` (layout observation).** `evaluateLayout` plus `layoutFacts.ts`, bounded at 15 s. It records only (`layout-violation`).
- ✅ **AC-15 (stamp on every writer).** `currentRenderStamp(model, composition)` has no default, so every writer must pass the stamp. Null is written as `Prisma.DbNull`. Writers carrying it: generation, regenerate-design, refine commit, rejected render, Override, inline edit, restore, adopt.
- ✅ **AC-16 (adopt, inline edit).** Adopt reads the rejected row's own stamp; inline edit carries the draft's stamp. TC-HERO-14.
- ✅ **AC-17 (refine).** The contract is passed only for a non-classic applied stamp. `refineReplacedStamp` re-stamps a kept draft classic when the background is replaced. TC-HERO-11.
- ✅ **AC-18 (regenerate).** Regenerate re-stamps from `result.composition`; a retired key gives `unknown-archetype`. TC-HERO-10.
- ✅ **AC-19 (notice).** `compositionNotice.ts` is pure. `CompositionNotice.tsx` renders on the draft page. `uiTokenGuard` is green.
- ✅ **AC-20 (quality).** `IMAGE_QUALITY` goes through `parseImageTier` in `env.ts`. OpenAI maps the tier; Gemini ignores the option. `.env.example` documents it.
- ✅ **AC-21 (E2E §AA).** `hero-image.test.ts` has TC-HERO-01..16; the seams are dormant outside `MOCK_AI`. E2E 422/3/0/0.
- ✅ **AC-22 (budget).** `budget.ts` and `actionBudget.test.ts` are updated. The worst-case segment is 835 s against the 840 s ceiling.
- ✅ **AC-23 (scope, greps run by the verifier).**
  - The only `safeArea`/`regions` hits are comments and dataset reads; no code reads a region from a model reply.
  - Nothing changed under `src/scheduler`, `src/mcp`, `src/app/api/acp` or `src/lib/scheduler`, and in `src/lib/models` only `budget.ts` changed.
  - Four component files changed. All four are in design.md's file map. The AC says "the three named", which is a wording discrepancy only.
- ✅ **AC-24 (docs).** `.env.example`, `e2e-test-plan.md` §AA, the handoff 009 section (with the evidence query and the OP-1 steps) and the `CLAUDE.md` line.
- ✅ **AC-25 (the gate).** tsc, lint, unit 2947, render 47, build, `test:upgrade`, E2E 422/3/0/0 and CI at `f8f063c` all pass.

## Per-task reviews

- T1 — PASS (orchestrator)
- T2 — BLOCK → resolved on attempt 2 (PORTRAIT subject wording)
- T3 — NOTE
- T4 — NOTE (the stale `pathB.ts` comment was fixed before the T4 commit)
- T5 — PASS
- T6 — no review (docs and gate)

## Operator step pending: OP-1

OP-1 is the check of the real look on prod, done by the user. It is not an AC. The build makes no real model calls, and the thresholds were tuned on synthetic fixtures. If nearly every real run falls back, the thresholds are too tight. The steps and the read-only evidence query are in `docs/handoff.md`, 009 section.

## Summary

**Passed:** 25/25 criteria
**Failed:** 0/25 criteria
**Verdict:** PASS
