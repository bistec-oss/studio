### [BLOCK] party-security — Accepting edits activates them at once, and "revertible" covers the kit text but not the posts made from it

**Quotes:**

> The accepted set becomes a new kit-prompt version through the existing versioned flow (`POST /api/admin/brandkits/[id]/prompts`, `prompts/route.ts:30-84`, which allocates the next version and activates it in one transaction;
>
> - Automatic kit changes without review; every upgrade is a proposed version a human activates
> - **Risk:** low to medium. Nothing reaches generation unless a human accepts an edit into a new, revertible kit version.
>   **Problem:** The proposal describes two different flows. Line 77 describes a proposed version that a human then activates. Line 38 reuses a flow that allocates and activates in the same transaction. So the click that accepts an edit is also the click that puts it into every later generation. That includes unattended generation: the active kit prompt reaches every generation (line 31), and scheduled queue entries can auto-publish without a human present. The recovery path covers only the kit text: restoring an earlier version through `PromptSection.tsx:164` fixes future generations. Drafts generated and posts published under the bad version are not undone by restoring, and the proposal names no way to find them. The Risk line's "revertible" claim therefore overstates what an operator can undo.
>   **Fix:** Pick one of two flows and state it. Either save the accepted set as an inactive version that the author activates as a separate step after reading the full resulting text, or keep save-and-activate but say plainly in the proposal and in the UI that accepting puts the edits live at once. In both cases, state the recovery path for output generated under a version that is later rolled back. At minimum, name how an operator lists the drafts and scheduled entries generated while that version was active.
>   **Status:** upheld

### [WARN] party-security — An unreadable or partly invalid edit list has no defined outcome, and the natural default looks like "nothing to fix"

**Quotes:**

> The upgrade reply is a new fenced block (an array of edits) in the same style, not a change to the existing block.
> The upgrade call uses the same model surface, the same MOCK_AI seam style and the same error path.
> **Problem:** The error path being reused (`AssistantModelError` → 422) covers model resolution. It does not cover a reply that has no fenced block, a block that fails zod, or an array where some entries are invalid. If the route turns any of these into an empty list, or quietly drops the invalid entries, the review panel shows "no edits proposed" or a short list. To the author that looks like a kit that is already measurable, so a failed call reads as a clean result. The adjective detector runs separately, so the two signals would also disagree with no explanation.
> **Fix:** Separate three outcomes in the route's response and in the UI: parse failure (shown as an error), zero edits (shown as "no suggestions"), and N edits with M rejected (shown with a count of the dropped entries). Log the raw reply when parsing fails. Never show an empty panel after a failed parse.
> **Status:** upheld

### [WARN] party-security — The model writes the provenance label, so an invented number can claim to come from the kit's own images

**Quotes:**

> - `collectBrandKitGrounding` (`assistant.ts:103`) for reference images and documents, so a proposed number can cite the kit's own references.
>   The recommendation is yes: propose a labelled default, never a silent number.
>   **Problem:** The reviewer relies on the label ("sampled from your references" against "dataset default") to decide whether to trust a number. Nothing in the proposal says code attaches that label. If the model writes the citation, a made-up canvas share can carry a "sampled" label. The author cannot check that against `sampleImageColors` output they never see. The label on the default can then be lost once the edit is saved. The party being reviewed (the model's proposal) controls the trust signal the review gate depends on.
>   **Fix:** Have code attach provenance. A number marked as sampled must equal a value the server computed from `sampleImageColors` in this call. A number marked as a dataset default must match an entry in `designData` by key, and the server checks it. Every other number is marked as unverified model output. Show the label in the review panel. Decide on purpose whether it stays in the saved text.
>   **Status:** upheld

### [WARN] party-security — Matching an edit by exact quote can hit the wrong occurrence or overwrite another admin's newer version

**Quotes:**

> If the author edits the prompt after the proposal, an edit whose quote no longer matches must drop out or go stale, not apply to the wrong place. Plan should define this (exact-quote match, stale edits shown and disabled).
> **Problem:** An exact-quote match that is not required to be unique applies to the first occurrence. Words like "generous" or "dominant" can appear in several rules, so an edit can rewrite a different rule from the one the reviewer read. Separately, the proposal only considers the author's own edits going stale. If another admin saves and activates a version between proposal and accept, the edits are applied to the old base text. Saving that text as the newest version silently drops the other admin's changes. They survive only in the version history, with no warning.
> **Fix:** Reject an edit whose quote is not found exactly once in the base text. Send the base version number with the save, and have the server return 409 if the active version has changed since then. Show a stale edit as disabled and never re-anchor it.
> **Status:** upheld

### [WARN] party-security — Text from uploaded reference documents shapes edits that go into every generation, and nothing limits what an edit can change

**Quotes:**

> **Where the kit text goes.** The active kit prompt reaches every generation as `Brand voice: …` in `buildBrandKitSystemContext` (`src/lib/brandkit/systemContext.ts:15-21`). An adjective saved there is paid for on every post.
>
> - `collectBrandKitGrounding` (`assistant.ts:103`) for reference images and documents, so a proposed number can cite the kit's own references.
>   **Problem:** Text from uploaded documents and images, such as a client PDF, goes into the upgrade prompt. The model's reply becomes edits, and accepted edits become part of every generation, including unattended ones. The proposal does not say this grounding is fenced as untrusted for the new call. It also puts no limit on what an edit may do. An edit can quote a long span and replace it with something short (removing rules the author wanted to keep). It can also insert text that is not a design rule at all. The per-edit click is the only check, and a reviewer scanning a list of "make it measurable" edits is badly placed to catch a removed constraint or an inserted instruction.
>   **Fix:** Fence the grounding text as untrusted in the upgrade prompt. Validate each edit on the server: limit the quote and replacement lengths, keep the quote within one sentence or rule, and reject an edit whose replacement drops most of the quoted text. In the review panel, show the removed text next to the inserted text for each edit.
>   **Status:** upheld
