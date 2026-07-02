// Shared response shapes for the frontend data-fetching layer.
//
// These mirror what the API route handlers actually return (see the route
// files under src/app/api/**) — not aspirational/DB shapes. Keep this file
// in sync with the routes it documents; when a route's `select`/`include`
// changes, update the matching type here rather than re-declaring an
// inline interface in a page.
import type { AspectRatio } from '@prisma/client'
import type { Role } from '@/lib/auth'

// ── Auth ─────────────────────────────────────────────────────────────────

// GET /api/me
export interface MeResponse {
  userId: string
  role: Role
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
