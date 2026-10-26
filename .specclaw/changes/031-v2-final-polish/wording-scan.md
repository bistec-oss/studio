# Wording scan, 2026-10-26

A read-only scan of the user-facing text in `src/app/(app)/**`, `src/components/**` and the `src/lib/**` / `src/providers/**` modules that build user-visible messages, plus three out-of-scope docs. It was made by a Sonnet Explore agent; nothing was checked in a browser. Line numbers are as of `a58d329`.

Group G of 031 is scoped to this list: each item is fixed, or recorded in the 031 build report as dropped with a reason. The glossary the fixes use is in `proposal.md` (User Decisions).

**Not found anywhere in UI text:** Canva, Clerk, Frozen Light, "glass", "3:4", "DALL-E", "gpt-image". WhatsApp appears only in the legacy label map (`lib/channels.ts:58`). The 1:1 / 4:5 / 9:16 labels come from `lib/aspectRatio.ts` and are correct. The screenshot limits in the wizard match `lib/composite/imageHeader.ts`.

## 1. Provider-specific versus provider-agnostic

- **W-01 (MEDIUM)** `src/components/settings/OpenAiKeyCard.tsx:83,89` (also `:55,64,71,95,119`): "OpenAI key" / "Connect your personal OpenAI key for image generation." The card does not say that a personal key overrides the team's provider for every image call. Superseded by group C: "Image generation key", OpenAI or Gemini.
- **W-02 (LOW)** `src/app/(app)/team/page.tsx:445,453`: "Teammates without a personal OpenAI key …". Reword with group C ("personal image key").
- **W-03 (MEDIUM)** `src/app/(app)/team/page.tsx:69` and `src/app/api/admin/providers/route.ts:11`: any `sk-` key is labelled "GPT (OpenAI)", although an IMAGE row generates images. Use "OpenAI".
- **W-04 (LOW)** "Claude" is named where the caption writer may be an OpenAI COPY row: `ContentStep.tsx:68`, `ReviewStep.tsx:140`, `ImagesStep.tsx:34,90,91`, `SizeDesignStep.tsx:169,185,352`.
- **W-05 (MEDIUM)** `src/components/team/CaptionRouteCard.tsx:58`: "Image design always needs a team Claude token." "Image design" is not a product term, and "always" overstates (design tries the personal token first). Suggested: "Post design, scheduled posts and MCP/ACP runs use the Claude account, not this route; scheduled runs need a team Claude token."

## 2. Stale terms

- **W-06 (MEDIUM)** `src/components/brief/ReviewStep.tsx:178`: "No copy provider is configured, and the server is not in CLI mode. An admin must add a COPY provider in AI Providers before generating." Suggested: "No caption provider is set up. Ask a team admin to add one under Team settings > AI providers."
- **W-07 (MEDIUM)** `src/components/brief/useBriefWizard.ts:661`: "Ask an admin to add a COPY provider in AI Providers." Same fix as W-06.
- **W-08 (MEDIUM)** `src/lib/agent/generationErrors.ts:26`: "No AI copy provider is configured for this team …". Use "caption provider".
- **W-09 (MEDIUM)** `src/lib/models/route.ts:57` `NO_PROVIDER_MESSAGE`: operator wording (env vars, a DB model name) that can reach a team admin through the caption-route state.
- **W-10 (MEDIUM)** `src/app/(app)/team/page.tsx:512`: "Copy (text generation)". Use "Captions (text generation)".
- **W-11 (MEDIUM)** `src/app/(app)/team/page.tsx:177-178` (toggle "COPY" / "IMAGE", label "Provider slot"), `:243` (the raw `{provider.slot}` tag), `:516` ("No providers registered for COPY"), and the server messages `src/app/api/admin/providers/route.ts:73,98`. Show "Captions" / "Images".
- **W-12 (LOW)** `src/app/(app)/page.tsx:105`: activity feed "Copy provider added — <label>". Use "Caption provider added".
- **W-13 (MEDIUM)** `src/components/campaigns/BriefingAssistantPanel.tsx:446` shows `{row.goal}`; `:234` saves `goal` and no `postStyle`; the plan shape `:16-22` and the assistant prompt `src/lib/campaign/briefingAssistant.ts` carry `goal`. Fixed by group F (post styles).
- **W-14 (LOW)** `src/acp/agent.ts:17`: "(HTML design + copy)". Say "captions".
- **W-15 (LOW)** "Brief" where the UI says "post": `src/app/(app)/campaigns/[id]/page.tsx:282,285,288`; `src/app/(app)/brief/page.tsx:31` ("New Brief"); `RecentDraftsCard.tsx:139,99`; `KitDetail.tsx:445`. Apply the glossary's applies / does-not-apply list (the input form may still be called a brief where it means the form).

## 3. Text that contradicts behaviour

- **W-16 (MEDIUM)** `src/components/admin/brandkits/BrandKitAssistantPanel.tsx:296`: promises "a voice, palette, and font guesses you can review and apply", but `apply()` (`:182-206`) saves only the voice and colors. Fixed by group F (fonts applied).
- **W-17 (MEDIUM)** `src/components/team/TeamClaudeTokenCard.tsx:86` ("Shared fallback used by members who haven't connected their own Claude account."), the disconnect dialog `:69`, and `ClaudeConnectGuide.tsx` (~170): none says the team token is the only credential for scheduled posts, MCP and ACP.
- **W-18 (MEDIUM)** `src/app/(app)/admin/users/page.tsx:105`: "Create accounts and manage roles." The page has no role controls. Suggested: "Create and deactivate accounts. Team roles are set under Teams."
- **W-19 (MEDIUM)** `src/components/drafts/HeadlinePanel.tsx:232`: "Regenerate the design to use a changed headline." Edit inline (and, after group A, Apply) also fix it, and Path A drafts have no Regenerate design button.
- **W-20 (LOW-MEDIUM)** `src/lib/drafts/factsCheckNotice.ts:17`: "These are not in your brief or campaign." The check also reads the brand voice text. Say "brief, campaign or brand voice".
- **W-21 (LOW)** `src/app/(app)/admin/layout.tsx:24-25` ("Requires admin … Ask an admin"), `QueueEntryModal.tsx:281` ("Auto-publish requires admin."), and the four queue routes' messages: the gate is team admin.
- **W-22 (LOW)** `src/lib/agent/generationErrors.ts:14-15` ("Ask an admin to install a browser or set PUPPETEER_EXECUTABLE_PATH") and `src/lib/models/route.ts:54` (`DESIGN_PROVIDER=cli`): operator tasks shown to marketers or team admins.
- **W-23 (LOW)** `CampaignBriefingSection.tsx:258` ("brand voice and campaign documents") versus `ContentStep.tsx:150` ("brand voice and campaign context"). Pick one, and check "documents" is true.
- **W-24 (LOW)** `src/app/(app)/campaigns/page.tsx:138`: the lead omits the default post style the form (`:187`) sets.

## 4. Plain text that should be links

- **W-25 (MEDIUM)** `src/components/settings/ClaudeConnectGuide.tsx:185`: "Full guide: docs/claude-account-setup.md in the repository." A repo path a marketer cannot open. Link a hosted copy or inline the missing facts (Pro, Max, Team or Enterprise plan needed; the free plan does not work). This is the 005 setup-guide follow-up.
- **W-26 (LOW)** Bare routes or page names in messages: `src/lib/models/resolve.ts:196,157`; `src/lib/models/route.ts:52,54`; `src/lib/agent/generationErrors.ts:21`; `src/lib/social/instagram.ts:11` and `linkedin.ts:11` (no pointer to Team settings > Social channels).

## 5. Inconsistent naming (LOW, by pattern)

- **W-27** "Brand kit" spelled five ways (about 9 places): "Brandkits" (nav `AppShell.tsx:65`), "Brand Kits", "Brand Kit", "Brand kit", "Brand-kit assistant" (`lib/models/catalogue.ts:218`).
- **W-28** "Team settings" versus "Team Settings" versus "Team", and the "Admin" section holding both team-admin and super-admin pages (5 places).
- **W-29** Title Case beside sentence case in the wizard: "Post Size", "Generation Path", "Style Reference Template" next to "Post style", "Image style" (6 labels); "Refine Design" panel versus "Regenerate design" button.
- **W-30** Path A / B jargon shown to users: the dashboard "Path" column shows "A" / "B" (`RecentDraftsCard.tsx:208`); Review says "Path A — Template fill" while the picker says "Path A — Template".
- **W-31** One concept, four names: "Style Reference Template" / "Style ref:" / "Style reference" / "No reference".
- **W-32** Review row "Prompt" (`ReviewStep.tsx`) versus field "Brief" (`ContentStep`); dashboard column "Platform" versus "Channels" elsewhere.
- **W-33** "Entry" versus "post" in the planned queue: "Entry re-armed" (`ScheduledQueueSection.tsx:111`), "Failed to save entry", versus "Planned post" elsewhere.
- **W-34** Spelling: "colour" (inline editor, 4 places) versus "color" (5 places); "Organise" (`projects/page.tsx:104`) versus nav "Organize". The glossary picks US spelling.
- **W-35** "Back to Library" (`drafts/[id]/page.tsx:298,331`) is shown for drafts the Library does not list (not exported yet).
- **W-36** "Select Campaign" step title (`CampaignStep.tsx:74`) although choosing none is valid; the Headline panel sits under the "Captions" heading.
- **W-37** Publish dialog: "Publish Post" modal with a "Confirm" button, versus the "Publish" button on the card.
- **W-38** Publish errors with jargon shown in the Publish History drawer: "UGC post", "media container", "exportUrl" (`lib/social/*.ts`).

## 6. Docs (out of the app, in scope by the user's decision)

- **W-39** `docs/cold-start.md:165` and `scripts/seed-portrait-template.mjs:2,83` say "3:4 portrait"; `prisma/schema.prisma:21` has the same comment. PORTRAIT is 4:5 (1080x1350).
- **W-40** `docs/PRD.md` (lines 27, 49, 62, 111, 142, 172-183, 244-245) still describes Canva, an OpenAI orchestrator and gpt-image-2 as the product.
- **W-41** `docs/mcp-acp-guide.md:112` lists `goal` without the "legacy" note the MCP schema carries.
