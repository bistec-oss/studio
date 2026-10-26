### [BLOCK] party-ba — The wording scan that drives group G is asserted, not evidenced

**Quotes:**

> The **wording scan** (2026-10-26, read-only, about 20 MEDIUM findings and a long LOW tail) found UI text that misleads or is stale.
> Fix every MEDIUM finding of the 2026-10-26 scan and its LOW naming drift, using the user's glossary:
> **Problem:** Group G is the widest group, and it is scoped to "every MEDIUM finding" and "a long LOW tail". The proposal does not list the findings, link the scan output, or give a count for LOW. "Every" has no checkable denominator, and "about 20" is approximate. The proposal's own text gives only a dozen examples. The proposal is unchanged since round 1, so the objection stands.
> **Fix:** Commit the scan as a file in the change directory, with one numbered line per finding and its file and string. Scope group G to that list. Add an acceptance criterion: "each listed finding is fixed or recorded as dropped with a reason".
> **Status:** upheld

### [WARN] party-ba — The font problem is partly stated as a bug that is not shown, and the catalogue is a proxy for the user's need

**Quotes:**

> The font picker is a fixed list of 100. Instrument Serif is missing, and `googleFontsUrl` always asks for weights 400 to 700, which Google refuses for single-weight families such as Instrument Serif.
> The full Google Fonts catalogue, as a committed metadata snapshot (family, category, real weights and styles, scripts) with a refresh script.
> **Problem:** The pain is that Instrument Serif and JetBrains Mono cannot be used, and that Sinhala is not covered. The fix is the whole catalogue, a larger answer than the pain. The "Google refuses" claim has no source. It is unclear which font is actually missing, because the repo notes say the Hearts Academy kit already uses JetBrains Mono. It is also not evidenced that Sinhala posts rendered wrongly, since the OS fallback font already covers Sinhala.
> **Fix:** Cite the observed failure: the font tried, the URL requested, and Google's response. State whether Sinhala posts have rendered wrongly. Add an acceptance criterion that names the specific fonts and checks that each renders.
> **Status:** upheld

### [WARN] party-ba — "Apply to image" claims a 32-of-35 match rate, but the proposal's own text calls the sample non-representative

**Quotes:**

> The 030 measurement (35 real Path B drafts) found one innermost element holding the headline in 32 of 35.
> the match rate re-measured under the final rule (the sample called non-representative), plus the seeded Path A templates measured.
> **Problem:** The case for Apply rests on a figure the proposal itself discredits. No threshold is stated for the feature to be worth shipping. The re-measure is a requirement inside the build, not a gate before it, so the premise is checked after the work is committed.
> **Fix:** Make the re-measurement the first task of group A, with a stated threshold and a stated fallback if the rate falls below it. Flag the sample's limits wherever 32 of 35 is cited.
> **Status:** upheld

### [WARN] party-ba — Acceptance criteria are not stated, and several stated goals have no way to fail

**Quotes:**

> Groups A to H above, each with unit tests, render fixtures where a check runs in Chromium, and E2E on the mock seams.
> Existing personal OpenAI keys keep working with no re-entry (a data migration carries them).
> A **typography** part of the brand-kit design dataset: font pairing and type scale rules, measurable, with the detector and Improve/Upgrade covering them.
> **Problem:** The proposal has no acceptance criteria, only "each with unit tests". "Keep working with no re-entry" has no observation that would show failure. "The badge clears only when the image really shows the new headline" has no named test. The typography ranges are deferred to a plan, so they do not exist yet.
> **Fix:** Add one falsifiable acceptance line per group. For example: "a pre-existing personal OpenAI key row resolves and generates after migration"; "after Apply the stamp is verified:true and the badge is absent; a corrupted splice leaves htmlContent byte-identical".
> **Status:** upheld

### [WARN] party-ba — The Spotlight "busy" failure is attributed to the contract without evidence, and the pass bar is thin

**Quotes:**

> **Spotlight failed OP-028 on SQUARE** (`busy` twice), so Promotion and Milestone stay classic.
> A new `spotlight` SQUARE contract (v2) aimed at the `busy` failure, its three fixtures, and an operator real-image check OP-031: the `run-look-check.mjs` runner and ledger, a cap of **4** image calls, and 2 accepted renders to pass.
> **Problem:** The failure is two `busy` results on one size. The cause could be the contract geometry, the pixel-check threshold, or the model's behavior, and the proposal does not rule out the last two. A contract change would not fix a threshold fault. "2 accepted renders" out of 4 calls is a thin bar for changing two post styles' default look. It is also not stated whether failed attempts count against the pass.
> **Fix:** Cite the OP-028 SQUARE busy evidence (which regions, by how much). Say why a contract change addresses it. State a falsifiable pass rule that counts the failed attempts.
> **Status:** upheld

### [WARN] party-ba — "Brief"/"post", "Captions"/"Images" and "image generation key" are load-bearing terms with two readings

**Quotes:**

> "post", not "brief", in the UI;
> Routes, API fields and DB names do not change (`/brief`, `Brief` stay).
> Show the slot names as "Captions" / "Images".
> It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider.
> **Problem:** The glossary rule "post, not brief" has no list of where it applies and where it does not, so a blanket replacement could mislabel the input form. "Captions" may misdescribe the COPY slot, because the repo notes say that slot also drives brand-voice drafting. The proposal gives no precedence when a user holds a personal Gemini key and the team has a default OpenAI image row, or the reverse. Two builds are possible.
> **Fix:** Give each glossary rule a short applies and does-not-apply list. State the precedence between a personal key's provider and the team image row.
> **Status:** upheld

### [NOTE] party-ba — Assumed user behavior: operators will read the confirm step

**Quotes:**

> Styling inside the element (an accent span, line breaks) flattens to plain text; the confirm step says so.
> each part shown before you accept.
> **Problem:** The proposal relies on a confirm message to make users accept that styling is lost. It does not establish how often styled headlines occur, and the 32-of-35 count says nothing about child elements inside the headline element. The assumption is probably safe, but losing an accent span is a visible design change.
> **Fix:** Report the share of the 35 drafts whose headline element contains child elements.
> **Status:** upheld
