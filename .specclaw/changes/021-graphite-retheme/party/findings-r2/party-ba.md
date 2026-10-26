### [WARN] party-ba — The user's motive for the change is never stated, so "the problem" is a preference with no acceptance test

**Quotes:**

> The user wants this system to look different from the fork. On 2026-10-18 the user picked **study A, Graphite**, from the same three 011 studies
> Folio is not just a token file. It reaches 67 files under `src/`:
> **Problem:** The Problem section describes the cost of the existing state (67 files) but not what hurts. The only stated reason is "look different from the fork", and that is satisfied by any change. A different direction (Graphite) was picked, but nothing says what Graphite is meant to fix, such as readability, density or brand distance. The proposal has no Acceptance Criteria section. Its only checkable bars are "Contrast must meet the same thresholds as 011" and a "full clean mock E2E". Neither says when the screens look like Graphite. A reviewer cannot fail "restyle every screen" at ship time, so the main claim goes unverified.
> **Fix:** State the actual driver in one sentence. Add falsifiable criteria, for example no Folio-specific tokens, fonts or classes remain under `src/` (grep returns zero). Also require before/after captures of every listed screen in both themes, matched to the study.
> **Status:** upheld

### [WARN] party-ba — Quantities used to size and risk the change are asserted, and two of them disagree

**Quotes:**

> Folio is not just a token file. It reaches 67 files under `src/`:
> Size: architectural. The design system is an interface every later UI change depends on, and the change spans 67+ files.
> **Files affected:** about 80 (estimated), including tests and docs.
> `src/app/globals.css` holds the Folio semantic tokens (66 custom properties).
> **Problem:** The 67-file and 66-property counts come with no method, such as a grep pattern or script. "67 files" is also the count of files that reference Folio, and the proposal treats that as the number of files to restyle. The counts are then used to justify the "architectural" size and "medium" risk. The "about 80" estimate is not tied to the 67 either. The proposal does not say whether the 13 extra files are the tests and docs it lists, or other source files.
> **Fix:** Cite how the 67 was counted, for example the grep or command. Reconcile it with "about 80", or drop the figure from the sizing rationale.
> **Status:** upheld

### [WARN] party-ba — "Look different from the fork" and "keep the structure the fork built" pull in opposite directions

**Quotes:**

> The user wants this system to look different from the fork.
> Swap the visual direction to Graphite, and keep the structure the fork built: the semantic token layer, the primitives, the 014 accessibility work and the opaque-surface rule.
> **Problem:** If the goal is visual distance from the fork, the proposal never says how much distance counts. The fork's primitives, layout, screens and token architecture all stay, so a user comparing the two would see only a reskin. Graphite is also one of the same three studies the fork's team put forward. The proposal does not establish that this reskin satisfies the stated want. A different pick from the same candidate set may not look different enough to the user.
> **Fix:** Say what "different" means, for example the same palette and typography but different structure. Alternatively, record the user's confirmation that a reskin of this kind is what they want.
> **Status:** upheld

### [NOTE] party-ba — "Graphite", "the study" and "Graphite carry-over notes" are treated as a complete spec, but the source is a file not yet checked

**Quotes:**

> Replace the Folio values in `globals.css` with the Graphite study's token block, for light and dark
> Contrast must meet the same thresholds as 011 in both themes.
> Do the same notes apply to Graphite? Planning reads the T2 report and decides.
> **Problem:** The token block and "the same thresholds as 011" are used as the definition of done. The proposal does not say whether the Graphite study's own token block passes those thresholds. The 011 T2 carry-over notes included `--line-subtle` and an amber `scheduled` colour, and those may mean the study's tokens need changing. If so, "replace with the study's block" and "meet the thresholds" can conflict. The proposal defers the check to planning, but the scope claim in item 1 depends on its answer.
> **Fix:** Confirm before build that the study's tokens pass the contrast tests. State which wins if they don't.
> **Status:** upheld

### [NOTE] party-ba — Premise that E2E selectors may break on small-caps labels is asserted, while "no copy change" is declared

**Quotes:**

> E2E selectors may key on visible text such as small-caps labels.
> Any behaviour, API, schema or copy change.
> **Problem:** Small-caps is a CSS rendering, so the DOM text does not change when it goes away. The risk as written mixes two things, CSS text transform and the label text itself. A selector that keys on uppercase text would only break if the transform is applied in the string rather than in CSS, and the proposal does not say which. This affects whether "no copy change" is true.
> **Fix:** Say whether the labels are uppercased in the source strings. Grep the E2E for such selectors before assigning a risk level.
> **Status:** upheld
