# Design: Stale-headline badge

**Change:** 030-stale-headline-badge · **Size:** architectural
**Spec:** [`spec.md`](spec.md) (18 FR, 8 NFR, 20 AC). The user's decisions D1 to D5 are in [`proposal.md`](proposal.md).

## 1. Shape of the change

```
render (Chromium or mock) ──► HeadlineCheck ──► RenderStamp.renderedText ──► Draft / DraftRevision.renderedText
                                                                                     │
Draft.headline (edit, regenerate headline) ──────────────────────────────────────────┤
                                                                                     ▼
                                                            headlineState() ──► GET /api/drafts/[id].headlineImage ──► HeadlineImageNotice
                                                                            ├─► GET /api/library[].headlineState ──► PublishDialog line
                                                                            ├─► draft.headline_edited.state
                                                                            └─► publish.settled.headlineState
```

One pure module owns the vocabulary, the normaliser, the stamp schema, the verdict and the state rule. The renderer owns the in-page fact collection. The stamp helpers in `revisions.ts` carry the value. Nothing else decides anything.

## 2. The pure module: `src/lib/renderedText/`

| File           | Exports                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `vocab.ts`     | `HEADLINE_STATES`, `UNVERIFIED_REASONS`, `HEADLINE_CHECKS`, their types, `HEADLINE_CHECK_TIMEOUT_MS = 5000`                         |
| `normalise.ts` | `normaliseHeadline(s)` (self-contained, see 2.1), `NORMALISE_HEADLINE_SOURCE = normaliseHeadline.toString()`                        |
| `stamp.ts`     | `renderedTextSchema`, `RenderedText` type, `parseRenderedText(unknown)`, `renderedTextColumn(stamp)`, `stampFromCheck(text, check)` |
| `facts.ts`     | `HeadlineFacts` type (what the page returns), `evaluateHeadlineFacts(facts, canvas): HeadlineCheck`                                 |
| `mockCheck.ts` | `mockHeadlineCheck(html, headline): HeadlineCheck` and the sentinel `MOCK_HEADLINE_HIDDEN = '__MOCK_HEADLINE_HIDDEN__'`             |
| `state.ts`     | `headlineState(stamp, headline): HeadlineState`, `headlineImageFor(stamp, headline, scheduled)` (the FR-12 read model)              |
| `index.ts`     | re-exports                                                                                                                          |

It imports only zod and `HEADLINE_MAX` (`src/lib/captions/headline.ts`). No Prisma client, no I/O, so the GET, the catalogue and the tests can import it freely. `renderedTextColumn` returns `Prisma.DbNull` for null, like `toJsonColumn`; it imports the `Prisma` namespace type only, as `revisions.ts` does.

### 2.1 The normaliser (FR-09)

```ts
export function normaliseHeadline(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\s   ]+/g, ' ')
    .trim()
    .toLowerCase()
}
```

It must stay self-contained: no imports, no closures, no helper calls. The in-page collector rebuilds it from `NORMALISE_HEADLINE_SOURCE` (`new Function('return ' + src)()`), so both sides run the same text. A unit test asserts the rebuilt function equals the original on a fixed set of strings, which catches a bundler rewriting it into something that no longer stands alone. AC-07 (the render agreement fixtures) catches the rest.

### 2.2 The stamp (FR-02)

```ts
const headlineEntry = z.discriminatedUnion('verified', [
  z.object({ text: z.string().max(HEADLINE_MAX), verified: z.literal(true) }).strict(),
  z
    .object({
      text: z.string().max(HEADLINE_MAX),
      verified: z.literal(false),
      reason: z.enum(UNVERIFIED_REASONS),
    })
    .strict(),
])
export const renderedTextSchema = z.object({ headline: headlineEntry.optional() }).strict()
```

`.strict()` on the outer object today; a later field adds a key and drops nothing. `parseRenderedText` is the tolerant reader (`safeParse`, null on failure). `renderedTextColumn` validates with `.parse` at every write, so a bad stamp fails loudly in tests rather than reaching a row.

`stampFromCheck(text, check)`: `check === 'painted'` → `{ headline: { text, verified: true } }`, otherwise `{ headline: { text, verified: false, reason: check } }`. `text` is cut to `HEADLINE_MAX` defensively (a brief topic used as the fallback can be longer).

### 2.3 The verdict (FR-07, FR-08)

```ts
interface CandidateFacts {
  visible: boolean // checkVisibility({ opacityProperty, visibilityProperty })
  rects: Rect[] // Range.getClientRects() over the element's contents, empty rects dropped
  clipBoxes: Rect[] // the box of self and each ancestor whose overflow-x/-y is not visible
  topmost: boolean[] // per rect centre: elementFromPoint is el or a descendant
}
interface HeadlineFacts {
  candidates: CandidateFacts[]
}
```

`evaluateHeadlineFacts(facts, { width, height })`: a candidate is painted when `visible`, `rects.length > 0`, the union of `rects` is inside the canvas within `HEADLINE_TOLERANCE_PX = 1`, every rect is inside every `clipBox` within 1 px, and every `topmost` is true. Then: 0 candidates → `not-found`; 1 painted → `painted`; more than 1 painted → `ambiguous`; else `not-visible`.

### 2.4 The state rule (FR-11) and the read model (FR-12)

```ts
export function headlineState(stamp: RenderedText | null, headline: string | null): HeadlineState {
  const h = stamp?.headline
  if (!h || headline === null) return 'unknown'
  if (!h.verified) return 'unconfirmed'
  return normaliseHeadline(h.text) === normaliseHeadline(headline) ? 'fresh' : 'stale'
}
```

`headlineImageFor(stamp, headline, scheduled)` builds `{ state, renderedHeadline, reason, scheduledPosts }`, filling each field only for the states the spec names. `scheduled` is `{ count, nextAt } | null`, passed in by the caller.

## 3. The renderer: `src/lib/renderer/puppeteer.ts`

### 3.1 API

A new export, beside `renderHtmlToPng`:

```ts
export interface RenderResult {
  png: Buffer
  headlineCheck: HeadlineCheck | null
}

export async function renderPost(
  html: string,
  width: number,
  height: number,
  composites: CompositeRender | null,
  check: { headline: string } | null,
): Promise<RenderResult>
```

`renderHtmlToPng(html, w, h, composites)` stays as is for callers that stamp nothing and becomes `(await renderPost(html, w, h, composites, null)).png`. `headlineCheck` is null exactly when `check` is null. Every stamping caller (section 4) moves to `renderPost`. Required `check` argument, so a caller must choose.

### 3.2 In the page

`withRenderedPage` gains an optional `beforeShot(page)` hook that runs after `verifyComposite` and before `fn`. `renderPost` passes one that runs `collectHeadlineFacts(page, headline, NORMALISE_HEADLINE_SOURCE)` under `Promise.race` with `HEADLINE_CHECK_TIMEOUT_MS`. Any throw or timeout → `not-checked` (logged once with the draft-free context `[renderer] headline check: …`). The collector, in one `page.evaluate`:

1. rebuild `norm` from the source string;
2. walk `document.body.querySelectorAll('*')`, skipping `script, style, template, noscript`, and keep elements where `norm(el.innerText) === norm(headline)`;
3. drop any kept element that contains another kept element (innermost only);
4. for each candidate return the `CandidateFacts` of 2.3 (`Range.selectNodeContents(el)` → `getClientRects()`; `getComputedStyle` for each ancestor up to `body`; `document.elementFromPoint` at each rect centre).

Cost: one DOM walk and a few hundred `innerText` reads on a 1080 px post, which is milliseconds; the render fixtures log the time (NFR-04).

The verdict runs in Node: `evaluateHeadlineFacts(facts, { width, height })`.

### 3.3 Under `MOCK_PUPPETEER`

`renderPost` keeps the existing order (composite HTML assert, composite sentinel), then returns `{ png: MOCK_PNG_BUFFER, headlineCheck: check ? mockHeadlineCheck(html, check.headline) : null }`.

`mockHeadlineCheck` (2, `mockCheck.ts`): if the HTML contains `__MOCK_HEADLINE_HIDDEN__` → `not-visible`. Otherwise strip `<head>…</head>`, `script`, `style`, `template`, comments; replace each tag with a space; decode `&amp; &lt; &gt; &quot; &#39; &nbsp;`; normalise; then count occurrences of the normalised headline bounded by the string ends or a space: 0 `not-found`, 1 `painted`, more `ambiguous`.

### 3.4 The mock design

`buildMockHtml(promptContext, width, height, headline?)` (`src/lib/testHooks.ts`): when `headline` is given, the body gains `<div class="headline" data-mock-headline="true">{escaped headline}</div>` after the existing card. When `promptContext` contains `__MOCK_HEADLINE_HIDDEN__`, the sentinel rides along as a comment, as the 025 composite sentinel does. The mock design paths (`designAgent.ts` and `designAgentCli.ts` under `MOCK_AI`) pass the headline they were given (section 4.1). `buildMockRefineReply`'s default (bare document) copies a `data-mock-headline` element from the current document when there is one, so a mock refine keeps the headline painted; every sentinel branch keeps its meaning.

`MOCK DESIGN` stays in the card, so existing E2E text checks still hold. Any existing test that pins `buildMockHtml`'s exact output is adapted and listed in the task report.

## 4. The writers (FR-04, FR-05)

### 4.1 Generation and regenerate design

- `DesignAgentOptions` (`src/lib/agent/types.ts`) gains `headline: string` (required). `DesignAgentResult` gains `headlineCheck: HeadlineCheck | null`.
- `runDesignAgentCli`: renders with `renderPost(..., { headline })` and returns its check.
- `runDesignAgent` (API mode): `toolRenderHtml` takes the headline and returns `{ url, key, headlineCheck }`; the loop keeps `lastHeadlineCheck` beside `lastExportUrl` and returns it. A run that ends with no render returns `null`.
- `runPathADesign` and `runPathBDesign` pass the headline they already build the prompt from and return the agent's check. Path B's 025 classic fallback re-renders, so its check is the fallback render's.
- `produceDesign` → `currentRenderStamp(model, composition, postStyle, stampFromCheck(headline, result.headlineCheck ?? 'not-checked'))`.
- `regenerate-design/route.ts`: the same, with `designHeadline(draft, draft.brief).text`.
- `generation.finished` (`emitGenerationFinished`) reads `trace.design.stamp.renderedText` and adds `headlineCheck` (`'painted'` or the reason).

### 4.2 The stamp helpers in `src/lib/drafts/revisions.ts`

- `RenderStamp` gains `renderedText: RenderedText | null`.
- `currentRenderStamp(model, composition, postStyle, renderedText)`: the fourth argument is required.
- `revisionStampFields` and `draftStampFields` add `renderedText: renderedTextColumn(stamp.renderedText)`.
- `restoredRenderStamp` returns `parseRenderedText(revision.renderedText)` (also when `rerendered`: a pre-F3 row is pre-030, so null).
- `rejectedRenderStamp` selects and parses `renderedText`.

### 4.3 `commitDraftRevision` and `recordRejectedRender`

Both already render through `renderDraftHtml`. The change:

1. `renderDraftHtml(draftId, html, composition, width, height, headline)` returns `RenderResult` and calls `renderPost` with `{ headline }`. The restore and export callers pass `null` and read `.png`.
2. `commitDraftRevision`, when it renders (no `exportKey`), first reads `designHeadline` for the draft (one `findUnique` selecting `headline` and `brief.topic`), renders with it, and builds the stamp **after** the render: `currentRenderStamp(model, composition, postStyle, stampFromCheck(headline, result.headlineCheck))`. With an `exportKey` (adopt) the stamp is `rejectedRenderStamp`, unchanged.
3. `recordRejectedRender` does the same for its row.

The callers (refine, inline edit both modes, Override, adopt) need no change: they do not pass the stamp.

### 4.4 The writer guard (AC-03)

`tests/unit/renderedTextWriters.test.ts`:

- a source scan: every file under `src/` with a Prisma write of `htmlContent` (today `generateDraft.ts`, `regenerate-design/route.ts`, `revisions.ts`) is in a fixed list, and each such write object spreads `draftStampFields(` or `revisionStampFields(`. A new writer outside the list fails the test with its path;
- behavioural cases, extending the fakes of `renderStamps.test.ts` and `draftRevisions.test.ts`: each FR-04 row stamps as stated (AC-04).

## 5. The headline-write paths and the events

### 5.1 `trackHeadlineEdited` (`src/lib/renderedText/track.ts`, the one emitter of `draft.headline_edited`)

```ts
trackHeadlineEdited({ draftId, teamId, userId, via, before: string | null })
```

It reads `headline`, `renderedText` and the SCHEDULED post count in one query, returns early when `normaliseHeadline(before ?? '') === normaliseHeadline(headline ?? '')` and the raw strings are equal (no change), and otherwise tracks `{ via, state, scheduledPending }`. It never throws (track's contract).

- `PATCH /api/drafts/[id]` reads the headline before `saveHeadlineEdit` (the route already loads the draft) and calls it after a successful save.
- `settleCaptionAction` returns whether it wrote the headline and the value before (read inside its transaction); `regenerate-copy/route.ts` calls `trackHeadlineEdited({ via: 'regenerate' })` after the settle when it did. The emitter stays outside the transaction.

`trackHeadlineEdited` lives outside the pure files (it imports `prisma` and `track`), and `index.ts` does not re-export it.

### 5.2 `publish.settled.headlineState`

`PublishOutcome` gains `headlineState?: HeadlineState`. The callers:

| Caller                                 | Source of the draft row                                       |
| -------------------------------------- | ------------------------------------------------------------- |
| `src/lib/publish/publishDraft.ts`      | its draft load gains `headline` and `renderedText`            |
| `src/app/api/posts/[id]/publish/route` | its post load includes the draft; select gains the two fields |
| `src/lib/scheduler/jobRunner.ts`       | its claimed post's draft; select gains the two fields         |

MCP and ACP publish through `publishDraft.ts`, so they are covered there. The state is computed with `headlineState` at the moment of the attempt.

### 5.3 The catalogue (`src/lib/analytics/catalogue.ts`)

- new `'draft.headline_edited': { schemaVersion: 1, source: ['web'], outcomes: [], schema: z.object({ via: z.enum(['edit', 'regenerate']), state: z.enum(HEADLINE_STATES), scheduledPending: z.boolean() }) }`;
- `publish.settled` gains `headlineState: z.enum(HEADLINE_STATES).optional()`;
- `generation.finished` gains `headlineCheck: z.enum(HEADLINE_CHECKS).optional()`.

Imported from `@/lib/renderedText`, never copied. `analyticsCoverage.test.ts` gains the two coverage assertions (FR-18).

## 6. The read side

- `GET /api/drafts/[id]` (`src/app/api/drafts/[id]/route.ts`): the draft select gains `renderedText`; the three parallel reads become four with `prisma.post.aggregate({ where: { draftId, status: 'SCHEDULED' }, _count: true, _min: { scheduledAt: true } })`, run only when the state is `stale` or `unconfirmed` (computed first, from columns already read). `data.headlineImage = headlineImageFor(...)`. This GET is the 4 s poll (018 FR-04): the extra read is skipped for `fresh` and `unknown`, which is nearly every poll.
- `src/lib/api-types.ts`: `HeadlineImage` type and `DraftDetail.headlineImage`; the library item type gains `headlineState`.
- `GET /api/library`: select `renderedText` and return `headlineState`.

## 7. The UI

- `src/components/drafts/HeadlineImageNotice.tsx`: the `CompositionNotice` / `FactsCheckNotice` pattern (same surface, icon size and spacing, Graphite tokens only, no `// ui-exception`). Props: `image: HeadlineImage`, `busy: boolean`, `onEditInline()`, `onRegenerateDesign()`. Text from a pure `headlineNoticeText(image)` (`src/lib/renderedText/noticeText.ts`, unit-tested), so the sentences of FR-13 live in one place. Rendered in `src/app/(app)/drafts/[id]/page.tsx` beside the other two notices; the callbacks reuse the page's existing inline-edit opener and regenerate-design handler (with its confirm). `role="status"`, and the buttons are real buttons.
- `PublishDialog` (`src/components/library/PublishDialog.tsx`): optional `headlineState`; one line from the same `noticeText.ts` (`publishLineFor(state)`), in the dialog's existing helper-text style, above the actions. The draft page passes `draft.headlineImage.state`; the library page passes the item's `headlineState`.
- Read `docs/ui-reference/DESIGN_SYSTEM.md` before the UI task. No new shared component.

## 8. Tests

| Layer   | File                                                                                               | Covers                                                              |
| ------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| unit    | `tests/unit/renderedText.test.ts` (new)                                                            | AC-02, AC-05, AC-09, normaliser rebuild, mock stand-in, notice text |
| unit    | `tests/unit/renderedTextWriters.test.ts` (new)                                                     | AC-03, AC-04                                                        |
| unit    | `tests/unit/renderPost.test.ts` (new)                                                              | AC-08 (forced throw and timeout)                                    |
| unit    | `tests/unit/draftDetailGet.test.ts`, library route test                                            | AC-10                                                               |
| unit    | `tests/unit/analyticsCoverage.test.ts`, `analyticsGeneration.test.ts`, publish and scheduler tests | AC-19                                                               |
| render  | `tests/render/headlineCheck.test.ts` (new) + fixtures                                              | AC-06, AC-07                                                        |
| E2E     | `tests/e2e/headline-badge.test.ts` (new, §AH, TC-HL-01..10)                                        | AC-11 to AC-19                                                      |
| upgrade | `npm run test:upgrade`                                                                             | AC-01                                                               |

E2E seams: the pre-030 case uses a test-only write of `renderedText = NULL` on `Draft` and its revisions. None of the existing `/api/test/*` seams (analytics-events, generation-tick, model-calls, scheduler-tick, worker-heartbeat) fits, so add `POST /api/test/draft-rendered-text` with `{ draftId }` that nulls both, gated like the others (MOCK, 404 in prod, admin only).

## 9. File map

| File                                                                                                                          | Change                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `prisma/schema.prisma`                                                                                                        | `renderedText Json?` on `Draft` and `DraftRevision`       |
| `prisma/migrations/20261027120000_rendered_text/migration.sql`                                                                | new                                                       |
| `prisma/rollback/030-stale-headline-badge.down.sql`                                                                           | new                                                       |
| `src/lib/renderedText/*`                                                                                                      | new (section 2, 5.1)                                      |
| `src/lib/renderer/puppeteer.ts`                                                                                               | `renderPost`, `beforeShot`, the collector                 |
| `src/lib/testHooks.ts`                                                                                                        | `buildMockHtml` headline, refine reply keeps it, sentinel |
| `src/lib/agent/{types,designAgent,designAgentCli,tools,pathA,pathB,generateDraft}.ts`                                         | headline in, check out, stamp                             |
| `src/app/api/drafts/[id]/regenerate-design/route.ts`                                                                          | stamp                                                     |
| `src/lib/drafts/revisions.ts`                                                                                                 | stamp helpers, `renderDraftHtml`, commit, rejected        |
| `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts`                                                                    | `.png` from the new `renderDraftHtml`                     |
| `src/app/api/generate/export/route.ts`                                                                                        | `.png` from the new `renderDraftHtml`                     |
| `src/lib/captions/store.ts`                                                                                                   | `settleCaptionAction` reports the headline write          |
| `src/app/api/drafts/[id]/regenerate-copy/route.ts`                                                                            | emit after the settle (line ~138)                         |
| `src/app/api/drafts/[id]/route.ts`                                                                                            | GET `headlineImage`; PATCH emit                           |
| `src/app/api/library/route.ts`                                                                                                | `headlineState`                                           |
| `src/lib/api-types.ts`                                                                                                        | types                                                     |
| `src/lib/analytics/catalogue.ts`                                                                                              | one event, two fields                                     |
| `src/lib/publish/{trackPublish,publishDraft}.ts`, `src/app/api/posts/[id]/publish/route.ts`, `src/lib/scheduler/jobRunner.ts` | `headlineState`                                           |
| `src/components/drafts/HeadlineImageNotice.tsx`                                                                               | new                                                       |
| `src/components/library/PublishDialog.tsx`                                                                                    | the line                                                  |
| `src/app/(app)/drafts/[id]/page.tsx`, `src/app/(app)/library/page.tsx`                                                        | wire                                                      |
| `src/app/api/test/draft-rendered-text/route.ts`                                                                               | new seam                                                  |
| tests (section 8), `docs/e2e-test-plan.md` §AH, `docs/handoff.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`                        | docs                                                      |

`src/mcp/tools/generate.ts` and `src/acp/agent.ts` need no change: they call `generateDraftForBrief`.

## 10. Key decisions

- **Check in the PNG's own page, not a second load** (D2, NFR-02). The render that made the pixels is the only honest witness.
- **`renderPost` beside `renderHtmlToPng`, not a changed return type.** Callers that stamp nothing (sampling, layout facts, export) stay untouched, and the stamping callers must pass `check` explicitly.
- **The stamp is built after the render in `commitDraftRevision`.** Today the stamp is built before the render; the check result is only known after it. Nothing writes between the two, so moving it is safe.
- **The headline a commit checks is read inside `commitDraftRevision`,** so the five callers stay unchanged and cannot pass a stale value.
- **State is computed, never stored.** The headline changes without a design write, so a stored state would go stale itself.
- **The scheduled-posts read is conditional,** to keep the 4 s poll's cost flat.

## 11. Risks

| Risk                                                            | Mitigation                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| A bundler makes `normaliseHeadline.toString()` non-standalone   | The rebuild unit test, and AC-07 in real Chromium                    |
| The check misreads a real design (false `unconfirmed`)          | FR-17 measures the rate; known limits stated; the badge never blocks |
| Mock E2E drafts change shape (`buildMockHtml` gains an element) | The card text stays; adapted tests are listed in the report          |
| `commitDraftRevision`'s extra read adds latency                 | One indexed `findUnique` per commit, next to a 1 to 2 s render       |
| A writer added later forgets the stamp                          | `currentRenderStamp`'s required argument and the source-scan guard   |

## 12. Grounding sources

- `docs/handoff.md`, 030 section: "Every write that renders a PNG already runs Chromium, so the check costs no extra render." (D2) and "The next free migration timestamp follows `20261026120000_composite_source`."
- `CLAUDE.md`, Analytics (006): "**One emitter per event name:** each event has exactly one place that writes it, and a shared function that serves several surfaces takes an explicit `source`." and "Events hold ids, enums, counts, durations, redacted failure reasons and the capped refine instruction, never prompt text, model output, captions or headlines."
- `src/lib/analytics/catalogue.ts` header: "A payload change only ADDS optional fields." and "Vocabularies are IMPORTED … never copied".
- `src/lib/drafts/revisions.ts`, RenderStamp header: "009: `composition` has no default, so a caller that forgets it is a type error" (the pattern FR-04 follows).
- `src/lib/renderer/puppeteer.ts` `verifyComposite`: the `elementFromPoint` sampling FR-08 reuses.
- `CLAUDE.md` gotcha: "A `page.waitForResponse` must be created before the action that triggers the request."
