import Link from 'next/link'
import {
  FileCheck2,
  Send,
  Megaphone,
  Cpu,
  FilePlus2,
  BookOpen,
  Palette,
  Activity,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { listBriefDrafts } from '@/lib/brief/briefDrafts'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { RecentDraftsCard } from '@/components/dashboard/RecentDraftsCard'
import { channelLabel as sharedChannelLabel } from '@/lib/channels'
import { relativeTime } from '@/lib/format'

// Dashboard renders live data; never cache it.
export const dynamic = 'force-dynamic'

// ── Helpers ─────────────────────────────────────────────────────────────────

function channelLabel(channels: string[]): string {
  if (!channels?.length) return '—'
  return channels.map(sharedChannelLabel).join(', ')
}

// ── Data ────────────────────────────────────────────────────────────────────

async function getDashboardData() {
  const [
    draftsReady,
    postsPublished,
    activeCampaigns,
    aiProviders,
    recentDrafts,
    recentPublished,
    recentProviders,
  ] = await Promise.all([
    prisma.draft.count({ where: { status: 'EXPORTED' } }),
    prisma.post.count({ where: { status: 'PUBLISHED' } }),
    prisma.campaign.count({ where: { isDeleted: false } }),
    prisma.availableProvider.count({ where: { isEnabled: true } }),
    prisma.draft.findMany({
      // 25, not 8: the Recent Drafts card shows 8 collapsed and the full list
      // when expanded (RecentDraftsCard) — one query serves both states.
      take: 25,
      orderBy: { createdAt: 'desc' },
      include: {
        brief: {
          select: {
            topic: true,
            designMode: true,
            channels: true,
            campaign: { select: { name: true } },
          },
        },
      },
    }),
    prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      take: 5,
      orderBy: { publishedAt: 'desc' },
      include: { draft: { include: { brief: { select: { topic: true } } } } },
    }),
    prisma.availableProvider.findMany({ take: 5, orderBy: { createdAt: 'desc' } }),
  ])

  // The viewer's own unfinished (autosaved) briefs — owner-scoped, so resolved
  // from the session; listBriefDrafts also runs the lazy 7-day TTL sweep.
  const currentUser = await getCurrentUser()
  const unfinishedBriefs = currentUser ? await listBriefDrafts(currentUser.userId) : []

  // Build a merged, chronological activity feed from the available signals.
  type Event = { id: string; at: Date; text: string; kind: 'draft' | 'post' | 'provider' }
  const events: Event[] = [
    ...recentDrafts.map(d => ({
      id: `draft-${d.id}`,
      at: d.createdAt,
      text: `Draft generated — “${d.brief?.topic ?? 'Untitled'}”`,
      kind: 'draft' as const,
    })),
    ...recentPublished.map(p => ({
      id: `post-${p.id}`,
      at: p.publishedAt ?? p.createdAt,
      text: `Published to ${channelLabel([p.channel])} — “${p.draft?.brief?.topic ?? 'Untitled'}”`,
      kind: 'post' as const,
    })),
    ...recentProviders.map(p => ({
      id: `prov-${p.id}`,
      at: p.createdAt,
      text: `${p.slot === 'COPY' ? 'Copy' : 'Image'} provider added — ${p.label}`,
      kind: 'provider' as const,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8)

  return {
    draftsReady,
    postsPublished,
    activeCampaigns,
    aiProviders,
    recentDrafts,
    unfinishedBriefs,
    events,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: React.ReactNode
}) {
  return (
    <GlassPanel className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-light-text-muted dark:text-dark-text-muted">
          {label}
        </span>
        <span className="text-primary dark:text-primary-light">{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-bold text-light-text dark:text-dark-text">{value}</div>
    </GlassPanel>
  )
}

function QuickAction({
  href,
  label,
  icon,
}: {
  href: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="glass-input flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-light-text dark:text-dark-text transition-all duration-150 hover:border-primary/40 hover:bg-primary/5 dark:hover:border-primary-light/40 dark:hover:bg-primary-light/5"
    >
      <span className="text-primary dark:text-primary-light">{icon}</span>
      {label}
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Dashboard</h1>
        <p className="mt-0.5 text-sm text-light-text-muted dark:text-dark-text-muted">
          At-a-glance status across drafts, posts, and campaigns.
        </p>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Drafts Ready" value={data.draftsReady} icon={<FileCheck2 size={18} />} />
        <KpiCard label="Posts Published" value={data.postsPublished} icon={<Send size={18} />} />
        <KpiCard label="Active Campaigns" value={data.activeCampaigns} icon={<Megaphone size={18} />} />
        <KpiCard label="AI Providers" value={data.aiProviders} icon={<Cpu size={18} />} />
      </div>

      {/* Quick actions */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickAction href="/brief" label="Create Post" icon={<FilePlus2 size={18} />} />
        <QuickAction href="/library" label="View Library" icon={<BookOpen size={18} />} />
        <QuickAction href="/admin/brandkits" label="Manage Brand Kits" icon={<Palette size={18} />} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent drafts — collapsed 8 / expandable to the full fetched list */}
        <RecentDraftsCard
          className="p-5 lg:col-span-2"
          unfinished={data.unfinishedBriefs.map(u => ({
            id: u.id,
            topic: u.topic,
            updatedAtLabel: relativeTime(u.updatedAt),
          }))}
          drafts={data.recentDrafts.map(d => ({
            id: d.id,
            status: d.status,
            createdAtLabel: relativeTime(d.createdAt),
            brief: d.brief
              ? {
                  topic: d.brief.topic,
                  designMode: d.brief.designMode,
                  channels: d.brief.channels,
                  campaign: d.brief.campaign,
                }
              : null,
          }))}
        />

        {/* Activity feed */}
        <GlassPanel className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Activity size={16} className="text-primary dark:text-primary-light" />
            <h2 className="text-sm font-semibold text-light-text dark:text-dark-text">Activity</h2>
          </div>

          {data.events.length === 0 ? (
            <p className="py-8 text-center text-sm text-light-text-muted dark:text-dark-text-muted">
              No recent activity.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.events.map(e => (
                <li key={e.id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60 dark:bg-primary-light/60" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-light-text dark:text-dark-text">{e.text}</p>
                    <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                      {relativeTime(e.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>
      </div>
    </>
  )
}
