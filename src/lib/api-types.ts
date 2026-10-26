// Shared response shapes for the frontend data-fetching layer.
//
// These mirror what the API route handlers actually return (see the route
// files under src/app/api/**) — not aspirational/DB shapes. Keep this file
// in sync with the routes it documents; when a route's `select`/`include`
// changes, update the matching type here rather than re-declaring an
// inline interface in a page.
import type { AspectRatio, Channel, DesignMode, TeamRole } from '@prisma/client'
import type { Role } from '@/lib/auth'
import type { BackgroundSkipped } from '@/lib/drafts/backgroundNotice'
import type { ImageSourceNotice } from '@/lib/drafts/imageSourceNotice'
import type { FontNotice } from '@/lib/drafts/fontNotice'
import type { CompositionNotice } from '@/lib/drafts/compositionNotice'
import type { FactsCheck } from '@/lib/factsCheck/types'
import type { CompositionStamp } from '@/lib/designData'
import type { ModelKey, ModelSpeed, ModelTier, UserSurface } from '@/lib/models/catalogue'
import type { CredentialTier, PipelineMode } from '@/lib/models/resolve'
import type { HeadlineState, UnverifiedReason } from '@/lib/renderedText/vocab'

// ── Auth ─────────────────────────────────────────────────────────────────

export type ClaudeTokenStatus = 'ACTIVE' | 'INVALID'

// GET/PUT/DELETE /api/me/claude-token — the user's personal Claude OAuth
// token. Only the masked suffix ever leaves the server.
export type ClaudeTokenInfo =
  | {
      connected: true
      status: ClaudeTokenStatus
      keyPrefix: string
      connectedAt: string
      lastValidatedAt: string | null
    }
  | { connected: false }

// GET/PUT/DELETE /api/team/claude-token — the team's shared Claude OAuth
// token (the fallback tier below each member's personal token). The Team
// model has no status/timestamp columns for it, unlike the personal token —
// a rejected team token is simply cleared, not flagged INVALID.
export type TeamClaudeTokenInfo = { connected: true; keyPrefix: string } | { connected: false }

// GET /api/team/api-keys — machine credentials for MCP/ACP (src/mcp/auth.ts).
// Only keyPrefix is ever returned here; the plaintext appears exactly once,
// in the POST response below.
export type TeamApiKeySummary = {
  id: string
  label: string
  keyPrefix: string
  createdAt: string
  revokedAt: string | null
}

// POST /api/team/api-keys — the only response that ever carries a plaintext key.
export type TeamApiKeyCreated = { id: string; label: string; plaintext: string }

// GET/PUT/DELETE /api/me/openai-key — the user's personal OpenAI API key,
// used for image generation ahead of the team's configured IMAGE provider.
// Only the masked suffix ever leaves the server. Unlike the Claude token
// there is no live validation ping at save time (OpenAI has no free
// validation endpoint) — status flips to INVALID only after an observed
// generation failure.
export type OpenAiKeyInfo =
  | { connected: true; status: 'ACTIVE' | 'INVALID'; keyPrefix: string; provider?: 'openai' | 'gemini' }
  | { connected: false }

// GET /api/me
export interface MeResponse {
  userId: string
  role: Role
  // Whether the server runs CLI-mode generation (DESIGN_PROVIDER=cli) — the
  // only mode where personal Claude tokens are used; gates the connect UI.
  cliMode: boolean
  claudeToken: {
    status: ClaudeTokenStatus
    keyPrefix: string
    connectedAt: string
  } | null
  // Team membership + active-team resolution (see resolveActiveTeam) — lets
  // the client show a team switcher or force /choose-team without a second
  // request.
  teams: Array<{ id: string; name: string; role: TeamRole }>
  activeTeamId: string | null
  teamRole: TeamRole | null
  teamChoiceRequired: boolean
}

// ── Shared reference shapes ─────────────────────────────────────────────

export interface BrandKitRef {
  id: string
  name: string
}

export interface ProjectRef {
  id: string
  name: string
}

export interface CampaignRef {
  id: string
  name: string
  isDeleted?: boolean
}

// ── Campaigns ────────────────────────────────────────────────────────────

// GET /api/campaigns, GET /api/campaigns/[id] — both `include` the same
// shape (brandKit, projects, _count.briefs); the list additionally relies
// on `isDeleted`, which Prisma returns on both since neither route uses a
// narrowing `select`.
export interface Campaign {
  id: string
  name: string
  defaultTone: string | null
  // 027 FR-08: a post style key, or null (the wizard then falls to General).
  defaultPostStyle: string | null
  isDeleted: boolean
  brandKit: BrandKitRef | null
  projects: Array<{ project: ProjectRef }>
  _count: { briefs: number }
}

// GET /api/campaigns/[id]/briefing — versioned campaign briefing rows
export interface CampaignBriefing {
  id: string
  campaignId: string
  content: string
  version: number
  isActive: boolean
  createdBy: string
  createdAt: string
}

// GET/POST /api/campaigns/[id]/queue — scheduled-generation queue entries
export type GenerationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type PostGenerationAction = 'HOLD' | 'SCHEDULE_PUBLISH' | 'PUBLISH_NOW'

export interface ScheduledGeneration {
  id: string
  campaignId: string
  createdById: string
  topic: string
  description: string | null
  goal: string
  tone: string
  // 027 FR-06: the resolved key (null = a pre-027 entry).
  postStyle: string | null
  channels: Channel[]
  aspectRatio: AspectRatio
  designMode: DesignMode
  templateId: string | null
  template: { id: string; name: string } | null
  generateAt: string
  postAction: PostGenerationAction
  publishAt: string | null
  status: GenerationStatus
  errorReason: string | null
  // 027 FR-12: why an auto-publish action was not run (null = nothing held).
  heldReason: string | null
  retryCount: number
  nextRetryAt: string | null
  briefId: string | null
  draftId: string | null
  createdAt: string
  updatedAt: string
}

// GET /api/scheduler/status
export interface SchedulerLoopStatus {
  loop: 'scheduler' | 'generation'
  state: 'online' | 'offline' | 'never'
  lastSeenAt: string | null
}

export interface SchedulerStatus {
  loops: SchedulerLoopStatus[]
  offline: boolean
}

// GET /api/campaigns/[id]/brandkit
export type BrandKitSource = 'explicit' | 'campaign' | 'project' | 'system'

export interface ResolvedBrandKit {
  id: string
  name: string
  colors: string[]
  fonts: Array<{ name: string; url: string }>
  logoUrl: string | null
  voicePrompt: string | null
  source: BrandKitSource
}

export interface ResolvedBrandKitResponse {
  kit: ResolvedBrandKit | null
  source: BrandKitSource | null
}

// ── Projects ─────────────────────────────────────────────────────────────

// GET /api/projects (list) — defaultBrandKit + _count.campaigns, no
// `campaigns` relation array.
export interface ProjectSummary {
  id: string
  name: string
  defaultTone: string | null
  isDeleted: boolean
  defaultBrandKit: BrandKitRef | null
  _count: { campaigns: number }
}

// GET /api/projects/[id] (detail) — defaultBrandKit + campaigns relation,
// no `_count`.
export interface ProjectDetail {
  id: string
  name: string
  defaultTone: string | null
  defaultBrandKit: BrandKitRef | null
  campaigns: Array<{ campaign: CampaignRef }>
}

// ── Brand kits (public, non-admin) ──────────────────────────────────────

// GET /api/brandkits
export interface BrandKitSummary {
  id: string
  name: string
  isDefault: boolean
  previewColor: string
}

// ── Templates ────────────────────────────────────────────────────────────

// GET /api/templates
export interface TemplateSummary {
  id: string
  name: string
  brandKitId: string
  aspectRatio: AspectRatio
  brandKitName: string | null
  previewColor: string
}

// ── AI providers (public, non-admin) ────────────────────────────────────

// GET /api/providers/available?slot=COPY|IMAGE
export interface ProviderInfo {
  id: string
  providerKey: string
  label: string
  isDefault: boolean
}

// ── Models (008) ─────────────────────────────────────────────────────────

// GET/PUT /api/team/model-policy (team admins) — the team's model policy
// (008 FR-05, FR-13). `defaults` names every user surface; null = "use the
// system default". `saved` is false for a team with no stored row (A2), and
// `newModels` lists defaultAllowed catalogue entries a SAVED list doesn't
// include yet — /team labels them "New" (never added silently).
export interface TeamModelPolicyInfo {
  allowed: ModelKey[]
  defaults: Record<UserSurface, ModelKey | null>
  requirePersonalTokenForGated: boolean
  saved: boolean
  newModels: ModelKey[]
}

// GET/PUT /api/team/caption-route (024 FR-08): the team's caption credential
// route and whether it can run. /team renders this and the brief wizard gates
// on it; neither re-derives it. No key, prefix or ciphertext is ever in it.
export interface CaptionRouteState {
  setting: 'CLI' | 'API_KEY' | null
  state: 'unset' | 'ready' | 'not-ready'
  effective: 'CLI' | 'API_KEY' | 'SERVER_KEY' | 'OTHER' | null
  servingProviderId: string | null
  message: string | null
  mode: 'cli' | 'api'
}

// GET /api/models (any team member) — everything a picker needs to run the
// client-side decideModel. Never a price or an apiId: the boundary is the
// only consumer of ResolvedModel.arg (FR-13).
export interface ModelsView {
  catalogue: Array<{
    key: ModelKey
    displayName: string
    tier: ModelTier
    speed: ModelSpeed
    surfaces: UserSurface[]
    personalTokenGated: boolean
  }>
  allowed: ModelKey[]
  defaults: Partial<Record<UserSurface, ModelKey>>
  gateOn: boolean
  mode: PipelineMode
  credential: CredentialTier
  /** CLAUDE_CLI_MODEL; null in API mode, where it is ignored (A4). */
  envDefault: ModelKey | null
  /**
   * Whether the team's default caption provider runs Claude (spec open
   * question 1). false (an OpenAI COPY provider) → the CAPTION picker is
   * hidden (FR-18), and an explicit caption pick is a 400.
   */
  captionProviderIsClaude: boolean
  /**
   * 024 FR-06: the credential tier of a CAPTION run. 'team' when the team chose
   * the API key route (the team's key bills, whoever calls); otherwise the
   * plain `credential`. The CAPTION picker reads this, so it never offers a
   * model the server will refuse.
   */
  captionCredential: CredentialTier
}

// ── Drafts ───────────────────────────────────────────────────────────────

// In-flight async draft action — mirrors the Prisma DraftAction enum.
export type DraftAction = 'REGENERATE_COPY' | 'REGENERATE_DESIGN' | 'REFINE' | 'APPLY_TEXT'

// GET /api/drafts/[id] — the not-applied refine outcome (change 004 FR-14,
// AC-18; T18). A refine that failed its fidelity check twice commits
// nothing (FR-12) — this is that failure, re-derived from the retained
// rejected render on every poll rather than trusted off the stored FK (Ruling
// E), so a discard/adopt elsewhere is reflected immediately. `null` when there
// is no live not-applied outcome. Deliberately carries nothing else off the
// rejected row (no htmlSnapshot, no rejection JSON).
export interface DraftNotApplied {
  reason: string
  instruction: string
  revisionId: string
  previewUrl: string | null
  rejectedAt: string
}

// GET /api/drafts/[id] — full detail consumed by the draft review page.
// `pendingAction`/`pendingActionError`/`conflict` drive the async-action poll;
// `conflict` is derived from the stored pendingConflict and NEVER includes the
// server-side pendingHtml. `notApplied` is a SEPARATE outcome channel (FR-14)
// — distinct from both a settled success and `pendingActionError` (a crashed
// run): it means the run completed cleanly but the edit itself was rejected.
// One channel's caption (012 FR-13). `failureReason` is set when the last write
// failed, including a failed regenerate that kept good text READY (A7).
export interface DraftCaptionDetail {
  channel: Channel
  text: string
  status: 'PENDING' | 'READY' | 'FAILED'
  failureReason: string | null
  updatedAt: string
  // 008 FR-08: the model whose output this caption is (null = unknown / none),
  // and the refused value the resolver substituted away from.
  model: string | null
  modelSubstitutedFrom: string | null
  // 024 FR-04: the credential route that wrote it (null = before 024 / none).
  route: string | null
}

// 030 FR-12: what the image shows of the headline, derived from the stamp at
// read time. Each field is filled only for the states the spec names.
export interface HeadlineImage {
  state: HeadlineState
  // The stamped text, when the state is 'stale'.
  renderedHeadline: string | null
  // Why the check could not confirm, when the state is 'unconfirmed'.
  reason: UnverifiedReason | null
  // SCHEDULED posts of this draft, when the state is 'stale' or 'unconfirmed'.
  scheduledPosts: { count: number; nextAt: string } | null
}

export interface DraftDetail {
  id: string
  briefId: string
  // The on-image headline; null until the caption call writes a valid one.
  headline: string | null
  // 008 FR-08: the model that wrote the headline / the current design (the
  // current revision's stamp), each with the refused value it replaced. Null
  // = unknown (written before 008, or no model output).
  headlineModel: string | null
  headlineModelSubstitutedFrom: string | null
  designModel: string | null
  designModelSubstitutedFrom: string | null
  // Always one per registry channel, in registry order.
  captions: DraftCaptionDetail[]
  // 008 FR-20 / spec open question 1: whether THIS draft's caption provider
  // (the brief's own key, else the team default) is Claude — the provider a
  // caption or headline regenerate runs on, so the caption pickers hide
  // exactly when the server would refuse a pick.
  captionProviderIsClaude: boolean
  imageUrl: string | null
  htmlContent: string | null
  exportUrl: string | null
  status: 'IN_PROGRESS' | 'EXPORTED' | 'PUBLISHED' | 'FAILED'
  failureReason: string | null
  pendingAction: DraftAction | null
  pendingActionError: string | null
  conflict: { conflictId: string; explanation: string } | null
  notApplied: DraftNotApplied | null
  // 005 FR-07: set when the current design has no AI background for a reason
  // other than the model deciding it didn't need one.
  backgroundSkipped: BackgroundSkipped | null
  // 031 FR-14: set when the user's own image key failed and the team's
  // provider made the image (null = nothing to say).
  imageSourceNotice: ImageSourceNotice | null
  // 031 FR-24: set when the live render could not load a post font (null = nothing to say).
  fontNotice: FontNotice | null
  // 009 FR-15: the stamped composition (null = before 009 or Path A history)
  // and the plain-language notice derived from it (null = nothing to say).
  composition: CompositionStamp | null
  compositionNotice: CompositionNotice | null
  // 027 FR-13: the stored facts check (null = never checked) and the post
  // style the draft was made with (null = before 027).
  factsCheck: FactsCheck | null
  postStyle: { key: string; label: string; version: number } | null
  headlineImage: HeadlineImage
  createdAt: string
  revisionCount: number
  currentRevisionNumber: number | null
  brandKitName: string | null
  brief: {
    id: string
    topic: string
    goal: string
    tone: string
    channels: Channel[]
    aspectRatio: AspectRatio
    designMode: DesignMode
  }
  posts: Array<{
    id: string
    channel: string
    status: string
    scheduledAt: string | null
    publishedAt: string | null
  }>
}

// ── Library (drafts + posts) ────────────────────────────────────────────

// PostRecord as embedded in a library draft tile.
export interface PostRecord {
  id: string
  channel: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  platformId: string | null
  errorReason: string | null
}

// GET /api/library — one row of the `drafts` array.
export interface DraftRecord {
  id: string
  exportUrl: string | null
  status: string
  createdAt: string
  // 030 FR-12: the state only (no text), from the stamp.
  headlineState: HeadlineState
  brief: {
    topic: string
    channels: string[]
    aspectRatio: AspectRatio
    campaign: { name: string; brandKit: { name: string } | null } | null
  }
  posts: PostRecord[]
}

export interface LibraryResponse {
  drafts: DraftRecord[]
  total: number
  page: number
  pageSize: number
}

// ── Brief drafts (unfinished-brief autosave) ────────────────────────────

// GET /api/brief-drafts — one row of the `drafts` array (list omits payload;
// GET /api/brief-drafts/[id] returns it for resume). Payload shape lives in
// src/lib/brief/briefDraftPayload.ts (client-safe zod schema).
export interface BriefDraftSummary {
  id: string
  topic: string
  updatedAt: string
}

// PUT /api/brief-drafts
export interface SaveBriefDraftResponse {
  id: string
}

// ── Admin: teams (super-admin platform management) ──────────────────────

// GET/POST /api/admin/teams
export interface AdminTeamSummary {
  id: string
  name: string
  memberCount: number
  createdAt: string
}

// GET/POST /api/admin/teams/[id]/members — POST upsert response mirrors GET's shape.
export interface AdminTeamMember {
  userId: string
  name: string
  loginLabel: string
  role: TeamRole
}

// ── Admin: AI providers ──────────────────────────────────────────────────

export type ProviderSlot = 'COPY' | 'IMAGE'

// GET /api/admin/providers
export interface AdminProvider {
  id: string
  slot: ProviderSlot
  providerKey: string
  providerName: string
  label: string
  keyPrefix: string
  isEnabled: boolean
  isDefault: boolean
  createdAt: string
}

// ── Admin: social channels ──────────────────────────────────────────────

export interface ChannelStatus {
  connected: boolean
  updatedAt?: string
}

export interface ChannelMap {
  INSTAGRAM: ChannelStatus
  LINKEDIN: ChannelStatus
}

// ── Admin: brand kits ────────────────────────────────────────────────────

export interface BrandKitPrompt {
  id: string
  content: string
  version: number
  isActive: boolean
  createdAt: string
  // 031 FR-34: the kit fonts before an assistant apply that changed them; null otherwise.
  previousFonts?: { fonts: Array<{ name: string; url: string }>; scriptFonts: Record<string, string> | null } | null
}

export interface BrandKitTemplateFull {
  id: string
  name: string
  htmlTemplate: string
  aspectRatio: AspectRatio
  createdAt: string
}

export interface BrandKitArtifact {
  id: string
  name: string
  type: string
  url: string
  feedToAI: boolean
}

// GET /api/admin/brandkits — list item (active-prompt preview + counts only).
export interface AdminBrandKitSummary {
  id: string
  name: string
  colors: string[]
  fonts: Array<{ name: string; url: string }>
  logoUrl: string | null
  isDefault: boolean
  prompts: Array<{ content: string; version: number }>
  _count: { templates: number; artifacts: number }
}

// GET /api/admin/brandkits/[id] — full detail (all prompt versions, templates,
// artifacts).
export interface AdminBrandKitDetail {
  id: string
  name: string
  colors: string[]
  fonts: Array<{ name: string; url: string }>
  // 031 FR-21: { [script]: family }, or null when none is set.
  scriptFonts?: Record<string, string> | null
  // 031 FR-25: the date of the font list the picker searches.
  fontCatalogueDate?: string
  typographyFindings?: Array<{ code: string; detail: string }>
  logoUrl: string | null
  isDefault: boolean
  prompts: BrandKitPrompt[]
  templates: BrandKitTemplateFull[]
  artifacts: BrandKitArtifact[]
}

// POST /api/admin/brandkits/[id]/prompts/improve (007 FR-15): `lostRules` is the
// measurable rules (original spelling) the rewrite no longer carries.
export interface ImprovePromptResponse {
  draft: string
  lostRules: string[]
}

// POST /api/admin/brandkits/[id]/prompts/upgrade (007 FR-05). Errors: 400 zod,
// 404, 409 { code: 'STALE_BASE', activeVersion }, 422 { code, message },
// 502 { code: 'UPGRADE_PARSE_FAILED', message }.
export type UpgradeEdit = import('@/lib/designData/authoring').Edit
export type UpgradeRejection = import('@/lib/designData/authoring').Rejection
export type UpgradeResponse =
  | {
      outcome: 'edits'
      baseVersion: number
      edits: UpgradeEdit[]
      rejected: UpgradeRejection[]
      candidates: number
    }
  | {
      outcome: 'none'
      reason: 'no-candidates' | 'model-proposed-none' | 'all-rejected'
      rejected: UpgradeRejection[]
      candidates: number
    }
export interface UpgradeStaleBase {
  code: 'STALE_BASE'
  activeVersion: number
}
