# Tasks: Design instruction fidelity

**Change:** 004-design-instruction-fidelity
**Created:** 2026-09-15
**Total Tasks:** 24

## Summary

24 tasks in 5 waves (16 planned 2026-09-15; T3a, T11a and Wave 0 — T0a–T0f, the deploy-pipeline fix — added 2026-09-23 from user decisions). Wave 0 ships first as its own PR to `main`; Waves 1–4 go on `v2`. Waves 1–4 map one-to-one onto the three reversibility phases (Wave 3 is Phase 2's wiring half, split from Wave 2 only because the route work depends on the modules landing first).

Phase boundaries are hard: **Wave 2 must not start before Wave 1 lands; Wave 4 must not start before Wave 3 lands.** Each wave leaves the system working and independently revertible.

Two migrations, one per phase, deliberately not merged — a single migration would couple Phase 1's revertibility to Phase 2.

## Tasks

### Wave 0 — Phase 0: deploy pipeline _(added 2026-09-23 — own branch `fix/ci-deploy-pipeline` off `main`, PR to `main`, ships first)_

- [ ] `T0a` — Coolify token rotation _(ops — blocked on the Coolify administrator)_
  - Files: `docs/coolify-token-rotation.md` (the handoff)
  - Estimate: small
  - Kind: ops
  - Notes: 401 on [run 34988162569](https://github.com/bistec-oss/studio/actions/runs/34988162569). The administrator creates a deploy-scoped token and updates `COOLIFY_API_TOKEN`. Claude never handles the value. Done when the failed job re-runs green. **AC-P0-2 cannot pass until this is done.**

- [ ] `T0b` — Self-explaining, always-both redeploy step
  - Files: `.github/workflows/docker-publish.yml`
  - Estimate: small
  - Kind: config
  - Notes: FR-P0-1/2, AC-P0-1. One script step looping both UUIDs; status → reason mapping; both always attempted; fail at end. Never echo the token.

- [ ] `T0c` — Commit SHA in the image + public `/api/health`
  - Files: `Dockerfile` (runner `ARG`/`ENV GIT_SHA`), `.github/workflows/docker-publish.yml` (`build-args`), `src/app/api/health/route.ts` (new), `src/proxy.ts` (public allowlist)
  - Estimate: small
  - Kind: impl
  - Notes: FR-P0-3/4, AC-P0-3. Returns exactly `{ ok, commit }`; no auth; nothing else exposed. E2E case: 200 without a session.

- [ ] `T0d` — Post-deploy verification + current action majors
  - Files: `.github/workflows/docker-publish.yml`
  - Estimate: small
  - Kind: config
  - Depends: T0b, T0c
  - Notes: FR-P0-5/6, AC-P0-2/4. Poll prod `/api/health` until `commit == github.sha` (~10 min cap, to cover boot-time migrations); scheduler verified via the Coolify deployment status. Bump `checkout` and the `docker/*` actions to current majors (match `e2e.yml`'s `checkout@v7`).

- [ ] `T0e` — Node 20 → 22 _(separate commit, so it reverts alone)_
  - Files: `Dockerfile` (3 `FROM` lines), `.github/workflows/e2e.yml` (3× `node-version`), `package.json` (`engines`)
  - Estimate: medium
  - Kind: config
  - Notes: FR-P0-7, AC-P0-5. The risk is the native pieces in the runner image (Alpine `chromium`, Prisma linux-musl engines, the Claude Code CLI), not app code. Prove with `docker build` + full mock E2E + one **real** render inside the image + `claude --version` inside the image. Docker Desktop must be running locally.

- [ ] `T0f` — Correct the deploy note in CLAUDE.md
  - Files: `CLAUDE.md`
  - Estimate: small
  - Kind: docs
  - Notes: CLAUDE.md currently states "a green `main` build **does** now redeploy prod". Record the 401 incident and that a deploy is only confirmed when `/api/health` reports the commit, so the next session doesn't trust a stale claim.

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

- [ ] `T3a` — No-emoji guidance in the shared design prompt note _(added 2026-09-23)_
  - Files: `src/lib/agent/prompts/shared.ts`, `src/lib/agent/prompts/*` (version constant)
  - Estimate: small
  - Kind: impl
  - Notes: FR-21a, AC-07a. One line in `SCRIPT_SUPPORT_NOTE`: use symbols from the covered set (★ ✓ → etc.), never emoji, in the rendered design. Captions unaffected. Bump `PROMPT_VERSION`. User decision 2026-09-23: monochrome coverage only, so emoji must not be emitted into designs.

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
  - Notes: FR-08/09/10, FR-14b, AC-12/13/14/20b. The `add` verifier call is **pinned to Haiku** inside this module — it takes no model parameter, so proposal 008's model picker can never route it elsewhere. Result is `pass` | `miss` | `unavailable`, and **`unavailable` routes exactly as `miss`** — there is no default-commit path. Structural post-conditions for `remove`/`constrain`/`replace` spend zero model calls. Only `add` calls a model, receiving extracted facts (element presence, text lengths) plus delimited content declared as data, never the raw document as ground truth. Verdict must be machine-readable; unparseable is a miss.

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

- [ ] `T11a` — "Use anyway": adopt a rejected render _(added 2026-09-23)_
  - Files: `src/app/api/drafts/[id]/revisions/[rev]/adopt/route.ts` (new), `src/lib/drafts/revisions.ts`, `src/components/drafts/RefinementPanel.tsx`, `prisma/schema.prisma` (fold into T8's migration)
  - Estimate: medium
  - Kind: impl
  - Depends: T9, T11
  - Notes: FR-14a, AC-20a. The not-applied failure shows the rejected render's preview + **Use anyway**. The route claims `pendingAction` (single-flight, 409 on contention), then commits the rejected row's snapshot + export as a **fresh** normal revision via `commitDraftRevision`, marked user-accepted, and advances the pointer. The rejected row is never itself pointed at — T9's filter invariant holds. Record the adoption on the rejected row so a second adopt is a 409. Team-scoped like every draft route (cross-team → 404).

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
  - Notes: AC-08 through AC-20b (incl. adopt-once and the Haiku-pinned verifier). Must include the two reported failures as regression cases: "reduce the text" (a `remove` whose output must be measurably shorter) and "use the uploaded image as the background" (a `replace` whose superseded element must be absent — the duplicate-image export must fail this).

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
