### [WARN] party-ba — The central claim, that Goal and Tone "mean almost nothing to the model", is asserted from one analogy and never tested

**Quotes:**

> **Goal and Tone are two loose dropdowns that mean almost nothing to the model.**
> The project's own lesson from the IRP fixes is that **adjectival instructions don't stick and measurable ones do**, and these two fields are exactly the adjectival kind.
> **Problem:** The proposal offers no observation of a bad post caused by Goal or Tone. It cites no case where the model ignored `Goal: engagement`, and no user complaint. The only support is an analogy to a different failure: the IRP fixes were about layout and naming rules written for one campaign. The real pain may be missing facts rules (inventing dates, prices or perks). Problem 2 says those rules exist only where someone hand-wrote them into a briefing. If so, the problem is "no default do-not-invent checklist". A new picker, seven presets and five new image looks is a much larger answer to that than the evidence supports. After shipping, nothing in the artifact shows that posts would be better, or that the Goal dropdown was the cause.
> **Fix:** Cite a real failure or a user request (draft IDs, a count, who asked). Or state that the checklist is the real problem and Goal replacement is incidental.
> **Status:** upheld

### [WARN] party-ba — "The user thinks in what a post is for" assumes a user behaviour that is not established

**Quotes:**

> **The user thinks in what a post is for, not in goal plus tone plus look.**
> Today the user assembles that from three separate pickers
> **Problem:** There is no source for how the marketing team picks Goal, Tone and image style today. It never says whether they find three pickers hard. It also never says whether they would choose one of exactly these seven styles. The table's rows come from a user decision on 2026-10-24, but the proposal does not say whether that decision came from observed use. The risk is concrete: a post that fits none of the seven (OQ3) either gets forced into a wrong style, or loses the Goal picker with nothing in its place. The sufferer is named, but their behaviour is assumed.
> **Fix:** Say who picked the seven styles and on what basis, for example past briefs by goal. Or mark the list as a hypothesis, and add an acceptance check that styles are actually chosen.
> **Status:** upheld

### [WARN] party-ba — Problem 3 motivates new looks with a limit that only partly applies, and the "scheduled posts" gap is not tied to any need

**Quotes:**

> **The image styles are narrow.** 009 shipped two (`product-showcase`, `editorial-split`), dark-area only, and **neither supports 9:16**, so Story posts can never use one. Scheduled, MCP and ACP briefs are always classic.
> Five new image styles: light variants of Showcase and Editorial split
> **Problem:** "Narrow" is a judgement. The proposal gives no usage data on how often styles are chosen, how often Story is used, or how often a user wanted a light area. The 009 OP-1 result in the project context shows styled renders preferred, but this proposal does not cite it, so the case for five more looks has no evidence on the page. "Always classic" for scheduled briefs was a deliberate 009 choice. The proposal does not say anyone needs it reversed, and OQ5 admits it is unconfirmed. Three different problems (goal and tone semantics, purpose presets, image variety) are bundled as one, so no single sentence names what would still hurt if the change shipped and worked.
> **Fix:** Tie each new look and each new surface to a stated need. Otherwise drop the ones without one.
> **Status:** upheld

### [WARN] party-ba — No acceptance criteria, and the main claim has no way to fail

**Quotes:**

> Unit and E2E coverage; a real-model OP check of the new looks (like 009 OP-1), run by the user's decision
> **The OP check budget:** how many real renders per new look (009 OP-1 used 6 briefs × 6 briefs × 2 styles).
> **Problem:** The proposal contains no pass bar. The OP check is named but has no threshold. 009 OP-1 had a stated bar of 4 of 6, and this proposal does not carry one over. The central benefit, that checklists reduce invented facts and that captions follow the style, has no test and no measure. "each passing the real-pixel check at every size it declares" tests layout only. It cannot show that a style made the post better, or that a checklist rule held. Nothing would make the headline value claim fail at ship time.
> **Fix:** State a falsifiable bar. An example: on N briefs per style with no stated date or price, zero posts contain an invented date or price, compared against today's Goal/Tone output.
> **Status:** upheld

### [WARN] party-ba — "Default" and "pre-filled" carry two meanings, and the conflict with campaign tone is unresolved

**Quotes:**

> a **default tone**: the Tone picker stays and is pre-filled; the user can change it;
> a campaign's **default post style**, which pre-filled the wizard the way its default tone does today;
> **Where the checklist lives in the prompt** relative to the campaign briefing and the kit voice prompt, and which wins on a conflict
> **Problem:** There are now up to three sources for tone (style default, campaign default tone, the user's pick). The text never says which wins when a campaign has a default tone and a default post style whose tone differs. "Pre-filled" could mean the style overwrites the tone on every style change, or fills only an empty field. These give different builds, and the first silently discards a user's tone pick. "Goal ... derived from it" also leaves open what happens to old and unstyled briefs and campaigns (OQ1). Whether the checklist outranks the briefing is left open, and that decides whether "no invented dates" can actually hold. The proposal's stated purpose depends on it.
> **Fix:** Define the precedence order among campaign tone, style tone and the user's choice. Say whether a style change overwrites a manually chosen tone. Resolve OQ4 before planning.
> **Status:** upheld

### [NOTE] party-ba — "Path A's design prompt does not receive them at all" is a factual claim about code that the proposal does not source

**Quotes:**

> Path A's design prompt does not receive them at all.
> **Problem:** This is stated as fact and justifies applying style to Path A. I cannot check it from the artifact alone. If it is wrong, the Path A scope row changes.
> **Fix:** Cite the file and prompt builder this was read from.
> **Status:** upheld
