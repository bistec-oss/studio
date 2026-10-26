### [BLOCK] party-security — Accepting edits activates them at once, and "revertible" covers the kit text but not the posts made from it

**Quotes:**

> The accepted set becomes a new kit-prompt version through the existing versioned flow (`POST /api/admin/brandkits/[id]/prompts`, `prompts/route.ts:30-84`, which allocates the next version and activates it in one transaction;
>
> - Automatic kit changes without review; every upgrade is a proposed version a human activates
> - **Risk:** low to medium. Nothing reaches generation unless a human accepts an edit into a new, revertible kit version.
>   **Problem:** The proposal describes two incompatible flows. Line 77 says an upgrade is a proposed version that a human then activates. Line 38 reuses a flow that allocates and activates the version in one transaction. With the line 38 flow, the click that accepts the edits is also the click that sends them to every later generation, because the active kit prompt reaches every generation (line 31). In round 1 I also said scheduled queue entries can auto-publish. That claim is not on the page, so I am narrowing this finding to what the proposal states: every generation that runs after the click uses the new text, whether or not anyone is watching. Architect's base-text finding adds a third reading: accepting writes into the textarea and the author saves through the existing Save. That flow also activates on save, so all three readings still put model-proposed text live without a separate activation step. Restoring an earlier version through `PromptSection.tsx:164` only fixes future generations. Drafts made and posts published under the bad version are not undone, and the proposal names no way to find them. The Risk line's "revertible" therefore overstates what an operator can undo. No seat argued that the activation step exists or that the recovery path is stated, so I am keeping this finding.
>   **Fix:** Pick one flow and state it. Either save the accepted set as an inactive version that the author activates as a separate step after reading the full resulting text, or keep save-and-activate and say plainly in the proposal and in the UI that accepting puts the edits live at once. With either flow, change "revertible" to say that only future generations revert. Also name how an operator lists the drafts generated while a rolled-back version was active, or state that they cannot.
>   **Status:** upheld

### [WARN] party-security — An unreadable or partly invalid edit list has no defined outcome, and the natural default looks like "nothing to fix"

**Quotes:**

> The upgrade reply is a new fenced block (an array of edits) in the same style, not a change to the existing block.
> The upgrade call uses the same model surface, the same MOCK_AI seam style and the same error path.
> **Problem:** The reused error path (`AssistantModelError` → 422) covers model resolution. It does not cover a reply with no fenced block, a block that fails zod, or an array where some entries are invalid. If the route turns any of these into an empty list or quietly drops the bad entries, the panel shows "no edits proposed" or a short list. To the author, a failed call then looks like a kit that is already measurable. Architect's contract finding says the edit schema is unspecified, and that is their finding. What I am flagging is the failure behaviour once a schema exists: a parse failure must not look the same as a clean result. Nothing raised in round 1 changes that.
> **Fix:** Give the route's response and the UI three separate outcomes. A parse failure shows as an error. Zero edits shows as "no suggestions". N edits with M rejected shows the count of dropped entries. Log the raw reply when parsing fails, and never show an empty panel after a failed parse.
> **Status:** upheld

### [WARN] party-security — The model writes the provenance label, so an invented number can claim to come from the kit's own images

**Quotes:**

> - `collectBrandKitGrounding` (`assistant.ts:103`) for reference images and documents, so a proposed number can cite the kit's own references.
>   The recommendation is yes: propose a labelled default, never a silent number.
>   **Problem:** The reviewer decides whether to trust a number from its label: "sampled from your references" or "dataset default". The proposal never says that code attaches the label, so the model under review controls the signal the review depends on. Architect's sampler finding makes this more serious. The proposal never says `sampleImageColors` returns a share, and if it returns only a palette, then every "sampled" canvas-share number is a share the model estimated. That number would still carry the most trusted label, and the author cannot check it against sampler output they never see.
>   **Fix:** Have code attach provenance. A number labelled as sampled must equal a share the server computed in this call. A number labelled as a dataset default must match a `designData` entry by key, and the server checks it. Label every other number as unverified model output. Show the label in the review panel, and decide on purpose whether it stays in the saved text.
>   **Status:** upheld

### [WARN] party-security — Matching an edit by exact quote can hit the wrong occurrence or overwrite another admin's newer version

**Quotes:**

> If the author edits the prompt after the proposal, an edit whose quote no longer matches must drop out or go stale, not apply to the wrong place. Plan should define this (exact-quote match, stale edits shown and disabled).
> **Problem:** Architect's contract finding covers specifying an occurrence rule; that part is theirs. My finding is about what happens when the rule is missing. An edit whose quote matches several places applies to the first match, so an edit can rewrite a different rule from the one the reviewer read, and nothing reports it. My second point does not overlap with architect: if another admin saves and activates a version between the proposal and the accept, the edits apply to the older base text. Saving that as the newest version silently drops the other admin's changes, which then survive only in the version history. Architect's textarea-versus-active finding raises the same risk within a single session, when the textarea holds unsaved work.
> **Fix:** Reject an edit whose quote does not occur exactly once in the base text. Send the base version number with the save, and have the server return 409 if the active version has changed since. Show a stale edit as disabled, and never re-anchor it.
> **Status:** upheld

### [WARN] party-security — Text from uploaded reference documents shapes edits that go into every generation, and nothing limits what an edit can change

**Quotes:**

> **Where the kit text goes.** The active kit prompt reaches every generation as `Brand voice: …` in `buildBrandKitSystemContext` (`src/lib/brandkit/systemContext.ts:15-21`). An adjective saved there is paid for on every post.
>
> - `collectBrandKitGrounding` (`assistant.ts:103`) for reference images and documents, so a proposed number can cite the kit's own references.
>   **Problem:** The proposal notes that `claude -p` runs with `--tools ""` (line 53). That limits what the model can do, but it does not limit what it can write: the replies here become edits, and accepted edits enter every generation. Uploaded document text, such as a client PDF, goes into the upgrade prompt, and the proposal does not say it is fenced as untrusted for this new call. Nothing limits what one edit may do either. An edit can quote a long span and replace it with something short, which deletes rules the author wanted to keep, or it can insert text that is not a design rule at all. The per-edit click is the only check, and a reviewer scanning a list of "make it measurable" edits is poorly placed to notice a removed constraint. No seat argued that this entry point is missing.
>   **Fix:** Fence the grounding text as untrusted in the upgrade prompt. Validate each edit on the server: limit the lengths of the quote and the replacement, keep each quote within one sentence or rule, and reject an edit whose replacement drops most of the quoted text. In the review panel, show each edit's removed text next to its inserted text.
>   **Status:** upheld
