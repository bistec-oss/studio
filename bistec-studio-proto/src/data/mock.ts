// ─── Types ───────────────────────────────────────────────────────────────────

export type Platform = 'instagram' | 'linkedin'
export type PathType = 'A' | 'B'
export type BriefStatus = 'draft' | 'generating' | 'ready' | 'published'
export type DraftStatus = 'pending' | 'generating' | 'ready' | 'published' | 'failed'
export type ProviderType = 'copy' | 'image' | 'both'
export type ImageIntent = 'embed' | 'reference'

export type BriefImage = {
  url: string
  intent: ImageIntent
  filename: string
}

export type Project = {
  id: string
  name: string
  defaultBrandKitId?: string
  defaultTone?: string
  status: 'active' | 'archived'
  createdAt: string
}

export type BrandKit = {
  id: string
  name: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  fontHeading: string
  fontBody: string
  logoUrl: string
  isDefault: boolean
  templateCount: number
  createdAt: string
}

export type BrandKitTemplate = {
  id: string
  brandKitId: string
  name: string
  description: string
  previewColor: string
}

export type Campaign = {
  id: string
  name: string
  projectIds: string[]   // M:N — a campaign can belong to multiple projects
  brandKitId?: string    // overrides project default if set
  defaultTone?: string
  status: 'active' | 'draft' | 'completed' | 'archived'
  postCount: number
  createdAt: string
}

export type Brief = {
  id: string
  campaignId: string | null   // null = Uncategorized
  campaignName: string | null
  projectId: string | null    // derived from campaign's primary project
  platform: Platform
  pathType: PathType
  templateId?: string
  referenceTemplateId?: string
  briefImages: BriefImage[]
  copyPrompt: string
  status: BriefStatus
  createdAt: string
}

export type DraftRevision = {
  id: string
  draftId: string
  revisionNumber: number
  instruction: string
  exportUrl: string
  createdAt: string
}

export type Draft = {
  id: string
  briefId: string
  briefSummary: string
  campaignId: string | null   // null = Uncategorized
  campaignName: string | null
  projectId: string | null
  projectName: string | null
  platform: Platform
  pathType: PathType
  status: DraftStatus
  exportUrl: string
  revisions: DraftRevision[]
  createdAt: string
}

export type AvailableProvider = {
  id: string
  name: string
  type: ProviderType
  keyPrefix: string
  isDefault: boolean
  model: string
  status: 'connected' | 'error' | 'unconfigured'
  lastUsed?: string
}

export type ActivityEvent = {
  id: string
  type: 'draft_ready' | 'post_published' | 'brief_created' | 'revision_added' | 'provider_connected'
  title: string
  meta: string
  time: string
  icon: 'check' | 'publish' | 'brief' | 'revision' | 'provider'
}

// Legacy type kept for Header search compat
export type Item = {
  id: string
  name: string
  category: string
  status: string
  priority: string
  assigned: string | null
  value: number
  created: string
}

// ─── Brand Kits ──────────────────────────────────────────────────────────────

export const brandKits: BrandKit[] = [
  {
    id: 'bk1',
    name: 'Bistec Core',
    primaryColor: '#2563eb',
    secondaryColor: '#7c3aed',
    accentColor: '#10b981',
    fontHeading: 'Syne',
    fontBody: 'DM Sans',
    logoUrl: '',
    isDefault: true,
    templateCount: 4,
    createdAt: '2026-05-01',
  },
  {
    id: 'bk2',
    name: 'Bistec Care',
    primaryColor: '#0ea5e9',
    secondaryColor: '#6366f1',
    accentColor: '#f59e0b',
    fontHeading: 'Inter',
    fontBody: 'Inter',
    logoUrl: '',
    isDefault: false,
    templateCount: 2,
    createdAt: '2026-05-15',
  },
  {
    id: 'bk3',
    name: 'Bistec Events',
    primaryColor: '#dc2626',
    secondaryColor: '#ea580c',
    accentColor: '#facc15',
    fontHeading: 'Poppins',
    fontBody: 'DM Sans',
    logoUrl: '',
    isDefault: false,
    templateCount: 3,
    createdAt: '2026-06-01',
  },
]

export const brandKitTemplates: BrandKitTemplate[] = [
  { id: 't1', brandKitId: 'bk1', name: 'Blue Gradient Card', description: 'Bold heading with gradient overlay', previewColor: '#2563eb' },
  { id: 't2', brandKitId: 'bk1', name: 'Clean Split', description: 'Left image, right text block', previewColor: '#7c3aed' },
  { id: 't3', brandKitId: 'bk1', name: 'Announcement Banner', description: 'Full-bleed with centered call-out', previewColor: '#10b981' },
  { id: 't4', brandKitId: 'bk1', name: 'Stat Showcase', description: 'Three-column metrics layout', previewColor: '#2563eb' },
  { id: 't5', brandKitId: 'bk2', name: 'Sky Card', description: 'Light airy card with skyblue accents', previewColor: '#0ea5e9' },
  { id: 't6', brandKitId: 'bk2', name: 'Professional Post', description: 'Formal grid layout for B2B', previewColor: '#6366f1' },
  { id: 't7', brandKitId: 'bk3', name: 'Event Promo', description: 'High-energy event announcement', previewColor: '#dc2626' },
  { id: 't8', brandKitId: 'bk3', name: 'Speaker Spotlight', description: 'Speaker photo with event details', previewColor: '#ea580c' },
  { id: 't9', brandKitId: 'bk3', name: 'Recap Post', description: 'Post-event highlights layout', previewColor: '#facc15' },
]

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects: Project[] = [
  {
    id: 'p1',
    name: 'Q3 2026 Growth',
    defaultBrandKitId: 'bk1',
    defaultTone: 'Professional, energetic',
    status: 'active',
    createdAt: '2026-05-20',
  },
  {
    id: 'p2',
    name: 'Events 2026',
    defaultBrandKitId: 'bk3',
    defaultTone: 'Exciting, bold',
    status: 'active',
    createdAt: '2026-06-01',
  },
  {
    id: 'p3',
    name: 'Brand Awareness',
    defaultBrandKitId: 'bk1',
    defaultTone: 'Warm, approachable',
    status: 'active',
    createdAt: '2026-04-01',
  },
]

// ─── Campaigns ───────────────────────────────────────────────────────────────

export const campaigns: Campaign[] = [
  {
    id: 'c1',
    name: 'Q3 Product Launch',
    projectIds: ['p1'],
    brandKitId: 'bk1',
    status: 'active',
    postCount: 8,
    createdAt: '2026-06-01',
  },
  {
    id: 'c2',
    name: 'Hiring Push — July',
    projectIds: ['p1'],
    brandKitId: undefined,  // inherits from project p1 → bk1
    status: 'active',
    postCount: 5,
    createdAt: '2026-06-10',
  },
  {
    id: 'c3',
    name: 'Bistec Summit 2026',
    projectIds: ['p2'],
    brandKitId: 'bk3',
    status: 'draft',
    postCount: 2,
    createdAt: '2026-06-15',
  },
  {
    id: 'c4',
    name: 'Q2 Highlights',
    projectIds: ['p3'],
    brandKitId: 'bk1',
    status: 'completed',
    postCount: 12,
    createdAt: '2026-04-01',
  },
  {
    id: 'c5',
    name: 'Social Proof Series',
    projectIds: [],         // standalone — no project
    brandKitId: undefined,  // falls back to system default bk1
    status: 'active',
    postCount: 3,
    createdAt: '2026-06-18',
  },
]

// ─── Briefs ───────────────────────────────────────────────────────────────────

export const briefs: Brief[] = [
  {
    id: 'br1',
    campaignId: 'c1',
    campaignName: 'Q3 Product Launch',
    projectId: 'p1',
    platform: 'instagram',
    pathType: 'A',
    templateId: 't1',
    briefImages: [],
    copyPrompt: 'Announce the launch of bistec-studio with excitement and professionalism. Focus on AI-driven efficiency.',
    status: 'ready',
    createdAt: '2026-06-18',
  },
  {
    id: 'br2',
    campaignId: 'c2',
    campaignName: 'Hiring Push — July',
    projectId: 'p1',
    platform: 'linkedin',
    pathType: 'B',
    referenceTemplateId: 't2',
    briefImages: [
      { url: '', intent: 'embed', filename: 'office.jpg' },
    ],
    copyPrompt: "We're hiring senior engineers. Creative, driven people who want to shape the future of internal tools.",
    status: 'generating',
    createdAt: '2026-06-19',
  },
  {
    id: 'br3',
    campaignId: 'c1',
    campaignName: 'Q3 Product Launch',
    projectId: 'p1',
    platform: 'linkedin',
    pathType: 'B',
    briefImages: [
      { url: '', intent: 'reference', filename: 'product-shot.jpg' },
    ],
    copyPrompt: 'Feature showcase post — highlight Path A template rendering and AGUI refinement chat.',
    status: 'draft',
    createdAt: '2026-06-19',
  },
  {
    id: 'br4',
    campaignId: 'c3',
    campaignName: 'Bistec Summit 2026',
    projectId: 'p2',
    platform: 'instagram',
    pathType: 'A',
    templateId: 't7',
    briefImages: [],
    copyPrompt: 'Summit announcement post. Bold, exciting. September 12 — Colombo. Register now.',
    status: 'published',
    createdAt: '2026-06-17',
  },
  {
    id: 'br5',
    campaignId: null,
    campaignName: null,
    projectId: null,
    platform: 'instagram',
    pathType: 'B',
    briefImages: [],
    copyPrompt: 'Quick Instagram post celebrating 5 years of Bistec.',
    status: 'ready',
    createdAt: '2026-06-20',
  },
]

// ─── Drafts ───────────────────────────────────────────────────────────────────

export const draftRevisions: DraftRevision[] = [
  { id: 'rv1', draftId: 'd1', revisionNumber: 1, instruction: 'Initial generation', exportUrl: '', createdAt: '2026-06-18T10:00:00Z' },
  { id: 'rv2', draftId: 'd1', revisionNumber: 2, instruction: 'Make the heading larger and bolder', exportUrl: '', createdAt: '2026-06-18T10:12:00Z' },
  { id: 'rv3', draftId: 'd1', revisionNumber: 3, instruction: 'Change background to a deep blue gradient', exportUrl: '', createdAt: '2026-06-18T10:25:00Z' },
  { id: 'rv4', draftId: 'd2', revisionNumber: 1, instruction: 'Initial generation', exportUrl: '', createdAt: '2026-06-19T08:00:00Z' },
  { id: 'rv5', draftId: 'd3', revisionNumber: 1, instruction: 'Initial generation', exportUrl: '', createdAt: '2026-06-17T14:00:00Z' },
  { id: 'rv6', draftId: 'd3', revisionNumber: 2, instruction: 'Add the summit date more prominently', exportUrl: '', createdAt: '2026-06-17T14:18:00Z' },
  { id: 'rv7', draftId: 'd5', revisionNumber: 1, instruction: 'Initial generation', exportUrl: '', createdAt: '2026-06-20T09:00:00Z' },
]

export const drafts: Draft[] = [
  {
    id: 'd1',
    briefId: 'br1',
    briefSummary: 'bistec-studio launch post',
    campaignId: 'c1',
    campaignName: 'Q3 Product Launch',
    projectId: 'p1',
    projectName: 'Q3 2026 Growth',
    platform: 'instagram',
    pathType: 'A',
    status: 'ready',
    exportUrl: '',
    revisions: draftRevisions.filter(r => r.draftId === 'd1'),
    createdAt: '2026-06-18T10:00:00Z',
  },
  {
    id: 'd2',
    briefId: 'br2',
    briefSummary: 'Senior engineer hiring',
    campaignId: 'c2',
    campaignName: 'Hiring Push — July',
    projectId: 'p1',
    projectName: 'Q3 2026 Growth',
    platform: 'linkedin',
    pathType: 'B',
    status: 'generating',
    exportUrl: '',
    revisions: draftRevisions.filter(r => r.draftId === 'd2'),
    createdAt: '2026-06-19T08:00:00Z',
  },
  {
    id: 'd3',
    briefId: 'br4',
    briefSummary: 'Bistec Summit announcement',
    campaignId: 'c3',
    campaignName: 'Bistec Summit 2026',
    projectId: 'p2',
    projectName: 'Events 2026',
    platform: 'instagram',
    pathType: 'A',
    status: 'published',
    exportUrl: '',
    revisions: draftRevisions.filter(r => r.draftId === 'd3'),
    createdAt: '2026-06-17T14:00:00Z',
  },
  {
    id: 'd4',
    briefId: 'br3',
    briefSummary: 'Feature showcase post',
    campaignId: 'c1',
    campaignName: 'Q3 Product Launch',
    projectId: 'p1',
    projectName: 'Q3 2026 Growth',
    platform: 'linkedin',
    pathType: 'B',
    status: 'failed',
    exportUrl: '',
    revisions: [],
    createdAt: '2026-06-19T09:00:00Z',
  },
  {
    id: 'd5',
    briefId: 'br5',
    briefSummary: '5 years of Bistec celebration',
    campaignId: null,
    campaignName: null,
    projectId: null,
    projectName: null,
    platform: 'instagram',
    pathType: 'B',
    status: 'ready',
    exportUrl: '',
    revisions: draftRevisions.filter(r => r.draftId === 'd5'),
    createdAt: '2026-06-20T09:00:00Z',
  },
]

// ─── AI Providers ─────────────────────────────────────────────────────────────

export const providers: AvailableProvider[] = [
  {
    id: 'ap1',
    name: 'Anthropic Claude',
    type: 'copy',
    keyPrefix: 'sk-ant-api03-••••',
    isDefault: true,
    model: 'claude-sonnet-4-6',
    status: 'connected',
    lastUsed: '2026-06-19T10:00:00Z',
  },
  {
    id: 'ap2',
    name: 'OpenAI GPT',
    type: 'image',
    keyPrefix: 'sk-proj-••••',
    isDefault: false,
    model: 'gpt-image-2',
    status: 'connected',
    lastUsed: '2026-06-18T15:30:00Z',
  },
  {
    id: 'ap3',
    name: 'Stability AI',
    type: 'image',
    keyPrefix: '',
    isDefault: false,
    model: 'stable-diffusion-xl',
    status: 'unconfigured',
  },
]

// ─── Activity Feed ────────────────────────────────────────────────────────────

export const activityFeed: ActivityEvent[] = [
  { id: 'a1', type: 'draft_ready', title: 'Draft ready', meta: 'bistec-studio launch · Q3 Product Launch · Instagram', time: '2 min ago', icon: 'check' },
  { id: 'a2', type: 'brief_created', title: 'Brief created', meta: 'Senior hiring post · Hiring Push — July · Path B', time: '14 min ago', icon: 'brief' },
  { id: 'a3', type: 'revision_added', title: 'Revision applied', meta: 'Change background to deep blue gradient', time: '32 min ago', icon: 'revision' },
  { id: 'a4', type: 'post_published', title: 'Post published', meta: 'Bistec Summit announcement · Instagram', time: '2 hr ago', icon: 'publish' },
  { id: 'a5', type: 'revision_added', title: 'Revision applied', meta: 'Make heading larger and bolder', time: '3 hr ago', icon: 'revision' },
  { id: 'a6', type: 'provider_connected', title: 'Provider connected', meta: 'Anthropic Claude · claude-sonnet-4-6', time: '1 day ago', icon: 'provider' },
]

// ─── Derived helpers ──────────────────────────────────────────────────────────

export function getCampaignBrandKit(campaign: Campaign): BrandKit {
  if (campaign.brandKitId) {
    return brandKits.find(b => b.id === campaign.brandKitId) ?? brandKits.find(b => b.isDefault)!
  }
  const project = projects.find(p => campaign.projectIds[0] && p.id === campaign.projectIds[0])
  if (project?.defaultBrandKitId) {
    return brandKits.find(b => b.id === project.defaultBrandKitId) ?? brandKits.find(b => b.isDefault)!
  }
  return brandKits.find(b => b.isDefault)!
}

export function getBrandKitSource(campaign: Campaign): 'campaign' | 'project' | 'default' {
  if (campaign.brandKitId) return 'campaign'
  const project = projects.find(p => campaign.projectIds[0] && p.id === campaign.projectIds[0])
  if (project?.defaultBrandKitId) return 'project'
  return 'default'
}

export function getProjectCampaigns(projectId: string): Campaign[] {
  return campaigns.filter(c => c.projectIds.includes(projectId))
}

export function getCampaignDrafts(campaignId: string): Draft[] {
  return drafts.filter(d => d.campaignId === campaignId)
}

export function getUncategorizedDrafts(): Draft[] {
  return drafts.filter(d => d.campaignId === null)
}

// ─── items alias — kept for Header search ────────────────────────────────────

export const items: Item[] = [
  ...drafts.map(d => ({ id: d.id, name: d.briefSummary, category: d.platform, status: d.status, priority: 'medium', assigned: null, value: 0, created: d.createdAt.slice(0, 10) })),
  ...campaigns.map(c => ({ id: c.id, name: c.name, category: 'campaign', status: c.status, priority: 'medium', assigned: null, value: 0, created: c.createdAt })),
  ...projects.map(p => ({ id: p.id, name: p.name, category: 'project', status: p.status, priority: 'medium', assigned: null, value: 0, created: p.createdAt })),
  ...brandKits.map(b => ({ id: b.id, name: b.name, category: 'brand-kit', status: b.isDefault ? 'active' : 'pending', priority: 'low', assigned: null, value: 0, created: b.createdAt })),
]
