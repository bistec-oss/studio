# Proposal: Post styles, phase a (purpose presets with goal, tone, a facts checklist and a facts check)

**Created:** 2026-10-24
**Revised:** 2026-10-24, after the deep party panel (CHANGES_REQUESTED) and the user's four decisions (see "Decisions after the panel").
**Status:** 🟡 Draft

## Problem

1. **Nothing stops a post from inventing facts unless someone wrote a rule for it by hand.** The IRP campaign needed an explicit "FACTS — DO NOT INVENT" block in its briefing (2026-07-28) before posts stopped making up intake dates and deadlines. Every other campaign and every ad-hoc brief has no such rule. A hiring post can invent a salary, a promotion a price or end date, a milestone a number. On a scheduled entry set to auto-publish, that reaches LinkedIn or Instagram with nobody reviewing it, and the only fix is deleting it by hand on each platform.
2. **Goal and Tone are loose, undefined words.** The wizard's Content step offers Goal (Awareness, Engagement, Conversion, Hiring, Announcement) and Tone (Professional, Casual, Bold, Empathetic) (`src/components/brief/constants.ts`). Each reaches the caption, Path B design and background prompts as one line (`Goal: engagement`, `Tone: bold`; `src/lib/agent/prompts/caption.ts:68-69`, `pathB.ts:123-124`, `background.ts:103-104`). Path A's prompt builder (`src/lib/agent/prompts/pathA.ts`) receives neither. The project's lesson from the IRP fixes is that adjectival instructions don't stick and measurable ones do; these two fields carry no measurable content at all.
3. **The user (the marketing lead, 2026-10-24) wants to pick what a post is for**, and have the goal, a sensible tone and the facts rules follow, instead of assembling them from separate pickers. The purposes below are the user's choice in this session, not drawn from usage data; the 006 insights page will show which are actually chosen (an acceptance check, below).

## Proposed Solution

Replace the **Goal** picker with a **Post style** picker. A post style is a code-owned **purpose preset**, named so it works for any industry (Bistec, Hearts Academy, a travel company). Each style carries:

- its **goal** (no longer a picker);
- a **default tone**: the Tone picker stays and is pre-filled; the user can change it;
- a **default image style** for Path B, limited in this phase to the looks that exist today;
- a **content checklist**: structured rules `{ id, scope: 'caption' | 'image', text }` rendered into the prompts.

**Eight styles (user decisions, 2026-10-24; exact defaults and rule text are set in the spec):**

| Post style (key)               | Goal         | Default tone | Default image style (027a)    | Checklist (gist)                                                |
| ------------------------------ | ------------ | ------------ | ----------------------------- | --------------------------------------------------------------- |
| General (`general`)            | awareness    | Professional | classic                       | no invented dates, prices or numbers                            |
| Launch / new offer (`launch`)  | conversion   | Bold         | Showcase (`product-showcase`) | name the thing launched; one CTA; no invented specs             |
| Promotion / deal (`promotion`) | conversion   | Bold         | classic                       | offer, price, % and end date only if stated; else open CTA      |
| Event (`event`)                | engagement   | Professional | classic                       | date, place, time only if stated; how to register               |
| Hiring (`hiring`)              | hiring       | Professional | classic                       | role named; how to apply; no invented salary, location or perks |
| Announcement (`announcement`)  | announcement | Professional | Editorial split               | the news in the headline; no invented dates or numbers          |
| Tip / how-to (`tip`)           | engagement   | Casual       | classic                       | one concrete tip; no invented statistics                        |
| Milestone (`milestone`)        | awareness    | Bold         | classic                       | the milestone number only if stated; thank the audience         |

The rows defaulting to `classic` move to the new looks when phase b ships them. `product-showcase` is relabelled "Showcase" (key unchanged).

**One resolver.** A pure server-side function in the post-style dataset, `resolvePostStyle(style, campaign defaults, explicit inputs, path, aspect ratio, surface) → { goal, tone, imageStyle, checklist, stamp }`, is the only place this mapping lives. The wizard's pre-fill, the briefs route, the queue runner, MCP and ACP all call it. Precedence (to be confirmed in the spec):

- **tone:** the explicit pick → the campaign's default tone → the style's default tone;
- **image style:** the explicit pick → the style's default → `classic`; and `classic` whenever the size is unsupported (9:16 today), the path is A, or the surface is unattended (queue, MCP, ACP: classic in 027a, as today);
- **goal:** always the style's goal. The server is the only writer.

**The facts check (user decision).** After generation, code (no model) pulls currency amounts, percentages, dates and bare numbers from the captions and the rendered headline, and compares them with the brief, the campaign briefing and the brand-kit text. A value found in none of them is flagged. A scheduled entry set to auto-publish is **downgraded to HOLD** with a named reason and is not published. An interactive draft shows a notice listing the flagged values. The result is stored on the draft.

**Surfaces.** Campaign default post style (pre-fills the wizard). Scheduled queue entries, MCP and ACP accept a post style key. They get the checklist, the tone and the facts check, but stay classic for images in this phase.

## Decisions after the panel (2026-10-24)

1. **Two phases (user).** 027 is **phase a**: the dataset, the resolver, the wizard, the checklists, the facts check, the campaign default, and the queue/MCP/ACP reach without image styles. **Phase b is a separate change, proposed after 027a ships:** STORY layouts for the two existing looks, the five new looks (light Showcase, light Editorial split, Abstract brand forms, Full-bleed scene, Spotlight), pixel-check rules for light polarity and full-bleed with pass and fail fixtures per contract and size, a capped real-model check, and unattended surfaces using only looks whose real check passed.
2. **Facts check: hold auto-publish, notice on drafts (user).**
3. **A General style (user).** Every new brief has a style; the Goal picker is removed. Old briefs keep their stored goal and have no style.
4. **Plain keys, reserved forever (user).** Keys (`hiring`, `promotion`, …) are permanent and never reused or renamed; a retired style stays resolvable but is hidden from pickers. A future team-owned style gets its own id column, never a bare string in these columns. The rule is written into the dataset.

**Settled by the orchestrator from the panel's fixes (confirm or change at approval):**

- **`goal` column:** written only by the server from the style. On rows with a post style it is a snapshot of the style's goal; rows with no post style (before 027) hold the user's own choice. The post-style column tells them apart. A `goal` input on MCP/ACP/queue is accepted and ignored when a style is given (existing clients keep working); without a style the input defaults to `general`.
- **Unknown or retired keys:** an unknown key is a 400 when written (briefs, queue, campaign, MCP, ACP). A stored key that no longer resolves at run time fails the entry with a named `errorReason` and never auto-publishes; it never degrades to "no style".
- **Version stamp:** each draft and revision stamps the post-style key and its dataset version, like 009's `composition`; the prompt version is derived from the dataset version so a checklist edit can't skip a bump. A queue entry takes the latest version at run time, and the stamp records which ran.
- **Regenerate and refine:** regenerate copy and regenerate design reapply the checklist; refine receives the image-scope rules.
- **Rollback:** one additive migration with a down script in `prisma/rollback/`; reverting the deploy restores the old prompts, and old code ignores the new columns.

## Scope

### In Scope (027a)

- The post-style dataset (eight styles, structured checklist rules, keys reserved), the resolver and its unit tests
- Wizard: Post style picker replaces Goal; Tone and image style pre-filled from the resolver and overridable; Review shows the style
- Storage: `postStyle` on Brief and ScheduledGeneration, `defaultPostStyle` on Campaign, the post-style stamp and the facts-check result on Draft (and the stamp on DraftRevision); one additive migration and its down script
- Prompts: caption, Path A fill, Path B design, background, regenerate copy, regenerate design, refine (image rules); prompt versions tied to the dataset version
- The facts check (pure, code-only) wired into generation, the scheduler's post-action (HOLD downgrade) and a draft notice
- Campaign create/edit: default post style
- Queue entries, MCP and ACP: accept and validate a post style (classic image)
- 006 analytics: `postStyle` on `brief.submitted` and `generation.finished` (imported vocabulary); the insights page shows how often each style is chosen and how often the facts check flags a post
- Unit and E2E coverage, including a facts-check case per family (invented price, date, number) and the HOLD downgrade

### Out of Scope

- **Phase b (separate change):** 9:16 image layouts, the five new looks, pixel-check changes, the real-model look check, image styles on unattended surfaces
- Team- or brand-kit-editable post styles
- People-centred image styles
- A model-based facts verifier (the check here is code-only)
- Removing the `goal` column

## Impact

- **Size:** architectural (a new dataset and resolver that five surfaces depend on; a migration on four tables; a new post-generation gate on auto-publish)
- **Files affected:** about 30 to 40
- **Complexity:** large
- **Risk:** medium. Prompt changes alter every generation (versions bumped; the facts check and the E2E suite guard the result). The facts check can produce false positives (a number taken from something the check didn't compare against): the cost is a HOLD on an auto-publish entry, which is the safe direction. No image-pipeline change in this phase.

## Open Questions

1. **The exact checklist text and default tones** per style: drafted in the spec, reviewed by the user before build.
2. **What the facts check compares against:** brief, campaign briefing and kit text for sure; also campaign documents' parsed text? (Leaning yes: the IRP contact details came from a reference document.)
3. **Number noise:** which numbers are exempt (years in a copyright line, a phone number already in the kit, "24/7"). The spec lists the exemptions.
4. **Acceptance bar** (from party-ba): on a fixed set of mock briefs with no stated price or date, the facts check flags every seeded invented value and nothing else; and the insights page reports style usage. A real-model bar (invented facts per N briefs vs today) is optional and the user's call.

**Party panel (2026-10-24, CHANGES_REQUESTED), upheld findings (the decisions above answer most of them; the spec traces each):**

- (party-architect, BLOCK) Style-to-defaults resolution is placed in the wizard pre-fill, but three non-wizard surfaces need the same resolution and no shared resolver is named — see party-report.md
- (party-architect, WARN) The goal column keeps a writer of its own, and a no-style brief has no goal source once the picker is gone — see party-report.md
- (party-architect, WARN) The checklist reaches four first-generation prompt builders; the regenerate and refine rebuilds are neither in scope nor excluded — see party-report.md
- (party-architect, WARN) The new looks change what the real-pixel check measures, but the artifact treats them as dataset rows — see party-report.md
- (party-architect, WARN) "Passes the real-pixel check at every size" has no deterministic test seam named for five new looks across three sizes — see party-report.md
- (party-architect, NOTE) Coupling fact on party-po's cut line: the post-style table cannot ship without the new image looks unless five of its seven defaults change — see party-report.md
- (party-ba, WARN) The central claim, that Goal and Tone "mean almost nothing to the model", is asserted from one analogy and never tested — see party-report.md
- (party-ba, WARN) "The user thinks in what a post is for" assumes a user behaviour that is not established — see party-report.md
- (party-ba, WARN) Problem 3 motivates new looks with a limit that only partly applies, and the "scheduled posts" gap is not tied to any need — see party-report.md
- (party-ba, WARN) No acceptance criteria, and the main claim has no way to fail — see party-report.md
- (party-ba, WARN) "Default" and "pre-filled" carry two meanings, and the conflict with campaign tone is unresolved — see party-report.md
- (party-ba, NOTE) "Path A's design prompt does not receive them at all" is a factual claim about code that the proposal does not source — see party-report.md
- (party-po, BLOCK) Scope bundles six separable features, and the proposal never prices a cheaper first cut — see party-report.md
- (party-po, WARN) Do-nothing option is never priced — see party-report.md
- (party-po, WARN) Scheduled, MCP and ACP reach and campaign default carry no stated value — see party-report.md
- (party-po, WARN) Running cost of seven new image looks and the real-model check is unbounded — see party-report.md
- (party-po, NOTE) Defaults on upgrade and the Goal picker removal — see party-report.md
- (party-security, WARN) The facts checklist is enforced only by the prompt, and the proposal sends it to unattended auto-publish runs — see party-report.md
- (party-security, WARN) Unproven image styles go to unattended and machine surfaces, and a fallback there is never seen — see party-report.md
- (party-security, WARN) A post-style key that does not resolve has no closed failure, and "no style" quietly removes the facts checklist — see party-report.md
- (party-security, WARN) The pixel check for the new archetypes has no stated property it measures, so it can pass everything — see party-report.md
- (party-security, NOTE) The recovery path for the migration and for the changes to every prompt is not stated — see party-report.md
- (party-visionary, BLOCK) The post-style key becomes a persisted, published vocabulary, and the proposal already expects the change that will have to break it — see party-report.md
- (party-visionary, WARN) No stamp records which version of a post style a draft or a pending queue entry used — see party-report.md
- (party-visionary, WARN) `goal` becomes a field with two meanings: chosen by the user before 027, derived from the style after it — see party-report.md
- (party-visionary, WARN) The relabel-but-keep-the-key precedent, plus OQ2's `showcase-light`, leaves the Showcase family with two key grammars from its first addition — see party-report.md
- (party-visionary, NOTE) The checklist is one step from being a machine-checkable rule set and stops at prose — see party-report.md

---

**To proceed:** Review this proposal and approve to begin planning.
