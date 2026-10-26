### [WARN] party-ba — The pain is "software marketers want real-UI posts", but no evidence says any user wants it or does the upload work

**Quotes:**

> For a software company's marketing team, "a laptop showing our actual dashboard" is the post they want most.
> A per-brief upload (`Brief.briefImages`, `embed`/`reference` intent) is the other plausible home, for a one-off "this feature, this week" screenshot.
> **Problem:** The sole statement of user need is an unsourced assertion ("the post they want most"). The proposal does not say who asked, how often a post with a product screen is requested, or what marketers do today (manual screenshot mockups?). It also assumes the team will upload and maintain a library of `PRODUCT_SCREENSHOT` artifacts in the kit admin page, and that a team admin (not the post author) does so. The proposal's own text raises a more likely behaviour, a one-off per-post screenshot, and leaves it as an open question. If real usage is per-post, the kit-first recommendation builds the wrong home. OP-1 and OP-028 showed that styled looks beat classic. They did not show demand for a device screen.
> **Fix:** Cite where the demand came from (a request, a count of posts, a user quote). State who uploads and how often. Decide the kit-versus-per-brief question from that behaviour, not from where an upload route already exists.
> **Status:** upheld

### [WARN] party-ba — No acceptance criteria exist for the main claim that the screenshot is pixel-exact and correctly placed

**Quotes:**

> The screenshot stays pixel-exact; the model does not redraw it.
> the prompt gets the screenshot URL and the rect, and must place the screenshot exactly there (object-fit and rounding are set by the contract, not the model). `evaluateLayout` checks the box after render.
> **Problem:** "Pixel-exact" and "exactly there" are the headline benefit, but the proposal has no stated pass or fail observation. It does not give a tolerance for the box check, and it does not say how the output is shown to contain the unaltered screenshot (as opposed to a model that recolours or crops it). In approach (b) the design step is an LLM writing HTML. The same proposal documents that prompt rules are not invariants. The only measurable gate named is the blank-screen check on the image, which tests the device and not the placement. The fixtures listed (pass, busy, contrast, screen-not-blank) are all about the background image and none about the composited screenshot.
> **Fix:** State falsifiable criteria. For example, the rendered screen rect matches the screenshot within a stated per-pixel tolerance. Or the screenshot's `<img>` box is within N px of the rect. Or a post-render check fails closed when the screenshot is absent or altered.
> **Status:** upheld

### [WARN] party-ba — "Blank enough" and "tighter bar than a clear region" are undefined, and OP-025's pass rule is open

**Quotes:**

> The screen rect must be blank, with a tighter bar than a `clear` region.
> Does a size need 2 of 2 blank screens to pass?
> if the screen is not blank enough at a size, that size is out of scope or the change stops.
> **Problem:** The go/no-go gate depends on a term with no measure. "Blank", "blank enough" and "tighter" can each be built as different thresholds. Two image calls per size, with a 2-of-2 rule left open, is a sample too small to show that a size is reliably achievable. It also contradicts the premise that the model must achieve this every time, since every failure falls back to classic and drops the screenshot. The proposal's own risk note says Spotlight failed a calm-region bar on a real image. That shows a pass on a few samples does not predict the failure rate.
> **Fix:** Define blank as a number (for example maximum luminance variance or edge density inside the rect). State the pass rate that makes a size shippable, and the fallback rate users will accept.
> **Status:** upheld

### [NOTE] party-ba — "Real product screenshot" does not say what a valid screenshot is, and "device" carries two readings

**Quotes:**

> Screen shape per size:** one device per size (a laptop for SQUARE, a phone for STORY?), or one device for all sizes?
> Is a screenshot whose aspect is far from the rect's refused at pick time?
> **Problem:** The build differs a lot between readings. If the device is per size, a desktop dashboard screenshot is shown in a phone rect for STORY, and then it is either cropped (cover) or letterboxed. In both cases the "real UI" is no longer what the product looks like, which undercuts the stated value. The proposal leaves these as open questions but does not say the premise ("our actual dashboard") depends on them.
> **Fix:** Say which reading the problem statement assumes. Check that the supported device and fit combinations show a screenshot a marketer would call "our actual dashboard".
> **Status:** upheld
