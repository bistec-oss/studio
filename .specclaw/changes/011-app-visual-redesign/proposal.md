# Proposal: App visual redesign

**Created:** 2026-09-23
**Status:** 🟡 Draft

## Problem

**The app's own UI undercuts the product it sells.** Bistec Studio exists to make polished, on-brand posts, but its interface is a lightly adapted template ("Frozen Light", itself _"adapted from a Stitch-generated 'Synthetix AI' workspace template"_ — `docs/ui-reference/DESIGN_SYSTEM.md`), and its most visible trait is a legibility defect.

**1. Translucent surfaces let content bleed through.** The glass utilities in `src/app/globals.css` are semi-transparent by design:

| Class          | Light alpha | Dark alpha | Used for                                                          |
| -------------- | ----------- | ---------- | ----------------------------------------------------------------- |
| `.glass`       | 0.75        | 0.60       | the **fixed** top header (`AppShell.tsx:177`), toasts, lightbox   |
| `.glass-panel` | 0.60        | 0.50       | in-flow panels, modals, the segmented toggle, the settings prompt |
| `.glass-input` | 0.80        | 0.60       | every input, select and textarea                                  |

The fixed header sits above scrolling content at 60–75% opacity, so text scrolls visibly **beneath** it. This is the "translucent bars with text beneath" problem. It has been patched once already, locally: the team switcher got a separate near-opaque `.glass-popover` on 2026-07-21 because it was _"see-through over nav text"_. The fix went to one component while the class that causes it stayed in use everywhere else.

**2. The visual system is inherited, not designed.** Type, spacing, hierarchy and density were taken from the template and extended screen by screen. Separate passes (2026-07-20 clarity pass, sidebar sections, chevron fix) each fixed one symptom. Nothing defines the system as a whole.

**3. There is no product identity.** The UI shares no visual language with BISTEC Global's brand or with the posts it produces. A marketer moving from the app to an exported post crosses two unrelated design worlds.

## Proposed Solution

**A new visual direction (decided 2026-09-23), designed with the `high-end-visual-design` skill as the working guide during the design phase**, then applied through a new design-system document and a token-level foundation, before screen-by-screen restyling.

1. **A design direction, chosen and recorded before any code.** Produce two or three direction studies: palette, type pairing, surface model, density, motion. Apply them to one real screen (the draft review page, the product's centre of gravity) and pick one. The chosen direction replaces `DESIGN_SYSTEM.md`, and the Frozen Light document is archived, not deleted.
2. **An opaque-by-default surface model.** Any surface that content can scroll beneath or that floats over other content (header, sidebar, popovers, menus, modals, toasts, sticky bars) is **opaque**, with depth from elevation and borders rather than transparency. Translucency, if the new direction keeps it at all, is limited to surfaces with nothing legible behind them. Stated as a measurable rule: **text behind a floating or fixed surface must never be perceptible**. It is enforced by removing the translucent utilities from those roles rather than by case-by-case fixes.
3. **Token foundation first.** Colour, type scale, spacing, radius, elevation and motion tokens live in one place (Tailwind theme + CSS variables). Components consume tokens only, so the direction can be tuned in one file.
4. **Dark and light both remain mandatory.** Today's hard requirement carries over. Both themes are designed deliberately, not derived.
5. **Screen-by-screen restyle, in order of use:**
   - app shell (header, sidebar, team switcher);
   - dashboard;
   - brief wizard;
   - draft review + refine;
   - library;
   - campaigns + queue;
   - brand kits admin;
   - `/team`, `/settings`, `/admin/*`.

   Each screen is a separately shippable unit.

6. **Self-hosted assets stay the rule.** No runtime font or icon CDN, per the existing `DESIGN_SYSTEM.md` §0 decision. The `high-end-visual-design` skill is used as **guidance**. None of its files enter the repository (the same licence caution proposal **007** recorded for design skills that ship no licence).

## Scope

### In Scope

- Direction studies + a chosen direction, recorded in a new `DESIGN_SYSTEM.md` (Frozen Light archived)
- Token foundation (Tailwind theme + CSS variables) for colour, type, spacing, radius, elevation, motion
- Opaque surface model for every fixed, sticky or floating surface; retiring `.glass` / `.glass-panel` in those roles
- Restyle of every screen under `src/app/(app)/` plus the login and choose-team pages
- Shared UI primitives in `src/components/ui/` (Button, Modal, Select, inputs, toggles, toasts, lightbox) rebuilt on the tokens
- Dark and light themes, with a visual check of both on every restyled screen
- Accessibility floor: WCAG AA contrast on text, visible focus states, reduced-motion respected

### Out of Scope

- The **generated posts'** design — proposals **004**, **007**, **009**
- New features or flows. This proposal restyles; it does not rearrange product behaviour. The new pickers from **008** and the WhatsApp handoff screen from **010** should be **built in the new style**, not restyled twice.
- A marketing website or landing page
- Changing icon libraries unless the chosen direction requires it

## Dependencies and sequencing

- It has no hard code dependency on another proposal, but **ordering matters**. **008** (pickers) and **010** (handoff screen, mobile-first) both add UI. If 011's token foundation and app shell land first, those screens are built once in the new style. Otherwise they are built in Frozen Light and redone.

## Impact

- **Files affected:** ~60–90 (estimated) — `globals.css`, Tailwind config, every component under `src/components/`, every page under `src/app/(app)/`, `DESIGN_SYSTEM.md` and the UI reference images
- **Complexity:** large
- **Risk:** medium. There are no data or API changes, but the surface area is the whole app, and a restyle can quietly break interactions: the E2E suite drives the UI through selectors and roles. Mitigated by shipping per screen, keeping roles and accessible names stable, and running the E2E suite after each screen.

## Open Questions

- Should the new direction take cues from **BISTEC Global's brand** (navy / blue / green, Poppins) so the app and the posts feel related? Or should it stay a neutral tool UI that lets each team's brand kit be the only brand on screen? The latter matters because Hearts Academy is a separate tenant.
- How many direction studies, and who approves the choice (you alone, or the marketing team)?
- Does the default theme stay "follow OS preference", or does the new direction lead with one theme?
- Should the E2E suite gain visual-regression screenshots per screen during the restyle, or is that heavier than it is worth?
- Mobile: the app is desktop-first today, but **010**'s handoff is used on a phone. Does the redesign make the whole app responsive, or only the screens a phone needs?

---

**To proceed:** Review this proposal and approve to begin planning.
