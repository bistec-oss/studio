// 027 FR-16 (the golden half): the prompt builders called the way they were
// called before 027, with no post style. The expected strings are in
// preStyleGolden.json, captured from these same functions at the base commit
// (8816d89, before any 027 edit to a builder) in a git worktree. The test
// asserts byte equality, so a brief with no style cannot change any prompt.
// 031 (T7) adapted the golden JSON by exactly two substitutions, the change's own prompt edits:
// Poppins's request is the recomputed catalogue URL (FR-23), and SCRIPT_SUPPORT_NOTE gains its
// one sentence.
//
// This file calls only the builders' pre-027 option sets. It must never pass
// `imageRules` or `captionRules`.
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildCaptionPrompt } from '@/lib/agent/prompts/caption'
import { buildPathASystemPrompt, buildPathAUserMessage } from '@/lib/agent/prompts/pathA'
import { buildPathBSystemPrompt, buildPathBUserMessage } from '@/lib/agent/prompts/pathB'
import { buildBackgroundDecisionPrompt } from '@/lib/agent/prompts/background'
import { buildRefineSystemPrompt } from '@/lib/agent/prompts/refine'
import { buildBriefInput } from '@/lib/agent/briefInput'
import { CAPTION_CHANNELS } from '@/lib/channels'

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Golden',
  colors: ['#0A1F44', '#00A99D'],
  fonts: [{ name: 'Poppins', url: 'https://fonts.example/poppins' }],
  logoUrl: 'https://cdn.example/logo.png',
  logos: [{ label: 'Primary mark', url: 'https://cdn.example/logo.png', primary: true }],
  voicePrompt: 'Warm and direct. Keep clear space of 1.5 wordmark letters.',
  source: 'explicit',
}
const BRIEFING = 'Industry Readiness Programme: name the programme in the headline.'

// A Brief row as it was before 027: no postStyle column at all.
const brief = {
  id: 'b1',
  topic: 'Launch day',
  description: 'We ship the new app',
  goal: 'awareness',
  tone: 'bold',
  channels: ['INSTAGRAM', 'LINKEDIN'],
} as unknown as Parameters<typeof buildBriefInput>[0]

const input = buildBriefInput(brief, kit, BRIEFING)
const targets = ['HEADLINE', ...CAPTION_CHANNELS.map((s) => s.channel)] as const

export const PRE_STYLE_CASES: Record<string, () => string> = {
  briefInput: () => JSON.stringify(buildBriefInput(brief, kit, BRIEFING)),
  briefInputBare: () => JSON.stringify(buildBriefInput(brief)),
  captionSystem: () => buildCaptionPrompt(input, targets).system,
  captionUser: () => buildCaptionPrompt(input, targets).user,
  captionUserOneTarget: () => buildCaptionPrompt(input, ['LINKEDIN']).user,
  pathASystemApi: () =>
    buildPathASystemPrompt({ kit, mode: 'api', width: 1080, height: 1080, hasInlineAssets: true, campaignBriefing: BRIEFING }),
  pathASystemCli: () =>
    buildPathASystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1350,
      hasInlineAssets: false,
      additionalImageUrl: 'https://cdn.example/a.png',
    }),
  pathAUserApi: () =>
    buildPathAUserMessage({
      slimTemplate: '<div>__HEADLINE__</div>',
      headline: 'Ship it today',
      topic: 'Launch day',
      description: 'We ship the new app',
      mode: 'api',
      width: 1080,
      height: 1080,
    }),
  pathAUserCli: () =>
    buildPathAUserMessage({
      slimTemplate: '<div>__HEADLINE__</div>',
      headline: 'Ship it today',
      topic: 'Launch day',
      description: null,
      mode: 'cli',
      width: 1080,
      height: 1350,
      additionalImageUrl: 'https://cdn.example/a.png',
    }),
  pathBSystem: () =>
    buildPathBSystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1080,
      artifactUrls: ['https://cdn.example/ref.png'],
      referenceTemplateHtml: null,
      backgroundImageUrl: 'https://cdn.example/bg.png',
    }),
  pathBUser: () =>
    buildPathBUserMessage({
      topic: 'Launch day',
      description: 'We ship the new app',
      goal: 'awareness',
      tone: 'bold',
      channels: ['INSTAGRAM', 'LINKEDIN'],
      headline: 'Ship it today',
      mode: 'cli',
      width: 1080,
      height: 1080,
      briefImages: [{ url: 'https://cdn.example/p.png', intent: 'embed' }],
      campaignBriefing: BRIEFING,
    }),
  pathBUserBare: () =>
    buildPathBUserMessage({
      topic: 'Launch day',
      description: null,
      goal: 'awareness',
      tone: 'bold',
      channels: ['INSTAGRAM'],
      headline: 'Ship it today',
      mode: 'api',
      width: 1080,
      height: 1080,
    }),
  backgroundSystem: () =>
    buildBackgroundDecisionPrompt({
      kit,
      topic: 'Launch day',
      description: 'We ship the new app',
      goal: 'awareness',
      tone: 'bold',
      headline: 'Ship it today',
      campaignBriefing: BRIEFING,
    }).system,
  backgroundUser: () =>
    buildBackgroundDecisionPrompt({
      kit,
      topic: 'Launch day',
      description: 'We ship the new app',
      goal: 'awareness',
      tone: 'bold',
      headline: 'Ship it today',
      campaignBriefing: BRIEFING,
    }).user,
  refineSystemCli: () =>
    buildRefineSystemPrompt({ kit, mode: 'cli', width: 1080, height: 1080, hasInlineAssets: true, backgroundImageUrl: 'https://cdn.example/n.png' }),
  refineSystemApi: () =>
    buildRefineSystemPrompt({ kit, mode: 'api', width: 1080, height: 1350, hasInlineAssets: false }),
}
