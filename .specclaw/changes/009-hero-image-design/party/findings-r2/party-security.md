### [BLOCK] party-security — The verifier's region comes from the model it is checking

**Quotes:**

> The decision gains `{ archetype, role: 'hero' | 'background', safeArea }`. The image prompt states the empty region as a measurement ("the left 45% of the frame must be an empty dark gradient"). The design prompt receives **the same** archetype and safe area, so text lands where the image is empty by construction, not by scrim.
> After the image returns, sample luminance and variance inside the text safe area
> **Problem:** The art-director model writes `safeArea`, and the verifier samples only inside it. The region being checked is chosen by the party being checked, so this is a self-graded gate. A tiny or degenerate rectangle, or one placed over a plain corner, passes luminance and variance trivially. The design prompt then gets the same rectangle as its text zone, so the post goes out green with text over the busy subject. Brief text, campaign briefings and uploaded documents all feed the art-director, and any of them can steer it into producing that rectangle on purpose. A missing or zero-area `safeArea` passes vacuously. party-architect's round-1 BLOCK reaches the same fix from the structural side ("two sources of truth"). Their reading shows the field is redundant. This one shows it is also exploitable, which is why it stays a BLOCK and not only a duplication to clean up.
> **Fix:** Take the safe area from the versioned archetype dataset, keyed by archetype, never from model output. The model picks only an archetype key from a closed enum, and any region it returns is ignored. Set a minimum area per archetype in the dataset. A region below that minimum, or one that cannot be resolved, counts as a failed check and takes the `classic-background` fallback.
> **Status:** upheld

### [WARN] party-security — The check reads the image and never where the text actually landed

**Quotes:**

> so text lands where the image is empty by construction, not by scrim.
> This follows the 2026-08-03 lesson: **a prompt rule is not an invariant; check the output.**
> **Problem:** The verification runs on the generated image before the design step. Whether the design model really puts its text inside the safe area is still only a prompt rule, which is exactly what the cited lesson says not to trust. A design reply that ignores the zone produces text over the hero subject with no scrim, and the image check still reports a pass. That failure looks the same as success. party-visionary's round-1 NOTE makes the same observation as a reuse opportunity. This finding is the exposure that opportunity would close.
> **Fix:** After the final render, read the bounding rects of the text and logo elements from the DOM (Puppeteer already has the page) and assert they fall inside the safe area. A violation takes the same fallback as an image failure and is recorded the same way.
> **Status:** upheld

### [WARN] party-security — An archetype from the brief or from auto is not stated to be checked against the kit allow-list

**Quotes:**

> A brand kit lists which archetypes it allows and its default. A brief can pick one or leave it on **auto**.
> **Problem:** The allow-list belongs to the kit admin. The archetype value comes from the brief, which an editor controls, or under auto from model output. The proposal never says the value is checked against the allow-list at generation time. If the check lives only in the wizard, it is bypassed by a direct API call, by a model choice under auto, and by callers that skip the wizard (scheduler, MCP, ACP, regenerate from a stored brief). It is also bypassed when a kit's allow-list is narrowed after the brief was saved. party-po's round-1 WARN proposes cutting the allow-list. If that happens, the kit-admin half of this finding goes away, but the closed-enum check on model output under auto still applies.
> **Fix:** On the server, check the resolved archetype against the kit's current allow-list at call time, on every caller path. An explicit interactive pick that is not allowed returns 400. A stored or model-chosen value that is not allowed falls back to the kit default, and the substitution is recorded.
> **Status:** upheld

### [WARN] party-security — The fallback to classic-background is silent and leaves no record

**Quotes:**

> - **On a failed safe-area check, fall back directly** to `classic-background`, with no regenerate. Open question 4 is answered.
>   **Problem:** A user who picked `product-showcase` gets a full-bleed background with a scrim, and nothing tells them, stamps the draft or logs it. A miscalibrated threshold, a prompt regression or a provider change could make the fallback fire on every run, and that would look exactly like hero mode working. The "prove it on prod" plan would then rest on numbers that cannot tell the two apart. The proposal also does not say whether the fallback reuses the image that failed the check (putting a busy subject under the text) or makes a second paid image call. party-architect (BLOCK, the rendered archetype is never recorded) and party-visionary (WARN, no evidence for "until proven") converge on the same stamp, which supports this finding.
>   **Fix:** Stamp the draft with the requested archetype, the applied archetype and the fallback reason (`busy`, `contrast`, `region-invalid`, `check-error`, `layout-violation`). Show a visible notice on the draft page. Say whether the fallback reuses the generated image or makes a new call, and count that call.
>   **Status:** upheld

### [WARN] party-security — The fallback only fires on a measured failure, so a check that cannot run passes

**Quotes:**

> If the region is busy or fails contrast, regenerate once, then fall back to `classic-background`.
>
> - post-generation safe-area verification, with a **direct fallback** to `classic-background`;
>   **Problem:** The only fallback condition the artifact states is "the region is busy or fails contrast", which can only be the result of a completed measurement. It names no outcome for when measuring is impossible: a sampler exception, a Puppeteer timeout, an image URL that won't load, or an art-director reply that won't parse or names an unknown archetype. If the code falls back only on a negative result, every one of these ships as a hero render that was never checked. That is the fail-open shape. party-architect's fallback-table WARN asks for these exits to be routed somewhere, which is a specification gap. This finding is narrower: whatever the table says, an exit where the check could not complete must not keep the hero archetype.
>   **Fix:** State that the check fails closed. Any error, timeout, unparseable decision or unknown archetype counts as a failed check, takes the `classic-background` fallback and is recorded with reason `check-error`. Only an explicit, completed pass may keep the hero archetype.
>   **Status:** upheld

### [WARN] party-security — The per-team quality setting spends money but names no permission gate

**Quotes:**

> - a per-team `quality` setting for hero images, defaulting to today's behaviour;
>   **Problem:** Switching to `high` raises the spend on every image the team generates, including unattended scheduled and MCP runs, and money spent cannot be recovered. The proposal does not say who may change the setting, whether the value is limited to the provider's allowed values, or whether a run records the quality it used. Without that record, an operator cannot tell which drafts cost more or when the setting changed. Two other seats suggest moving the setting: party-visionary to the IMAGE provider row, party-po to an env flag. The provider row would satisfy this fix if it keeps the team-admin gate those rows already have. An env flag removes the in-app grant, but the per-draft stamp is still needed for tracing spend.
>   **Fix:** Make the setting team-admin only (`withTeamAdmin`, the narrowest gate that works). Validate it against a closed enum and treat any unknown value as the provider default. Stamp the quality used on each draft so spend can be traced afterwards.
>   **Status:** upheld

### [NOTE] party-security — Rebuttal to party-po: shipping archetype prompts before the verifier ships the unchecked failure mode as the live state

**Quotes:**

> real-render tests of the safe-area check, using **004**'s rasterizing harness (`npm run test:render`).
> This follows the 2026-08-03 lesson: **a prompt rule is not an invariant; check the output.**
> **Problem:** party-po's round-1 BLOCK and NOTE propose shipping prompt-only archetypes first, judging them by eye, and adding the verification and fallback afterwards ("Sequence the guard after the prompts are seen in use"). I take no position on cost or scope. My objection is to the failure mode of that order. In the interim, a hero prompt that leaves the text region busy produces text over the subject with no scrim, no check, no fallback and no record. The proposal's own cited lesson describes this as the failure that looks identical to success. A prompt-only cut is safe only if it keeps a fail-closed path: either it stays off until the check exists, or it ships with a stamp that makes every interim hero render identifiable afterwards.
> **Fix:** If the prompt-only cut is adopted, it must either ship behind an admin-only flag that stays off until the verifier lands, or stamp the requested archetype on each draft from day one so interim renders can be found and re-checked. Only party-po can withdraw or amend their finding. This entry records the failure-mode objection.
> **Status:** upheld
