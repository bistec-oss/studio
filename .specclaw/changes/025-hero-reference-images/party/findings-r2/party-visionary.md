### [WARN] party-visionary — A generic `composite` slot gets permanent screen-only names in the stamp and the analytics vocabulary

**Quotes:**

> 3. **Pixel check:** the screen rect must be blank, with a tighter bar than a `clear` region. A failure falls back to classic with a new reason, `screen-not-blank`, added to `FALLBACK_REASONS` (`stamp.ts:7`). The screenshot is then dropped, not pasted onto a classic post. 6. **Stamp:** `compositionStampSchema` gains an optional `screenshots` field (artifact ids). It is validated in code, so the stamp needs no migration.
> **Problem:** The proposal presents `composite` as a general purpose ("the next `Purpose` literal"), but it names the two persisted parts after this one use, and both names become permanent. `FALLBACK_REASONS` is imported into the 006 event catalogue and written into every Draft and DraftRevision stamp. `parseCompositionStamp` returns null when a stamp fails to parse, so renaming or removing a reason later would silently turn every historical stamp that carries it into "no stamp". Two future changes will need a composite that is not a kit screenshot. One is the per-brief upload in open question 2, which has no artifact id. The other is an exact-geometry kit logo lockup: the Hearts Academy logo sizing failed three times when it was controlled only by prompt wording. Each of those changes will have to add a second reason next to `screen-not-blank` and a second id field next to `screenshots`, or reuse the screen names for things that are not screens. Either way, `/admin/insights` will split one kind of failure across two names. Round 2 makes this more pressing, not less. party-security's BLOCK proposes a second new reason (`screenshot-not-rendered`), and party-architect's lifecycle WARN asks for a named exit for a deleted artifact. Under screen-specific naming those become two more asset-specific reasons; under slot naming they are `composite-not-rendered` and `composite-source-missing`, and a logo or per-brief source reuses them. The artifact says the look key is permanent (open question 3). It does not say these names are just as permanent.
> **Fix:** Name the parts after the slot, not the asset: `composite-not-blank` (plus whatever reasons the panel's render and delete findings add, in the same family), and `composites: [{ region, source: { kind: 'kit-artifact', id } }]`. A per-brief upload or a logo then becomes a new `kind`, with no new reason and no new field. State in the artifact that these names are permanent once released.
> **Status:** upheld

### [WARN] party-visionary — "A new ArtifactType keeps screenshots out of prompts" is false, and the next asset type will copy that reasoning

**Quotes:**

> Reusing `REFERENCE_IMAGE` or `EXAMPLE_POST` would mix purposes. It would also put screenshots into every prompt that reads `feedToAI` artifacts.
> **Problem:** The generation readers filter on the `feedToAI` flag, not on the artifact type: Path B, the agent tools and the prompt-generate route all select `feedToAI: true` with no type filter, and the upload route takes the flag from the form for every type. So a new enum value does not keep a screenshot out of the prompts; the flag does. party-architect filed the merge-day half of this, and its fix (force the flag off on upload, or filter in each reader) closes today's hole. My concern is what comes after. Either fix as stated is a per-type exception that lives in a route or in N queries. The next kit asset type will copy the proposal's reasoning, that a new type is what keeps it out of prompts. Examples are 007's planned typography follow-up and a team-photo asset for a Hiring look. That type will then repeat the gap, because nothing fails when a reader misses the new type.
> **Fix:** Make generation visibility a property of the type, defined in one place. That means an exported set of the types generation may read, used by every `feedToAI` query and enforced by a guard test in the style of `designDataBoundary.test.ts`. A per-type exception in the upload route doesn't do this. Then correct the stated reason in the artifact.
> **Status:** upheld

### [WARN] party-visionary — The first look that needs an input declares that need in wizard UI, not in the dataset the resolver reads

**Quotes:**

> It also gives the picker a clear rule: the look is offered only when the brief has a screenshot. 7. **UI:** an upload section for screenshots on the kit admin page, and a screenshot picker in the brief wizard. The `device-screen` card is shown only once a screenshot is chosen.
>
> - Changing any post style's default look. Launch keeps `product-showcase`.
>   **Problem:** `device-screen` is the first look that cannot render without a specific input. Build step 1 adds the look to the dataset but no field that says it needs one, so the rule exists only as a condition in the wizard. party-architect's lifecycle finding asks for the same rule on the server, in `POST /api/briefs`. If that is written as a route check, the precondition is in two places, the wizard and the route, and the dataset is in neither. The obvious next change is the one the proposal puts out of scope: "Launch uses `device-screen` when the kit has a screenshot." It goes through `resolvePostStyle`, whose result notes are a closed set (`unattended-classic`, `retired-classic`) with no case for a missing input. That change, and any later lifting of `unattended-classic` for the queue, would have to write the precondition a third time. The next input-bound look will copy the wizard condition.
>   **Fix:** Declare the input on the archetype in `composition.ts` (for example `requires: 'composite-source'`). The picker, the brief route and `resolve.ts` should all read that one field. Give `resolve.ts` a `missing-input-classic` note now, so a follow-up that changes a default only edits data.
>   **Status:** upheld

### [WARN] party-visionary — Choosing a public bucket is a one-way door once URLs are written into stored HTML, and open question 4 frames it as a symmetric trade-off

**Quotes:**

> 4. **Bucket:** the public IMAGES bucket (stable URL, as kit logos use), or a private bucket signed at read? Screenshots of unreleased UI argue for private. The render then needs a signed URL that lives long enough, and the stored HTML must not keep an expiring URL.
> **Problem:** As written, the screenshot URL is stored in `Draft.htmlContent` and in every `DraftRevision.htmlSnapshot`, and refine and re-render read those snapshots. If the bucket starts public, a later move to private has two options, both bad. One is to leave every object an old snapshot references public forever. The other is a data migration that rewrites stored HTML across all revisions. The reverse move, from private to public, is only a policy change. Open question 4 weighs confidentiality against URL stability and never says that only one direction can be undone. party-security argues the confidentiality side, and party-architect's BLOCK, code placement with a placeholder in the stored HTML, would remove the door. Neither makes the irreversibility visible in the artifact. If the code-placement fix is not adopted, the door is still there.
> **Fix:** Mark open question 4 as one-way and decide it before `/specclaw:plan`. Store an object key or a placeholder token in the HTML and resolve it at render time (the `resolveExportUrl` / `__INLINE_ASSET_n__` pattern), so stored HTML never holds a URL that expires or can't be revoked. This is the same seam party-architect's and party-security's fixes call for.
> **Status:** upheld

### [WARN] party-visionary — The screenshot in a post is recorded twice, in the stamp and in the HTML, and refine and delete will make the two disagree

**Quotes:**

> 7. **Refine:** when a refine replaces the image, Phase 1 already falls back (`refine-replaced-image`). Should a refine that keeps the image be allowed to move or remove the screenshot?
>
> - `PRODUCT_SCREENSHOT` kit artifacts: upload with validation (type, size, dimensions), list and delete, team-scoped (a cross-team id is 404).
>   **Problem:** The stamp's artifact ids say which screenshot a revision used, and the `<img>` in the revision's HTML says it again. Refine edits only the HTML. If open question 7 answers yes, a refined revision can carry a stamp naming screenshot X while its HTML shows a different screenshot or none, unless every refine writer recomputes the stamp. Deleting an artifact leaves the id pointing at nothing while old HTML may still show the image. party-security's BLOCK shows the merge-day form of this: a stamp that lists a screenshot that never rendered. The long-horizon cost lands when something reads the stamp as the truth. That could be an insights section on which screenshots were used, or a "this screenshot is out of date" badge built the way the stale-headline badge is planned, on a per-revision stamp.
>   **Fix:** Make one of the two copies derived. Under party-architect's code-placement fix, the code step that inserts the element is the only writer of both the placeholder and the stamp entry, and refine is forbidden from touching the composite. Otherwise, derive the stamp field at commit time from the rendered HTML. Either way, make artifact delete a soft delete, as party-security also asks. Say which one in the artifact.
>   **Status:** upheld

### [WARN] party-visionary — A screenshot's fit depends on a versioned rect, but it would be checked once at upload against a long-lived kit asset

**Quotes:**

> 6. **Fit rule:** cover (crop to fill) or contain (letterbox)? Is a screenshot whose aspect is far from the rect's refused at pick time? 5. **Screen shape per size:** one device per size (a laptop for SQUARE, a phone for STORY?), or one device for all sizes? This sets the screen rect's aspect, which sets how the screenshot is cropped.
> **Problem:** Kit screenshots are meant to be reused across many posts and to outlive any one look version. Whether one fits depends on the screen rect's aspect, which the `device-screen` contract version sets. If the scope's "validation (type, size, dimensions)" includes an aspect rule, the upload route holds a second copy of the rect geometry. The foreseeable next change is `device-screen` v2, for example a phone for STORY after a second OP run, or the PORTRAIT and STORY follow-ups that party-po's SQUARE-first slice would create. It must then also update the upload rule, and screenshots already uploaded become silently unsuitable for the new rect. No test links the two. party-security's NOTE asks for a pixel-area cap at upload. That fits this fix, because it bounds decode cost without encoding geometry.
> **Fix:** At upload, validate only the format (by magic bytes), the byte size and the pixel bounds. Compute aspect fit only at pick time, from the current contract's rect, so the dataset stays the only copy of the geometry.
> **Status:** upheld
