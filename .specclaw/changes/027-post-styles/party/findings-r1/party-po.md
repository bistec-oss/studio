### [BLOCK] party-po — Scope bundles six separable features, and the proposal never prices a cheaper first cut

**Quotes:**

> Replace the **Goal** picker with a **Post style** picker.
> **Size:** architectural (a new dataset other surfaces depend on; a brief field; new image contracts across three sizes; four surfaces)
> **Files affected:** about 35 to 50 (dataset, wizard, briefs route, queue, campaign forms, MCP/ACP, four prompt builders, designData, tests)
> **Problem:** The proposal is large (35-50 files, an additive migration, seven new image contracts) and ships as one unit. Its core value is the content checklist: the measurable "never invent salary, date or price" rules, which are the only part tied to the project's own lesson that measurable instructions stick. That value can be captured by a much smaller variant. The variant is a code-owned post-style dataset (goal, tone, checklist), a wizard picker that pre-fills Tone, and the checklist injected into the caption and design prompts. It needs no new image styles, no 9:16 contracts, no queue, campaign, MCP or ACP surfaces, and no per-surface migration columns. The proposal never describes this variant or says why it is not the first release. The image-style expansion, the 9:16 support and the four-surface reach are each separable and each carry their own cost, but none is tied to a stated value.
> **Fix:** Name the cut lines. Release 1 is the dataset, the wizard picker, the checklist in the prompts and one brief column. Release 2 is the STORY layouts and the new image looks, gated by a real-model check. Release 3 is the campaign default, queue, MCP and ACP reach, and only if usage shows demand. Compare the cost of each release to the value it returns.

### [WARN] party-po — Do-nothing option is never priced

**Quotes:**

> **The user thinks in what a post is for, not in goal plus tone plus look.**
> **The image styles are narrow.** 009 shipped two (`product-showcase`, `editorial-split`), dark-area only, and **neither supports 9:16**, so Story posts can never use one.
> **Problem:** The problem section describes inconvenience but gives no rate and no consequence. It does not say how often Story posts are made, how often users mis-set Goal or Tone, or how often an invented fact has reached a post. If nothing ships, the proposal never says what specifically gets worse.
> **Fix:** State one measurable cost of doing nothing for each of the three problems. If a problem has none, drop its scope.

### [WARN] party-po — Scheduled, MCP and ACP reach and campaign default carry no stated value

**Quotes:**

> **Post styles reach every surface (user decision):**
> **scheduled queue entries**: they carry a post style, which means they get an image style too (today they are always classic);
> **MCP / ACP generate**, which accept a post style key.
> **Problem:** The web wizard is where a person picks a purpose. Unattended surfaces (the queue, MCP and ACP) now also run hero image generation, so they would spend extra image calls and time on every entry without anyone watching. The proposal does not say whether the style's default image style applies there. It also gives no per-entry cost number, only a fallback to classic when the pixel check fails. Open Question 5 concedes the unattended behaviour is unconfirmed. Three more surfaces, each needing its own tests, are listed as in scope with no value stated for them.
> **Fix:** Ship the web wizard first. For the unattended surfaces, carry the checklist only (it adds no image cost) and keep them classic until a request appears. State the added image calls and seconds per entry if an image style is enabled there.

### [WARN] party-po — Running cost of seven new image looks and the real-model check is unbounded

**Quotes:**

> each passing the real-pixel check at every size it declares
> a real-model OP check of the new looks (like 009 OP-1), run by the user's decision 6. **The OP check budget:** how many real renders per new look (009 OP-1 used 6 briefs × 2 styles).
> **Problem:** There are seven image archetypes at up to three sizes each, so up to about 21 contracts, each to be tuned against real pixels. 009's own OP-1 took 6 briefs × 2 styles, which is 12 renders. Matching that per look would mean about 40 to 80 real renders, and the proposal gives no number. The existing hero step is also described as taking 11 to 22 seconds unset. Every post using a style now runs the extra step, and the proposal states no recurring seconds or image-call cost.
> **Fix:** Cap the OP budget at a stated number of renders. Declare only the sizes each look is actually needed at, rather than all three. State the added image calls per generation.

### [NOTE] party-po — Defaults on upgrade and the Goal picker removal

**Quotes:**

> Leaning: leave them; only new briefs get a style. 3. **A "General" style** for posts that fit none of the seven: needed, or does "no style" (today's Goal/Tone behaviour) cover it?
> **Problem:** Replacing the Goal picker removes a working control before the replacement is proven. A user whose post fits none of the seven styles loses the ability to set a goal. The "leave old briefs unstyled" lean is the right cheap default. The Goal removal is not, because "no style" would keep a goal but nothing in the wizard could set it. The Tone default also gets pre-filled by each style, which silently changes what users get on first use.
> **Fix:** Keep the Goal picker visible, collapsed or secondary, until the style picker has shown it covers most posts. Alternatively, add "No style" as an explicit first option that keeps Goal and Tone as they are today.
> **Status:** upheld
