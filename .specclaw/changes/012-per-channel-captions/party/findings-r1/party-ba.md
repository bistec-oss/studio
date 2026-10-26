### [WARN] party-ba — Premise rests on a model behaviour the proposal itself calls unstructured, with no evidence of how often it occurs

**Quotes:**

> the model tends to answer with its own `**INSTAGRAM:** … **LINKEDIN:** …` blocks. Nothing parses them.
> (010's proposal says generation "currently writes `INSTAGRAM:` / `LINKEDIN:` sections". The code does not. That is model behaviour, not a format, and this change replaces it.)
> **Problem:** Problem 1 ("a LinkedIn post carries the Instagram caption") depends on how often the model emits sectioned output. "Tends to" is asserted with no source: no sample of drafts, no count, no published post. The proposal's own text concedes it is unreliable model behaviour, and the migration fallback ("Otherwise the whole text becomes both the Instagram and the LinkedIn caption") assumes many drafts have no headers. So the incidence is unknown. Problems 3 and 4 are independent and real, but Problem 1 is the stated bug and is unmeasured.
> **Fix:** Cite what was observed (how many published posts or drafts carried both sections, and from where), or restate Problem 1 as "no per-channel control exists" without a prevalence claim.
> **Status:** upheld

### [WARN] party-ba — Two stated goals have no falsifiable acceptance criterion

**Quotes:**

> The markdown `**` markers are published literally, since neither platform renders Markdown.
> WhatsApp: short, `*bold*` / `_italic_` only (never Markdown `**`), link in the body.
> Instagram: hook first, hashtags at the end, up to 2,200 characters.
> **Problem:** The listed tests check structure: three captions exist, LinkedIn gets only its caption, one panel regenerates. Nothing checks the per-channel qualities that justify three separate briefs: no `**` in any output, WhatsApp short, hashtags at the end, LinkedIn with few or none. The mock AI returns canned text, so the E2E cannot fail on prompt quality. Only the extractor's unit tests touch content, and they test parsing, not the style rules. The claim that this "replaces" model behaviour is therefore unverified at ship time. "Short" for WhatsApp also has no stated bound in the brief. The 1,000-character figure appears only in the decisions section and is a UI guide.
> **Fix:** Add criteria that can fail, such as a validator that rejects or strips `**` and a measurable WhatsApp length bound. Alternatively, state that style quality is unverified.
> **Status:** upheld

### [NOTE] party-ba — "Caption" is used for two different things, and the migration fallback duplicates one caption across two channels without saying who sees it

**Quotes:**

> Otherwise the whole text becomes both the Instagram and the LinkedIn caption.
> The design agent gets one caption as on-image text.
> **Problem:** Two readings of "caption" would change the build. In the product sense it is the post text per channel. In Solution 5 it is the on-image text, which the Decisions section later replaces with a separate "headline". Solution 5 and the Open Question on this were not reconciled with the Decisions section, so a builder reading top to bottom could feed the Instagram caption to the design. The migration also makes old drafts publish an identical Instagram-style caption to LinkedIn. That is exactly the cross-channel contamination Problem 1 describes, now written into the data. It assumes users will notice and edit it.
> **Fix:** Mark Solution 5 and the open questions as superseded by the Decisions section. State whether migrated drafts get a visible "not channel-tailored" indicator.
> **Status:** upheld
