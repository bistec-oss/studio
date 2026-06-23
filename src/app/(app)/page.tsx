import Link from 'next/link'
import {
  FileCheck2,
  Send,
  Megaphone,
  Cpu,
  FilePlus2,
  BookOpen,
  Palette,
  Sparkles,
  Activity,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { StatusChip } from '@/components/ui/StatusChip'
import type { DraftStatus } from '@prisma/client'

// Dashboard renders live data; never cache it.
export const dynamic = 'force-dynamic'

// ── Helpers ─────────────────────────────────────────────────────────────────

const DRAFT_CHIP: Record<DraftStatus, 'draft' | 'exported' | 'published' | 'failed'> = {
  IN_PROGRESS: 'draft',
  EXPORTED: 'exported',
  PUBLISHED: 'published',
  FAILED: 'failed',
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const sec = Math.round(diffMs / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function channelLabel(channels: string[]): string {
  if (!channels?.length) return '—'
  return channels
    .map(c => (c === 'INSTAGRAM' ? 'Instagram' : c === 'LINKEDIN' ? 'LinkedIn' : c))
    .join(', ')
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
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: {
        brief: { select: { topic: true, designMode: true, channels: true } },
        campaigns: { take: 1, include: { campaign: { select: { name: true } } } },
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

  return { draftsReady, postsPublished, activeCampaigns, aiProviders, recentDrafts, events }
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
        <QuickAction href="/brief" label="New Brief" icon={<FilePlus2 size={18} />} />
        <QuickAction href="/library" label="View Library" icon={<BookOpen size={18} />} />
        <QuickAction href="/admin/brandkits" label="Manage Brand Kits" icon={<Palette size={18} />} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent drafts */}
        <GlassPanel className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles size={16} className="text-primary dark:text-primary-light" />
            <h2 className="text-sm font-semibold text-light-text dark:text-dark-text">Recent Drafts</h2>
          </div>

          {data.recentDrafts.length === 0 ? (
            <p className="py-8 text-center text-sm text-light-text-muted dark:text-dark-text-muted">
              No drafts yet.{' '}
              <Link href="/brief" className="text-primary hover:underline dark:text-primary-light">
                Create your first brief
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-left text-xs text-light-text-muted dark:border-white/10 dark:text-dark-text-muted">
                    <th className="pb-2 pr-3 font-medium">Topic</th>
                    <th className="pb-2 pr-3 font-medium">Campaign</th>
                    <th className="pb-2 pr-3 font-medium">Platform</th>
                    <th className="pb-2 pr-3 font-medium">Path</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentDrafts.map(d => (
                    <tr
                      key={d.id}
                      className="group border-b border-black/5 last:border-0 dark:border-white/5"
                    >
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/drafts/${d.id}`}
                          className="font-medium text-light-text hover:text-primary dark:text-dark-text dark:hover:text-primary-light"
                        >
                          {d.brief?.topic ?? 'Untitled'}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3 text-light-text-muted dark:text-dark-text-muted">
                        {d.campaigns[0]?.campaign?.name ?? '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-light-text-muted dark:text-dark-text-muted">
                        {channelLabel(d.brief?.channels ?? [])}
                      </td>
                      <td className="py-2.5 pr-3 text-light-text-muted dark:text-dark-text-muted">
                        {d.brief?.designMode === 'TEMPLATE' ? 'A' : 'B'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusChip status={DRAFT_CHIP[d.status]} />
                      </td>
                      <td className="py-2.5 text-light-text-muted dark:text-dark-text-muted">
                        {relativeTime(d.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassPanel>

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
