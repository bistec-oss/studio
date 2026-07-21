// Shared response shapes for the frontend data-fetching layer.
//
// These mirror what the API route handlers actually return (see the route
// files under src/app/api/**) — not aspirational/DB shapes. Keep this file
// in sync with the routes it documents; when a route's `select`/`include`
// changes, update the matching type here rather than re-declaring an
// inline interface in a page.
import type { AspectRatio, Channel, DesignMode, TeamRole } from '@prisma/client'
import type { Role } from '@/lib/auth'

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
  | { connected: true; status: 'ACTIVE' | 'INVALID'; keyPrefix: string }
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
  retryCount: number
  nextRetryAt: string | null
  briefId: string | null
  draftId: string | null
  createdAt: string
  updatedAt: string
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

// ── Drafts ───────────────────────────────────────────────────────────────

// In-flight async draft action — mirrors the Prisma DraftAction enum.
export type DraftAction = 'REGENERATE_COPY' | 'REGENERATE_DESIGN' | 'REFINE'

// GET /api/drafts/[id] — full detail consumed by the draft review page.
// `pendingAction`/`pendingActionError`/`conflict` drive the async-action poll;
// `conflict` is derived from the stored pendingConflict and NEVER includes the
// server-side pendingHtml.
export interface DraftDetail {
  id: string
  briefId: string
  copyText: string
  imageUrl: string | null
  htmlContent: string | null
  exportUrl: string | null
  status: 'IN_PROGRESS' | 'EXPORTED' | 'PUBLISHED' | 'FAILED'
  failureReason: string | null
  pendingAction: DraftAction | null
  pendingActionError: string | null
  conflict: { conflictId: string; explanation: string } | null
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
  logoUrl: string | null
  isDefault: boolean
  prompts: BrandKitPrompt[]
  templates: BrandKitTemplateFull[]
  artifacts: BrandKitArtifact[]
}
