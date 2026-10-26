### [BLOCK] party-security — A screenshot that fails to render still produces a green, screenshot-stamped post

**Quotes:**

> 5. **Design step:** the prompt gets the screenshot URL and the rect, and must place the screenshot exactly there (object-fit and rounding are set by the contract, not the model). `evaluateLayout` checks the box after render. 6. **Stamp:** `compositionStampSchema` gains an optional `screenshots` field (artifact ids). It is validated in code, so the stamp needs no migration.
> **Problem:** The blank-screen check (step 3) runs on the image model's output before the screenshot is composited. After that, two things can fail and nothing catches them. (1) The design model writes the `<img>`. It can leave it out, point it at the wrong URL, or put it outside the rect. "set by the contract, not the model" is a request in the prompt, not a rule the code enforces. (2) The screenshot can fail to load at render time: the artifact was deleted, a signed URL expired (open question 4), MinIO is down, or the egress allowlist blocks the host. Chromium then paints a broken image or nothing. The device screen stays blank, which is exactly the state step 3 checked for. The proposal says `evaluateLayout` "checks the box", but it never says what a failed check does. The architect's round-1 finding confirms that the Path B layout observation is record-only. The result is an EXPORTED draft showing an empty laptop, and its stamp still lists `screenshots: [id]`. Draft status, stamp and events all look the same as success. Round 2: party-architect (code-owned placement) and party-ba (no criterion for "pixel-exact") reach the same weak point from their own lenses. Nothing in round 1 shows that the post-render check fails closed.
> **Fix:** Make the composite deterministic. Code inserts the `<img>` (with the contract's object-fit and radius) into the screen rect after the model has written its HTML, and the model is never asked to place it. After render, check the actual pixels in the rect: confirm the image loaded (`naturalWidth > 0` or a check on the network response) and that the rect is no longer blank. On any failure, fail closed to classic with a named reason (for example `screenshot-not-rendered`) and show the user the existing draft notice. Write `screenshots` into the stamp only after that check passes.
> **Status:** upheld

### [BLOCK] party-security — Deleting a kit screenshot silently breaks every draft and revision that references it

**Quotes:**

> - `PRODUCT_SCREENSHOT` kit artifacts: upload with validation (type, size, dimensions), list and delete, team-scoped (a cross-team id is 404).
>
> 7. **Refine:** when a refine replaces the image, Phase 1 already falls back (`refine-replaced-image`). Should a refine that keeps the image be allowed to move or remove the screenshot?
>    **Problem:** Delete removes the stored object, and that cannot be undone. Drafts and revisions keep `htmlSnapshot`s that name the screenshot's URL, and their stamps name its artifact id. After a delete, any later refine, regenerate design or re-render of those drafts loads a missing object and produces a blank device screen. Nothing reports it (see the finding above). The proposal states no reference check, soft delete, warning or recovery path. The risk also runs the other way. Deleting a screenshot of unreleased UI does not remove it from exported PNGs or published posts that already contain it, so an operator who deletes it "to withdraw it" wrongly believes it is gone. Round 2: party-architect (lifecycle warning: no named exit when an id no longer resolves) and party-visionary (the stamp and the HTML disagree after a delete) concur. Neither offers a recovery path, so the runtime-irreversibility objection stands.
>    **Fix:** Before deleting, count the drafts and revisions whose stamps reference the artifact and show that count in the confirmation. Prefer a soft delete (hide the screenshot from the picker but keep the object) so existing drafts still render. If the object really is removed, any later render of an affected draft must fail closed with a named reason, not show a blank screen. Say plainly in the delete UI that exports and published posts are not changed.
>    **Status:** upheld

### [WARN] party-security — Unreleased product UI has no safe default bucket, and the public option exposes it permanently and without auth

**Quotes:**

> 4. **Bucket:** the public IMAGES bucket (stable URL, as kit logos use), or a private bucket signed at read? Screenshots of unreleased UI argue for private. The render then needs a signed URL that lives long enough, and the stored HTML must not keep an expiring URL.
>
> - A product screenshot may show unreleased UI. Bucket choice matters (open question 4).
>   **Problem:** The proposal names the exposure but leaves the default open. With the public IMAGES bucket, every screenshot gets a stable URL that needs no login. That URL is copied into the model-written `htmlSnapshot`s and into every revision, so it spreads to every place that stores or logs HTML. It also outlives a kit delete unless the object itself is removed. Anyone who obtains the URL can fetch the unreleased UI without a session. The renderer allows all MinIO hosts, so model-written HTML can also reference any public object, not just the screenshot the brief chose. Round 2: party-visionary adds that public-then-private is a one-way door once URLs are in stored HTML. That strengthens the case for a private default.
>   **Fix:** Default to a private bucket. Store only the object key in the HTML and the stamp, and sign it with a short TTL when the render runs, as H10's `resolveExportUrl` does. With the deterministic composite from the first finding this is straightforward: code inserts the signed URL just before render and strips it back to the key before saving. A public bucket should be an explicit opt-in the user chooses, not the fallback when the question goes unanswered.
>   **Status:** upheld

### [WARN] party-security — OP-025 decides go/no-go with a looser check than the one the build will ship

**Quotes:**

> It sends a hand-written blank-screen prompt to `gpt-image-2` per size and runs the existing pixel check on the screen rect. 3. **Pixel check:** the screen rect must be blank, with a tighter bar than a `clear` region.
> **Problem:** OP-025 is the gate, but it measures with the existing calm-region check, while production will use a stricter "blank" bar. The prompt is also hand-written, not generated from the data.
> **Fix:** Fix the threshold and generate the prompt from the contract before OP-025, and record both in the ledger.
> **Status:** withdrawn — party-architect's round-1 finding ("OP-025 gates on a hand-written prompt and rect, not on the data contract the build ships") covers the same gap more completely, including the rect and the duplicate ledger, and it sits in their lane (test strategy, contract). What I added as a failure mode, a mass silent fallback, is not silent: the proposal routes each failure to the named, stamped `screen-not-blank` reason. So the part that was mine does not hold, and the rest is theirs.

### [NOTE] party-security — The upload validation does not name the allowed formats or limit the decode cost in the renderer

**Quotes:**

> - `PRODUCT_SCREENSHOT` kit artifacts: upload with validation (type, size, dimensions), list and delete, team-scoped (a cross-team id is 404).
>   **Problem:** "type, size, dimensions" does not say which types are allowed. An SVG accepted as a "screenshot" and served from MinIO is active content on the MinIO origin. A highly compressed raster with very large pixel dimensions costs decode memory in the shared Puppeteer browser, which runs at most two renders at once. Round 2: party-architect notes that the existing route already has a raster allow-list (`IMAGE_TYPES`) but no dimension check. If the new type is added to that list, the SVG exposure goes away. The decode-cost and magic-byte points remain. This is hardening, not exposure.
>   **Fix:** Allow raster formats only (PNG, JPEG, WebP), checked against the file's magic bytes rather than the MIME type the client sends. At upload, cap the pixel count (width × height), not just the file size in bytes.
>   **Status:** upheld
