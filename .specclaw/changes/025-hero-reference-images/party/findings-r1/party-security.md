### [BLOCK] party-security — A screenshot that fails to render still produces a green, screenshot-stamped post

**Quotes:**

> 5. **Design step:** the prompt gets the screenshot URL and the rect, and must place the screenshot exactly there (object-fit and rounding are set by the contract, not the model). `evaluateLayout` checks the box after render.

> 6. **Stamp:** `compositionStampSchema` gains an optional `screenshots` field (artifact ids). It is validated in code, so the stamp needs no migration.
>    **Problem:** The blank-screen check (step 3) runs on the image model's output before the screenshot is composited. After that, two things can fail with nothing to catch them. (1) The design model writes the `<img>`. It can leave it out, point it at the wrong URL, or move it outside the rect. "set by the contract, not the model" is a prompt request, not an enforced rule; this is the same lesson as the 2026-08-03 preamble incident. (2) The screenshot can fail to load at render time: a deleted artifact, an expired signed URL (open question 4), MinIO being down, or a host the egress allowlist blocks. Chromium then paints a broken image or nothing, and the device screen is left blank, which is exactly what step 3 checked for. The proposal says `evaluateLayout` "checks the box" but never says what a failed check does. In 009 Phase 1 a `layout-violation` is only recorded as an observation and the style is kept. So the result is an EXPORTED draft showing an empty laptop, and its stamp still lists `screenshots: [id]`. That failure looks the same as success in the draft status, the stamp and the 006 events.
>    **Fix:** Make the composite deterministic. Code inserts the `<img>` (with the contract's object-fit and radius) into the screen rect after the model has written its HTML. The model is never asked to place it. After render, check the actual pixels in the rect. Confirm the image loaded (`naturalWidth > 0` or a network-response check) and that the rect is no longer blank. On any failure, fail closed to classic with a named reason (for example `screenshot-not-rendered`) and show the user the existing draft notice. Write `screenshots` into the stamp only after that check passes.
>    **Status:** upheld

### [BLOCK] party-security — Deleting a kit screenshot silently breaks every draft and revision that references it

**Quotes:**

> - `PRODUCT_SCREENSHOT` kit artifacts: upload with validation (type, size, dimensions), list and delete, team-scoped (a cross-team id is 404).

> 7. **Refine:** when a refine replaces the image, Phase 1 already falls back (`refine-replaced-image`). Should a refine that keeps the image be allowed to move or remove the screenshot?
>    **Problem:** Delete removes the stored object, and that cannot be undone. Drafts and revisions keep `htmlSnapshot`s that name the screenshot's URL, and their stamps name its artifact id. After a delete, any later refine, regenerate design or re-render of those drafts loads a missing object and produces a blank device screen. Nothing reports it (see the finding above). The proposal states no reference check, soft-delete, warning or recovery path. In the other direction, deleting a screenshot of unreleased UI does not remove it from exported PNGs or published posts that already contain it. An operator who deletes it "to withdraw it" gets a false sense that it is gone.
>    **Fix:** Before deleting, count the drafts and revisions whose stamps reference the artifact and show that count in the confirmation. Prefer a soft delete (hide it from the picker, keep the object) so existing drafts still render. If the object really is removed, any later render of an affected draft must fail closed with a named reason, not a blank screen. Say plainly in the delete UI that exports and published posts are not changed.
>    **Status:** upheld

### [WARN] party-security — Unreleased product UI has no safe default bucket, and the public option exposes it permanently and without auth

**Quotes:**

> 4. **Bucket:** the public IMAGES bucket (stable URL, as kit logos use), or a private bucket signed at read? Screenshots of unreleased UI argue for private. The render then needs a signed URL that lives long enough, and the stored HTML must not keep an expiring URL.

> - A product screenshot may show unreleased UI. Bucket choice matters (open question 4).
>   **Problem:** The proposal names the exposure and leaves the default open. With the public IMAGES bucket, every screenshot gets a stable, unauthenticated URL. That URL is copied into model-authored `htmlSnapshot`s and every revision, so it spreads to every place that stores or logs HTML. It also outlives a kit delete unless the object itself is removed. Anyone who obtains the URL can fetch the unreleased UI with no session. The renderer allows all MinIO hosts, so model-authored HTML can also reference any public object, not just the screenshot the brief chose.
>   **Fix:** Default to a private bucket. Store only the object key in the HTML and stamp, and sign it with a short TTL when the render runs, in the same way as H10's `resolveExportUrl`. The deterministic composite from the first finding makes this easy: code inserts the signed URL just before render and strips it back to the key before saving. A public bucket should be an explicit opt-in the user chooses, not the fallback when the question goes unanswered.
>   **Status:** upheld

### [WARN] party-security — OP-025 decides go/no-go with a looser check than the one the build will ship

**Quotes:**

> It sends a hand-written blank-screen prompt to `gpt-image-2` per size and runs the existing pixel check on the screen rect.

> 3. **Pixel check:** the screen rect must be blank, with a tighter bar than a `clear` region.
>    **Problem:** OP-025 is the gate ("It decides whether the change goes ahead"), but it measures with the existing calm-region check. Production will use a stricter "blank" bar. A size can pass OP-025 and then fail the shipped check on most real renders. That would quietly send most `device-screen` posts to the classic fallback, and the decision to build would rest on a measurement nobody shipped. The prompt is also hand-written, not the data-generated one from step 2, so the gate does not test the prompt that will run in production either.
>    **Fix:** Fix the blank-screen threshold before OP-025. Run OP-025 with that threshold and with the prompt text generated from the draft contract. Record the threshold and the prompt hash in the ledger, so a later threshold change shows up as a gap against the gate result.
>    **Status:** upheld

### [NOTE] party-security — The upload validation does not name the allowed formats or limit the decode cost in the renderer

**Quotes:**

> - `PRODUCT_SCREENSHOT` kit artifacts: upload with validation (type, size, dimensions), list and delete, team-scoped (a cross-team id is 404).
>   **Problem:** "type, size, dimensions" does not say which types are allowed. An SVG accepted as a "screenshot" and served from MinIO is active content on the MinIO origin. A highly compressed raster with very large pixel dimensions costs decode memory in the shared Puppeteer browser, which is capped at two concurrent renders. Neither risk exists as long as the validation is strict, so this is hardening, not exposure.
>   **Fix:** Allow raster formats only (PNG, JPEG, WebP), checked against the file's magic bytes, not the client MIME type. Cap pixel width × height (not just file bytes) when the file is uploaded.
>   **Status:** upheld
