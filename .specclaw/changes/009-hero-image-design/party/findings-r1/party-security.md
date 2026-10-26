### [BLOCK] party-security — The verifier's region comes from the model it is checking

**Quotes:**

> The decision gains `{ archetype, role: 'hero' | 'background', safeArea }`. The image prompt states the empty region as a measurement ("the left 45% of the frame must be an empty dark gradient"). The design prompt receives **the same** archetype and safe area, so text lands where the image is empty by construction, not by scrim.
> After the image returns, sample luminance and variance inside the text safe area
> **Problem:** The art-director model writes `safeArea`, and the verifier samples only inside it. That makes it a self-graded gate: the region being checked is chosen by the party being checked. A tiny, degenerate or empty rectangle, or one placed over a corner that happens to be plain, passes luminance and variance trivially. The design prompt then gets the same rectangle as its text zone, so the post goes out green while text sits over the busy subject. A brief written to steer the art-director (prompt text, campaign briefing, uploaded docs) can produce that rectangle on purpose. A missing or zero-area `safeArea` passes vacuously, because there is nothing to sample.
> **Fix:** Take the safe area from the versioned archetype dataset, keyed by the archetype, never from model output. The model may pick only an archetype key from a closed enum. If the model returns a region anyway, ignore it or reject it. Enforce a minimum area per archetype in the dataset. A region below that minimum, or one that cannot be resolved, counts as a failed check and takes the `classic-background` fallback.
> **Status:** upheld

### [WARN] party-security — The check reads the image and never where the text actually landed

**Quotes:**

> so text lands where the image is empty by construction, not by scrim.
> This follows the 2026-08-03 lesson: **a prompt rule is not an invariant; check the output.**
> **Problem:** The verification runs on the generated image before the design step. Whether the design model really puts its text inside the safe area is still just a prompt rule, which is the exact thing the cited lesson says not to trust. A design reply that ignores the zone produces a post with text over the hero subject and no scrim, while the image check reports a pass. The failure looks the same as a success.
> **Fix:** After the final render, read the bounding rects of the text and logo elements from the DOM (Puppeteer already has the page) and assert they fall inside the safe area. A violation takes the same fallback as an image failure and is recorded the same way.
> **Status:** upheld

### [WARN] party-security — An archetype from the brief or from auto is not stated to be checked against the kit allow-list

**Quotes:**

> A brand kit lists which archetypes it allows and its default. A brief can pick one or leave it on **auto**.
> **Problem:** The allow-list belongs to the kit admin. The archetype value comes from the brief, which an editor controls, or under auto from model output. The proposal never says the value is checked against the allow-list at generation time. If it isn't, an editor can call the API directly, or a model can pick under auto, and get an archetype the kit admin did not allow. Callers that skip the wizard (scheduler, MCP, ACP, regenerate from a stored brief) are where a wizard-only check would be bypassed. A kit whose allow-list was narrowed after the brief was saved is another such case.
> **Fix:** Check the resolved archetype against the kit's current allow-list on the server, at call time, on every caller path. An explicit interactive pick that is not allowed returns 400. A stored or model-chosen value that is not allowed closes to the kit default and the substitution is recorded.
> **Status:** upheld

### [WARN] party-security — The fallback to classic-background is silent and leaves no record

**Quotes:**

> - **On a failed safe-area check, fall back directly** to `classic-background`, with no regenerate. Open question 4 is answered.
>   **Problem:** A user who picked `product-showcase` gets a full-bleed background with a scrim. Nothing in the proposal tells them, stamps the draft, or logs it. A fallback that fires on every run, from a miscalibrated threshold, a prompt regression or a provider change, would look exactly like hero mode working as designed, and the "prove it on prod before it becomes the default" plan would rest on numbers that cannot be told apart. The proposal also does not say whether the fallback reuses the image that failed the check (so a busy subject goes under the text) or generates a new background (a second paid call that the "no regenerate" decision does not account for).
>   **Fix:** Stamp the draft with the requested archetype, the applied archetype and the fallback reason (for example `busy`, `contrast`, `region-invalid`, `check-error`, `layout-violation`). Show a visible notice on the draft page. Say explicitly whether the fallback reuses the generated image or makes a new call, and count that call.
>   **Status:** upheld

### [WARN] party-security — The fallback only fires on a measured failure, so a check that cannot run passes

**Quotes:**

> If the region is busy or fails contrast, regenerate once, then fall back to `classic-background`.
>
> - post-generation safe-area verification, with a **direct fallback** to `classic-background`;
>   **Problem:** The fallback condition is "the region is busy or fails contrast", which is a result of measuring. The proposal names no outcome for when measuring is impossible: a sampler exception, a Puppeteer timeout, an image URL that won't load into the sampler, or an art-director reply that won't parse or names an unknown archetype. Code that falls back only on a negative result lets all of these through as hero renders that were never checked. That is the fail-open path, and it looks identical to a passed check.
>   **Fix:** State that the check fails closed. Any error, timeout, unparseable decision or unknown archetype counts as a failed check, takes the `classic-background` fallback, and is recorded with reason `check-error`. Only an explicit, completed pass may keep the hero archetype.
>   **Status:** upheld

### [WARN] party-security — The per-team quality setting spends money but names no permission gate

**Quotes:**

> - a per-team `quality` setting for hero images, defaulting to today's behaviour;
>   **Problem:** Switching to `high` raises the spend on every image the team generates, including unattended scheduled and MCP runs. Money spent cannot be recovered. The proposal does not say who may change the setting, whether the value is restricted to the provider's allowed values, or whether a run records the quality it used. Without that record, an operator cannot work out which drafts incurred the higher cost or when the setting changed.
>   **Fix:** Make the setting team-admin only (`withTeamAdmin`, the narrowest gate that works). Validate it against a closed enum, and treat any unknown value as the provider default. Stamp the quality used on each draft so spend can be traced after the fact.
>   **Status:** upheld
