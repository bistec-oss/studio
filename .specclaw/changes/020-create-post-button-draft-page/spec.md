# Spec: Hide the floating Create post button on the draft page

**Change:** 020-create-post-button-draft-page · **Size:** bounded · **Proposal:** [proposal.md](proposal.md)
**Created:** 2026-10-20
**Status:** 🟡 Draft

## Overview

The floating **Create post** button is `fixed bottom-6 right-6 z-30` (`src/components/layout/CreatePostButton.tsx:29`). It covers whatever sits in the bottom-right corner of the viewport until the page is scrolled. On the draft review page that corner holds the refine **Send** button (`RefinementPanel.tsx:364-376`, `aria-label="Send"`) at 1440 px, and body text at 375 px. The 140 px bottom padding on `main` clears only the end of the page, not the corner while the user is mid-scroll.

The user decided on 2026-10-13 to hide the button on `/drafts/[id]`. `AppShell` already hides it on `/brief` with one `pathname` check, so this change widens that check to the draft page. It amends **011 AC-01** and **FR-01**, which required the button on the draft page. The proposal's facts were re-derived at HEAD `9990b42` on 2026-10-20, after 021 (Graphite) and 019; the corrections are under Notes.

## Approach

**One decision: `AppShell` hides the button on `/brief` and on `/drafts/<id>`, with one `pathname` check.** The button component, the toast offset and the `main` padding are not touched, because every other page behaves exactly as today.

File map:

- **Code:** `src/components/layout/AppShell.tsx` (the condition and its comment). Comment-only edits in `src/components/layout/CreatePostButton.tsx` and `src/components/providers/ToastProvider.tsx`.
- **Tests:** `tests/e2e/create-post-button.test.ts`.
- **Docs:** `docs/ui-reference/DESIGN_SYSTEM.md` (§8.9), `.specclaw/changes/011-app-visual-redesign/spec.md` (an update note on FR-01 and AC-01), `docs/e2e-test-plan.md` (an update note and a map row), then `docs/handoff.md` and `CLAUDE.md` in the gate task.

## Requirements

### Functional Requirements

- **FR-01 — The button is not rendered on the draft page.**
  - **The check.** In `AppShell.tsx:263`, the condition `pathname !== '/brief'` becomes "not `/brief` and not under `/drafts/`". It is written once, as a local constant named for what it means (for example `hideCreatePost`), and the existing JSX comment (`AppShell.tsx:261-262`) says why both pages are excluded.
  - **Match rule.** `usePathname()` carries no query string, so `/brief?resume=…` is still `/brief`. The draft page is the only route under `(app)/drafts/`, so `pathname.startsWith('/drafts/')` is exact.
  - **Nothing is rendered.** The element is absent from the DOM (`toHaveCount(0)`), not hidden with CSS.
  - **Unchanged.** `CreatePostButton` itself, its link, label, `data-testid`, placement and motion are untouched. It stays on every other `(app)` page except `/brief`.
- **FR-02 — The E2E suite expresses the new rule** (`tests/e2e/create-post-button.test.ts`).
  - **AC-01 test (`:103-126`).** Its page loop becomes `/`, `/library` and `/campaigns` only. It no longer mints a draft. Its `/brief` assertions are unchanged.
  - **A new case: absent on the draft page.** With an EXPORTED draft from `createExportedDraft`, at 1440×900 and again at 375×812, `/drafts/[id]` has `fab(page)` count 0, and no link named "Create post" exists.
  - **A new case: refine Send is not covered.** See AC-02.
  - **Skips.** Both new cases keep the `test.skip(!MOCKED(), …)` guard the AC-01 case uses today, because they mint a draft.
- **FR-03 — The docs say the same thing.**
  - **`DESIGN_SYSTEM.md` §8.9.** The "Layering" line (`:512`) says the button is hidden on `/brief` and on the draft page, and why: the draft page's own actions sit in that corner. The "Known" line (`:513`) says the 140 px padding still serves the pages that show the button.
  - **`CreatePostButton.tsx:5-6`** says "except /brief and the draft page".
  - **011 `spec.md`.** An update note (the same blockquote style other specs use) says 020 amends FR-01 and AC-01: the draft page is excluded. FR-01 and AC-01 get an inline "(amended by 020)" marker. The original text is kept.
  - **`docs/e2e-test-plan.md`.** An update note says `create-post-button.test.ts` now asserts the button absent on `/drafts/[id]` and runs the Send-not-covered check. One row is added to the AC → case map, naming the three cases.
- **FR-04 — Nothing else moves.** The toast offset (`ToastProvider.tsx:24-25`), the `main` bottom padding (`AppShell.tsx:253`, `pb-[140px]`), the dashboard Create Post card and every other page's button are unchanged.

### Non-Functional Requirements

- **NFR-01: no behaviour change outside the draft page.** No route, API call, data shape, accessible name or keyboard order changes anywhere else. On the draft page the only difference is that one link is gone.
- **NFR-02: scope.** `git diff --name-only 9990b42` lists only the files in the Approach file map, plus `docs/handoff.md`, `CLAUDE.md` and this change's own directory. No file under `src/app/`, `src/lib/`, `prisma/` or `src/components/drafts/`.
- **NFR-03: no real model calls,** and no prisma or DB command except the E2E harness's own `npm run test:e2e:db`, which targets `bistec_studio_test` (CLAUDE.md gotchas).

## Acceptance Criteria

- **AC-01 (FR-01, FR-02): the button is absent on the draft page and present elsewhere** (`create-post-button.test.ts`).
  - On `/`, `/library` and `/campaigns` at 1440×900, the link "Create post" is visible bottom-right, goes to `/brief`, and is absent on `/brief` (the existing 011 AC-01 case, narrowed).
  - On `/drafts/[id]` of an EXPORTED draft, at 1440×900 and at 375×812, `[data-testid="create-post-fab"]` has count 0 and `getByRole('link', { name: 'Create post', exact: true })` has count 0.
- **AC-02 (FR-02): the refine Send button is not covered at 1440×900** (`create-post-button.test.ts`, a viewport check, not a full-page screenshot).
  - **The element.** The refine panel's Send button: `page.getByRole('button', { name: 'Send', exact: true })` on the EXPORTED draft's page.
  - **Setup.** Viewport 1440×900. After the page settles, `scrollIntoViewIfNeeded()` on Send, so it is inside the viewport.
  - **How "not covered" is measured.** In the page, take the centre of Send's bounding box. Assert the box lies fully inside the viewport, then assert `document.elementFromPoint(cx, cy)` is Send itself or a descendant of it (`send.contains(hit)`). Send is disabled while the input is empty; `elementFromPoint` still reports it, so the check does not type anything.
  - **What it guards.** With the button gone from this page, a pass means no fixed element (the button, a toast, or a later addition) covers Send. It would fail if the button came back, because `fixed bottom-6 right-6` sits over that corner.
- **AC-03 (FR-01, NFR-01): the rest of the button's behaviour still passes.** The existing AC-02 (label at 1440, icon only at 375, Tab focus) and AC-03 (toasts stack above the button, at 1440 and 375) cases pass unchanged, and `surfaces.test.ts` passes unchanged (its button cases load `/` after login).
- **AC-04 (FR-03): the docs.** A review confirms the §8.9 text, the 011 amendment note and markers, the `CreatePostButton.tsx` comment, and the `e2e-test-plan.md` note and map row. `grep -n "except /brief" src docs/ui-reference/DESIGN_SYSTEM.md` matches no line that still omits the draft page.
- **AC-05 (NFR-02): scope, by diff.** `git diff --name-only 9990b42` shows only the Approach file map, `docs/handoff.md`, `CLAUDE.md` and `.specclaw/changes/020-create-post-button-draft-page/`. `src/components/layout/CreatePostButton.tsx` and `src/components/providers/ToastProvider.tsx` differ by comment lines only.
- **AC-06: the gate.**
  - tsc is clean, and `npm run lint` gives 0 errors and no more than the 7-warning baseline.
  - `npm run test:unit` passes in full: at least the 2681 baseline, with no case removed (this change adds none; `tests/unit/uiTokenGuard.test.ts` and `designTokens.test.ts` stay green).
  - `npm run build` passes.
  - A full clean mock E2E gives 0 failed and 0 flaky. The baseline is 397/3/0/0 (019 T4, 2026-10-20); this change adds one case, so the expected total is 398 passed (399 if the absent-on-draft check is split into two viewports as separate tests; the implementer states which in `reports/T1.md`).
  - `gh run list --branch v2` shows CI green at the change's last commit.
- **AC-07 (FR-03, gate): results recorded.** The run ID and gate numbers are written to `CLAUDE.md`'s top entry and the handoff's "Where things stand" table, and 020 is marked verified there.

## Edge Cases

- **`/drafts/<id>?x=1` and `/drafts/<id>/…`.** The query string is not in `usePathname()`; there is no nested route today. A future nested route under `/drafts/` would also hide the button, which is the intended default for that section.
- **A route named `/drafts`** (no trailing slash) does not exist and is not matched. The index of drafts is the library at `/library`.
- **Navigating from the draft page to another page** renders the button again, because `AppShell` persists and the condition is evaluated per `pathname`. The first case of AC-01 covers `/` after login; nothing else is needed.
- **A toast on the draft page** still rises 96 px above the bottom edge (A1). The gap is slightly larger than needed without the button, and harmless.
- **The 140 px bottom padding on the draft page** now clears nothing. It is left alone (A2).

## Assumptions

- **A1: the toast offset stays as it is on the draft page.** `ToastProvider` is global and has no `pathname`. Making the offset route-aware would add a client hook and a branch to save 70 px of gap on one page. The draft page's toasts sit where they do on every page, which is consistent.
- **A2: the `main` bottom padding stays at 140 px.** It is one shared value for every page, and the draft page's long content benefits from the scroll room anyway. Changing it is out of scope.
- **A3: the reference screenshots stay.** `docs/ui-reference/screen-light.png` and `screen-dark.png` were captured on the draft page (021 T8) and still show the button there. They are Graphite visual references, not gates, and are not recaptured; §8.9 of the design system says the rule is the text, not those images. If the user wants them recaptured, it is a separate chore with `scripts/capture-ui.mjs`.
- **A4: the new check runs at one width, 1440×900,** as the proposal asks. The 375 px case is covered by the absence assertion in AC-01, since a missing element cannot cover text.
- **A5: no unit test.** The condition is one expression in a client component, and the repo has no `AppShell` unit harness. The E2E cases are the test, as for `/brief` today.

## Open Questions

None.

## Dependencies

- 011 T1 (the button) and 021 T3 (its Graphite restyle). 021 moved the button to `bottom-6 right-6` (it was `bottom-7 right-7`), and the placement test's 32 px tolerance still holds.
- 019 is complete; there is no overlap.
- Merging to `main` is out of scope.

## Notes

**Corrections to the proposal (2026-10-13), re-derived at `9990b42`:**

- **Line pointers.** `CreatePostButton.tsx:27-28` with `bottom-7 right-7` is now `:29` with `bottom-6 right-6` (021 T3). The component file did not move; only its styling did.
- **How it hides on `/brief`.** The proposal does not say. It is a pathname check in `AppShell.tsx:263`, `{pathname !== '/brief' && <CreatePostButton />}`, not a layout. The component never checks the route itself. This change edits that one line.
- **E2E line range.** `create-post-button.test.ts:105-126` still matches: it is the AC-01 case inside the `describe` that opens at `:94`. Its page loop is `:111`.
- **The `main` bottom padding.** `pb-[140px]` is at `AppShell.tsx:253`, in the `max-w-canvas` div inside `main`, not on `main` itself.
- **Docs.**
  - `DESIGN_SYSTEM.md` states the placement rule in §8.9 (`:506-513`, "Layering" at `:512`). It also mentions the button at `:188`, `:198`, `:279`, `:342` (the 140 px padding), `:363`, `:374`, `:382-383`, `:417` and `:451`; none of those is a placement rule and none changes.
  - `docs/e2e-test-plan.md` does **not** list the create-post-button cases today; a grep for "create post" matches nothing. The proposal's "update `docs/e2e-test-plan.md`" therefore means adding an update note and a map row, not editing a case list.
  - The 011 spec says the button is "on every `(app)` page except `/brief`" in the binding-decisions list, FR-01 (`:44`) and AC-01 (`:155`). The FR and AC get markers; the binding-decisions line is covered by the update note.
- **Other tests.** Nothing else asserts the button on the draft page. `surfaces.test.ts` uses the button at `:177`, `:388` and `:1508`, all after `pageLogin`, which lands on `/`. No unit test, `uiTokenGuard`, `designTokens`, the render harness or `scripts/capture-ui.mjs` references the button. The capture script's draft-page shots (`capture-ui.mjs:195`) will simply no longer show it.
- **Toasts.** The offset is global (`ToastProvider.tsx:24-25`, bottom 96, right 24; mobile bottom 96). The decision is A1.
- **Files affected.** "About 5" is 7 files in this change (1 code, 2 comment-only, 1 test, 3 docs), plus `handoff.md` and `CLAUDE.md` at the gate.
- **Test counts.** The new case adds to the E2E total; it is not a replacement.
