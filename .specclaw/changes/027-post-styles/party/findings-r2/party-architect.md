### [BLOCK] party-architect — Style-to-defaults resolution is placed in the wizard pre-fill, but three non-wizard surfaces need the same resolution and no shared resolver is named

**Quotes:** > - a **default tone**: the Tone picker stays and is pre-filled; the user can change it;
**Quotes:** > - a campaign's **default post style**, which pre-fills the wizard the way its default tone does today;
**Quotes:** > - **scheduled queue entries**: they carry a post style, which means they get an image style too (today they are always classic);
**Quotes:** > - **MCP / ACP generate**, which accept a post style key.
**Quotes:** > One additive migration (a post-style column on the brief, the queue entry and the campaign); old briefs have none and behave as today.
**Problem:** The artifact describes turning a post style into a tone and an image style only as a wizard pre-fill. That is client-side behaviour, and the user's override is stored on the brief. Scheduled entries, MCP and ACP have no wizard, yet they "get an image style too". The migration adds only a post-style column to the queue entry, so the queue's image style (and tone) must be worked out from the style somewhere else, probably at generation time. As written, that makes at least two resolvers of the same mapping: the wizard's pre-fill and a server-side derivation for queue, MCP and ACP. They will diverge on precedence, which the artifact never states. A campaign can carry both a default tone and a default post style whose own default tone differs. Which wins? Does an explicit MCP tone or imageStyle input override the style? Does MCP/ACP still force classic? The scope lifts the classic force only for "scheduled entries may now use an image style". A wizard brief and a queue entry with the same style and campaign can come out with different tone and image style. Round 2: party-ba's precedence finding and party-security's unattended-surface findings confirm that the precedence and the per-surface image-style rule are both undefined. One named resolver is the place to define both, so this finding stands.
**Fix:** Name one pure server-side resolver in the post-style dataset: (style, campaign defaults, explicit inputs, path, aspect ratio) → (goal, tone, imageStyle). Have the wizard pre-fill, the briefs route, the queue runner, MCP and ACP all call it. State its precedence order and whether MCP/ACP lift the forced-classic rule.
**Status:** upheld

### [WARN] party-architect — The goal column keeps a writer of its own, and a no-style brief has no goal source once the picker is gone

**Quotes:** > Replace the **Goal** picker with a **Post style** picker.
**Quotes:** > - Storing the post style on the brief (and on scheduled queue entries); the goal is derived from it
**Quotes:** > - Removing the `goal` column (it stays, derived from the style)
**Quotes:** > 3. **A "General" style** for posts that fit none of the seven: needed, or does "no style" (today's Goal/Tone behaviour) cover it?
**Problem:** After this change `goal` is a stored column that is also implied by `postStyle`. The artifact does not say who writes it: the client after deriving, or the server from the style key. It also does not say whether the brief, queue, MCP and ACP inputs still accept a `goal` field, or what happens when a caller sends a goal that contradicts its style. If any of them still accepts one, the column has two writers. Open Question 3 also leans towards "no style" keeping "today's Goal/Tone behaviour". But the Goal picker is removed, so a new no-style brief has no input that sets its goal. The leaning and the replacement cannot both hold. Two implementers would build different input contracts. Round 2: party-visionary (long-horizon meaning of the column) and party-po (keeping the picker) reached the same contradiction from their own lenses. This finding keeps the merge-time part: which writer, and which input fields.
**Fix:** State that the server is the only writer of `goal`, derived from the style key, and that `goal` is rejected (or ignored, said explicitly) as an input on every brief-creating surface. Resolve OQ3 so that a no-style brief has a defined goal value, or keep the Goal picker visible only when no style is chosen.
**Status:** upheld

### [WARN] party-architect — The checklist reaches four first-generation prompt builders; the regenerate and refine rebuilds are neither in scope nor excluded

**Quotes:** > - Prompts: caption, Path B design, background, and the Path A fill receive the style's checklist; prompt versions bumped
**Quotes:** > On Path A (template) the style drives the caption's goal, tone and checklist, and the design fill gets the checklist's on-image rules; the template still fixes the look.
**Problem:** The co-change list names the prompts that run at first generation. A draft is then reworked through further model passes: regenerate caption, regenerate design and refine. The artifact names none of them, in scope or out of scope. If a later pass builds its prompt along its own path, the facts rules ("never invent salary", "date only if stated") apply at generation and drop away on the next pass. Whether these paths are covered is left to the implementer. No round-1 finding addresses this.
**Fix:** List each regenerate and refine prompt site as receiving the checklist, or exclude it in Out of Scope with the reason.
**Status:** upheld

### [WARN] party-architect — The new looks change what the real-pixel check measures, but the artifact treats them as dataset rows

**Quotes:** > 3. **The image styles are narrow.** 009 shipped two (`product-showcase`, `editorial-split`), dark-area only, and **neither supports 9:16**, so Story posts can never use one.
**Quotes:** > - **Five new image styles:** light variants of Showcase and Editorial split (light area, dark text), plus three new looks: **Abstract brand forms**, **Full-bleed scene** and **Spotlight** (centred subject, top headline band, bottom CTA band).
**Quotes:** > - **9:16 for every image style**, including the two existing ones (each gets a new contract version with a STORY layout; existing versions are immutable).
**Problem:** The artifact says the shipped styles are "dark-area only". The light variants need the pixel check to judge the opposite polarity (a light area under dark text). A full-bleed scene has no reserved image band, so whatever the check verifies for it is a new kind of rule, not new numbers. Each of these is a change to the check itself, and to the stamp's vocabulary for it, landing in the same commit. The artifact counts them only as "new archetypes". Separately, the problem statement says Story posts "can never use one". Whatever enforces that today, in the wizard picker and in brief validation, must be lifted in the same commit, and the scope does not name it. Without that, the new STORY contracts are unreachable. Round 2: party-security's fail-open finding is the hostile-failure side of the same gap. This finding is the co-change side, so both stand.
**Fix:** Under Scope, list the pixel-check changes (light polarity, a full-bleed rule) and the removal of the existing 9:16 gate in the wizard and on the brief input as co-changes.
**Status:** upheld

### [WARN] party-architect — "Passes the real-pixel check at every size" has no deterministic test seam named for five new looks across three sizes

**Quotes:** > each passing the real-pixel check at every size it declares
**Quotes:** > - Unit and E2E coverage; a real-model OP check of the new looks (like 009 OP-1), run by the user's decision
**Quotes:** > New image contracts may fail the pixel check often until tuned, but a failure already falls back to classic with no second image call.
**Problem:** The only check named against real images is an optional OP run that needs a live model. The mock E2E path cannot test pixels, because the mocks never produce real images. The artifact does not say what images the scope line's check runs against at merge. For seven contracts across up to three sizes (two existing, each gaining STORY, plus five new), it names no fixture set per contract and size. Without one, the scope line is unverifiable at merge, and the check could fail on every new look in CI without anyone noticing. The fallback to classic hides this, so the E2E suite still passes. Round 2: party-security's fix (a negative fixture per archetype) fits into the fixture set asked for here.
**Fix:** Name a deterministic fixture set (synthetic pass and fail images per contract per size) run by the render harness. Make that the merge-time gate, and keep the real-model OP check as a separate tuning step.
**Status:** upheld

### [WARN] party-architect — The post-style dataset is called "versioned", but nothing records which version a brief used

**Quotes:** > **Owned in code (user decision):** the post styles are a versioned, client-safe dataset next to the image styles, like 009 and 007.
**Quotes:** > One additive migration (a post-style column on the brief, the queue entry and the campaign); old briefs have none and behave as today.
**Problem:** The image styles are versioned through immutable contract versions and a stamp. For post styles, the migration adds only a key column. If a style's checklist or default tone changes in a later version, nothing stored says which version shaped a brief or a pending queue entry. A queue entry written today and generated after the change gets the new rules. The word "versioned" therefore has no contract behind it. One implementer will add a version stamp and another will rely on the prompt-version bump alone.
**Fix:** State whether the post-style version is stamped (and on which row), or drop "versioned" and say the prompt-version bump is the only record.
**Status:** withdrawn — party-visionary's WARN ("No stamp records which version of a post style a draft or a pending queue entry used") is the same finding, more fully argued. Its harm is the next checklist edit and its drift against PROMPT_VERSION. That is a post-merge consequence and belongs to party-visionary. At merge, the gap here is only an ambiguous adjective, so keeping a duplicate costs the panel without adding anything.

### [NOTE] party-architect — Coupling fact on party-po's cut line: the post-style table cannot ship without the new image looks unless five of its seven defaults change

**Quotes:** > | Promotion / deal | conversion | Bold | Spotlight | offer, price, % and end date only if stated; else open CTA |
**Quotes:** > | Hiring | hiring | Professional | Full-bleed scene | role named; how to apply; no invented salary, location or perks |
**Quotes:** > - a **default image style** for Path B: the image-style picker stays and is pre-filled; the user can change it;
**Problem:** party-po's BLOCK proposes a first release of "the dataset, the wizard picker, the checklist in the prompts and one brief column" with "no new image styles". As tabled, the dataset's default-image-style field points at Spotlight, Full-bleed scene and Abstract brand forms for five of the seven styles (Promotion, Event, Hiring, Tip, Milestone). None of these exists until the new archetypes land. A dataset that validates its default image style against the image-style keys, as a client-safe dataset in `src/lib/designData/` would, cannot compile those rows without them. This is a coupling fact, not a view on release order: the cut party-po describes is structurally possible only if those five defaults are set to `classic` (or the field is made optional) in that release, and the table changes when the looks arrive. A split that leaves the table as written half-lands.
**Fix:** If the panel adopts any split, the proposal states the interim default image style for each row whose look is not yet built, and says where the dataset checks that every default names an existing key.
**Status:** upheld
