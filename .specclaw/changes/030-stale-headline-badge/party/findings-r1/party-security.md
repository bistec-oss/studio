### [BLOCK] party-security — The "visible text" check passes on hidden, clipped or covered text, then clears the badge

**Quotes:**

> **Check the visible text.** In the real render, the element's visible text must equal the new headline. Under `MOCK_PUPPETEER`, the same check runs on the parsed HTML.
> **Stamp** `renderedHeadline` from what the replace changed, and only after the check passes.
> **Match** the innermost element whose visible text equals the stamped old headline, with whitespace normalised and case ignored.
> **Problem:** The proposal's own measurement shows that the parser can find a headline the render does not show: 32 of 35 drafts match at element level, but the measurement only confirms 34 of 35 as visible page text. In 4 of the 9 raw single matches, the match was not visible. A parse5 match cannot see CSS, so it can pick an element that is `display:none`, `opacity:0`, off the canvas, clipped by `overflow:hidden`, or covered by another layer. The check then asks for "the element's visible text". A text read such as `innerText` or `textContent` still returns the string for hidden, clipped, overflowing or covered elements. So the check passes, `renderedHeadline` is stamped with the new value, and the badge clears while the PNG still shows the old headline or a cut-off new one. This is the 006 party-security BLOCK again, one layer down: it now depends on the check rather than on a raw replace. Flattening an accent span or `<br>` breaks into one run also changes how the text wraps, so overflow after Apply is a likely result, not a rare one. A false pass looks exactly like success, and the stamp keeps the wrong answer for good.
> **Fix:** Define the check from what the page actually paints, measured in Chromium after the render. All of these must hold:

- the element has a non-empty box that lies inside the canvas rect;
- its computed `display`, `visibility` and `opacity` all render it;
- `scrollWidth`/`scrollHeight` are no larger than `clientWidth`/`clientHeight` on the element and its clipping ancestors;
- `elementFromPoint` at sample points across the text box returns the element or one of its children, as 025 does for the composite;
- the comparison handles `text-transform`.

A failure on any of these returns the `not-visible` outcome and writes nothing. Run the same geometry test before the splice on the old headline, so a hidden match is refused at the Match step.
**Status:** upheld

### [WARN] party-security — `renderedHeadline` is written from intent at most writers and never checked against the HTML

**Quotes:**

> A new render stamps the headline it was built from (`designHeadline`). A write that keeps HTML (inline edit, Override) carries the stored value forward.
> It offers three buttons: **Apply to image**, **Edit inline** and **Regenerate design**.
> **Problem:** Only Apply checks the stamp against the HTML. Every other writer records what the headline should be, not what the HTML holds.

First, a new render stamps `designHeadline` even when the model wrote different words. The proposal measured one such draft: in `…zwvn0q` the visible headline was worded differently. The badge would then quote an "old headline" that never appeared on the image.

Second, inline edit changes the HTML but keeps the stamp, which causes two failures:

- **Fail open:** an inline edit that rewords the on-image headline leaves the stamp equal to `Draft.headline`, so the system reports a fresh image that is not fresh.
- **Fail closed, but useless:** the user follows the badge's own advice and fixes the headline with Edit inline. The stamp still holds the old value, so the badge can never clear. A later Apply then looks for text that is gone and returns `not-found`.

A badge that stays on after the user fixed the problem teaches users to ignore it.
**Fix:**

- At every stamp write (new render, inline edit, Override, adopt), run the same parse, match and visibility rule against the HTML being committed. Stamp the headline only if it is the visible text of exactly one element.
- Otherwise, stamp an explicit "unverified" value. The UI must treat it like a pre-030 null draft, never as fresh.
- Inline edit must recompute the stamp, not carry it forward.
  **Status:** upheld

### [WARN] party-security — The splice can delete content the check never looks at

**Quotes:**

> **Replace** that element's inner content with the new headline, HTML-escaped. Splice it at the parser's offsets so every other byte of the document is unchanged.
> The cost: inline markup inside the element (an accent span, `<br>` line breaks) becomes one plain run of text in the element's own style. The confirm step says so.
> **Problem:** The match rule is "the innermost element whose visible text equals the headline". An element whose children have no text also qualifies: an inline `<img>` or `<svg>` icon, an `__INLINE_ASSET_n__` logo, or a 025 `data-composite` wrapper holding the `__COMPOSITE_0__` token. Replacing the inner content deletes them all without a trace. The confirm step mentions only spans and line breaks. The visible-text check looks only at the target element, so an image or composite deleted next to the new text still passes.

A second risk is the offsets themselves. When parse5 recovers from bad HTML, such as an implied end tag or misnested elements, an element can lack an explicit end-tag location. Splicing at the element's end offset can then swallow sibling content, and the check still passes. The damage is recoverable through restore, but nothing signals that it happened.
**Fix:**

- Refuse the match (a named outcome, writing nothing) when the element contains anything other than text, `<br>` and inline phrasing elements (`span`, `em`, `strong`, `b`, `i`). In particular, refuse `img`, `svg`, `picture`, `[data-composite]` and any `__*_n__` token.
- Refuse when parse5 reports no explicit start-tag and end-tag location for the element.
- After the splice, re-parse and assert that the document outside the element is unchanged: the same element count and the same text.
  **Status:** upheld

### [WARN] party-security — For pre-030 drafts, the recommended read-time rule fails open on CSS-hidden matches

**Quotes:**

> **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`).
> **Staleness is pure and read-time.** A draft is stale when `renderedHeadline` is set and differs from `Draft.headline` after whitespace normalisation. `GET /api/drafts/[id]` returns `headlineStale` with the reason. No model call and no render are needed to read it.
> **Problem:** On the GET path there is no render, so "visible text" can only mean "parsed text outside attributes and `<title>`". Suppose the current headline sits in exactly one element that CSS hides, clips or pushes off the canvas, or in a hidden duplicate the model emitted. The rule then reports "not stale", and no badge appears on a draft whose image does not show the headline. For pre-030 drafts, the absence of a badge reads to the user as a clean result, yet the rule cannot actually establish that. This is the same raw-match trap the 006 panel warned about, narrowed from the whole document to element text but not removed.
> **Fix:** Never derive "fresh" for a null stamp from parsing alone. Show "unknown" for null drafts, or derive "fresh" only from a render-time geometry check (see the BLOCK above) and cache its result as the stamp.
> **Status:** upheld

### [WARN] party-security — A stale image is published with no warning, record or recovery path on the publish side

**Quotes:**

> Publishing is never blocked.
> Blocking or warning inside publish. The badge is on the draft page only (Open Question 4).
> **Recommend yes** if it fits the dialog without a new component.
> **Problem:** Publishing to Instagram or LinkedIn is the one effect here that cannot be undone. At publish time the system already knows `headlineStale`, yet the design records nothing about it. The dialog line is only conditional, and a `Post` that was already SCHEDULED before the headline edit publishes the stale PNG on the worker with no human present. After the fact, nobody can tell that a published post went out stale. The only recovery is deleting the post on each channel by hand, and nothing points the operator at which posts need it.
> **Fix:** Not a blocking gate:

- Write `headlineStale` (and the reason) to the `Post` row, or as a field on the publish event, at the moment of publishing, both interactive and scheduled.
- Show the dialog line whenever the draft is stale, not only "if it fits".
- When a headline edit lands on a draft with a pending SCHEDULED `Post`, say so in the badge.
  **Status:** upheld

### [NOTE] party-security — HTML escaping does not neutralise the document's reserved token strings

**Quotes:**

> **Replace** that element's inner content with the new headline, HTML-escaped.
> **Commit** through `commitDraftRevision`. That re-renders the PNG, and the 025 composite placement still applies.
> **Problem:** Two kinds of text reach the splice: a user-typed headline and model output from Regenerate headline. HTML escaping covers `<`, `>`, `&` and quotes, but not the placeholder namespace the stored HTML already relies on (`__COMPOSITE_0__`, `__INLINE_ASSET_n__`). Those tokens are resolved after this point. A headline that contains one of these strings puts a second copy of a reserved token into the stored HTML. The proposal does not say how the later steps treat a duplicate. The only exposure is to the author's own draft.
> **Fix:** Before the splice, reject (or rewrite) any new headline that matches the reserved token pattern, and make it a named outcome.
> **Status:** upheld

### [NOTE] party-security — The apply event's outcomes have no value for a failure after the match

**Quotes:**

> `revision.headline_applied` (outcome `ok`, `not-found`, `ambiguous` or `not-visible`).
> Together they give the frequency and the real match rate the 006 panel asked for.
> **Problem:** Apply can also fail after a successful match: the render fails, the 025 composite cannot be placed, or the claim is lost in `commitDraftRevision`. None of the four outcomes describes these. Such failures are either not recorded or recorded under the wrong outcome, which skews the measured match rate. The user still sees the failure, so this concerns only the accuracy of the measurement.
> **Fix:** Add an outcome for render or commit failures, such as `render-failed`, carrying a redacted reason, so every Apply attempt leaves exactly one event.
> **Status:** upheld
