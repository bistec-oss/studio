# Design: Design instruction fidelity

**Change:** 004-design-instruction-fidelity
**Created:** 2026-09-15

## Technical Approach

Three phases, ordered by reversibility. Each is a working system on its own.

The organising idea is the project's own recorded lesson — **a prompt rule is not an invariant** — applied to the refine loop. Today the refine prompt _asks_ for a targeted edit and nothing checks. This change adds a parse boundary and a post-condition around the same model call, and moves the cases that never needed a model onto a deterministic path.

### Phase 0 — deploy pipeline (added 2026-09-23)

Ships on its own branch off `main` (`fix/ci-deploy-pipeline`) as a PR to `main`. After it merges, `main` is merged into `v2` so `v2` carries it.

**Redeploy step.** Replace the two `curl -fsS` steps with one script step that deploys both UUIDs in a loop. It captures each HTTP status (`curl -sS -o body -w '%{http_code}'`, not `-f`, so the body survives), maps the status to a reason, records both outcomes, and exits non-zero at the end if either failed. The token stays in `secrets.COOLIFY_API_TOKEN` and is only ever passed as a header.

**Commit in the image.** `docker/build-push-action` gains `build-args: GIT_SHA=${{ github.sha }}`. The Dockerfile runner stage declares `ARG GIT_SHA` → `ENV GIT_SHA`, so there is no build-time secret and nothing else changes. The app reads `process.env.GIT_SHA`, falling back to `"unknown"` for local dev.

**`/api/health`.** A tiny route handler returning `{ ok: true, commit }`. Public, so it goes on the auth proxy's allowlist. It deliberately exposes nothing else. A commit SHA of a public repo is not sensitive; env, versions and DB state would be.

**Verify step.** Poll `https://studio.bistecglobal.com/api/health` every ~15s for up to ~10 minutes until `commit == github.sha`. Coolify pulls the image, runs `prisma migrate deploy` in the entrypoint, then boots, so the wait must cover a migration. For the scheduler, read the Coolify deployment status returned by the deploy call. That proves the container deployed, not that the worker loops; the real liveness check is 006 item 7.

**Node 22.** Bump the three `FROM` lines, `setup-node` in `e2e.yml`, and `engines`. The risks are native pieces in the runner image, not app code: Alpine's `chromium` package, Prisma's linux-musl engines copied from the builder, and the globally installed Claude Code CLI. All three are covered by AC-P0-5. Kept as a **separate commit** so it reverts alone if a native piece breaks. The dev machine already runs Node 24, so the app code is not the concern.

### Phase 1 — glyph coverage, a real render harness, placeholder reconciliation

No behavioural change to the model path. Everything here is deletable in one commit.

**Emoji guidance (added 2026-09-23).** The one model-path touch in Phase 1: `SCRIPT_SUPPORT_NOTE` (`prompts/shared.ts`) gains a line telling the design agent to use covered symbols and never emoji, since colour emoji remain uncovered by decision. One line, `PROMPT_VERSION` bump, deletable with the rest of the phase.

**Fonts.** `Dockerfile` runner stage gains a monochrome symbol font beside `font-noto-sinhala`. Chromium's fontconfig fallback then covers symbol codepoints automatically, as it already does for Sinhala — no CSS or `@import` in generated HTML. The font-set identifier is computed at boot (package list digest) and stamped on the draft next to `promptVersion`.

**Rasterizing harness.** A test helper that runs the real `renderHtmlToPng` with `MOCK_PUPPETEER` off and asserts on decoded pixels. Its first assertion is glyph-agnostic tofu detection: render the candidate glyph and a known-covered control glyph at the same size, and compare — a replacement box has a distinctive uniform-rectangle signature that differs from any real glyph. This is the seam proposal 007 will also use.

**Placeholder reconciliation.** `inlineAssets.ts` gains a reconcile step. `extractInlineAssets` already returns the token set; the new function compares it against the token set found in the reply. Equal sets commit; a clean subset restores the missing tokens; anything else (renamed, duplicated, reindexed) returns a mismatch that the caller treats as not-applied.

### Phase 2 — taxonomy and verification

**One table, two consumers.** A new module exports the per-class definition:

```
INSTRUCTION_CLASSES = {
  add:       { semantics: "...", postCondition: null },
  replace:   { semantics: "...", postCondition: supersededElementAbsent },
  remove:    { semantics: "...", postCondition: targetTextShorter },
  constrain: { semantics: "...", postCondition: boundedAttributeHolds },
}
```

`prompts/refine.ts` renders the `semantics` fields into the prompt. The verifier reads `postCondition`. Because both derive from one object, FR-06 holds structurally rather than by discipline — there is no second copy to forget.

**Classification rides the refine call.** The refine prompt's output protocol changes from "output only the HTML document" to a small envelope carrying `classes`, `supersedes`, and the document. The existing `extractHtmlDocument` (`src/lib/agent/htmlDocument.ts`) already cuts a document out of surrounding text, so the envelope parse reuses that proven boundary rather than inventing a second one — and keeps its property of tolerating model narration.

**Verification.** In the refine route, above `runDesignAgentCli`. For every returned class with a non-null `postCondition`, evaluate it against the rendered output. Only `add` falls through to a verifier model call, and that call receives extracted facts (element presence, text lengths) plus delimited content declared as data — never the raw document as ground truth.

**Fail-closed.** The verifier result type is a three-state (`pass` / `miss` / `unavailable`), and `unavailable` routes to the same branch as `miss`. There is no default-commit path.

**Not-applied outcome.** `Draft.pendingActionError` already carries a string the poll surfaces, but the UI treats it as an error. A distinct field is needed so "the model ran fine and did not do what you asked" reads differently from "the run crashed". The rejected render is stored as a `DraftRevision`-shaped row that the pointer never references — see Key Decisions.

**Use anyway (added 2026-09-23).** The not-applied failure shows the retained render's preview and a **Use anyway** action — a new `POST /api/drafts/[id]/revisions/[rev]/adopt`. It claims `pendingAction` like every draft action (so it is single-flight), then commits the rejected row's snapshot and export as a normal revision via `commitDraftRevision`, recorded as user-accepted. The rejected row itself is not flipped into the chain; the adopted revision is a fresh row, so the "rejected rows are never referenced by the pointer" invariant from Key Decisions still holds everywhere. A second adopt of the same rejected row is a 409 (the rejected row records that it was adopted).

**Verifier model (added 2026-09-23).** `refineVerify.ts` pins the `add` verifier call to Haiku rather than taking a model from the caller, so proposal 008's per-surface model choice can never route the verifier to Opus. The retry-once re-runs the refine on the model the route received.

### Phase 3 — element-targeted editing

Extends the existing inline-edit rather than adding a writer. The current surface is a whole-document `contenteditable` iframe whose HTML is regex-sanitized (`sanitizeInlineHtml`) and committed through `commitDraftRevision`. Phase 3 adds a **narrower** mode on top: click a node, edit that node only.

- Click sends a structural locator (node path derived server-side from the current HTML), not a CSS selector the server trusts.
- Text edits set `textContent`, so markup cannot escape the element.
- Colour and size go through parse-and-re-serialize. Reject on any parse failure. `url(` is refused outright.
- The commit reuses `commitDraftRevision` — one revision, one writer.

## File Changes Map

| File                                                             | Change                                                               | Phase |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | ----- |
| `Dockerfile`                                                     | add monochrome symbol font to runner stage                           | 1     |
| `src/lib/renderer/fontSet.ts` _(new)_                            | compute/expose installed font-set identifier                         | 1     |
| `src/lib/agent/inlineAssets.ts`                                  | add `reconcileInlineAssets`                                          | 1     |
| `tests/e2e/helpers/rasterize.ts` _(new)_                         | real-render harness + tofu assertion                                 | 1     |
| `tests/e2e/render-fidelity.test.ts` _(new)_                      | harness cases                                                        | 1     |
| `src/lib/agent/instructionClasses.ts` _(new)_                    | the one table: semantics + post-conditions                           | 2     |
| `src/lib/agent/prompts/refine.ts`                                | render semantics from the table; envelope output protocol            | 2     |
| `src/lib/agent/refineEnvelope.ts` _(new)_                        | parse `{classes, supersedes, html}`, reusing `extractHtmlDocument`   | 2     |
| `src/lib/drafts/refineVerify.ts` _(new)_                         | structural post-conditions + `add` model call; three-state result    | 2     |
| `src/app/api/drafts/[id]/refine/route.ts`                        | wire classification, verification, retry-once, not-applied outcome   | 2     |
| `src/components/drafts/RefinementPanel.tsx`                      | surface not-applied as failure; rejected preview + Use anyway        | 2     |
| `src/app/api/drafts/[id]/revisions/[rev]/adopt/route.ts` _(new)_ | adopt a rejected render as a normal revision                         | 2     |
| `src/lib/agent/prompts/shared.ts`                                | no-emoji line in `SCRIPT_SUPPORT_NOTE`                               | 1     |
| `src/lib/testHooks.ts`                                           | deterministic verification-miss seam                                 | 2     |
| `prisma/schema.prisma` + migration                               | not-applied outcome field, font-set stamp, rejected-render retention | 1–2   |
| `src/lib/drafts/inlineEdit.ts`                                   | node-scoped text write; colour/size grammar                          | 3     |
| `src/app/api/drafts/[id]/inline-edit/route.ts`                   | element-scoped mode                                                  | 3     |
| `src/components/drafts/InlineEditModal.tsx`                      | click-to-select element mode                                         | 3     |

## Key Decisions

**Verification lives in the refine route, not the shared runner.** All three draft actions route through `runDesignAgentCli`, but only refine has an instruction to verify against. Wrapping the runner would silently change `regenerate-design` and `regenerate-copy` and would push the pattern toward first-pass generation, where "did it land" has no prior state and degrades into "is this good" — a question that belongs to proposal 007.

**The rejected render is retained as an unreferenced revision row, not a new table.** `DraftRevision` already has the right shape (`instruction`, `htmlSnapshot`, `exportUrl`). A row that `currentRevisionNumber` never points at, flagged as rejected, satisfies FR-13 without a new model. This needs care: every existing consumer of the revision list must exclude rejected rows, which is the one place this design adds risk. The alternative — a separate table — is cleaner in isolation but duplicates the snapshot shape.

**Classification is transient and therefore not in the schema.** No column carries it. This is the reversibility guarantee: a later change can replace the taxonomy without a migration or historical rows carrying a stale vocabulary.

**The envelope reuses `extractHtmlDocument`.** That module was written for exactly this class of problem (the 2026-08-03 preamble incident) and is already unit-tested against model narration. Inventing a second parse boundary would repeat the bug it fixed.

**Phase 3 narrows rather than widens.** The existing inline-edit already accepts arbitrary edited HTML. Element-targeted editing is a _more_ constrained mode on the same writer. It would be wrong to present it as hardening the existing surface — that surface is unchanged and keeps its documented regex limits.

## Risks

| Risk                                                                                                                                                                                                                                                     | Mitigation                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rejected revision rows leak into version-switch UI, restore, or Undo                                                                                                                                                                                     | Every `DraftRevision` consumer must filter them. Enumerate consumers as a task; this is the design's sharpest edge.                                                                                                                                        |
| Envelope output protocol degrades reply quality vs plain HTML                                                                                                                                                                                            | The CLI model already handles structured output elsewhere; verify on a real run before Phase 2 merges.                                                                                                                                                     |
| Tofu detection is heuristic and could false-positive on legitimate box glyphs                                                                                                                                                                            | Compare against a known-covered control at the same size rather than matching an absolute pattern.                                                                                                                                                         |
| Font install changes appearance of existing approved drafts                                                                                                                                                                                              | Unavoidable (global glyph environment). FR-22 makes it attributable. Prefer monochrome to minimise the delta.                                                                                                                                              |
| **A local test run reports the font fix green without proving it.** Host Chromium (on Windows, Segoe UI Symbol) already covers `★`, so the `★` case passes whether or not `Dockerfile` changed — a false green on the most visible defect in the change. | AC-01 is provable **only** inside the built image. `verify-report.md` must record the method as `docker-build-local` or `ci-docker-build`, never `local`. Keep AC-02 (harness correctness, locally provable) separate from AC-01 (image correctness, not). |
| Structural post-conditions are wrong for edge-case designs, producing false "not applied"                                                                                                                                                                | Fail-closed is deliberate; false negatives are visible to the user, unlike today's silent false positives. Retry-once absorbs transient cases.                                                                                                             |
| Verifier and refine degrade together                                                                                                                                                                                                                     | FR-10 fails closed, so the gate does not evaporate silently.                                                                                                                                                                                               |

## Grounding sources

- `CLAUDE.md` — _"a prompt rule is not an invariant"_ and _"Validate model output by extracting what you need, not by asserting that it's in there somewhere."_ The organising principle for FR-08/FR-09.
- `CLAUDE.md` — _"the mock E2E suite is structurally blind to this class of bug — `MOCK_AI` returns clean HTML and `MOCK_PUPPETEER` never rasterizes, so nothing between the model and the pixels is exercised."_ Justifies FR-23.
- `CLAUDE.md` — _"`font-noto-sinhala`… Installed OS-wide so Chromium's fontconfig fallback picks it up"_, the precedent FR-21 follows.
- `src/lib/renderer/puppeteer.ts:68-75` — _"Only our own MinIO endpoints (embedded assets) and Google Fonts (brand @import fonts) are reachable; everything else is aborted."_ Establishes the SSRF half of the `url(` concern is already mitigated; FR-16 stands for declaration break-out.
- `src/lib/drafts/inlineEdit.ts:1-11` — _"the iframe never sets allow-scripts, the renderer's egress is allowlisted… and this HTML is never re-served to a browser as a live document — only rendered to a PNG."_ Defines the existing surface Phase 3 must stay narrower than.
- `docs/e2e-test-plan.md` — mock seams live in `src/lib/testHooks.ts` gated by `MOCK_AI`/`MOCK_PUPPETEER`/`MOCK_SOCIAL`, dormant in prod. FR-24's seam follows that pattern.
- `party-report.md` — 34 upheld findings; 14 of the 18 decisions in `proposal.md` answer one directly.
