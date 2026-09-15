# Spec: Design instruction fidelity

**Change:** 004-design-instruction-fidelity
**Created:** 2026-09-15
**Status:** 🟡 Draft

## Overview

Four refine failures were reported by a tester and each traced to a confirmed defect: the refine prompt is structurally additive, nothing verifies an instruction was applied, font coverage is Sinhala-only, and the mock test seams never rasterize so none of it is visible to a green suite.

This change makes the refine path declare **what kind of change** an instruction is, **prove** the change landed, and offer a **deterministic editing surface** for the cases that never needed a model. It ships in three phases ordered by reversibility — Phase 1 leaves no residue, Phase 2 is a removable wrapper, Phase 3 introduces the only durable surface.

Decisions carried from `proposal.md` (18 of them, 14 in response to the party panel's 34 upheld findings) are binding here and are not re-litigated.

## Requirements

### Functional Requirements

**FR-01 — Instruction classification is emitted by the refine call.**
The refine model returns `{ classes[], supersedes[], html }` in one response. No separate classifier call. A multi-clause instruction returns multiple classes, all of which must be satisfied.

**FR-02 — Classification is transient.**
The class is used for prompt assembly and verification, then discarded. It is not written to `DraftRevision` or any other persisted row.

**FR-03 — Per-class instruction semantics replace the blanket preserve rule.**
`add` preserves existing content; `replace` supersedes a named element; `remove` deletes named content; `constrain` bounds an attribute without adding. The current unconditional "Preserve everything the instruction does not touch" no longer applies to `replace` and `remove`.

**FR-04 — Destructive classes require a named superseded element.**
`replace` and `remove` are permitted only when `supersedes` is non-empty. The **route** checks this, not the prompt. Empty `supersedes` on a destructive class downgrades to the preserving behaviour and is treated as an ambiguous classification (FR-05).

**FR-05 — Ambiguous classification defaults to preserving.**
Low confidence, or a multi-clause instruction the model cannot cleanly partition, resolves to `add`/`constrain`.

**FR-06 — A single per-class table generates both the refine semantics and the verifier criteria.**
One exported definition, two consumers. No second hand-maintained copy of the semantics.

**FR-07 — Verification runs in the refine route, above `runDesignAgentCli`.**
`regenerate-design` and `regenerate-copy` are unchanged by this change and acquire no verification step and no new failure outcome.

**FR-08 — Verification is structural where the class permits.**
`remove`, `constrain` and `replace` are checked by deterministic post-conditions against the rendered DOM with **no model call**. Only `add` — which has no deterministic post-condition — spends a verifier model call.

**FR-09 — The verifier receives extracted facts, not the raw document.**
Where raw content must reach it, the content is delimited and declared to be data, never a claim about whether the edit succeeded. The verdict is machine-readable.

**FR-10 — Verification fails closed.**
Unreachable, timed out, empty, or unparseable verifier response is a **miss**, taking the same path as an explicit miss.

**FR-11 — One retry, hard-capped.**
On a miss the refine is retried once with the miss made explicit. A second miss ends the attempt. The cap holds regardless of class or failure kind.

**FR-12 — A twice-failed refine does not advance the revision pointer.**
`Draft.currentRevisionNumber` is unchanged and no `DraftRevision` row is appended.

**FR-13 — The rejected render is retained out-of-chain.**
Labelled with the instruction, its classes, and the verifier's stated miss, reachable for diagnosis but not part of the revision chain.

**FR-14 — "Couldn't apply" is a hard failure surfaced in the UI.**
Not a soft warning on a committed revision. The draft poll response carries a distinct outcome for it, separate from the existing error channel.

**FR-15 — Element-targeted editing writes text as text content.**
User text becomes a text node, never parsed as markup.

**FR-16 — Colour and size inputs are parsed into a closed grammar and re-serialized.**
Colour resolves to hex or `rgb()`; size to number + unit from an allowed unit set. Anything else is **rejected**, not passed through. No free-form CSS declarations. No value containing `url(`.

**FR-17 — The element write is confined to the clicked node.**
The node is resolved server-side from the click payload; a client-supplied selector is never used as the write target.

**FR-18 — Element addresses are resolved fresh and never persisted.**
Addressing happens at click time against the current HTML. No address is stored against a revision, so a later refine that rewrites markup cannot invalidate one.

**FR-19 — Element-targeted editing reuses the existing inline-edit writer.**
It goes through the same HTML-writing and revision-commit path as `src/lib/drafts/inlineEdit.ts` and `commitDraftRevision`. No second writer of `Draft.htmlContent`.

**FR-20 — Placeholder handling is reconciliation, not detection.**
The set of `__INLINE_ASSET_n__` tokens sent out must equal the set returned, same tokens and same multiplicity. A clean absence is restored; any other mismatch is treated as not applied and takes the FR-11 path.

**FR-21 — The runner image carries monochrome symbol font coverage.**
Narrowest coverage that fixes the reported defect. Not a full colour emoji set.

**FR-22 — The installed font set is recorded per draft.**
Stored alongside the existing `PROMPT_VERSION` stamp so a render's glyph environment is attributable after the fact.

**FR-23 — A reusable rasterizing test harness exists.**
It runs the real render path and asserts on real output, with a glyph-agnostic tofu/replacement-glyph check as its first assertion.

**FR-24 — A deterministic seam forces a verification miss.**
Distinct from the rasterizing harness, so the retry and twice-failed branches are reachable in tests.

### Non-Functional Requirements

**NFR-01 — Cost ceiling.** Worst case 4 model calls per refine (refine, verify, retry, verify) against today's 1. Expected p50 is 1–2, because only `add` spends a verifier call. The cap is hard.

**NFR-02 — Latency.** Refine is user-initiated and already measured at 41–61s. Added p50 latency must stay under one verifier call; worst case must not exceed one additional full design call.

**NFR-03 — No behaviour change to sibling actions.** `regenerate-design`, `regenerate-copy`, generation, and Path A template filling are untouched.

**NFR-04 — Existing gates stay green.** tsc clean, lint no new errors (7 pre-existing warnings tolerated), full unit suite, full mock E2E.

**NFR-05 — Verification adds no new outbound network surface.** The renderer egress allowlist (MinIO + Google Fonts only) is unchanged.

**NFR-06 — Phase independence.** Each phase must be revertible on its own without breaking the phases below it.

## Acceptance Criteria

Each criterion must pass for the change to be considered complete.

**Phase 1**

- **AC-01** — A design whose HTML contains a `★` (U+2605) renders with a visible star glyph, not a replacement box, in the runner image.
- **AC-02** — The rasterizing harness fails when given HTML containing a glyph with no font coverage, and passes when coverage exists. The assertion is glyph-agnostic — it detects replacement boxes, not one specific character.
- **AC-03** — The harness runs the real `renderHtmlToPng` path with `MOCK_PUPPETEER` off.
- **AC-04** — A draft record carries the font-set identifier used for its render, readable alongside `promptVersion`.
- **AC-05** — Given HTML sent out with N inline-asset placeholders, a model reply returning the same N tokens reconciles clean and commits.
- **AC-06** — A reply with a placeholder **absent** restores it and commits.
- **AC-07** — A reply with a placeholder **renamed, duplicated, or reindexed** is treated as not applied; no revision is committed.

**Phase 2**

- **AC-08** — A `remove` instruction ("reduce the text") produces output whose target text content is measurably shorter; if it is not, the refine is retried once and then reported as not applied.
- **AC-09** — A `replace` instruction ("use the uploaded image as the background") produces output where the named superseded element is **absent** — reproducing the reported duplicate-image failure must fail this criterion.
- **AC-10** — A `replace` or `remove` classification with empty `supersedes` does not delete anything; it resolves to the preserving behaviour.
- **AC-11** — A multi-clause instruction returns more than one class, and every returned class is verified.
- **AC-12** — `remove`, `constrain` and `replace` verifications complete with **zero** verifier model calls.
- **AC-13** — An `add` instruction ("include a human character") spends exactly one verifier call and reports not-applied when the element is absent after retry.
- **AC-14** — A verifier that times out, returns empty, or returns unparseable output is treated as a miss, not a pass.
- **AC-15** — A refine never issues more than 2 refine calls and 2 verifier calls in total, under any input.
- **AC-16** — After a twice-failed refine, `Draft.currentRevisionNumber` is unchanged and no new `DraftRevision` row exists.
- **AC-17** — After a twice-failed refine, the rejected render is retrievable with its instruction, classes, and the verifier's miss.
- **AC-18** — The draft poll response exposes a not-applied outcome distinguishable from both success and the existing error channel, and the UI surfaces it as a failure.
- **AC-19** — Editing the per-class table changes both the refine prompt text and the verifier criteria; no second definition exists to fall out of sync.
- **AC-20** — `regenerate-design` and `regenerate-copy` request/response shapes and behaviour are byte-identical to before this change.

**Phase 3**

- **AC-21** — A text edit containing `<script>alert(1)</script>` appears in the render as literal visible text, not as an element.
- **AC-22** — A colour input of `red; background: url(http://evil.test/x)` is **rejected**; no CSS declaration is written.
- **AC-23** — A size input with a disallowed unit or non-numeric value is rejected.
- **AC-24** — An element edit commits through `commitDraftRevision`, producing exactly one new revision, with no second write path to `Draft.htmlContent`.
- **AC-25** — No element address is persisted; a refine that rewrites the markup between two edit sessions does not cause an edit to land on the wrong node.
- **AC-26** — A client-supplied selector in the request payload is not used to choose the write target.

## Edge Cases

- **Instruction spans both a destructive and a preserving clause** ("use this as the background and add a character"). Both classes returned; the destructive half still requires a non-empty `supersedes`, and the preserving half proceeds regardless.
- **The model returns `supersedes` naming an element that does not exist.** Structural verification fails (the named element is absent before and after), so it retries once then reports not-applied rather than silently succeeding.
- **`add` on a design already containing something similar.** Structural check cannot distinguish; this is why `add` is the one class that spends a verifier call.
- **Verifier and refine both degrade together** (shared model/credential path). FR-10 makes this a miss, so the gate does not silently evaporate.
- **A refine whose instruction is empty after trim.** Existing 400 behaviour is unchanged; classification is never reached.
- **Concurrent element edit and refine.** Existing `pendingAction` single-flight already 409s the second; unchanged.
- **Font install changes the appearance of an already-approved draft.** Unavoidable — the glyph environment is global with no per-kit override. FR-22 makes it attributable; it does not make it per-draft overridable.
- **A draft rendered before FR-22 exists** has no font-set stamp. Absent, not wrong; readers must tolerate null.

## Dependencies

- No new npm dependencies expected for Phases 1 and 2.
- Phase 1 adds one Alpine package to the runner stage (`Dockerfile`).
- FR-13 and FR-22 need storage for the rejected render and the font-set identifier — see `design.md` for whether this is a migration or reuses existing columns.
- Phase 3 depends on the existing inline-edit surface (`src/lib/drafts/inlineEdit.ts`, `src/app/api/drafts/[id]/inline-edit`, `src/components/drafts/InlineEditModal.tsx`) shipped in PR #36.
- Phases are strictly ordered: 2 must not start before 1 lands; 3 must not start before 2 lands.

## Notes

- The dead API-mode-only brand-conflict protocol in `prompts/refine.ts` is **out of scope**, moved to a follow-up sequenced after Phase 2 because it shares a prompt builder with the taxonomy work.
- Production runs CLI mode. The CLI branch of the refine prompt is the one that matters; the API branch must stay consistent but is not the live path.
- The renderer already blocks all egress except MinIO and Google Fonts (`src/lib/renderer/puppeteer.ts:75`), which mitigates the SSRF half of the `url(` concern. FR-16 still stands, for CSS declaration break-out and defence in depth.
- The existing inline-edit accepts whole-document contenteditable HTML and sanitizes by regex, relying on structural mitigations it documents honestly. Phase 3 must be **narrower** than that surface, never wider.
