### [WARN] party-visionary — A generic `composite` slot gets permanent screen-only names in the stamp and the analytics vocabulary

**Quotes:**

> 3. **Pixel check:** the screen rect must be blank, with a tighter bar than a `clear` region. A failure falls back to classic with a new reason, `screen-not-blank`, added to `FALLBACK_REASONS` (`stamp.ts:7`). The screenshot is then dropped, not pasted onto a classic post. 6. **Stamp:** `compositionStampSchema` gains an optional `screenshots` field (artifact ids). It is validated in code, so the stamp needs no migration.
> **Problem:** The proposal presents `composite` as a general purpose ("the next `Purpose` literal"), but it names the two persisted parts after this one use. Both names become permanent. `FALLBACK_REASONS` is imported into the 006 event catalogue (`src/lib/analytics/catalogue.ts:24`, `:100`) and written into every Draft and DraftRevision stamp. `parseCompositionStamp` returns null when a stamp fails to parse, so renaming or removing a reason later would silently turn every historical stamp that carries it into "no stamp". Two future changes will need a composite that is not a screenshot. One is the per-brief upload in open question 2, which has no artifact id. The other is an exact-geometry kit logo lockup: the Hearts Academy logo sizing failed three times when it was controlled only by prompt wording. Each of those changes will have to add a second reason next to `screen-not-blank` and a second id field next to `screenshots`, or reuse the screen names for things that are not screens. Either way, `/admin/insights` will split one kind of failure across two names. The artifact says the look key is permanent (open question 3). It does not say these two names are just as permanent.
> **Fix:** Name both parts after the slot, not the asset: `composite-not-blank`, and `composites: [{ region, source: { kind: 'kit-artifact', id } }]`. Then a per-brief upload or a logo becomes a new `kind` with no new reason and no new field. State in the artifact that both names are permanent once released.
> **Status:** upheld

### [WARN] party-visionary — "A new ArtifactType keeps screenshots out of prompts" is false, and the next asset type will copy that reasoning

**Quotes:**

> Reusing `REFERENCE_IMAGE` or `EXAMPLE_POST` would mix purposes. It would also put screenshots into every prompt that reads `feedToAI` artifacts.
> **Problem:** The generation readers filter on the `feedToAI` flag, not on the artifact type. `src/lib/agent/pathB.ts:95` reads `where: { brandKitId: kit.id, feedToAI: true }`. `src/lib/agent/tools.ts` (lines 69, 77, 88 and 117) and `src/app/api/admin/brandkits/[id]/prompts/generate/route.ts:20` do the same. Only `brandkit/assistant.ts` filters by type. Meanwhile the artifacts upload route reads `feedToAI` from the form, and `KitDetail.tsx` shows the feedToAI toggle on every artifact row. So a new enum value does not keep a screenshot out of the prompts; the flag does. Every reader must exclude the type by hand, and nothing fails when a sixth reader forgets. The proposal states the opposite as the reason for a new type. The next asset type will copy that reasoning and the gap with it, for example 007's planned typography follow-up or a team-photo asset for a Hiring look.
> **Fix:** Make generation visibility a property of the type, defined in one place. One option is an exported set of the types generation may read, used by every `feedToAI` query, with a guard test like `designDataBoundary.test.ts`. The other is to forbid `feedToAI = true` for `PRODUCT_SCREENSHOT` at write time (the route, the toggle and a DB check). Then correct the stated reason in the artifact.
> **Status:** upheld

### [WARN] party-visionary — The first look that needs an input declares that need in wizard UI, not in the dataset the resolver reads

**Quotes:**

> It also gives the picker a clear rule: the look is offered only when the brief has a screenshot. 7. **UI:** an upload section for screenshots on the kit admin page, and a screenshot picker in the brief wizard. The `device-screen` card is shown only once a screenshot is chosen.
>
> - Changing any post style's default look. Launch keeps `product-showcase`.
>   **Problem:** `device-screen` is the first look that cannot render without a specific input. Build step 1 adds the look to the dataset but adds no field that says it needs one, so the rule exists only as a condition in the wizard. The obvious next change is the one the proposal puts out of scope: "Launch uses `device-screen` when the kit has a screenshot". That change goes through `resolvePostStyle`, and its result notes are a closed set (`unattended-classic`, `retired-classic`) with no case for a missing input. That change, and any later lifting of `unattended-classic` for the queue, will each have to rewrite the precondition outside the wizard. The next input-bound look, such as a team-photo look or a quote look, will copy the wizard condition.
>   **Fix:** Declare the input on the archetype in `composition.ts` (for example, `requires: 'screenshot'`). Have the picker read that field, and give `resolve.ts` a `missing-input-classic` note now, so the follow-up that changes a default only edits data.
>   **Status:** upheld

### [WARN] party-visionary — Choosing a public bucket is a one-way door once URLs are written into stored HTML, and open question 4 frames it as a symmetric trade-off

**Quotes:**

> 4. **Bucket:** the public IMAGES bucket (stable URL, as kit logos use), or a private bucket signed at read? Screenshots of unreleased UI argue for private. The render then needs a signed URL that lives long enough, and the stored HTML must not keep an expiring URL.
> **Problem:** The design step places the screenshot by URL, so the URL is stored in `Draft.htmlContent` and in every `DraftRevision.htmlSnapshot`. Refine and later re-renders read those snapshots. If the bucket starts public, a later move to private has two options, and both are bad. One is to leave every object that an old snapshot references public forever. The other is a data migration that rewrites stored HTML across all revisions. Going the other way, from private to public, is only a policy change. Open question 4 weighs confidentiality against URL stability and never says that only one direction can be undone. "List and delete", which is in scope, has the same problem: with a stable public URL baked into history, a delete either breaks the re-render of old revisions or has to become a soft delete.
> **Fix:** Mark open question 4 as one-way and decide it before `/specclaw:plan`. If private, use what the repo already has: store an object key or a placeholder token in the HTML (the `resolveExportUrl` / `__INLINE_ASSET_n__` pattern) and resolve it at render time. The stored HTML then never holds a URL that expires or that can't be revoked.
> **Status:** upheld

### [WARN] party-visionary — The screenshot in a post is recorded twice, in the stamp and in the HTML, and refine and delete will make the two disagree

**Quotes:**

> 7. **Refine:** when a refine replaces the image, Phase 1 already falls back (`refine-replaced-image`). Should a refine that keeps the image be allowed to move or remove the screenshot?
>
> - `PRODUCT_SCREENSHOT` kit artifacts: upload with validation (type, size, dimensions), list and delete, team-scoped (a cross-team id is 404).
>   **Problem:** The stamp's artifact ids say which screenshot a revision used. The `<img>` in the revision's HTML says it again. Refine edits only the HTML. If open question 7 answers yes, a refined revision can carry a stamp naming screenshot X while its HTML shows a different screenshot or none, unless every refine writer recomputes the stamp. Deleting an artifact leaves the id pointing at nothing while the old HTML may still show the image. Nobody notices until something reads the stamp as the truth: an insights section on which screenshots were used, or a "this screenshot is out of date" badge built the way the stale-headline badge is planned. That badge is planned to read a per-revision stamp for exactly this reason.
>   **Fix:** Derive the field when the revision is committed, from the rendered HTML (the post-render box check already finds the element), instead of copying it forward. Or forbid refine from touching the composite and make artifact delete a soft delete. Say which one in the artifact.
>   **Status:** upheld

### [WARN] party-visionary — A screenshot's fit depends on a versioned rect, but it would be checked once at upload against a long-lived kit asset

**Quotes:**

> 6. **Fit rule:** cover (crop to fill) or contain (letterbox)? Is a screenshot whose aspect is far from the rect's refused at pick time? 5. **Screen shape per size:** one device per size (a laptop for SQUARE, a phone for STORY?), or one device for all sizes? This sets the screen rect's aspect, which sets how the screenshot is cropped.
> **Problem:** Kit screenshots are meant to be reused across many posts and to outlive any one look version. Whether one fits depends on the screen rect's aspect, which is set by the `device-screen` contract version. If the scope's "validation (type, size, dimensions)" includes an aspect rule, the upload route holds a second copy of the rect geometry. The foreseeable next change is `device-screen` v2, for example a phone instead of a laptop for STORY after a second OP run. It must then also update the upload rule, and the screenshots already uploaded become silently unsuitable for the new rect. No test links the two.
> **Fix:** At upload, validate only the type, the byte size and the pixel bounds. Compute aspect fit only at pick time, from the current contract's rect, so the dataset remains the only copy of the geometry.
> **Status:** upheld
