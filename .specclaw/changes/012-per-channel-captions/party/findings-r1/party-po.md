### [BLOCK] party-po — No cheaper variant is considered; the publish bug is fixable at a fraction of this scope

**Quotes:**

> **Three captions per draft, one per channel, each written, edited, counted, regenerated and published on its own. Everywhere a user reads it, the word is "Caption".**
>
> - **Files affected:** ~30–40 (estimated).
> - **Complexity:** medium
>   **Problem:** The only defect with a stated cost is that each channel is published the whole combined caption (Problem 1) and that the counter measures the wrong thing (Problem 2). The cheapest variant is to keep one generation call, make it return the Instagram and LinkedIn captions as fixed JSON keys that are extracted at the boundary, store them in two columns, and have publish send the matching one. That fixes the publish bug, the counter and the `**` markers. It needs perhaps a third of the files, and it has no new table, no per-channel regenerate, no per-channel undo, no renames and no WhatsApp work. The proposal never prices this variant, and it never says what the remaining 60-70% of the 30–40 files buys. Per-channel regenerate, per-channel undo and a "Regenerate all" button each have no stated value. The rename of routes, enums and files is justified only as "the rename is done where the change touches code". Do-nothing is also unpriced: the artifact never says how many publishes have gone out with the wrong caption.
>   **Fix:** Add a "cheaper variant" section comparing a two-channel structured extraction plus matching-caption publish against the full scope. Attach a value to each of the per-channel regenerate, per-channel undo, WhatsApp caption and rename items, or cut them.
>   **Status:** upheld

### [WARN] party-po — WhatsApp caption, storage and generation ship before any consumer exists

**Quotes:**

> - **Publishing to WhatsApp.** That is **010**. This change only produces and stores the WhatsApp caption and lets it be copied.
>   If 012 lands first, WhatsApp is a caption-only channel until 010 ships.
>   **Problem:** Every generation will spend output tokens on a third caption that nothing publishes. It also adds a third panel, a third counter, a soft 1,000-character guide against a limit the proposal admits is unconfirmed, and a third regenerate path. The value arrives only when 010 ships, and 010 is a proposal that has no date. The WhatsApp limit is still an open question, and the counter is a guess. This is a cut line the proposal does not name. The Instagram and LinkedIn publish fix is worth shipping alone, and WhatsApp can follow in 010 as an additive row. The `DraftCaption` table makes that additive step cheap.
>   **Fix:** Name the cut line. Ship Instagram and LinkedIn in 012, and move the WhatsApp caption, its panel and its counter into 010. Alternatively, state the per-generation token overhead and why it is worth paying before 010 exists.
>   **Status:** upheld

### [WARN] party-po — Recurring cost of the extra model output and the regenerate actions is not stated

**Quotes:**

> Each channel has its own brief:
> **Regenerate** for that channel alone (plus one "Regenerate all");
> The caption call also returns a short headline, and the design, Path A and background prompts use it.
> **Problem:** One call now emits three captions (up to 2,200 + 3,000 + about 1,000 characters) plus a headline, instead of one caption. Failure of one field leaves partial results that are retried per channel. That makes up to 3 extra spawns per draft, plus a "Regenerate all" spawn, and each CLI spawn is a Haiku call with a 120s timeout. The artifact gives no number for output size, expected spawns per draft, or the added wall-clock before the copy skeleton resolves. The headline also adds a new field and a new prompt contract that every design prompt must now follow.
> **Fix:** State tokens and spawns per generation at the largest case (three failed fields retried separately). State whether the headline is a required field or optional with a fallback.
> **Status:** upheld

### [WARN] party-po — Data migration and rename scope carry work with no stated value

**Quotes:**

> Otherwise the whole text becomes both the Instagram and the LinkedIn caption.
> **UI + docs, code where touched**
>
> - the regenerate route (`regenerate-copy` → `regenerate-caption`);
>   **Problem:** The splitter is a best-effort migration for historic drafts, and it duplicates the same text into two channels when no headers are found. That keeps the original bug in the data for every old draft. The cost is a pure planner, unit tests and a data migration, in return for drafts whose captions have already been published or edited. A lazy read-time fallback ("if no captions rows, show copyText as read-only legacy") would cost far less, but `copyText` is retired. Renaming the route, the enum, the file names and the tests inside "code where touched" breaks every in-repo caller and test for naming only. The user-facing string change is cheap, and the identifier rename is the expensive part with no user-visible return.
>   **Fix:** Say what old-draft migration returns that a read-only legacy fallback would not. Limit the rename to UI strings, or give a reason why the route and enum must be renamed in this change.
>   **Status:** upheld

### [NOTE] party-po — Ship order within the change is not named

**Quotes:**

> **Risk:** medium. It changes a column every draft has, and the publish path.
> **Problem:** The proposal bundles the data model change, the publish fix, a UI rebuild, a model-output contract change and a rename into one change. The publish fix with the empty-caption guard is the most valuable slice and the one with a real defect behind it. It should land first and by itself. The panel UI and the rename can follow, and each piece can be reverted on its own.
> **Fix:** In the task plan, sequence as: (1) the storage and extraction, plus the publish and job-runner lookup; (2) the panels; (3) the rename and docs. Name each as a shippable boundary.
> **Status:** upheld
