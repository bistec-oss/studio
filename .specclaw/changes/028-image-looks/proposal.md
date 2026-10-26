# Proposal: Image looks (027b): 9:16 for the two looks, Full-bleed scene and Spotlight, and a pixel check that can fail

**Created:** 2026-10-24
**Revised:** 2026-10-24, after the deep party panel (CHANGES_REQUESTED) and the user's four decisions (see "Decisions after the panel").
**Status:** 🟡 Draft
**Phase b of 027.** 027a (`027-post-styles`, VERIFIED PASS 22/22) shipped the post styles with every image default limited to the looks that exist. This change is the image half the user split off (027 proposal, "Decisions after the panel", item 1), cut down by the user after the panel.

## Problem

1. **Story posts can never use an image style.** 009 shipped two looks, `product-showcase` and `editorial-split`, at SQUARE and PORTRAIT only (`src/lib/designData/composition.ts:68`: "STORY is absent from both"). A 9:16 brief is always classic, and `resolvePostStyle` downgrades a Launch or Announcement default to classic with the `size-classic` note (`src/lib/postStyles/resolve.ts:100-104`). This is a capability the user asked for (2026-10-24); there is no measured count of 9:16 briefs.
2. **Six of eight post styles default to classic** because no look fits them (027 proposal: "The rows defaulting to `classic` move to the new looks when phase b ships them"). The looks are the user's choice, not drawn from usage data. Full-bleed scene and Spotlight are the two that serve four of those rows (Event, Hiring, Promotion, Milestone).
3. **OP-1 showed the styled looks are wanted** (2026-10-23: a styled render preferred on 6 of 6 briefs; bar 4). It covered two looks at SQUARE and PORTRAIT; it says nothing about STORY or the new looks, which is why this change has its own real-image check.

## Decisions after the panel (2026-10-24, the user)

1. **Cut the look set.** This change builds STORY for the two existing looks plus two new looks, `full-bleed-scene` and `spotlight`. The light variants (`product-showcase-light`, `editorial-split-light`) and Abstract brand forms move to a follow-up, proposed once there is usage data. (po BLOCK.)
2. **Unattended surfaces stay classic.** Scheduled, MCP and ACP posts keep today's rule (`UNATTENDED` in `resolve.ts:93`). There is no allow-list, no `realCheck` record, no `unproven-classic` note and no runtime off switch in this change; unattended looks get their own later change, which must answer both security BLOCKs. The real-image check is a tuning step and the gate for moving defaults, nothing else. (security BLOCKs 1 and 2, po WARN on the unattended gate.)
3. **Defaults move only after the real check.** The new looks ship as opt-in picks. A later task in this change writes post-style `versions[2]` with the new defaults, and only for a look whose real check passed at every size. The switch is versioned and visible (it bumps `POST_STYLES_REVISION` and so `PROMPT_VERSION`). (po and security WARNs on defaults.)
4. **Fallbacks are visible on the draft notice only.** With unattended posts classic, a look can only fall back on an interactive post, where 009's draft notice already shows it. The composition stamp stays the one source of truth for the look outcome. No insights section in this change. (security, po and architect findings on fallbacks.)

**Settled by the orchestrator from the panel's fixes (confirm or change at approval):**

- **The look key rule** (visionary BLOCK): 027's key rule extends to look keys. A look key is never renamed and never reused; a retired look stays resolvable (stamps, refine, regenerate) and is hidden from pickers. When a post-style version's default names a retired look, the resolver uses classic with a named note `retired-classic`. A test fails if any post-style version names a key that is not in the look dataset. The rule is written in the dataset header.
- **Variants, for the follow-up** (architect and visionary WARNs): a variant is marked by explicit data on the look (`variantOf: { key, version }`), never parsed from the hyphens in its key. No variant ships here, so this change adds only the rule and the validation, not a variant.
- **"Contract"** means one (look key, version, size). Version 2 of `product-showcase` and `editorial-split` copies SQUARE and PORTRAIT unchanged and adds STORY; v1 is never edited (the dataset's immutability rule).
- **The exact fixture set** (architect, security WARNs): every (key, current version, size) in the dataset has **one pass image and two fail images**, one failing on `busy` and one on `contrast`. The contrast fail image is built from the look's intended backdrop as declared in the spec, not from the `textTone` field it tests. That set is 12 contracts: `product-showcase` v2 × 3, `editorial-split` v2 × 3, `full-bleed-scene` × 3, `spotlight` × 3. Fixtures are keyed by key + version + size; a unit test asserts the set is complete. The fixtures prove the check discriminates; they do not prove a look works on real images (ba WARN). That is the real check's job.
- **No empty check** (027 finding 21): dataset validation fails any contract with no `text` region.
- **The real-image check** (architect, security, visionary): the runner moves from 009's change folder to `scripts/` as a maintained tool. It renders **one brief per new contract**: 2 STORY additions plus 6 new-look contracts = **8 hero image calls**, plus **at most one re-run per failing contract**. **Hard cap: 16 calls**, computed as 2 × the contracts it covers. It keeps an append-only call ledger in its results directory, writes each call to the ledger before the request goes out, counts attempts (timeouts and errors included), refuses to start at the cap, and prints the running total on every call. Its verdicts go to a committed results file: contract (key, version, size), brief id, render reference, whether the style was kept, and the user's accept or reject. **The pass rule, stated:** a look passes when every one of its contracts kept its style and the user accepted the render. One render per contract is a weak bar (ba, visionary); it is accepted here because it gates only an interactive default that already falls back to classic, and it is written down so a later change does not inherit it for unattended use.
- **Band looks** (security WARN): Full-bleed and Spotlight put text over the image, not beside it. The spec states each band's geometry per size, and the layout observation on these looks is shown on the draft notice, as 009 does for `layout-violation`.
- **Co-changes listed by file** (architect WARN): the spec lists every STORY literal (the wizard, `POST /api/briefs`, the queue modal and any other) and says whether each goes. `size-classic` stays for any future look that declares fewer sizes and for Path A.

## Proposed Solution

### The looks

All in `src/lib/designData/composition.ts`, the one dataset every reader uses.

| Look (key)                            | New or changed                                         | Text tone | Sizes                       | Measured per size                                                                                       | Serves post style(s) |
| ------------------------------------- | ------------------------------------------------------ | --------- | --------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------- |
| Showcase (`product-showcase`)         | **version 2** adds STORY; SQUARE/PORTRAIT copied as is | light     | SQUARE, PORTRAIT, **STORY** | the text area: calm (busy) and light-text contrast                                                      | Launch               |
| Editorial split (`editorial-split`)   | **version 2** adds STORY                               | light     | SQUARE, PORTRAIT, **STORY** | the text area: calm and light-text contrast                                                             | Announcement         |
| Full-bleed scene (`full-bleed-scene`) | new                                                    | light     | SQUARE, PORTRAIT, STORY     | a **text band** (bottom 35 to 40%) over the scene: calm and contrast on the raw image, no scrim credit  | Event, Hiring        |
| Spotlight (`spotlight`)               | new                                                    | light     | SQUARE, PORTRAIT, STORY     | **two** text bands (top headline, bottom CTA), each calm and with contrast; the subject centred between | Promotion, Milestone |

The spec sets the exact rectangles, subjects and band sizes.

**Full-bleed and Spotlight change what is measured** (027 finding 4): a band over the scene rather than an area beside it. The rule stays "every `text` region is calm and has contrast". The band is measured on the raw image with no credit for a CSS scrim (strict; proposed answer to the old open question 2).

### The surfaces

- **Interactive briefs (wizard, `POST /api/briefs`):** may pick any active look at any declared size, so 9:16 gains Showcase and Editorial split, and every size gains Full-bleed scene and Spotlight. A hero image that fails the pixel check falls back to classic with no second image call (009, unchanged).
- **Scheduled, MCP, ACP:** classic, unchanged.
- **Post-style defaults:** unchanged at merge; post-style `versions[2]` moves Promotion and Milestone to Spotlight, and Event and Hiring to Full-bleed scene, only for a look that passed the real check. A look that fails stays opt-in, and its rows stay classic.

### Cost

- **Recurring:** a styled post makes the same one image call as a classic Path B post (the hero replaces the background; 009). It takes longer: 11 to 22 s with `IMAGE_QUALITY` unset, on OP-1's numbers. When the pixel check fails, that hero image is reused under the classic prompt (009), so a fallback costs time but no extra call. The fallback rate of the new contracts is unknown until the real check; OP-1 saw 2 of 12 renders with a `layout-violation` observation and no fallbacks.
- **One-off:** at most 16 hero image calls for the real-image check, run once on the user's decision.

## Scope

### In Scope

- Version 2 of `product-showcase` and `editorial-split`, with STORY contracts.
- Two new looks, `full-bleed-scene` and `spotlight`, each at SQUARE, PORTRAIT and STORY.
- The image, design and refine prompts and the layout observation read the new contracts (they already read the dataset; the spec checks each).
- Dataset validation: at least one `text` region per contract; the look key rule and its test; the `variantOf` rule (no variant shipped); the completeness test for fixtures.
- The fixture set: 12 contracts × (1 pass + 2 fail) in the render harness, the merge gate.
- Removing STORY exclusions, listed by file in the spec.
- The real-image check runner in `scripts/`, with the ledger, the cap and the committed results file.
- Post-style `versions[2]` with the new defaults, written after the real check, for the looks that passed.
- The draft notice shows the layout observation for the band looks.
- Unit, render and mock E2E coverage; docs (handoff section, e2e plan, ROADMAP, CLAUDE.md entry).

### Out of Scope

- **Unattended looks** (scheduled, MCP, ACP): a later change, which must answer this panel's two security BLOCKs (an allow-list tied to evidence; a runtime off switch).
- **The light variants and Abstract brand forms:** a follow-up, once there is usage data.
- **A fallback section on `/admin/insights`.**
- 025 (hero product screenshots, 009 Phase 2) and 009 Phase 3 (full AI render). 025 follows this change.
- Team-owned or kit-owned looks. Looks stay code-owned.
- Changing the global thresholds in `evaluate.ts` (`BUSY_STDDEV_MAX`, `CONTRAST_MIN`). Tuning is per contract (geometry, subject wording).
- Looks on Path A. Path A stays classic.
- A "regenerate with another look" action on a fallback (009: fall back straight to classic).
- The stale-headline badge (its own proposal, after 025).

## Impact

- **Size:** architectural (the look keys become a permanent vocabulary that the resolver, the stamps, the post-style defaults and 025 depend on; the key rule is a contract for later changes)
- **Files affected:** ~18 (estimated: `designData/composition.ts` and validation, `postStyles/styles.ts`, the prompt text, the render fixtures and tests, the runner in `scripts/`, the draft notice, the wizard and briefs route where a STORY literal remains, E2E, docs)
- **Complexity:** medium
- **Risk:** low to medium. New contracts may fail on real pixels until tuned; a failure falls back to classic with no second image call, unattended surfaces are untouched, and defaults move only after a pass. **No migration:** `Brief.imageStyle` is free text and the stamp is JSON. The spec confirms.

## Open Questions

1. **Real-check pass bar:** "every contract of the look kept its style and the user accepted it" (one render per contract, proposed above), or two briefs per contract (cap 32)?
2. **Band geometry:** Full-bleed text band at the bottom 35 to 40% of the canvas, and Spotlight bands at the top and bottom; the spec proposes exact numbers per size. Any preference before the spec?

**Party panel (deep, 2026-10-24): CHANGES_REQUESTED, 37 upheld (4 BLOCK, 26 WARN, 7 NOTE), 0 withdrawn. See party-report.md. Answered by the user's decisions and the settled items above; the list is kept as raised against the first draft.**

- (party-architect, WARN) The `realCheck` record edits released dataset versions, which breaks the immutability rule the proposal cites — see party-report.md
- (party-architect, WARN) The allow-list is keyed to the current version, but the real check covers only the 17 new contracts, so the v2 copies of Showcase and Editorial split at SQUARE and PORTRAIT can never qualify — see party-report.md
- (party-architect, WARN) Three different fixture counts, so the completeness test and the fixture set cannot both be built as written — see party-report.md
- (party-architect, WARN) The `<base>-<variant>` key grammar cannot be checked by a test, because the bases and the new standalone looks already contain hyphens — see party-report.md
- (party-architect, WARN) The STORY exclusions and the unattended-classic gate that must change are left to discovery ("if any") — see party-report.md
- (party-architect, WARN) New note `unproven-classic` with no named consumers — see party-report.md
- (party-architect, WARN) Fallback-per-look on insights may become a second record of the look outcome that the composition stamp already holds — see party-report.md
- (party-architect, WARN) The unattended allow-list's "allowed" branch ships with no data to test against — see party-report.md
- (party-architect, NOTE) A one-off change-folder script becomes the only producer of a product dataset field, and the hard cap lives in that untested script — see party-report.md
- (party-architect, NOTE) Rebuttal of the visionary's first fix for the light variants: inheriting base geometry would silently edit a variant's released contract — see party-report.md
- (party-ba, WARN) "Real check passed" has no falsifiable bar, and it gates unattended publishing — see party-report.md
- (party-ba, WARN) Problem 2 (looks serving post styles) is asserted, not evidenced — see party-report.md
- (party-ba, WARN) The 9:16 problem has no evidence that Story posts are wanted or hurt — see party-report.md
- (party-ba, WARN) Merge-gate fixtures prove the check can fail on synthetic images, not that the looks work — see party-report.md
- (party-ba, WARN) "Look" and "contract" carry the same load with shifting meaning, and the real-check cap arithmetic does not close — see party-report.md
- (party-ba, NOTE) Fallback visibility is promised but the data source is undecided — see party-report.md
- (party-po, BLOCK) Seven looks and 17 contracts are bought up front with no cheaper cut line, and no use data justifies five of them — see party-report.md
- (party-po, WARN) The unattended-surface gate costs the whole real-image check and returns value only to a path the user did not size — see party-report.md
- (party-po, WARN) Shipped defaults silently move five post styles onto unproven looks, and no running cost is stated for the slower render — see party-report.md
- (party-po, NOTE) Insights fallback section is optional scope with the answer already listed as an open question — see party-report.md
- (party-security, BLOCK) The unattended allow-list is a hand-editable code record with no link to the evidence or to the contract it vouches for — see party-report.md
- (party-security, BLOCK) No way to pull a misbehaving look off unattended auto-publish short of a code change and redeploy — see party-report.md
- (party-security, WARN) The 34-call cap is only stated as a runner refusal, so a crash or restart can reset it and timed-out calls may go uncounted — see party-report.md
- (party-security, WARN) The fallback visibility that answers finding 19 is put up for removal in the open questions — see party-report.md
- (party-security, WARN) The new post-style version silently changes the look an already planned auto-publish entry will publish — see party-report.md
- (party-security, WARN) On band looks, the check measures the image, and nothing stated stops the design from putting text outside the measured band — see party-report.md
- (party-security, WARN) One fail fixture per contract proves only one of the two measured properties is active — see party-report.md
- (party-security, NOTE) Whether the four copied v2 contracts are allow-listed is left unstated — see party-report.md
- (party-security, WARN) Rebuttal to party-po: "stamp only, with a handoff query" leaves unattended degradation silent — see party-report.md
- (party-security, NOTE) Rebuttal to party-po: making defaults conditional on `realCheck` turns an allow-list write into a silent change to what queued entries publish — see party-report.md
- (party-visionary, BLOCK) Five new look keys become permanent through two immutable datasets and a free-text column, and no rule says how to rename or retire them — see party-report.md
- (party-visionary, WARN) The `<base>-<variant>` grammar can't be parsed from the key, because bases already contain hyphens — see party-report.md
- (party-visionary, WARN) A `realCheck` keyed to (key, current version, size) is revoked by changes that don't need it and survives changes that do — see party-report.md
- (party-visionary, WARN) The light looks copy their base's whole contract, so every later geometry fix must be made twice and checked twice — see party-report.md
- (party-visionary, WARN) The only tool that writes the allow-list lives in a closed change's folder, and nothing ties its output to the record in code — see party-report.md
- (party-visionary, WARN) "One render and the user's approval" becomes the standard of proof every later look will copy — see party-report.md
- (party-visionary, NOTE) Production fallback rates per look and the allow-list are two halves that never connect — see party-report.md
