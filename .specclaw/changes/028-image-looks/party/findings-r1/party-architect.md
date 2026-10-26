### [WARN] party-architect — The `realCheck` record edits released dataset versions, which breaks the immutability rule the proposal cites

**Quotes:** > The spec sets the exact rectangles, subjects and band sizes. Existing versions are never edited (the dataset's immutability rule): STORY arrives as `versions[2]` with `current: 2`, and drafts stamped `v1` keep resolving.
**Quotes:** > - **The allow-list:** each contract carries a `realCheck` record (`{ passedOn, renders }`), written into the dataset only from the real-image check's results. Unset means unproven.
**Quotes:** > It is a tuning step and the allow-list input, never a merge gate.
**Problem:** The proposal says a contract is part of a released version that is never edited. It then puts a mutable field on that contract, to be filled in after the version ships, by an operator run that happens after the merge. One of two things must give. Either every later `realCheck` write edits a released version, which breaks the rule, or every pass needs a new `versions[n+1]`, which moves `current` and so voids the record the resolver just read (see the next finding). The proposal does not say which. It also does not say how runner output becomes a code change: whether the runner emits a patch, prints a record for a person to paste, or writes the file. So "written … only from the real-image check's results" has no mechanism behind it.
**Fix:** Keep the allow-list outside the versioned contracts, as a separate code-owned map keyed by (key, version, size) that the resolver reads. State that adding an entry does not count as a version edit. Name the hand-off format from the runner to that map.
**Status:** upheld

### [WARN] party-architect — The allow-list is keyed to the current version, but the real check covers only the 17 new contracts, so the v2 copies of Showcase and Editorial split at SQUARE and PORTRAIT can never qualify

**Quotes:** > | Showcase (`product-showcase`) | **version 2** adds STORY; SQUARE/PORTRAIT copied as is | light | SQUARE, PORTRAIT, **STORY** | the text area: calm (busy) and light-text contrast | Launch |
**Quotes:** > - `resolvePostStyle` lets a queue entry, an MCP call or an ACP call use a non-classic look **only when the contract at (key, current version, size) has a `realCheck` record**.
**Quotes:** > the 009 OP-1 runner (`.specclaw/changes/009-hero-image-design/op1/run-op1.mjs`) is extended to render **one brief per new contract** (17 hero image calls)
**Problem:** Once v2 ships, `current` is 2 for `product-showcase` and `editorial-split`. Their SQUARE and PORTRAIT contracts in v2 are byte-for-byte copies of v1, but they are new (key, version, size) tuples. The real-image check renders only the 17 new contracts: 2 STORY plus 15. So it never writes a `realCheck` for v2 SQUARE or v2 PORTRAIT, and OP-1's evidence is recorded against v1. As written, unattended Launch and Announcement posts at 1:1 and 4:5 stay `unproven-classic` for good, while the same looks at 9:16 can be allowed. The proposal does not say whether a byte-identical copy inherits the earlier version's record. The same gap applies to any future version bump: a version that only adds a size silently withdraws unattended use at every size it copied.
**Fix:** State whether a `realCheck` carries forward to an unchanged contract in a later version (for example, the key includes a content hash rather than the version number). If it does not, add the 4 copied contracts to the run and the cap.
**Status:** upheld

### [WARN] party-architect — Three different fixture counts, so the completeness test and the fixture set cannot both be built as written

**Quotes:** > - **Merge gate (deterministic):** `tests/render/` gains a synthetic pass image and a synthetic fail image per contract per size (17 contracts: 2 STORY additions plus 5 looks × 3 sizes), built like 009's `heroFixtures.ts`.
**Quotes:** > A unit test asserts that every (key, current version, size) in the dataset has both fixtures, so a new size cannot land without them.
**Quotes:** > - Dataset validation: at least one `text` region per contract; the variant key grammar `<base>-<variant>`; pass and fail fixtures for every (key, version, size).
**Problem:** The fixture set is sized at 17 contracts. Under the completeness test, every (key, current version, size) is 7 keys × 3 sizes = 21, because the v2 SQUARE and PORTRAIT contracts of the two existing looks count. The scope line says every (key, version, size), which adds both v1 versions: 25. If only 17 pairs are built, the unit test the proposal specifies fails at merge. The 4 missing pairs could be supplied by 009's existing fixtures only if those fixtures are matched to contracts by geometry rather than by version, and the proposal does not say whether 009 shipped must-fail images at all. Two implementers would build different fixture sets and different lookup keys.
**Fix:** State the fixture identity (by key+version+size, or by contract content) and the exact set. State whether 009's existing fixtures are reused for the copied v2 contracts and for v1, and whether a must-fail image is added for them.
**Status:** upheld

### [WARN] party-architect — The `<base>-<variant>` key grammar cannot be checked by a test, because the bases and the new standalone looks already contain hyphens

**Quotes:** > | 26 | visionary: two key grammars in the Showcase family | A variant key is `<base>-<variant>`: `product-showcase-light`, `editorial-split-light`. A test enforces it |
**Quotes:** > - Five new looks (`product-showcase-light`, `editorial-split-light`, `abstract-forms`, `full-bleed-scene`, `spotlight`), each at SQUARE, PORTRAIT and STORY.
**Problem:** Every base key (`product-showcase`, `editorial-split`) and two of the new non-variant looks (`abstract-forms`, `full-bleed-scene`) are themselves hyphenated. A test that splits on `-` cannot tell that `full-bleed-scene` is a standalone look and `product-showcase-light` is a variant. If the test instead requires the prefix to be an existing key, it is satisfied by any key that happens to start with one, and it says nothing about `abstract-forms`. The proposal does not say what makes a key a variant, so the test "that enforces it" has no defined input. Insights grouping by family and 025 would read the same ambiguity.
**Fix:** Make variance explicit data on the look, such as `variantOf: 'product-showcase'`. The test then asserts `key === variantOf + '-' + suffix`, with the suffix drawn from a closed list (`light`).
**Status:** upheld

### [WARN] party-architect — The STORY exclusions and the unattended-classic gate that must change are left to discovery ("if any")

**Quotes:** > - **The 9:16 gate lifts by data.** The wizard picker and `POST /api/briefs` already ask the dataset which sizes a look supports (`imageStyleOptions`); adding STORY rows enables them. The spec lists every place that hard-codes "not STORY" and removes it.
**Quotes:** > - Removing hard-coded STORY exclusions (wizard, briefs route, queue modal, if any).
**Quotes:** > 3. **Scheduled, MCP and ACP posts are always classic** (`UNATTENDED` in `resolve.ts:93`).
**Problem:** In one paragraph the proposal says the picker and the briefs route are data-driven, then lists those same two places as possibly holding hard-coded exclusions, "if any". The blast radius for the 9:16 lift is therefore unknown at proposal time. The `size-classic` downgrade at `resolve.ts:100-104` is not said to be data-driven either. If it is a literal STORY check, it is one more co-change; if it is data-driven, it becomes unreachable once every look declares STORY. For the unattended rule, the proposal names only `UNATTENDED` in `resolve.ts:93` and does not say that this is the only place scheduled, MCP and ACP runs are forced to classic. If the runner or the tool adapters also force classic, the resolver change half-lands: the resolver allows a proven look and a later step discards it. An unnamed co-change is the half-landed merge this probe exists to catch.
**Fix:** List in the proposal (or require the spec to list by file) every STORY literal and every unattended-to-classic force in the pipeline, and state whether each is removed or kept. Say what happens to `size-classic` once all looks declare STORY.
**Status:** upheld

### [WARN] party-architect — New note `unproven-classic` with no named consumers

**Quotes:** > Otherwise it is classic, with a new note `unproven-classic`.
**Quotes:** > A 9:16 brief is always classic, and `resolvePostStyle` downgrades a Launch or Announcement default to classic with the `size-classic` note (`src/lib/postStyles/resolve.ts:100-104`).
**Problem:** The resolver's notes are a vocabulary shared with whatever reads them. The proposal itself shows `size-classic` is one, but it names no reader of the new value: not the draft notice, the queue entry line, the MCP and ACP tool responses, or any analytics field that carries the note. Every place that switches on the note set must handle the new value in the same commit, or it falls into a default branch. The proposal enumerates the producer and none of the consumers.
**Fix:** Name every reader of the resolver's notes and say what each shows for `unproven-classic`, or state that the notes set is closed and read in one place.
**Status:** upheld

### [WARN] party-architect — Fallback-per-look on insights may become a second record of the look outcome that the composition stamp already holds

**Quotes:** > - **Fallbacks are seen** (finding 19): the look outcome per draft (styled, or fell back with its reason) is shown per look key on `/admin/insights`, from events 006 already emits or one new field on them. The spec decides which.
**Quotes:** > 5. **Insights:** is a fallback-rate-per-look section on `/admin/insights` wanted now, or is the composition stamp enough until there is usage?
**Problem:** The proposal itself says the composition stamp already records the per-draft look outcome. Adding "one new field" on an analytics event writes the same fact a second time, from a different writer, on a different retention schedule. The two diverge on the first path that stamps without emitting, or emits without stamping. The source of the in-scope insights section is left as "the spec decides which". So the shared contract (which field is the truth for "fell back, and why") is undecided at proposal time.
**Fix:** Name one source of truth for the look outcome. If an event field is added, state that it is derived from the stamp at the same write site, so there is a single writer.
**Status:** upheld

### [WARN] party-architect — The unattended allow-list's "allowed" branch ships with no data to test against

**Quotes:** > It runs locally on a scratch database, as OP-1 did. It is a tuning step and the allow-list input, never a merge gate.
**Quotes:** > - The resolver's unattended rule (the allow-list instead of always classic) and the `unproven-classic` note.
**Problem:** The real check runs after the merge, on the user's decision, so the dataset ships with no `realCheck` record set. Because the resolver reads the code-owned dataset, the branch where an unattended surface gets a styled look has no real data at merge. A unit or mock E2E test cannot exercise it unless the resolver takes the allow-list as an input or the tests can swap the dataset. The proposal names no such seam. As written, only the `unproven-classic` branch can be tested deterministically, and the path finding 19 exists for is first exercised in production.
**Fix:** Pass the allow-list into `resolvePostStyle` as an argument, or put it behind an injectable lookup, and name the test that drives a queue, MCP or ACP run through a proven contract with a fixture allow-list.
**Status:** upheld

### [NOTE] party-architect — A one-off change-folder script becomes the only producer of a product dataset field, and the hard cap lives in that untested script

**Quotes:** > the 009 OP-1 runner (`.specclaw/changes/009-hero-image-design/op1/run-op1.mjs`) is extended to render **one brief per new contract** (17 hero image calls), plus **at most one re-run per failing contract** after tuning. **Hard cap: 34 hero image calls**; the runner refuses to go past it.
**Problem:** The runner lives in 009's change-history folder. This proposal makes it the source of the `realCheck` allow-list for 027b, and through the vocabulary it calls architectural ("025 all depend on"), for later changes too. Placing a recurring producer of a product contract inside a closed change's folder puts the seam in an odd spot. The cap is enforced only inside it, with no stated test.
**Fix:** Move the runner to `scripts/` (or similar) as a maintained tool with a unit-tested cap counter. Or state that each change copies it, and accept the drift.
**Status:** upheld
