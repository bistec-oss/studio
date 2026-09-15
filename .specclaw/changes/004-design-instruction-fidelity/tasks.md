# Tasks: Design instruction fidelity

**Change:** 004-design-instruction-fidelity
**Created:** 2026-09-15
**Total Tasks:** 16

## Summary

16 tasks in 4 waves, mapping one-to-one onto the three reversibility phases (Wave 3 is Phase 2's wiring half, split from Wave 2 only because the route work depends on the modules landing first).

Phase boundaries are hard: **Wave 2 must not start before Wave 1 lands; Wave 4 must not start before Wave 3 lands.** Each wave leaves the system working and independently revertible.

Two migrations, one per phase, deliberately not merged — a single migration would couple Phase 1's revertibility to Phase 2.

## Tasks

### Wave 1 — Phase 1: glyph coverage, real-render harness, placeholder reconciliation

- [ ] `T1` — Install monochrome symbol font coverage in the runner image
  - Files: `Dockerfile`
  - Estimate: small
  - Kind: config
  - Notes: Beside the existing `font-noto-sinhala` on the runner stage (`Dockerfile:68`). Monochrome symbol coverage only — not a full colour emoji set (FR-21). Chromium's fontconfig fallback picks it up OS-wide; no CSS or `@import` in generated HTML.
  - ⚠️ **Verification requires a Docker image build.** This task's effect exists only inside the built image. A local test run uses host Chromium, which on Windows already has symbol coverage via Segoe UI Symbol and will pass whether or not this task was done — a false green. Prove it with `docker build` and run the assertion inside the image, or rely on the CI docker-build job. **The Docker daemon must be running**; it was not available in the planning session, which is why this is called out here rather than discovered at verify time.

- [ ] `T2` — Font-set identifier, stamped per draft
  - Files: `src/lib/renderer/fontSet.ts` (new), `prisma/schema.prisma`, `prisma/migrations/*`, render/export call sites
  - Estimate: medium
  - Kind: migration
  - Depends: T1
  - Notes: FR-22. Compute a digest of the installed font packages at boot; store on `Draft` beside `promptVersion`. Nullable — drafts rendered before this exist and are not wrong, just unstamped (Edge Cases). This is Phase 1's only migration.

- [ ] `T3` — Reusable rasterizing test harness with glyph-agnostic tofu assertion
  - Files: `tests/e2e/helpers/rasterize.ts` (new), `tests/e2e/render-fidelity.test.ts` (new)
  - Estimate: large
  - Kind: test
  - Depends: T1
  - Notes: FR-23, AC-01/02/03. Runs real `renderHtmlToPng` with `MOCK_PUPPETEER` **off**. Tofu detection compares the candidate glyph against a known-covered control glyph at the same size rather than matching an absolute pattern — a replacement box has a uniform-rectangle signature no real glyph has. This harness is the compounding asset: proposal 007 and every future font/render question reuse it. Include a `★` case that fails without T1 and passes with it.
  - ⚠️ **Split what this proves.** AC-02 (the harness detects tofu) is provable locally. AC-01 (the runner image actually has the glyph) is **not** — see T1. The `★` case will pass locally on Windows regardless of T1, so a green local run is not evidence the font fix works. Make the harness runnable inside the image so CI and a local `docker build` can both execute it.

- [ ] `T4` — Inline-asset reconciliation replacing detection
  - Files: `src/lib/agent/inlineAssets.ts`, unit tests
  - Estimate: medium
  - Kind: impl
  - Notes: FR-20, AC-05/06/07. `reconcileInlineAssets(sentTokens, replyHtml)` returns `clean` | `restored` | `mismatch`. Token set out must equal token set back, same multiplicity. Clean absence restores; renamed/duplicated/reindexed returns `mismatch`. Pure function, no I/O — unit-testable like `htmlDocument.ts`. Caller wiring for `mismatch` lands in T10.

### Wave 2 — Phase 2: the taxonomy and verification modules

- [ ] `T5` — The single per-class table
  - Files: `src/lib/agent/instructionClasses.ts` (new), unit tests
  - Estimate: medium
  - Kind: impl
  - Notes: FR-03, FR-06, AC-19. One exported object keyed by `add`/`replace`/`remove`/`constrain`, each carrying `semantics` (prose rendered into the prompt) and `postCondition` (null for `add`). This is the _only_ definition — the prompt builder and the verifier both import it, so they cannot drift. Include the worked `constrain` example the spec owes (party-ba).

- [ ] `T6` — Refine envelope parser
  - Files: `src/lib/agent/refineEnvelope.ts` (new), unit tests
  - Estimate: medium
  - Kind: impl
  - Notes: FR-01. Parses `{ classes[], supersedes[], html }` from the reply. **Reuse `extractHtmlDocument`** (`src/lib/agent/htmlDocument.ts`) for the document cut rather than writing a second boundary — it already tolerates model narration, which is the bug it was written for. Missing/unparseable classes resolve to the preserving default (FR-05). Pure, no I/O.

- [ ] `T7` — Verification module with three-state result
  - Files: `src/lib/drafts/refineVerify.ts` (new), unit tests
  - Estimate: large
  - Kind: impl
  - Depends: T5
  - Notes: FR-08/09/10, AC-12/13/14. Result is `pass` | `miss` | `unavailable`, and **`unavailable` routes exactly as `miss`** — there is no default-commit path. Structural post-conditions for `remove`/`constrain`/`replace` spend zero model calls. Only `add` calls a model, receiving extracted facts (element presence, text lengths) plus delimited content declared as data, never the raw document as ground truth. Verdict must be machine-readable; unparseable is a miss.

- [ ] `T8` — Phase 2 migration: not-applied outcome and rejected-render retention
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`
  - Estimate: small
  - Kind: migration
  - Notes: FR-12/13/14. A distinct not-applied field on `Draft` (separate from `pendingActionError`, so "did not do what you asked" reads differently from "the run crashed"), and a rejected flag on `DraftRevision`. Kept separate from T2's migration so Phase 1 stays independently revertible.

- [ ] `T9` — Exclude rejected revisions from every consumer
  - Files: `src/app/api/drafts/[id]/revisions/route.ts`, `.../revisions/[rev]/restore/route.ts`, `.../route.ts`, `.../inline-edit/route.ts`, `.../refine/route.ts`, `.../regenerate-design/route.ts`, `src/lib/drafts/revisions.ts`, `src/lib/drafts/recovery.ts`, `src/lib/agent/generateDraft.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T8
  - Notes: **The design's sharpest edge.** 9 files read `DraftRevision`; a rejected row leaking into the version-switch list, restore, Undo, or `withNextRevisionNumber` would be a regression worse than the bug being fixed. Enumerate every consumer, filter explicitly, and add a test per surface. Do not rely on callers remembering — filter at the query helper where possible.

### Wave 3 — Phase 2: wiring, UI, and test seams

- [ ] `T10` — Wire classification, verification, retry-once and the not-applied outcome into the refine route
  - Files: `src/app/api/drafts/[id]/refine/route.ts`, `src/lib/agent/prompts/refine.ts`
  - Estimate: large
  - Kind: impl
  - Depends: T4, T5, T6, T7, T8, T9
  - Notes: FR-04/05/07/11/12/13, AC-08/09/10/11/15/16/17. Verification sits **above `runDesignAgentCli`, in the refine route only** — `regenerate-design` and `regenerate-copy` must remain byte-identical (AC-20, NFR-03). The route enforces non-empty `supersedes` before any destructive class; the prompt is not trusted to have required it. Hard cap: at most 2 refine calls and 2 verifier calls, any input. Wire T4's `mismatch` to the same not-applied path. Prompt semantics render from T5's table; bump `PROMPT_VERSION`.

- [ ] `T11` — Surface not-applied as a failure in the UI
  - Files: `src/components/drafts/RefinementPanel.tsx`, `src/app/api/drafts/[id]/route.ts` (poll response)
  - Estimate: medium
  - Kind: impl
  - Depends: T10
  - Notes: FR-14, AC-18. Name the poll field explicitly — party-architect's point is that client and server halves of one merge disagree without it. Hard failure, not a dismissible warning on a committed revision.

- [ ] `T12` — Deterministic verification-miss seam
  - Files: `src/lib/testHooks.ts`
  - Estimate: small
  - Kind: test
  - Depends: T7
  - Notes: FR-24. Follows the existing sentinel pattern (`shouldMockGenerateFail`, `__FAIL_*__` in the brief topic). Without this the retry and twice-failed branches are unreachable in tests — exactly the structural blindness this change exists to fix.

- [ ] `T13` — E2E coverage for the refine fidelity contract
  - Files: `tests/e2e/agui-refinement.test.ts`, new cases
  - Estimate: large
  - Kind: test
  - Depends: T10, T11, T12
  - Notes: AC-08 through AC-20. Must include the two reported failures as regression cases: "reduce the text" (a `remove` whose output must be measurably shorter) and "use the uploaded image as the background" (a `replace` whose superseded element must be absent — the duplicate-image export must fail this).

### Wave 4 — Phase 3: element-targeted editing

- [ ] `T14` — Closed input grammar for element edits
  - Files: `src/lib/drafts/inlineEdit.ts`, unit tests
  - Estimate: medium
  - Kind: impl
  - Notes: FR-15/16, AC-21/22/23. Text written as text content, never parsed as markup. Colour parsed and re-serialized to hex/`rgb()`; size to number + unit from an allowed set. Reject on any parse failure — never pass through. No free-form CSS declarations, no value containing `url(`. Note in comments that the renderer egress allowlist already blocks off-host fetches (`puppeteer.ts:75`), so this guards declaration break-out and defence in depth, not SSRF.

- [ ] `T15` — Element-scoped write path on the existing inline-edit route
  - Files: `src/app/api/drafts/[id]/inline-edit/route.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T14
  - Notes: FR-17/18/19, AC-24/25/26. Node resolved **server-side** from the click payload; a client-supplied selector is never the write target. Addresses resolved fresh, never persisted. Commits through the existing `commitDraftRevision` — no second writer of `Draft.htmlContent`. This mode must be **narrower** than the existing whole-document contenteditable surface, never wider; that surface is unchanged.

- [ ] `T16` — Click-to-select element mode in the editor, with E2E
  - Files: `src/components/drafts/InlineEditModal.tsx`, `tests/e2e/draft-inline-edit.test.ts`
  - Estimate: large
  - Kind: impl
  - Depends: T15
  - Notes: AC-21 through AC-26. Include the injection cases as tests, not just the happy path: a text edit containing `<script>` must render as literal visible text, and a colour input of `red; background: url(http://evil.test/x)` must be rejected outright.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
