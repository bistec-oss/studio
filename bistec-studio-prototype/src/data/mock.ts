// ─── Domain Types ───────────────────────────────────────────────────────────

export type BrandKitSource = 'CANVA' | 'BACKEND' | 'HYBRID'
export type ArtifactType = 'LOGO' | 'FONT' | 'COLOR' | 'REFERENCE_IMAGE' | 'EXAMPLE_POST' | 'OTHER'
export type DesignMode = 'TEMPLATE' | 'GENERATE'
export type DraftStatus = 'IN_PROGRESS' | 'EXPORTED' | 'PUBLISHED' | 'FAILED'
export type PostStatus = 'PENDING' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED' | 'CANCELLED'
export type Channel = 'INSTAGRAM' | 'LINKEDIN'
export type ProviderSlot = 'COPY' | 'IMAGE'

export type BrandKitPrompt = {
  id: string; version: number; content: string
  isActive: boolean; createdBy: string; createdAt: string
}

export type BrandKitArtifact = {
  id: string; type: ArtifactType; name: string; url: string; feedToAI: boolean
}

export type BrandKit = {
  id: string; name: string; source: BrandKitSource
  canvaBrandKitId?: string; isDefault: boolean; isDeleted: boolean
  prompts: BrandKitPrompt[]; artifacts: BrandKitArtifact[]; createdAt: string
}

export type Project = {
  id: string; name: string; defaultBrandKitId?: string; defaultTone?: string
  campaignCount: number; postCount: number; isDeleted: boolean; createdAt: string
}

export type Campaign = {
  id: string; name: string; brandKitId?: string; defaultTone?: string
  projectIds: string[]; postCount: number; draftCount: number; isDeleted: boolean; createdAt: string
}

export type Draft = {
  id: string; briefId: string; topic: string; goal: string; tone: string
  channels: Channel[]; designMode: DesignMode; copyText: string; imageUrl: string
  exportUrl?: string; canvaDesignId?: string; templateName?: string; status: DraftStatus
  campaignId?: string; campaignName?: string; copyProviderLabel: string; imageProviderLabel: string; createdAt: string
}

export type Post = {
  id: string; draftId: string; topic: string; channel: Channel; status: PostStatus
  scheduledAt?: string; publishedAt?: string; platformId?: string; errorReason?: string
  campaignId?: string; campaignName?: string; projectName?: string
  exportUrl: string; copySnippet: string; createdAt: string
}

export type AvailableProvider = {
  id: string; slot: ProviderSlot; providerKey: string; label: string
  isEnabled: boolean; isDefault: boolean
}

export type FeedItem = {
  actor: string; action: string; time: string
  status: 'complete' | 'processing'; type: 'publish' | 'draft' | 'schedule' | 'generate'
}

// ─── Brand Kits ──────────────────────────────────────────────────────────────

export const brandKits: BrandKit[] = [
  {
    id: 'bk-001', name: 'Bistec Main', source: 'HYBRID',
    canvaBrandKitId: 'bk_xKf8mN2pQrT', isDefault: true, isDeleted: false, createdAt: '2026-01-10',
    prompts: [
      { id: 'p-001-v3', version: 3, isActive: true, createdBy: 'admin@bistec.lk', createdAt: '2026-06-01',
        content: 'You are the Bistec marketing voice. Bistec is a technology company building AI-powered software. Tone: confident, clear, approachable. Avoid jargon. Lead with the problem we solve, not the technology. Use active voice. Keep sentences short. For LinkedIn: professional but conversational. For Instagram: energetic, visual, use 3-5 relevant hashtags.' },
      { id: 'p-001-v2', version: 2, isActive: false, createdBy: 'admin@bistec.lk', createdAt: '2026-04-15',
        content: 'You are Bistec\'s marketing voice. Professional, innovative, and human. For LinkedIn posts keep it under 300 words. For Instagram use punchy captions under 150 chars with 5 hashtags.' },
      { id: 'p-001-v1', version: 1, isActive: false, createdBy: 'admin@bistec.lk', createdAt: '2026-01-10',
        content: 'Write marketing copy for Bistec, a software company. Be professional and informative.' },
    ],
    artifacts: [
      { id: 'a-001', type: 'LOGO', name: 'Bistec Logo (Primary)', url: '', feedToAI: false },
      { id: 'a-002', type: 'COLOR', name: 'Brand Color Palette', url: '', feedToAI: true },
      { id: 'a-003', type: 'REFERENCE_IMAGE', name: 'Team Photo (Office)', url: '', feedToAI: true },
      { id: 'a-004', type: 'EXAMPLE_POST', name: 'LinkedIn Post Example', url: '', feedToAI: true },
    ],
  },
  {
    id: 'bk-002', name: 'Bistec Product', source: 'BACKEND',
    isDefault: false, isDeleted: false, createdAt: '2026-02-20',
    prompts: [
      { id: 'p-002-v1', version: 1, isActive: true, createdBy: 'admin@bistec.lk', createdAt: '2026-02-20',
        content: 'Write product-focused marketing copy for Bistec\'s software products. Highlight features, benefits, and technical excellence. Target audience: CTOs, tech leads, and senior engineers. Be specific, cite capabilities, use evidence.' },
    ],
    artifacts: [
      { id: 'a-005', type: 'REFERENCE_IMAGE', name: 'Product Screenshot 1', url: '', feedToAI: true },
      { id: 'a-006', type: 'REFERENCE_IMAGE', name: 'Product Screenshot 2', url: '', feedToAI: true },
    ],
  },
  {
    id: 'bk-003', name: 'Employer Brand', source: 'CANVA',
    canvaBrandKitId: 'bk_eRp4sV7wYzA', isDefault: false, isDeleted: false, createdAt: '2026-03-05',
    prompts: [
      { id: 'p-003-v1', version: 1, isActive: true, createdBy: 'admin@bistec.lk', createdAt: '2026-03-05',
        content: 'You are writing for Bistec\'s employer brand. Focus on culture, people, growth, and opportunity. Target: top engineering and product talent. Be authentic, warm, and aspirational. Avoid corporate speak.' },
    ],
    artifacts: [
      { id: 'a-007', type: 'REFERENCE_IMAGE', name: 'Culture Photo', url: '', feedToAI: true },
      { id: 'a-008', type: 'EXAMPLE_POST', name: 'Hiring Post Example', url: '', feedToAI: true },
    ],
  },
]

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects: Project[] = [
  { id: 'proj-001', name: 'Q3 Marketing Push', defaultBrandKitId: 'bk-001', defaultTone: 'Confident, results-focused', campaignCount: 3, postCount: 14, isDeleted: false, createdAt: '2026-06-01' },
  { id: 'proj-002', name: 'Product Launch — Studio AI', defaultBrandKitId: 'bk-002', defaultTone: 'Technical, precise', campaignCount: 2, postCount: 8, isDeleted: false, createdAt: '2026-06-05' },
  { id: 'proj-003', name: 'Employer Brand 2026', defaultBrandKitId: 'bk-003', defaultTone: 'Authentic, warm', campaignCount: 1, postCount: 5, isDeleted: false, createdAt: '2026-05-20' },
  { id: 'proj-004', name: 'Year-End Review (Archived)', defaultBrandKitId: 'bk-001', campaignCount: 0, postCount: 3, isDeleted: true, createdAt: '2025-11-10' },
]

// ─── Campaigns ────────────────────────────────────────────────────────────────

export const campaigns: Campaign[] = [
  { id: 'camp-001', name: 'Summer Thought Leadership', brandKitId: 'bk-001', defaultTone: 'Insightful, authoritative', projectIds: ['proj-001'], postCount: 6, draftCount: 2, isDeleted: false, createdAt: '2026-06-02' },
  { id: 'camp-002', name: 'Client Success Stories', projectIds: ['proj-001'], postCount: 4, draftCount: 1, isDeleted: false, createdAt: '2026-06-03' },
  { id: 'camp-003', name: 'Bistec Studio Launch', brandKitId: 'bk-002', defaultTone: 'Exciting, feature-led', projectIds: ['proj-001', 'proj-002'], postCount: 5, draftCount: 3, isDeleted: false, createdAt: '2026-06-05' },
  { id: 'camp-004', name: 'Engineering Blog Series', brandKitId: 'bk-002', projectIds: ['proj-002'], postCount: 3, draftCount: 0, isDeleted: false, createdAt: '2026-06-08' },
  { id: 'camp-005', name: "We're Hiring — Sri Lanka", brandKitId: 'bk-003', defaultTone: 'Warm, aspirational', projectIds: ['proj-003'], postCount: 5, draftCount: 1, isDeleted: false, createdAt: '2026-05-22' },
  { id: 'camp-006', name: 'Independent Promo Drop', projectIds: [], postCount: 2, draftCount: 0, isDeleted: false, createdAt: '2026-06-10' },
]

// ─── Drafts ───────────────────────────────────────────────────────────────────

export const drafts: Draft[] = [
  {
    id: 'draft-001', briefId: 'brief-001',
    topic: 'Bistec Studio product announcement',
    goal: 'Generate awareness and early interest in the new internal tool',
    tone: 'Exciting, feature-led', channels: ['INSTAGRAM', 'LINKEDIN'], designMode: 'TEMPLATE',
    copyText: "The future of marketing isn't just about creativity — it's about scale. 🚀\n\nWith Bistec Studio, your team can go from brief to published post in minutes. Brand-consistent, AI-powered, and built for everyone on the team — not just the brand experts.\n\n#BistecStudio #AIMarketing #ContentCreation #MarketingTools",
    imageUrl: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800&q=80',
    exportUrl: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=1080&q=90',
    canvaDesignId: 'DAFx_kP9mNT', templateName: 'Bistec Square — Dark',
    status: 'EXPORTED', campaignId: 'camp-003', campaignName: 'Bistec Studio Launch',
    copyProviderLabel: 'GPT-4o', imageProviderLabel: 'gpt-image-1', createdAt: '2026-06-14',
  },
  {
    id: 'draft-002', briefId: 'brief-002',
    topic: 'Client success — HealthPlus digital transformation',
    goal: 'Build trust and demonstrate enterprise-level capability',
    tone: 'Professional, evidence-based', channels: ['LINKEDIN'], designMode: 'GENERATE',
    copyText: "We've been helping companies eliminate the bottlenecks that slow them down.\n\nFor HealthPlus, that meant transforming their patient data pipeline from a manual, error-prone process into an AI-assisted workflow that runs 3x faster with 94% fewer errors.\n\nThe result? Their clinical team spends more time on care, and less on spreadsheets.\n\nThis is what technology should do.",
    imageUrl: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80',
    exportUrl: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=1080&q=90',
    canvaDesignId: 'DAFy_qR3sTU', status: 'PUBLISHED',
    campaignId: 'camp-002', campaignName: 'Client Success Stories',
    copyProviderLabel: 'GPT-4o', imageProviderLabel: 'gpt-image-1', createdAt: '2026-06-12',
  },
  {
    id: 'draft-003', briefId: 'brief-003',
    topic: "We're hiring senior engineers in Colombo",
    goal: 'Attract engineering talent to apply for open roles',
    tone: 'Warm, aspirational', channels: ['INSTAGRAM', 'LINKEDIN'], designMode: 'TEMPLATE',
    copyText: "Big things are happening at Bistec 🙌\n\nWe're looking for senior engineers who love building things that matter. If you're passionate about AI, want to work on hard problems, and value a team that ships fast — let's talk.\n\nLink in bio to apply. DMs open.\n\n#WeAreHiring #SoftwareEngineer #TechJobsSriLanka #BistecCareers",
    imageUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80',
    exportUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1080&q=90',
    canvaDesignId: 'DAFz_mN5vWX', templateName: 'Bistec Story — Gradient',
    status: 'PUBLISHED', campaignId: 'camp-005', campaignName: "We're Hiring — Sri Lanka",
    copyProviderLabel: 'GPT-4o', imageProviderLabel: 'gpt-image-1', createdAt: '2026-06-10',
  },
  {
    id: 'draft-004', briefId: 'brief-004',
    topic: 'How AI reduces engineering toil by 40%',
    goal: 'Thought leadership — establish Bistec as an AI-native engineering org',
    tone: 'Insightful, data-driven', channels: ['LINKEDIN'], designMode: 'GENERATE',
    copyText: '', imageUrl: '', status: 'IN_PROGRESS',
    campaignId: 'camp-001', campaignName: 'Summer Thought Leadership',
    copyProviderLabel: 'GPT-4o', imageProviderLabel: 'gpt-image-1', createdAt: '2026-06-15',
  },
  {
    id: 'draft-005', briefId: 'brief-005',
    topic: 'Bistec Studio feature walkthrough',
    goal: 'Explain the product to potential users inside the company',
    tone: 'Clear, instructional', channels: ['LINKEDIN'], designMode: 'TEMPLATE',
    copyText: "From brief to published post in 5 steps — here's how Bistec Studio works:\n\n1️⃣ Fill in a short brief (topic, goal, tone)\n2️⃣ Select your campaign — brand kit auto-populates\n3️⃣ AI generates on-brand copy + imagery\n4️⃣ Review in the design preview — edit if needed\n5️⃣ Publish now or schedule for later\n\nNo Canva expertise required. No chasing the brand guide. Just a brief and a button.",
    imageUrl: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&q=80',
    status: 'IN_PROGRESS', campaignId: 'camp-003', campaignName: 'Bistec Studio Launch',
    copyProviderLabel: 'Claude 3.5 Sonnet', imageProviderLabel: 'gpt-image-1', createdAt: '2026-06-15',
  },
]

// ─── Posts (publish history) ───────────────────────────────────────────────────

export const posts: Post[] = [
  {
    id: 'post-001', draftId: 'draft-002', topic: 'Client success — HealthPlus digital transformation',
    channel: 'LINKEDIN', status: 'PUBLISHED', publishedAt: '2026-06-12T09:30:00Z',
    platformId: 'urn:li:share:7204938271', campaignId: 'camp-002', campaignName: 'Client Success Stories',
    projectName: 'Q3 Marketing Push', exportUrl: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=1080&q=90',
    copySnippet: "We've been helping companies eliminate the bottlenecks...", createdAt: '2026-06-12',
  },
  {
    id: 'post-002', draftId: 'draft-003', topic: "We're hiring senior engineers",
    channel: 'INSTAGRAM', status: 'PUBLISHED', publishedAt: '2026-06-10T10:00:00Z',
    platformId: 'ig_17865590215520000', campaignId: 'camp-005', campaignName: "We're Hiring — Sri Lanka",
    projectName: 'Employer Brand 2026', exportUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1080&q=90',
    copySnippet: 'Big things are happening at Bistec 🙌', createdAt: '2026-06-10',
  },
  {
    id: 'post-003', draftId: 'draft-003', topic: "We're hiring senior engineers",
    channel: 'LINKEDIN', status: 'PUBLISHED', publishedAt: '2026-06-10T10:05:00Z',
    platformId: 'urn:li:share:7204928111', campaignId: 'camp-005', campaignName: "We're Hiring — Sri Lanka",
    projectName: 'Employer Brand 2026', exportUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1080&q=90',
    copySnippet: 'Big things are happening at Bistec 🙌', createdAt: '2026-06-10',
  },
  {
    id: 'post-004', draftId: 'draft-001', topic: 'Bistec Studio product announcement',
    channel: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: '2026-06-16T09:00:00Z',
    campaignId: 'camp-003', campaignName: 'Bistec Studio Launch', projectName: 'Q3 Marketing Push',
    exportUrl: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=1080&q=90',
    copySnippet: "The future of marketing isn't just about creativity...", createdAt: '2026-06-14',
  },
  {
    id: 'post-005', draftId: 'draft-001', topic: 'Bistec Studio product announcement',
    channel: 'LINKEDIN', status: 'SCHEDULED', scheduledAt: '2026-06-16T10:00:00Z',
    campaignId: 'camp-003', campaignName: 'Bistec Studio Launch', projectName: 'Q3 Marketing Push',
    exportUrl: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=1080&q=90',
    copySnippet: "We've been building something we use every day at Bistec...", createdAt: '2026-06-14',
  },
  {
    id: 'post-006', draftId: 'draft-002', topic: 'Client success — HealthPlus digital transformation',
    channel: 'INSTAGRAM', status: 'FAILED',
    errorReason: 'Instagram token expired. Re-authenticate in Settings → Social Accounts.',
    campaignId: 'camp-002', campaignName: 'Client Success Stories', projectName: 'Q3 Marketing Push',
    exportUrl: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=1080&q=90',
    copySnippet: "We've been helping companies eliminate the bottlenecks...", createdAt: '2026-06-12',
  },
]

// ─── Available AI Providers ───────────────────────────────────────────────────

export const providers: AvailableProvider[] = [
  { id: 'prov-001', slot: 'COPY', providerKey: 'openai-gpt4o', label: 'GPT-4o', isEnabled: true, isDefault: true },
  { id: 'prov-002', slot: 'COPY', providerKey: 'openai-gpt4o-mini', label: 'GPT-4o mini', isEnabled: true, isDefault: false },
  { id: 'prov-003', slot: 'COPY', providerKey: 'anthropic-claude', label: 'Claude 3.5 Sonnet', isEnabled: true, isDefault: false },
  { id: 'prov-004', slot: 'COPY', providerKey: 'gemini-pro', label: 'Gemini 1.5 Pro', isEnabled: false, isDefault: false },
  { id: 'prov-005', slot: 'IMAGE', providerKey: 'openai-image-1', label: 'gpt-image-1', isEnabled: true, isDefault: true },
  { id: 'prov-006', slot: 'IMAGE', providerKey: 'dalle-3', label: 'DALL·E 3', isEnabled: true, isDefault: false },
  { id: 'prov-007', slot: 'IMAGE', providerKey: 'stability', label: 'Stable Diffusion 3', isEnabled: false, isDefault: false },
]

// ─── Activity Feed ─────────────────────────────────────────────────────────────

export const feedItems: FeedItem[] = [
  { actor: 'Damian DC', action: 'Scheduled <strong>Bistec Studio Announcement</strong> → Instagram + LinkedIn for Jun 16', time: 'Just now', status: 'complete', type: 'schedule' },
  { actor: 'Nadeesha K', action: 'Published <strong>HealthPlus Case Study</strong> → LinkedIn', time: '2h ago', status: 'complete', type: 'publish' },
  { actor: 'AI', action: 'Generated copy + image for <strong>Engineering Toil post</strong>', time: '3h ago', status: 'processing', type: 'generate' },
  { actor: 'Tharuka S', action: 'Published <strong>We\'re Hiring</strong> → Instagram + LinkedIn', time: 'Jun 10', status: 'complete', type: 'publish' },
  { actor: 'System', action: 'Scheduled post <strong>Summer Insights #3</strong> published successfully', time: 'Jun 9', status: 'complete', type: 'publish' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const getBrandKit = (id?: string) => brandKits.find(b => b.id === id)
export const getProject = (id: string) => projects.find(p => p.id === id)
export const getCampaign = (id: string) => campaigns.find(c => c.id === id)
export const getCampaignsForProject = (projectId: string) => campaigns.filter(c => c.projectIds.includes(projectId) && !c.isDeleted)
export const getPostsForCampaign = (campaignId: string) => posts.filter(p => p.campaignId === campaignId)
export const getUncategorizedPosts = () => posts.filter(p => !p.campaignId)

export const canvaTemplates = [
  { id: 'tmpl-001', name: 'Bistec Square — Dark', preview: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=400&q=80' },
  { id: 'tmpl-002', name: 'Bistec Story — Gradient', preview: 'https://images.unsplash.com/photo-1545665277-5937489579f2?w=400&q=80' },
  { id: 'tmpl-003', name: 'Bistec Landscape — Clean', preview: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=400&q=80' },
]

export const toneOptions = [
  'Confident, results-focused', 'Professional, evidence-based', 'Warm, aspirational',
  'Exciting, feature-led', 'Insightful, authoritative', 'Clear, instructional',
  'Authentic, conversational', 'Technical, precise',
]

// legacy shape used by the Header search palette
export const items = drafts.map(d => ({
  id: d.id,
  name: d.topic,
  category: d.campaignName ?? 'Uncategorized',
  status: d.status.toLowerCase() as 'active' | 'pending' | 'completed' | 'archived',
  priority: 'medium' as const,
  assigned: null,
  value: 0,
  created: d.createdAt,
}))
