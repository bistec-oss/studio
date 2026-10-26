### [WARN] party-ba — Premise rests on a model behaviour the proposal itself calls unstructured, with no evidence of how often it occurs

**Quotes:**

> the model tends to answer with its own `**INSTAGRAM:** … **LINKEDIN:** …` blocks. Nothing parses them.
> (010's proposal says generation "currently writes `INSTAGRAM:` / `LINKEDIN:` sections". The code does not. That is model behaviour, not a format, and this change replaces it.)
> **Problem:** Problem 1 depends on how often the model emits sectioned output. "Tends to" has no source: no sample of drafts, no count, no published post. The proposal concedes this is unreliable model behaviour. Its migration fallback ("Otherwise the whole text becomes both the Instagram and the LinkedIn caption") also assumes many drafts have no headers, so the incidence is unknown. Problems 3 and 4 are independent and real. Problem 1 is the stated bug and is unmeasured. The 2026-10-09 Decisions section settles storage and headline but does not touch this.
> **Fix:** Cite what was observed (how many published posts or drafts carried both sections, and from where), or restate Problem 1 as "no per-channel control exists" without a prevalence claim.
> **Status:** upheld

### [WARN] party-ba — Two stated goals have no falsifiable acceptance criterion

**Quotes:**

> The markdown `**` markers are published literally, since neither platform renders Markdown.
> WhatsApp: short, `*bold*` / `_italic_` only (never Markdown `**`), link in the body.
> Instagram: hook first, hashtags at the end, up to 2,200 characters.
> **Problem:** The listed tests check structure only: three captions exist, LinkedIn receives only its caption, one panel regenerates. Nothing can fail on the per-channel style rules that justify three separate briefs: no `**` in any output, WhatsApp short, hashtags at the end, few or no hashtags on LinkedIn. The mock AI returns canned text, so the E2E cannot fail on prompt quality. The 1,000-character WhatsApp figure was added in Decisions, but as a soft guide with a warning and no block. That gives "short" a UI hint, not a testable bound. The `**` rule has no enforcement point.
> **Fix:** Add criteria that can fail, such as a boundary validator that rejects or strips `**` on WhatsApp and a measurable WhatsApp length bound. Alternatively, state that style quality is unverified at ship time.
> **Status:** upheld

### [NOTE] party-ba — "Caption" is used for two different things, and the migration fallback duplicates one caption across two channels without saying who sees it

**Quotes:**

> Otherwise the whole text becomes both the Instagram and the LinkedIn caption.
> The design agent gets one caption as on-image text.
> **Problem:** The Decisions section settles the on-image text question with a separate headline. That resolves the ambiguity in intent. However, Solution 5 and the matching Open Question still read "feed the Instagram caption" and are not marked superseded. A builder reading top to bottom meets two contradictory instructions. The migration fallback still writes the same Instagram-style text into LinkedIn for old drafts. That is the cross-channel contamination Problem 1 describes, now stored in the data. The proposal does not say whether users are shown that those drafts are not channel-tailored.
> **Fix:** Mark Solution 5 and the stale Open Questions (storage, on-image text, revisions, wizard wording) as resolved by Decisions. State whether migrated drafts get a visible "not channel-tailored" indicator.
> **Status:** upheld
