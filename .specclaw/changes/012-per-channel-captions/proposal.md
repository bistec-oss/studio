# Proposal: Per-channel captions (Instagram / LinkedIn / WhatsApp) + "copy" → "caption"

**Created:** 2026-09-23
**Status:** 🟡 Draft

## Problem

**1. Every channel is published the whole combined caption, including the other channel's section.** A draft has one caption, `Draft.copyText String` (`prisma/schema.prisma:443`). The prompt asks for plain copy "for Instagram, LinkedIn posts" (`src/lib/agent/prompts/copy.ts:12-31`), and the model tends to answer with its own `**INSTAGRAM:** … **LINKEDIN:** …` blocks. Nothing parses them. At publish time the same full string goes to every channel:

| Step                           | Where                                                     | What it sends                     |
| ------------------------------ | --------------------------------------------------------- | --------------------------------- |
| Publish now / from the dialog  | `lib/publish/publishDraft.ts:33-44` (`:61`, `:78`)        | the whole `copyText`, per channel |
| Scheduled publish              | `lib/scheduler/jobRunner.ts:63,77`                        | the whole `copyText`, per channel |
| Instagram / LinkedIn publisher | `lib/social/instagram.ts:18`, `lib/social/linkedin.ts:30` | whatever they are handed, as-is   |

So a LinkedIn post carries the Instagram caption and its hashtags, and the reverse. The markdown `**` markers are published literally, since neither platform renders Markdown.

**2. The character counter measures the wrong thing.** `CopyEditor.tsx:35-44,94,204` (`copyLimitFor`) counts the **whole** string against the **smallest** limit among the brief's channels. That is how the editor shows "1451 / 2200 (Instagram)" while the text also contains the LinkedIn section.

**3. The product calls it "copy"; the team calls it a caption.** "Copy" is agency jargon, and in this app it collides with the clipboard sense of "copy" (Copy key, Copy link). The draft page says **Copy**, **Writing the copy…**, **Post copy…**; the brief wizard says **Brief & Copy Direction**.

**4. WhatsApp needs its own caption.** Proposal **010** adds WhatsApp Channel posting. WhatsApp uses its own formatting (`*bold*`, `_italic_`), has no "link in bio", and reads best short. It needs a third caption, not a slice of the other two. (010's proposal says generation "currently writes `INSTAGRAM:` / `LINKEDIN:` sections". The code does not. That is model behaviour, not a format, and this change replaces it.)

## Proposed Solution

**Three captions per draft, one per channel, each written, edited, counted, regenerated and published on its own. Everywhere a user reads it, the word is "Caption".**

1. **Structured captions in the data model.** A draft holds an Instagram, a LinkedIn and a WhatsApp caption. The storage shape is a design-phase decision (see Open Questions); `Draft.copyText` is retired, since the rename is done where the change touches code.
2. **One generation call, three captions out, extracted rather than trusted.** The caption prompt asks for all three in a fenced JSON object with fixed keys. Each channel has its own brief:
   - **Instagram:** hook first, hashtags at the end, up to 2,200 characters.
   - **LinkedIn:** professional, longer-form, up to 3,000 characters, few or no hashtags.
   - **WhatsApp:** short, `*bold*` / `_italic_` only (never Markdown `**`), link in the body.

   The reply is parsed at the boundary and each field is validated. This follows the 2026-08-03 lesson ("a prompt rule is not an invariant"): extract what you need, never assert it is in there somewhere. A reply that yields only some captions keeps those and marks the rest failed, so that channel can be retried alone. `PROMPT_VERSION` is bumped.

3. **Three caption panels on the draft page**, replacing the single Copy panel. Each panel has:
   - a channel label + icon;
   - its own textarea and a **per-channel counter** against that channel's own limit;
   - save on blur, as today;
   - **Regenerate** for that channel alone (plus one "Regenerate all");
   - its own undo snapshot;
   - **Copy caption to clipboard**. For WhatsApp this is the working path until 010's handoff screen exists.

   Generation skeletons resolve per panel.

4. **Publishing sends the matching caption.** `publishToChannel` and the job runner look up the caption for the channel being published. This fixes Problem 1. An empty caption for a channel that is being published is a validation error with a readable message, never a silent empty post.
5. **The design agent gets one caption as on-image text.** The design, Path A and background prompts take the caption as the text the image is built from (`prompts/pathB.ts:104`, `pathA.ts:70`, `background.ts:69`). Proposed: feed the **Instagram** caption, the most visual channel. This is confirmed in the design phase.
6. **Rename "copy" → "caption"** (scope decided 2026-09-23: _UI + docs, code where touched_):
   - **UI:** every user-facing string. That is about 12, in `CopyEditor.tsx`, `drafts/[id]/page.tsx:253-262`, `brief/ContentStep.tsx:58`, and the dashboard and campaign briefing wording.
   - **Code the change already rewrites** takes the new name:
     - the draft caption fields;
     - the regenerate route (`regenerate-copy` → `regenerate-caption`);
     - `DraftAction.REGENERATE_COPY` → `REGENERATE_CAPTION`;
     - `api-types.ts`;
     - `CopyEditor` → `CaptionPanels`;
     - `buildCopyPrompt` → `buildCaptionPrompt`;
     - `CHANNEL_COPY_LIMITS` → `CHANNEL_CAPTION_LIMITS`;
     - the matching tests.
   - **Deliberately unchanged:**
     - The `COPY` provider slot and `Brief.copyProviderKey`. The slot is a general text-generation slot that also drives brand-voice drafting (`providers/registry.ts:92-106`), so calling it CAPTION would be wrong.
     - The clipboard sense of "copy".
   - **Docs:** new text says "caption". CLAUDE.md, the handoff, ROADMAP and proposals **008** / **010** are updated to match.
7. **Existing drafts are migrated, not stranded.** A best-effort splitter moves each old `copyText` into the new shape. If it finds `INSTAGRAM:` / `LINKEDIN:` headers, it splits on them and strips `**`. Otherwise the whole text becomes both the Instagram and the LinkedIn caption. WhatsApp is left empty, and the panel offers **Generate**. The split is a pure planner, unit-tested without a DB (the `inlineEdit.ts` / `recovery.ts` pattern). The migration is data-only and applies on deploy through the PR #39 entrypoint.
8. **Every writer is covered:**
   - interactive generation;
   - regenerate;
   - the PATCH editor;
   - `api/generate/copy`;
   - the scheduler (`generationRunner.ts`), MCP (`mcp/tools/generate.ts`) and ACP, which stay on `generateDraft` and so get three captions automatically.

   The MCP/ACP draft reads return all three captions.

## Scope

### In Scope

- Structured per-channel captions (Instagram, LinkedIn, WhatsApp) + migration of existing drafts
- Caption prompt returning three captions; boundary extraction + per-field validation; per-channel partial failure; `PROMPT_VERSION` bump
- Draft page: three caption panels with per-channel counter, regenerate, undo and copy-to-clipboard
- Publish service + job runner send the matching caption; empty-caption guard
- Design / background prompts fed one chosen caption
- "copy" → "caption" rename: UI strings, the identifiers this change touches, docs (CLAUDE.md, handoff, ROADMAP, 008, 010)
- MCP/ACP read + generate outputs expose the three captions
- Tests:
  - unit: the migration splitter, the caption extractor (clean, partial, preamble, fenced, missing keys) and per-channel limits;
  - E2E: generation yields three captions; LinkedIn is published with the LinkedIn caption only; per-channel regenerate touches one panel; the TC-ASYNC-10 copy-edit status guard still holds

### Out of Scope

- **Publishing to WhatsApp.** That is **010**. This change only produces and stores the WhatsApp caption and lets it be copied. 010 then consumes it.
- Renaming the `COPY` provider slot or `copyProviderKey` (see Solution 6)
- Channels beyond these three
- Per-channel **images** (one exported image still serves every channel)
- Caption translation / multiple languages per channel

## Dependencies and boundaries

- **010 (WhatsApp):** 012 owns the WhatsApp **caption** (010's item 5 moves here); 010 owns **posting** it. 012 does not need 010 to exist. If 012 lands first, WhatsApp is a caption-only channel until 010 ships.
- **008 (model selection):** 008's `copy` surface and `Draft.copyModel` stamp become **`caption`** / **`captionModel`**. If 008 is built first, it uses the new names from the start.
- **011 (redesign):** the three panels are new UI. Build them in 011's style if its foundation has landed; otherwise build them in the current style, and they restyle with the draft page.
- **004 (design fidelity):** both touch the draft page (`drafts/[id]/page.tsx`) and the refine panel's surroundings. Coordinate or sequence.

## Impact

- **Files affected:** ~30–40 (estimated). Schema + migration; the caption prompt + extractor; `generateDraft.ts`; `pathA` / `pathB` / `background` prompts; regenerate + PATCH + `generate/copy` routes; `publishDraft.ts`; `jobRunner.ts`; `channels.ts`; `api-types.ts`; the draft page + new caption panels; brief wizard wording; MCP/ACP; tests; docs.
- **Complexity:** medium
- **Risk:** medium. It changes a column every draft has, and the publish path. Mitigations:
  - the pure, unit-tested migration planner, which never writes an empty caption over real text;
  - the publish-time empty-caption guard;
  - the E2E publish assertion that LinkedIn receives only the LinkedIn caption.

## Decisions (2026-10-09, user)

- **Approved for planning,** as the next roadmap change after 013 and 014.
- **Storage: a `DraftCaption` table,** one row per (draft, channel), with its own caption-channel enum that includes WHATSAPP. Each channel is regenerated, fails and is undone on its own.
- **On-image text: a separate short headline.** The caption call also returns a short headline, and the design, Path A and background prompts use it. They no longer use any caption.
- **Revisions stay design-only.** Each caption panel has its own undo; restoring a revision never touches captions.
- **The brief wizard step becomes "Brief & Caption Direction".**
- **WhatsApp counter (2026-10-10):** a soft 1,000-character guide with a warning past it, not a hard block. 010 can tighten it once the real Channel limit is confirmed.
- **Panel rulings (2026-10-10, user), after the deep panel (CHANGES_REQUESTED):**
  - **Full scope as decided:** three captions including WhatsApp, per-channel regenerate plus "Regenerate all", and per-panel undo. Tasks are ordered so that storage, extraction and the publish fix land first.
  - **WHATSAPP is added to `Channel` now,** and `DraftCaption` is keyed on `Channel`. WhatsApp is not selectable in the publish dialog until 010. A publish to a channel with no publisher fails closed: rejected up front, or a terminal FAILED with a readable reason, never retried.
  - **The headline is a required `Draft.headline` on new drafts.** A migrated draft with no headline makes design fall back to the brief Topic, and the fallback is logged. The headline panel offers "Generate headline".
  - **Contracts keep their names.** The UI strings, docs and internal identifiers are renamed. The routes `regenerate-copy` and `generate/copy`, the persisted `DraftAction.REGENERATE_COPY` and the MCP/ACP field names stay as they are, listed as deliberately unchanged like the `COPY` slot.
  - **Orchestrator defaults from the panel, adopted:**
    - `copyText` is preserved as a read-only `legacyCaptionText` and dropped only in a later change;
    - each draft records how it migrated (split, unsplit fallback or empty), and fallback drafts show a "review this caption" notice;
    - fallback drafts with a pending scheduled post are listed at migration time;
    - one shared caption resolver refuses failed, empty or over-limit captions, with a terminal error and no retry;
    - the strict JSON extractor accepts exactly one object;
    - a mock caption seam returns a raw reply through the real extractor, with a sentinel that drops one channel;
    - the channel limits and briefs come from one per-channel registry;
    - MCP/ACP returns captions as a `{channel, text}` list.
- **The UI is built on 014's shared `PageHead` / `Section` / `Notice` primitives.**

## Open Questions

- **Storage shape.**
  - Three columns on `Draft` (simplest, fixed set)?
  - A `DraftCaption(draftId, channel, text)` table (extensible; needs a caption-channel enum that includes WHATSAPP before 010 adds it to `Channel`)?
  - A JSON column (flexible, weakest typing)?

  Leaning three columns or the table; decided in design.

- **Which caption feeds the design agent** as on-image text: Instagram (proposed), LinkedIn, or a separate short "headline" field the model writes alongside the three?
- **Channel limits.** WhatsApp's Channel message length limit must be confirmed before it gets a counter. Instagram 2,200 and LinkedIn 3,000 are already in `channels.ts`.
- **Should revisions snapshot captions?** Today `DraftRevision` stores only HTML + export, so Undo/restore never touches the caption. Keeping that means caption history is only the per-panel undo; changing it is a bigger decision.
- **Brief wizard wording:** "Brief & Copy Direction" → "Brief & Caption Direction", or drop the second half?

---

**To proceed:** Review this proposal and approve to begin planning.

- (party-po, BLOCK) No cheaper variant priced; per-channel regenerate, per-channel undo, the WhatsApp caption and the renames carry no stated value — see party-report.md
- (party-architect, BLOCK) A second caption-channel enum beside `Channel`, with no mapping contract — see party-report.md
- (party-architect, BLOCK) The headline has no storage, extractor key, migration value or regenerate owner; Solution 5 contradicts the Decisions — see party-report.md
- (party-security, BLOCK) The migration rewrites every caption on deploy and retires `copyText` with no way back — see party-report.md
- (party-po) The WhatsApp caption ships before any consumer exists; name the cut line — see party-report.md
- (party-po) The recurring cost (tokens, spawns per draft) is unstated; is the headline required? — see party-report.md
- (party-po) The migration and the identifier renames carry no stated value — see party-report.md
- (party-po) Name the ship order inside the change — see party-report.md
- (party-ba) Problem 1's prevalence is unmeasured — see party-report.md
- (party-ba) No falsifiable criterion for the style rules (`**`, WhatsApp length) — see party-report.md
- (party-ba) Mark Solution 5 and the stale open questions superseded; flag migrated drafts as not channel-tailored — see party-report.md
- (party-architect) "Data-only" migration is wrong; state the migration sequence — see party-report.md
- (party-architect) Per-channel regenerate and failure need a request shape, a single-flight scope and per-channel status — see party-report.md
- (party-architect) Write the extractor's JSON contract and per-field rules — see party-report.md
- (party-architect) One shared caption resolver for publish and the job runner; partial results on scheduler post-actions — see party-report.md
- (party-architect) Give the PATCH, draft GET and MCP/ACP output shapes; does `copyText` stay externally? — see party-report.md
- (party-architect) Name the mock caption seam (raw reply through the real extractor, plus a drop-one-channel sentinel) — see party-report.md
- (party-architect) Slicing needs `copyText` live until the panels and PATCH land; a read-time fallback belongs in the one resolver — see party-report.md
- (party-security) Record how each draft migrated, and flag unsplit fallbacks with pending scheduled posts — see party-report.md
- (party-security) The publish guard must key on caption status, trimmed emptiness and hard limits; terminal, not retryable — see party-report.md
- (party-security) The headline must be required and validated; never run design on nothing — see party-report.md
- (party-security) The extractor must accept exactly one matching object — see party-report.md
- (party-security) If WHATSAPP joins `Channel`, a publish with no publisher fails closed and stays out of the publish dialog — see party-report.md
- (party-visionary) The headline needs its own storage, model setting and prompt version — see party-report.md
- (party-visionary) Split the rename rule: routes, persisted enums and MCP fields are renamed only on purpose — see party-report.md
- (party-visionary) Build the prompt's length guidance from `CHANNEL_CAPTION_LIMITS` — see party-report.md
- (party-visionary) Keep `copyText` as a read-only legacy column, dropped later — see party-report.md
- (party-visionary) Drive prompt keys, extractor, panels and MCP output from one per-channel registry; MCP returns a `{channel, text}` list — see party-report.md
