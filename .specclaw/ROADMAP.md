# bistec-studio roadmap — changes 004–011

**Updated:** 2026-09-23
**Status:** none of 004–011 is built. **004** is fully planned (spec, design, 24 tasks — 8 added 2026-09-23, incl. Phase 0 deploy-pipeline fix). **005–011** are proposals awaiting approval.

This file sequences the open changes. Each change's own `proposal.md` is the source of truth for its scope. This file only records **order, dependencies, and the boundaries between changes that touch the same code**.

## The changes

| #   | Change                                                                            | What it fixes / adds                                                                    | Size         | State             |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------ | ----------------- |
| 004 | [Design instruction fidelity](changes/004-design-instruction-fidelity/)           | Refine edits that don't stick; tofu glyphs; a real-render test harness                  | medium       | 📝 tasks ready    |
| 005 | [Provider flexibility + onboarding](changes/005-provider-flexibility-onboarding/) | Guided Claude connect; COPY provider route; `isDefault` image bug; Gemini; CLI sandbox  | medium       | 📋 proposal       |
| 006 | [Product observability](changes/006-product-observability/)                       | Self-hosted PostHog, generation traces, scheduler heartbeat, stale-export badge         | large        | 📋 proposal       |
| 007 | [Brand-kit design system](changes/007-brandkit-design-system/)                    | Turn adjectival kit prose into measurable rules; typography dataset                     | medium-large | 📋 proposal       |
| 008 | [Model selection](changes/008-model-selection/)                                   | Choose Haiku / Sonnet / Opus per caption, design, refine and assistant chat             | medium       | 📋 proposal (new) |
| 009 | [Hero imagery](changes/009-hero-image-design/)                                    | Image model makes the hero subject, not wallpaper; layout archetypes; reference images  | large        | 📋 proposal (new) |
| 010 | [WhatsApp Channel posting](changes/010-whatsapp-channel-posting/)                 | WhatsApp as a channel, with assisted handoff (Meta has no official Channel posting API) | medium       | 📋 proposal (new) |
| 011 | [App visual redesign](changes/011-app-visual-redesign/)                           | New visual direction; opaque surfaces (no text showing through bars)                    | large        | 📋 proposal (new) |

## Hard dependencies

These are "B cannot work until A lands", not just preferences.

```
B4 scheduler fix (ops) ───────────────► 010 scheduled WhatsApp handoffs
005 item 3 (isDefault image fix) ─────► 009 (else most users get no image at all)
004 T3 (rasterizing harness) ─────────► 009 safe-area verification
```

## Soft dependencies (ordering that avoids rework)

- **011 foundation + app shell → 008 pickers, 010 handoff screen.** Both add new UI. Build them once in the new style instead of in Frozen Light and again later.
- **008 → 005 item 2.** 008 introduces the model resolver. 005's COPY provider selector (OAuth CLI vs API key) should sit on top of it, not beside it.
- **007 ↔ 009.** 009's layout archetypes belong in the same design-system data module as 007's dataset. Whichever lands first creates the module; the other extends it.
- **008 → 006.** 006's generation traces read 008's `Draft.copyModel` / `designModel` stamps instead of re-deriving the model.
- **006 item 7 (scheduler heartbeat) → 010.** A missed WhatsApp handoff is a missed post. It is the same "nothing self-reports" failure B4 was.

## Boundaries between overlapping changes

| Overlap             | Owner split                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Copy "choice"       | **005** picks the _route_ (OAuth CLI vs a registered API key). **008** picks the _Claude model_ on that route.                |
| Image generation    | **005** owns _providers_ (Gemini, `isDefault` resolution). **009** owns _how images are used_ (hero, archetypes, references). |
| Design rules        | **007** owns kit _rules and typography_. **009** owns _composition_. **004** owns _refine_.                                   |
| Real-render testing | Built once in **004** (T3); reused by 007, 009 and 011.                                                                       |
| UI                  | **011** owns the app's look. 008 and 010 add screens _in_ that look; they do not restyle.                                     |

## Recommended order

**Stage 0 — ops + the deploy pipeline (do now).** These unblock things that are already built.

- **Rotate the Coolify API token.** Merges to `main` currently build but do not deploy (Coolify 401 since 2026-09-15). Handoff: `docs/coolify-token-rotation.md`. Then ship **004 Phase 0** as its own PR to `main`: readable deploy failures, post-deploy commit verification, current actions, Node 22. It is the one exception to the `v2` rule, because the deploy steps only run on `main`.
- Fix **B4**: the Coolify scheduler resource. Read `docs/scheduler-b4-diagnosis-2026-08-03.md`; one look at its logs picks the cause.
- Set a **team Claude token** on both prod teams at `/team`.
- Mark each team's IMAGE provider **isDefault** (data fix for today's silent no-background bug, ahead of 005's code fix).

**Stage 1 — correctness and quick wins.**

- **004** in full. It is planned, it answers the one real user complaint, and it builds the render harness three later changes reuse.
- Pull forward **005 item 3** (`isDefault` resolver fix) and **006 item 7** (scheduler heartbeat). Both are small and independent, and both remove silent failures.

**Stage 2 — 011 foundation.** Direction study → chosen direction → tokens → opaque surface model → app shell. This fixes the see-through bars early and fixes the style before new screens are built.

**Stage 3 — 008 model selection**, built in the new style.

**Stage 4 — 009 hero imagery**, Phase 1 (archetypes + layout contract + quality), then Phase 2 (reference images). Phase 3 (full AI render) only if still wanted after Phase 2.

**Stage 5 — 010 WhatsApp**, once B4 is fixed and the heartbeat is in.

**Stage 6 — the rest, parallelisable:**

- **011** remaining screens;
- **005** remainder (onboarding, COPY route on 008's resolver, Gemini, CLI sandbox);
- **007**;
- **006** PostHog + traces.

Why this order: user-visible quality and silent failures come first. Changes that other changes build on (004's harness, 011's tokens, 008's resolver) land before their dependants. The two infrastructure-heavy items, self-hosted PostHog and the CLI sandbox, go last because nothing else waits on them.

## Parallel-work caution

011's screen restyles can run beside backend-heavy work, but several files are shared. Coordinate these, or sequence them:

- the brief wizard's Review step (008 pickers + 011 restyle);
- `PublishDialog.tsx` (010 + 011);
- the refine panel (004 + 008 + 011).

**Branching (decided 2026-09-23):** all of 004–011 lands on one integration branch **`v2`**, pushed to `origin`. `v2` merges to `main` in one go only once it is confirmed working and the user gives the go-ahead. `main` is what CI auto-deploys to prod, so nothing on `v2` reaches production before that merge — confirmation happens locally or on a separate environment. Within `v2`, each change (and each 004 phase) is its own commit series so it can still be reverted on its own.
