### [WARN] party-architect — Two finders of "vague phrase", one deterministic and one model-driven, with no stated seam between them

**Quotes:** > It reads the active kit prompt and proposes individual edits, each one replacing a vague phrase with a measurable rule.
**Quotes:** > Flag vague design words in a kit prompt at authoring time and offer a measurable replacement, moving the feedback from "five minutes and a regeneration later" to "while you are typing". The suggestions come from the dataset, so the detector and the assistant agree.
**Problem:** The proposal describes two components that decide which phrase is vague and what replaces it: a pure word-list detector in the browser, and a model-backed upgrade assistant on the server. It says they "agree" because both draw on the dataset, but it never says how the dataset reaches the model, or whether the model's anchors are limited to the phrases the detector found. Nothing in the text stops the model from flagging a phrase the detector ignores, or proposing a number the dataset does not hold. The proposal also gives two ways to apply a fix: the detector "offer[s] a measurable replacement" while you type, and the assistant's edits go through the diff review. So one phrase can carry two different suggestions with two accept paths. Two implementers would put the decision in different layers.
**Fix:** In the artifact, give one component the job of picking anchors. For example: the deterministic detector produces the candidate phrases and the dataset suggestion, and the model only judges context or fills in a number for those candidates. Or state plainly that the model can propose edits outside the detector's list, and say how a phrase that both components flag is shown and applied.
**Status:** upheld

### [WARN] party-architect — The base text for the diff is unspecified: the saved active prompt versus the unsaved draft textarea

**Quotes:** > It reads the active kit prompt and proposes individual edits, each one replacing a vague phrase with a measurable rule. The author accepts or rejects each edit. The accepted set becomes a new kit-prompt version through the existing versioned flow
**Quotes:** > The kit editor's `PromptSection.tsx` (Improve with AI at :109, the editable draft textarea at :176-180) as the place the diff review lands.
**Quotes:** > The existing "Improve with AI" button stays as it is.
**Problem:** The proposal names the existing editable draft textarea as where the review lands. It also keeps Improve with AI, which writes into that same panel. But the assistant reads the _active_ (saved) prompt, and the accepted edits save directly as a new version through `POST .../prompts`. The proposal does not say what happens when the textarea holds unsaved text, whether from typing or from an Improve with AI rewrite. Three outcomes are all consistent with the text: the accepted edits apply to the active text and the textarea's unsaved work is silently overwritten; the edits apply to the textarea and anchors drawn from the active text miss; or the accept step writes into the textarea and the author saves as usual. The live detector scans the textarea, so the detector and the assistant are reading different inputs. PromptSection's existing draft state has to change in the same commit, and the proposal does not describe how.
**Fix:** State which text the upgrade request sends: the textarea's current contents or the active version. Also state whether accepting writes the result into the textarea, to be saved through the existing Save, or posts a version directly. Then say how a pending Improve with AI result or unsaved draft is handled.
**Status:** upheld

### [WARN] party-architect — The edit-array contract that the route, the parser, the apply logic and the UI share is not specified

**Quotes:** > The upgrade reply is a new fenced block (an array of edits) in the same style, not a change to the existing block.
**Quotes:** > Typography pairing and type-scale suggestions, delivered as edits in that same diff
**Quotes:** > An edit needs a quote of the phrase it replaces. If the author edits the prompt after the proposal, an edit whose quote no longer matches must drop out or go stale, not apply to the wrong place. Plan should define this (exact-quote match, stale edits shown and disabled).
**Problem:** The proposal defines an edit only as "a quote of the phrase it replaces". But its own typography deliverable is mostly _insertions_: a type scale or a pairing rationale where the kit currently says nothing, so there is no phrase to quote. The proposal does not say where an insertion is placed. It also leaves open what happens when the quoted text appears twice in the prompt, when two accepted edits overlap, and whether an edit records where its number came from. That last one matters because line 108 requires a "labelled default, never a silent number", so provenance is a field the UI has to render. The route's request and response shapes are also unstated. The zod schema, the server route, the client apply function and the E2E mock reply all depend on this one shape, and two implementers would build different ones.
**Fix:** Specify the edit schema in the artifact. At minimum: the kind (replace or insert); the quote, plus an occurrence rule or an insertion anchor; the replacement text; a provenance field (sampled, dataset default, or author-supplied); and the order in which overlapping edits apply or how they conflict.
**Status:** upheld

### [WARN] party-architect — "Dismiss for good on that kit" needs storage, but the proposal says there is no schema change

**Quotes:** > Does it match whole words only, and is a flag a hint the author can dismiss for good on that kit?
**Quotes:** > - **Schema:** none. The accepted edits save as a normal `BrandKitPrompt` version. No migration, no new env var.
**Problem:** The open question offers a per-kit permanent dismissal as an option. A dismissal that survives a reload and applies "on that kit" has to be stored somewhere: a new column or table, a field on `BrandKitPrompt`, or text written into the prompt itself. The Impact section's "Schema: none" and the "Files affected: ~10–15" estimate both assume that option is not taken, and the proposal does not say so. If plan picks it, the schema claim and the file count no longer hold, and a migration plus a rollback script land in the same commit.
**Fix:** Either close the option in the proposal (dismissals last only for the session, or are not supported), or name where a persistent dismissal is stored and remove "Schema: none".
**Status:** upheld

### [WARN] party-architect — The colour-share number depends on a Chromium-backed sampler, with no stated test stub and no statement that it returns shares

**Quotes:** > `sampleImageColors` (`src/lib/renderer/puppeteer.ts:272`) to ground a colour-proportion rule in the real reference images. The assistant already calls it. 007 does not add a second sampler.
**Quotes:** > Unit tests for the dataset, the detector and the edit-apply logic; an E2E case for the diff review and the version it saves (through the MOCK_AI seam, no real model call)
**Problem:** The headline worked example, the canvas-share edit, rests on `sampleImageColors`, which the proposal places in the Puppeteer renderer module. Elsewhere the proposal describes it only as something that "samples colours". It never says the function returns a _proportion_, and a proportion is what a "canvas share" rule needs. If it returns a palette, either a second sampler gets written, which contradicts "007 does not add a second sampler", or the model is left to estimate a percentage from a palette, which is arithmetic placed in the model. The test plan also stubs only the model (MOCK_AI). It does not name a seam for the renderer-backed sampler on the upgrade route, so the E2E case for the share path needs real Chromium or gets skipped.
**Fix:** State what the sampler returns that yields the share, and say that code computes the share number, not the model. Name the stub the upgrade route's tests use for the sampler, or state that the E2E case runs on a kit with no reference images and covers only the labelled-default path.
**Status:** upheld

### [WARN] party-architect — Detector scope includes "layout words", but the boundary with 009's composition has no checkable rule

**Quotes:** > 007 must not write composition numbers that fight an active image style.
**Quotes:** > Adjective detection for **design instructions** (size, spacing, proportion, colour-share and layout words) with a suggested measurable replacement at authoring time
**Quotes:** > The detector may flag its vague form, but it does not own or validate the archetype data.
**Problem:** The proposal puts layout and proportion words in the detector's scope and has the dataset suggest measurable replacements for them. It also forbids writing composition numbers that "fight an active image style", yet it gives the assistant and the detector no way to know what that means at kit-authoring time. Nothing in the text says which image style is "active" when a kit is being edited, or which `designData.composition` values a suggestion must stay consistent with. A suggestion like "image fills the right 40%" is exactly what the scope invites, and nothing stops it from conflicting with a region in the composition file it sits beside. An implementer has to guess whether 007 suggestions read the composition data, skip layout numbers altogether, or ignore the constraint.
**Fix:** Turn the constraint into a rule the implementer can test. For example: layout and proportion suggestions never emit region or placement numbers; or they are checked against `designData.composition` (read-only) and dropped when they conflict. Alternatively, remove "layout words" from the detector's scope.
**Status:** upheld

### [NOTE] party-architect — The second fenced-block parser copies `extractBrandKitBlock` instead of generalising it

**Quotes:** > The ` ```brandkit ` block convention and `extractBrandKitBlock` (`assistant.ts:53-67`) as the pattern for a fenced, zod-validated reply. The upgrade reply is a new fenced block (an array of edits) in the same style, not a change to the existing block.
**Problem:** The proposal uses the existing extractor "as the pattern" for a new block, which reads as writing a second fence extractor next to the first. The two will drift on fence handling, such as a missing closing fence or several blocks in one reply, the first time one of them is fixed.
**Fix:** Turn the fence extraction into one helper keyed by tag and schema, and have both blocks call it. Leave the existing block's schema unchanged.
**Status:** upheld
