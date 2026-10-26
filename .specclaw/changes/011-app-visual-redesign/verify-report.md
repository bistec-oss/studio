# Verification Report: 011-app-visual-redesign

**Verified:** 2026-10-09
**Model:** Claude Opus 5.5
**Branch / commit:** `v2` at `06541c97`. The last code commit is `c37357a3`; HEAD adds only docs and specclaw bookkeeping on top.

**Verdict: PASS** (20 of 20 acceptance criteria met)

The E2E-backed criteria are AC-01–03, AC-09, AC-11–13 and AC-17–19, plus AC-08 and AC-15, which rest on the T4 E2E run and the T13 capture run. A fresh full clean mock E2E was run at HEAD on 2026-10-09: **311 passed / 3 skipped / 1 flaky / 0 failed** (315 cases, 6.1 min). The flaky case is explained below. It is a Chromium page crash during navigation, not an assertion failure, and it passed on retry and again when run alone.

---

## Gates

| Gate                                                        | Result                                                    | Source                                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                              | 0 errors (the 7 known warnings)                           | Fresh run at HEAD, 2026-10-09                                                                                               |
| `npm run build`                                             | Passed                                                    | Fresh run at HEAD, 2026-10-09                                                                                               |
| `npm run test:unit`                                         | 60 files, 1722/1722 passed                                | Fresh run at HEAD, 2026-10-09                                                                                               |
| 011 unit files (`designTokens`, `contrast`, `uiTokenGuard`) | 129/129 passed                                            | Re-run by the verifier at HEAD                                                                                              |
| **Full clean mock E2E**                                     | **311 passed / 3 skipped / 1 flaky / 0 failed** (6.1 min) | **Fresh run at HEAD, 2026-10-09:** fresh test DB (dropped and recreated), `rm -rf .next`, `test:e2e:serve`, `test:e2e:mock` |
| Full clean mock E2E                                         | 312 / 3 skipped / 0 failed / 0 flaky                      | T13 report, at `c37357a3`                                                                                                   |
| `npm run test:render`                                       | 15/15                                                     | T13 report, at `c37357a3`. No renderer code has changed since.                                                              |
| Capture run (`scripts/capture-ui.mjs`)                      | 58 PNGs, all viewed                                       | T13 report                                                                                                                  |
| `tsc`                                                       | Clean                                                     | T13 report; the HEAD build type-checks                                                                                      |

**E2E flake, reported as a flake and not as a pass.** `tests/e2e/surfaces.test.ts:521` ("library thumbnails are shown as rendered: no filter, transform, rounding or hover scale") failed on its first attempt after 1.1 s with `Error: page.goto: Page crashed` while navigating to `/library`. No assertion ran. It passed on the configured retry (2.0 s) and passed again when run alone with `--retries=0` (2.6 s). This is read as a one-off Chromium page crash. It did not happen in any of the nine full runs during the 011 build (T5–T13). If it recurs, look into it under `/specclaw:debug`.

**Code review (whole change):** skipped, because `workflow.code_review` is not set in `.specclaw/config.yaml`. Every task had its own `specclaw:code-reviewer` pass, listed below.

---

## Acceptance criteria

| AC                                                                                                                 | Status  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AC-01** Create post link                                                                                         | **MET** | `tests/e2e/create-post-button.test.ts:105-126` covers four paths, the href, the position, the click-through, and the button being absent on `/brief` and `/brief?resume=…`. In the code, `AppShell.tsx:240` renders `{pathname !== '/brief' && <CreatePostButton />}`, and `CreatePostButton.tsx` is a `Link href="/brief"`.                                                                                                         |
| **AC-02** Label at 1440 px, icon only at 375 px, same accessible name, Tab-reachable, visible focus                | **MET** | `create-post-button.test.ts:130-153`. The button has `aria-label="Create post"`, a `title`, a `hidden md:inline` label and `focus-visible:outline-2`.                                                                                                                                                                                                                                                                                |
| **AC-03** Toasts never overlap the button                                                                          | **MET** | `create-post-button.test.ts:159-211` checks 1440 and 375 px, with a settled-box poll and a negative control in T1. `ToastProvider.tsx:22` sets `offset={{ bottom: 92, right: 28 }}` plus `mobileOffset`.                                                                                                                                                                                                                             |
| **AC-04** The dashboard quick action still links to `/brief`                                                       | **MET** | `src/app/(app)/page.tsx:216` (`QuickAction href="/brief"`), rendered as a `Link` (`:155`). `surfaces.test.ts:461` reaches it as a focus stop. No E2E asserts the href (follow-up 4).                                                                                                                                                                                                                                                 |
| **AC-05** Three studies, light and dark, a comparison page, axes stated, no runtime CDN except named preview fonts | **MET** | `docs/ui-reference/direction-studies/study-{a-graphite,b-folio,c-instrument}.html`, compared in `index.html` and `pick.html`. Each study's font link is marked preview-only and names its `next/font` equivalent. Minor: `pick.html`'s own fonts are not marked preview-only (follow-up 6).                                                                                                                                          |
| **AC-06** Pick recorded; FR-05 sections present; Frozen Light archived, nothing deleted                            | **MET** | `proposal.md:90-91`; `DESIGN_SYSTEM.md:1-25` and §3/§4/§5/§8/§9/§10. In `9be31d58`, Frozen Light moved with 100% renames.                                                                                                                                                                                                                                                                                                            |
| **AC-07** Token test                                                                                               | **MET** | `tests/unit/designTokens.test.ts:86-136` and `:138-220`.                                                                                                                                                                                                                                                                                                                                                                             |
| **AC-08** After T4, the full E2E passes and unmigrated screens are unchanged                                       | **MET** | T4 report: a pixel compare left 33/58 shots identical, and all 25 differences are explained. E2E was 265/3/0/0.                                                                                                                                                                                                                                                                                                                      |
| **AC-09** FR-08 surfaces opaque, with no `backdrop-filter`, in both themes                                         | **MET** | `tests/e2e/surfaces.test.ts:162-253` (`expectOpaque`, `:77-85`) covers the header, sidebar, button, mobile overlay, team menu, toast, modal, confirm dialog and lightbox chrome.                                                                                                                                                                                                                                                     |
| **AC-10** Primitives and ToastProvider are free of legacy and raw colours, and every import compiles               | **MET** | `uiTokenGuard.test.ts:56` finds zero hits. Sonner runs `unstyled` with token classes. tsc and the build are clean.                                                                                                                                                                                                                                                                                                                   |
| **AC-11** At 375 px the mobile sidebar traps focus, reaches every link and closes, with no horizontal scroll       | **MET** | `surfaces.test.ts:311-348`.                                                                                                                                                                                                                                                                                                                                                                                                          |
| **AC-12** Per-group grep, and 375 px with no horizontal scroll                                                     | **MET** | The guard finds zero hits across `src/`; the 6 `ui-exception:` lines are all documented. The 375 px checks are per group, at `surfaces.test.ts:350, 472, 596, 688, 843, 879, 1050, 1217, 1246, 1292, 1327`.                                                                                                                                                                                                                          |
| **AC-13** Every screen task ended with a full E2E at 0 failed and 0 flaky, with no existing case changing outcome  | **MET** | T5 282 → T13 312, each 3 skipped / 0 failed / 0 flaky. `git diff --name-status e398a589 HEAD -- tests/` shows only added files; no pre-011 test was modified.                                                                                                                                                                                                                                                                        |
| **AC-14** Guard test                                                                                               | **MET** | `tests/unit/uiTokenGuard.test.ts:15-75`. The Glass primitives are deleted, and T13's mutation proof gave 3 hits.                                                                                                                                                                                                                                                                                                                     |
| **AC-15** Capture script, and the reference screenshots replaced                                                   | **MET** | `scripts/capture-ui.mjs` covers 2 themes × 2 widths, login, 14 screens and the open mobile sidebar. `ui-captures/` is gitignored. `docs/ui-reference/screen-{light,dark}.png` were replaced at 1440×1120.                                                                                                                                                                                                                            |
| **AC-16** Contrast test                                                                                            | **MET** | `tests/unit/contrast.test.ts:85-135`. Text is held to 4.5:1 and boundaries to 3:1. `line-subtle` is excluded as decorative, with the reason stated.                                                                                                                                                                                                                                                                                  |
| **AC-17** Visible focus on the first three tab stops, per group                                                    | **MET** | `tabThreeWithVisibleFocus` (`surfaces.test.ts:266-308`) runs at `:364, 371, 457, 464, 585, 676, 819, 833, 1037, 1183`.                                                                                                                                                                                                                                                                                                               |
| **AC-18** Under reduced motion, a modal stays centred within 2 px and animates in 150 ms or less                   | **MET** | `surfaces.test.ts:1380-1409` and `:1411`. `globals.css:226`.                                                                                                                                                                                                                                                                                                                                                                         |
| **AC-19** OS-dark first paint, and no font or icon CDN request                                                     | **MET** | First paint: `surfaces.test.ts:1446-1470`. CDN: `surfaces.test.ts:27-29, 145-160` asserts zero CDN requests for every page that file visits, across every screen group. Fonts come from `next/font` (`src/app/layout.tsx`). The only Google Fonts strings in `src/` are brand-kit font data and the post-renderer allowlist, neither of which is a UI request. Caveat: the check sits in one suite, not the whole run (follow-up 3). |
| **AC-20** Unit, lint, build and `test:render` all pass                                                             | **MET** | Unit, lint and build were fresh at HEAD. `test:render` was 15/15 at `c37357a3`, and no renderer code has changed since.                                                                                                                                                                                                                                                                                                              |

---

## Binding decisions and FR-12

- **Neutral tool UI:** met. The accent is burnt sienna on paper and espresso, with no Bistec brand colours.
- **"Studio" wordmark, no Bistec logo:** met. `Logo.tsx` is a typeset span, and `public/BistecStudioLogo.png` was deleted in `7fdbe38b`.
- **Theme follows the OS:** met. `themeInitScript` is unchanged and proven by AC-19.
- **Self-hosted fonts:** met (`next/font`). `package.json` did not change during 011, so NFR-08 also holds.
- **No "More" menu on the draft page:** met in the app. However, DESIGN_SYSTEM.md §8.17 still describes a More menu (follow-up 2).
- **FR-12, behaviour unchanged:** nothing under `src/app/api`, `src/lib`, `prisma`, `src/mcp` or `src/scheduler` changed, and no pre-existing test was edited. There are two deliberate name changes:
  - **The theme toggle.** It was one button, "Switch to dark/light mode". It is now a group named "Theme" holding two buttons, "Light" and "Dark", with `aria-pressed`. This was the T6 review's WCAG 2.5.3 fix, documented in `reports/T6.md:117-122`, and no test depended on the old name. **The user should approve this exception to FR-12.**
  - **The logo's name.** "Bistec Studio" became "Studio", by the user's decision.

  The icon-only delete buttons also gained "Delete <name>" names. That adds names rather than changing existing ones.

---

## Per-task review results

- T1 — PASS (5 notes)
- T2 — no code review (docs-only studies; the user picked alone)
- T3 — PASS (3 notes)
- T4 — WARN(1), resolved (loaders frozen under reduced motion, now exempted)
- T5 — PASS (5 notes; the overlay blur and a fixed sleep were fixed in T6)
- T6 — WARN(1), resolved (theme toggle Label in Name)
- T7 — WARN(1), resolved (the Recent Drafts scroll region is now a focusable labelled region)
- T8 — PASS (notes only)
- T9 — WARN(3): 2 fixed, 1 accepted by design (the ink Send button beside the accent Publish)
- T10 — PASS (4 notes)
- T11 — WARN(1), resolved (an E2E fixture leak)
- T12 — PASS (notes only)
- T13 — WARN(1), resolved (the dev badge in the reference screenshots)

No BLOCK finding in any review.

---

## Gaps and follow-ups

None of these is required by an acceptance criterion.

1. **The FR-12 theme-toggle exception** needs the user's approval, or a recorded exception in Decisions.
2. **DESIGN_SYSTEM.md §8.17 still describes a "More ▾" menu.** Update it to match the decision.
3. **The AC-19 CDN check lives only in `surfaces.test.ts`.** Moving the listener into a shared Playwright fixture would cover the whole run.
4. **Add an E2E assertion on the dashboard Create Post quick action's href.**
5. **Guard blind spots:** `glow-blob`, `animate-scale-in`, `text-primary`, `font-inter` and arbitrary `bg-[#…]` values. This is in change 014.
6. **`pick.html` loads Hanken Grotesk and IBM Plex Mono** from Google Fonts without marking them preview-only. Docs only.
7. **DESIGN_SYSTEM §5 says body `tabular-nums`, but the app doesn't set it.** This is in change 014.
8. **`InlineEditModal.tsx:668` loading overlay `bg-canvas/70`** acts as a scrim. Worth a look.
9. **Housekeeping:** `spec.md` still says `🟡 Draft`. Its "Dark-mode logo" edge case is superseded by the wordmark.
10. **For 010:** the `toHaveCount(2)` channel-checkbox assertion changes when WhatsApp adds a third channel.
11. **Already proposed as change 014:** the accessibility naming pass, the shared page primitives and the consistency items.
12. **Not from 011:** the refine poll race ("Applying…" stuck once).
13. **New, from this verify run:** the one-off `Page crashed` at `surfaces.test.ts:521`. Watch for a recurrence.

---

## Summary

**Met:** 20/20 · **Not met:** 0/20 · **Unverified:** 0/20

**Verdict: PASS**
