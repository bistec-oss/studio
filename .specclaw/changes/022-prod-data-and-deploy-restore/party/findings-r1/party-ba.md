### [BLOCK] party-ba — The claim that every legacy draft trips the guard is asserted, and the proposal never checks prod's data shape

**Quotes:**

> That migration raises an exception when any draft has `copyText` and no `DraftCaption` rows. On prod, `migrate deploy` applies 012 and 016 in one run, before any boot step, so every legacy draft trips the guard.
> Prod drafts store their caption in `Draft.copyText`.
> **Problem:** The whole change rests on two claims about prod: that prod runs a schema where 012's migration is not yet applied, and that its drafts hold legacy captions. Neither is sourced. The proposal quotes no prod query, row count, migration-table state or dump. Open Question 2 admits there is no prod copy yet, so the premise has not been observed. The "every legacy draft" wording is also unscoped. The proposal does not say how many drafts exist, what shape their captions take (single block, combined multi-channel, empty), or whether any already have `DraftCaption` rows. Mechanism (a) versus (b) depends on those facts.
> **Fix:** Before planning, record the actual prod state: the last applied migration, the count of drafts with `copyText` and no `DraftCaption`, and a sample of caption shapes. Cite where that came from. State the problem as "N drafts will fail" and not "every".
> **Status:** upheld

### [WARN] party-ba — Caption "split quality" is the stated reason to prefer (b), but the proposal never says what a correct conversion means

**Quotes:**

> Either way, no caption text is lost.
> SQL cannot easily repeat the 012 channel-split planner, so it may only copy the whole caption to each channel.
> Default: (b), if planning confirms the planner splits real prod captions better.
> **Problem:** "Conversion" and "better" are load-bearing terms with no definition, so there are two builds. One copies the whole caption to every channel, which loses no text but duplicates it. The other splits per channel, which risks dropping or misassigning text. "No caption text is lost" is also not testable as written. It does not say whether duplicated text counts as lost, or whether the split must round-trip to the original. The Problem section also never establishes that the combined-caption shape actually exists in prod. The CLAUDE.md bug description is about the old system, and the proposal does not re-verify it for these drafts.
> **Fix:** State an acceptance criterion for the converted state. For example, for each legacy draft, the union of the per-channel captions contains the original `copyText` and no channel is empty. State the pass condition for the split-versus-copy choice.
> **Status:** upheld

### [WARN] party-ba — The item-4 checks are described as risks with no evidence they affect prod, and the scope depends on their outcome

**Quotes:**

> Prod's value is not known.
> External MCP/ACP callers that read it would break.
> Prod's team has both, so it stays.
> Reverting other 016 removals beyond what item 1 needs, unless the item-4 check finds a real prod caller.
> **Problem:** Several claims about prod are asserted with no source: the team "has both" members and rows, the heal is "probably safe", and external callers "would break". The proposal also names no party who calls the MCP/ACP surface with `copyText`, so it is unknown whether the problem exists. The scope boundary is conditional on a check the proposal does not specify how to run. The "Pre-merge prod checklist" is a doc deliverable, and nothing says when it is acted on or by whom.
> **Fix:** Name the evidence source for each item, such as a Coolify env read, the MCP/ACP access logs, or a count query. Say who runs it. Make the "real prod caller" threshold explicit.
> **Status:** upheld

### [WARN] party-ba — Acceptance criteria are absent, so the main claim (prod deploys and keeps its data) is unverified at ship time

**Quotes:**

> Items 1–4, with tests for the caption conversion (unit and an E2E case built on a legacy-shaped draft) and the docs.
> A dry-run on a copy of prod data proves it before any deploy.
> The dry-run on prod-shaped data is the gate.
> **Problem:** The goal is "keep prod data working", but no criterion defines it, so nothing can fail. A synthetic legacy-shaped draft only proves the code handles the shape the author imagined. It cannot show that real prod data survives. "Prod-shaped" is undefined, and Open Question 2 allows the gate to degrade to synthetic drafts only. The proposal also does not say what a passing dry-run looks like. It sets no row-count parity, no zero-diff on caption text, and no check that `/api/health` returns the commit. Item 2 has no criterion either. Nothing shows the restored workflow works, since it can only truly run on `main` and merging is out of scope.
> **Fix:** Add falsifiable criteria. Examples: after migrating a prod dump copy, the count of drafts with `copyText` and no captions is 0 and the pre- and post-migration text matches; the boot completes; the restored workflow passes a syntax or dry-run check. State what happens if no dump is available.
> **Status:** upheld

### [NOTE] party-ba — "Fresh system" and "company prod" reading of the fork rests on one dated user decision with no stated source

**Quotes:**

> The user decided on 2026-10-18 to **keep prod data working**.
> The fork was built for a **fresh, separate system** with no deploy target.
> **Problem:** The premise that prod holds real data and must be kept is credible, since the repo's own docs describe the Hearts Academy data. The proposal still cites the decision with no pointer to where it was recorded. "Prod data working" is also ambiguous. It could mean no data loss, or it could mean the deploy stays green with the new UI and behaviour. This probably does not change the build.
> **Fix:** Link the decision record and define "working" in one line.
> **Status:** upheld
