# Proposal: Hero imagery and product-showcase design

**Created:** 2026-09-23
**Status:** 🟡 Draft

## Problem

**The image model is used as wallpaper, so posts are clean but flat.** A side-by-side comparison on 2026-09-23 made the gap concrete (`evidence/`):

- `bistec-studio-launch-v2.png`: a Bistec Studio post, hand-polished, with HTML/CSS cards over an AI background.
- `chatgpt-product-showcase.png`: ChatGPT, from a short prompt. A photoreal laptop shows the product UI, with a 3-step "brief → AI creates → publish" row, a call-to-action pill, depth and lighting.
- `chatgpt-glow-cards.png`: ChatGPT's generic glow style. 3D icons, neon, glassy feature cards.

The ChatGPT images have a **hero subject** with depth, lighting and physical objects. Ours never can, because of how the pipeline divides the work:

1. **The image step is constrained to backgrounds.** `prompts/background.ts:19-21` asks for a _"full-bleed BACKGROUND image"_ with _"NO text, NO logos"_. `prompts/pathB.ts:35` then tells the design model to use it _"as the full-bleed background layer"_ with _"a subtle scrim"_. Nothing ever asks for a subject, an object or a scene with a focal point.
2. **The image and the layout are decided blind to each other.** The background is generated first (`pathB.ts:73`). The design model then has to fit text over whatever came back, so it reaches for scrims. The grey, washed-out middle band in our launch post is exactly that.
3. **The image model gets no reference images.** `ImageProvider.generateImage(prompt, _brandKitId, size)` ignores the kit (`_brandKitId`) and calls `images.generate` only (`providers/implementations/image/openai.ts:11-19`). It can never show the **real** product UI on a device screen, match a reference style, or respect a real logo.
4. **Image quality is never set.** `openai.ts` passes no `quality`, so every image runs at the provider default.
5. **There is no composition vocabulary.** Path B re-invents the layout on every generation. Proven structures such as a steps row, a device showcase or a CTA pill appear only by chance. That is the adjective problem **007** documents, applied to layout instead of kit rules.

## Proposed Solution

Let the image model make the **hero**, keep HTML for everything that must be exact, and bind the two with a **measurable layout contract**.

1. **Layout archetypes as data.** A small, versioned set of composition archetypes. Each one states in measurable terms where the text sits, where the image subject sits, and what must stay empty. Starting set:

   | Archetype            | Contract (example)                                                          |
   | -------------------- | --------------------------------------------------------------------------- |
   | `product-showcase`   | device/subject in right ~55%; left ~45% empty and dark for text             |
   | `hero-centre`        | subject centred in middle ~50% height; top ~20% and bottom ~25% kept clear  |
   | `editorial-split`    | image confined to its own ~40% band; soft-masked edge (the proven IRP rule) |
   | `typographic`        | no image; today's CSS/SVG-only behaviour                                    |
   | `classic-background` | today's full-bleed background + scrim; the backwards-compatible default     |

   A brand kit lists which archetypes it allows and its default. A brief can pick one or leave it on **auto**.

2. **The art-director step returns a layout, not just a prompt.** The decision gains `{ archetype, role: 'hero' | 'background', safeArea }`. The image prompt states the empty region as a measurement ("the left 45% of the frame must be an empty dark gradient"). The design prompt receives **the same** archetype and safe area, so text lands where the image is empty by construction, not by scrim.
3. **Verify the contract, don't assume it.** After the image returns, sample luminance and variance inside the text safe area (the existing `sampleImageColors` machinery in `renderer/puppeteer.ts`). If the region is busy or fails contrast, regenerate once, then fall back to `classic-background`. This follows the 2026-08-03 lesson: **a prompt rule is not an invariant; check the output.**
4. **Reference images into the image model.** Extend `ImageProvider` with optional `references: { url, role: 'product-ui' | 'style' | 'logo' }[]`. The OpenAI implementation uses the image-edit endpoint with input images when references are present. A brand kit gains **product screenshots** (a new artifact role, or `REFERENCE_IMAGE` + `feedToAI`), so a device screen shows the real product.
5. **The logo and all text stay in HTML.** In hero mode the image model still never renders text or logos. The real kit logo and exact copy are layered by the design step, which preserves correct spelling, logo fidelity, inline edit (PR #36), refine and version history.
6. **`quality: 'high'` for hero images**, configurable per team, with the latency and cost measured before it becomes the default.
7. **Experimental: full AI render (Phase 3, off by default).** For teams that want the ChatGPT look outright, the image model renders the entire post (text included) with the kit logo and colours as references. The trade-offs are stated in the UI:
   - text may be misspelled;
   - the logo may drift;
   - inline edit is unavailable;
   - refine becomes an image edit, not an HTML edit.

   Enabled per team by an admin, and stamped on the draft so it can't be mistaken for a normal render.

**Phasing (each phase independently revertible):**

- **Phase 1:** archetypes, the layout contract, safe-area verification, quality. `classic-background` stays the default until the archetypes are proven.
- **Phase 2:** reference images and product screenshots.
- **Phase 3:** experimental full AI render.

## Scope

### In Scope

- Composition archetype dataset + kit-level allow/default + brief-level choice
- Art-director decision schema extension and matching image + design prompt builders (`PROMPT_VERSION` bump)
- Post-generation safe-area verification with regenerate-once / fallback
- `ImageProvider` reference-image support; OpenAI edit-endpoint implementation; product-screenshot kit artifacts
- `quality` setting for hero images
- Phase 3 full-AI-render mode behind a per-team admin flag
- Real-render tests of the safe-area check, using **004**'s rasterizing harness

### Out of Scope

- New image **providers** (Gemini) and the `isDefault` resolution fix — proposal **005** (the fix is a **prerequisite**, see Dependencies)
- Converting kit prose into measurable rules and the typography dataset — proposal **007** (this proposal adds a **composition** section alongside it)
- Refine instruction fidelity — proposal **004**
- Video, motion or animated posts
- The app's own UI — proposal **011**

## Dependencies

- **005 item 3 (`isDefault` fix) is a hard prerequisite.** Today a teammate without a personal OpenAI key gets **no image at all**, silently. Ship hero mode before that fix and most users would see no change, only the CSS fallback.
- **004 T3 (rasterizing harness)** is needed to test the safe-area check against real pixels. The mock suite cannot see this class of bug (`MOCK_PUPPETEER` never rasterizes).
- **007** is soft: archetypes can land first, but should live in the same design-system data module 007 introduces, not a parallel one.

## Impact

- **Files affected:** ~20–30 (estimated) — background/pathB prompt builders, `background.ts`, `ImageProvider` + OpenAI impl, renderer sampling, brand-kit artifacts + admin UI, brief wizard, schema (brief archetype, kit allow-list, Phase 3 flag), tests
- **Complexity:** large
- **Risk:** medium-high. This changes the look of every Path B post, adds image cost (high quality, possible regenerate-once), and adds latency to an already ~5-minute pipeline. Mitigated by `classic-background` as the default until proven, per-kit opt-in, `PROMPT_VERSION` stamping, and phase independence.

## Open Questions

- Does **gpt-image-2** accept multiple input images on the edit endpoint, and does it support `background: 'transparent'`? Transparent hero cut-outs would allow subjects to be composited over **exact** CSS brand gradients, which is stronger than any prompt-described colour. Confirm against current API docs at design time.
- What does `quality: 'high'` cost in latency and price per image? Measure before making it the default.
- Should the art-director step stay on Haiku, or move to Sonnet for hero mode, where the layout decision matters more? That becomes a **008** surface question if it is made user-selectable.
- Is regenerate-once on a failed safe-area check worth the extra image cost, or should it fall straight back to `classic-background`?
- For product screenshots on device screens: should the image model receive the screenshot as a reference (it may redraw it inaccurately), or should the design step composite the **real** screenshot into a device frame the image model leaves blank? The second is exact but needs a screen-region contract.

---

**To proceed:** Review this proposal and approve to begin planning.
