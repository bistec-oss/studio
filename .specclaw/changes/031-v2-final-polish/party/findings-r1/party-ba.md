### [BLOCK] party-ba — The wording scan that drives group G is asserted, not evidenced

**Quotes:**

> The **wording scan** (2026-10-26, read-only, about 20 MEDIUM findings and a long LOW tail) found UI text that misleads or is stale.
> Fix every MEDIUM finding of the 2026-10-26 scan and its LOW naming drift, using the user's glossary:
> **Problem:** Group G is the widest group (about 80 to 120 files, E2E locator risk), and it is scoped to "every MEDIUM finding" and "a long LOW tail". The proposal does not list the findings, link the scan output, or give a count for LOW. The scan is a conversation artifact, not a cited file. The "about 20" is approximate and the LOW tail has no number. The "every" requirement therefore has no checkable denominator. The scan also calls itself read-only, so none of the findings has been verified as a live defect. The proposal gives a dozen examples and nothing else to build or verify against.
> **Fix:** Commit the scan as a file, for example `findings.md` in the change directory, with one numbered line per finding and its file and string. Scope group G to that numbered list. Add an acceptance criterion of the form "each listed finding is fixed or recorded as dropped with a reason".
> **Status:** upheld

### [WARN] party-ba — The font problem is partly stated as a bug that is not shown, and the catalogue is a proxy for the user's need

**Quotes:**

> The font picker is a fixed list of 100. Instrument Serif is missing, and `googleFontsUrl` always asks for weights 400 to 700, which Google refuses for single-weight families such as Instrument Serif.
> The full Google Fonts catalogue, as a committed metadata snapshot (family, category, real weights and styles, scripts) with a refresh script.
> **Problem:** The pain is that Instrument Serif and JetBrains Mono cannot be used, and that Sinhala text is not covered. The proposed fix is the whole catalogue, which is a much larger answer than the pain. The "Google refuses" claim is asserted with no source. JetBrains Mono appears in the user decisions as a font to enable, yet the same repo notes say the Hearts Academy kit already uses JetBrains Mono. So it is unclear which font is actually missing. The proposal never says whether the failure is the picker list or the URL weights, so it does not say which of the two the user hit. "Posts are written in Sinhala" is also not evidenced. The only Sinhala evidence is the OS fallback font in the image, which implies Sinhala already renders.
> **Fix:** Cite the observed failure: the font tried, the URL requested, and the Google response. State whether Sinhala posts have actually rendered wrongly, as opposed to wanting more choice. Add an acceptance criterion that names the specific fonts and checks that each renders.
> **Status:** upheld

### [WARN] party-ba — "Apply to image" claims a 32-of-35 match rate, but the proposal's own text calls the sample non-representative

**Quotes:**

> The 030 measurement (35 real Path B drafts) found one innermost element holding the headline in 32 of 35.
> the match rate re-measured under the final rule (the sample called non-representative), plus the seeded Path A templates measured.
> **Problem:** The case for building Apply rests on 32 of 35, which is about 91%. The same proposal says that sample is not representative, and that Path A templates have not been measured at all. The proposal does not state the match rate it needs for the feature to be worth shipping. It also does not say what happens to users in the 3 of 35 (or more) failures beyond a refusal. Re-measuring appears only as a requirement inside the build. It is not a gate that precedes the build, so the premise is checked after the work is committed.
> **Fix:** Make the re-measurement a first task with a stated threshold, and say what the group does if the rate falls below it. Do not cite 32 of 35 as the justification unless the proposal flags the sample's limits there too.
> **Status:** upheld

### [WARN] party-ba — Acceptance criteria are not stated, and several stated goals have no way to fail

**Quotes:**

> Groups A to H above, each with unit tests, render fixtures where a check runs in Chromium, and E2E on the mock seams.
> Existing personal OpenAI keys keep working with no re-entry (a data migration carries them).
> A **typography** part of the brand-kit design dataset: font pairing and type scale rules, measurable, with the detector and Improve/Upgrade covering them.
> **Problem:** The proposal contains no acceptance criteria. It has only "each with unit tests". The goals that would need them are:

- "keep working with no re-entry" has no observation that would show a key lost or a Gemini key rejected;
- "The badge clears only when the image really shows the new headline" is the central Apply claim, and it has no named test;
- "Fix every MEDIUM finding" has no checkable list (see the first finding);
- the typography entries are left to a plan that will "cite" ranges, which means the numbers do not exist yet.
  It is therefore unknown what a pass looks like for most of the groups.
  **Fix:** For each group, add one falsifiable acceptance line. For example: "a pre-existing personal OpenAI key row resolves and generates after migration"; "after Apply the stamp is verified:true and the badge is absent; a corrupted splice leaves htmlContent byte-identical".
  **Status:** upheld

### [WARN] party-ba — The Spotlight "busy" failure is attributed to the contract without evidence, and the pass bar is thin

**Quotes:**

> **Spotlight failed OP-028 on SQUARE** (`busy` twice), so Promotion and Milestone stay classic.
> A new `spotlight` SQUARE contract (v2) aimed at the `busy` failure, its three fixtures, and an operator real-image check OP-031: the `run-look-check.mjs` runner and ledger, a cap of **4** image calls, and 2 accepted renders to pass.
> **Problem:** The failure is two `busy` results on one size, from a model image. The proposal assumes the cause is the contract geometry. It could equally be the pixel-check threshold or the model's behavior, and the proposal does not rule these out. A new contract would not fix a threshold fault. The pass bar is "2 accepted renders" out of 4 calls, and it is not stated whether those two must come from separate attempts or whether a 2-of-4 result can be a fluke. Moving two post styles to spotlight on that evidence changes the default look for those styles, and the proposal gives no reason to trust two accepts. The failure mechanism is unexamined, so the fix is unverified.
> **Fix:** Cite the OP-028 SQUARE busy evidence (which regions were busy and by how much). Say why a contract change, not a threshold change, addresses it. State the pass rule as a falsifiable bar tied to the same contract, with the failed attempts counted.
> **Status:** upheld

### [WARN] party-ba — "Brief"/"post", "goal"/"post style" and "image generation key" are load-bearing terms with two readings

**Quotes:**

> "post", not "brief", in the UI;
> Routes, API fields and DB names do not change (`/brief`, `Brief` stay).
> Show the slot names as "Captions" / "Images".
> It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider.
> **Problem:** Three terms in the build are ambiguous.

- "Post, not brief" is a glossary rule with no test for where a "brief" in UI text is the correct concept. A brief is the input form, and a post is the output. A blanket replacement could make the UI wrong, for example by calling the wizard step a "post" when it collects a brief. The rule is unclear for the plain-English wizard.
- "Captions / Images" names the slots, but the same dialog describes the COPY slot as also driving brand-voice drafting (per the repo notes). A "Captions" label may misdescribe it. The proposal does not say whether the label means the slot's function or its output.
- "Generates with that provider": the personal key serves "either provider", but the proposal does not say what happens when a user holds a personal Gemini key and the team has a default OpenAI row, or the reverse. It names no precedence between providers, so two builds are possible.
  **Fix:** Give each glossary rule a short list of cases where it applies and does not apply. State the precedence between a personal key's provider and the team image row.
  **Status:** upheld

### [NOTE] party-ba — Assumed user behavior: operators will read the confirm step and the new-style proposals

**Quotes:**

> Styling inside the element (an accent span, line breaks) flattens to plain text; the confirm step says so.
> each part shown before you accept.
> **Problem:** The proposal relies on the user reading a confirm message to accept that styling is lost. It does not establish that users read it or how often styled headlines occur. The 32-of-35 measure already counted the headline as one element, but it does not count styled spans inside it. The assumption is probably safe, but the loss of an accent span in a brand post is a visible design change, and the rate of its occurrence is unknown.
> **Fix:** Report the share of the 35 drafts whose headline element contains child elements, so the cost of flattening is known.
> **Status:** upheld
