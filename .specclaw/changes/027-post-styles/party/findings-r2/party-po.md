### [BLOCK] party-po — Scope bundles six separable features, and the proposal never prices a cheaper first cut

**Quotes:**

> Replace the **Goal** picker with a **Post style** picker.
> **Size:** architectural (a new dataset other surfaces depend on; a brief field; new image contracts across three sizes; four surfaces)
> **Files affected:** about 35 to 50 (dataset, wizard, briefs route, queue, campaign forms, MCP/ACP, four prompt builders, designData, tests)
> **Problem:** The proposal is large (35-50 files, an additive migration, seven new image contracts) and ships as one unit. Its core value is the content checklist: the measurable "never invent salary, date or price" rules. A much smaller variant captures that value: a code-owned post-style dataset (goal, tone, checklist), a wizard picker that pre-fills Tone, and the checklist injected into the caption and design prompts. It needs no new image styles, no 9:16 contracts, no queue, campaign, MCP or ACP surfaces. The proposal never describes this variant or says why it is not the first release.
> **Fix:** Name the cut lines. Release 1 is the dataset, the wizard picker, the checklist in the prompts and one brief column. Release 2 is the STORY layouts and the new image looks, gated by a real-model check. Release 3 is the campaign default, queue, MCP and ACP reach, and only if usage shows demand.
> **Status:** upheld

### [WARN] party-po — Do-nothing option is never priced

**Quotes:**

> **The user thinks in what a post is for, not in goal plus tone plus look.**
> **The image styles are narrow.** 009 shipped two (`product-showcase`, `editorial-split`), dark-area only, and **neither supports 9:16**, so Story posts can never use one.
> **Problem:** The problem section describes inconvenience but gives no rate and no consequence. It does not say how often Story posts are made, how often users mis-set Goal or Tone, or how often an invented fact has reached a post.
> **Fix:** State one measurable cost of doing nothing for each of the three problems. If a problem has none, drop its scope.
> **Status:** upheld

### [WARN] party-po — Scheduled, MCP and ACP reach and campaign default carry no stated value

**Quotes:**

> **Post styles reach every surface (user decision):**
> **scheduled queue entries**: they carry a post style, which means they get an image style too (today they are always classic);
> **MCP / ACP generate**, which accept a post style key.
> **Problem:** Unattended surfaces would now run hero image generation, spending extra image calls and seconds on every entry with nobody watching. The proposal gives no per-entry cost number. Open Question 5 concedes the unattended behaviour is unconfirmed. Three more surfaces, each needing its own tests, are in scope with no value stated for them. The "user decision" label records who chose it, not what it returns. Pricing it is still my job.
> **Fix:** Ship the web wizard first. For the unattended surfaces, carry the checklist only (no image cost) and keep them classic until a request appears. State the added image calls and seconds per entry if an image style is enabled there.
> **Status:** upheld

### [WARN] party-po — Running cost of seven new image looks and the real-model check is unbounded

**Quotes:**

> each passing the real-pixel check at every size it declares
> a real-model OP check of the new looks (like 009 OP-1), run by the user's decision 6. **The OP check budget:** how many real renders per new look (009 OP-1 used 6 briefs × 2 styles).
> **Problem:** Seven archetypes at up to three sizes is about 21 contracts, each tuned against real pixels. Matching 009's OP-1 per look would mean roughly 40 to 80 real renders, and no number is given. Every post that uses a style also runs the hero step (11 to 22 s unset on 009's numbers), with no stated recurring cost.
> **Fix:** Cap the OP budget at a stated number of renders. Declare only the sizes each look is needed at. State the added image calls per generation.
> **Status:** upheld

### [NOTE] party-po — Defaults on upgrade and the Goal picker removal

**Quotes:**

> Leaning: leave them; only new briefs get a style. 3. **A "General" style** for posts that fit none of the seven: needed, or does "no style" (today's Goal/Tone behaviour) cover it?
> **Problem:** Replacing the Goal picker removes a working control before the replacement is proven. A user whose post fits none of the seven styles loses the ability to set a goal. The "leave old briefs unstyled" lean is the right cheap default. Pre-filling Tone from each style also silently changes what users get on first use.
> **Fix:** Keep the Goal picker visible, collapsed or secondary, until the style picker is shown to cover most posts. Or add "No style" as an explicit first option that keeps Goal and Tone as they are today.
> **Status:** upheld
