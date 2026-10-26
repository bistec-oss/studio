import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  FilePlus2,
  BookOpen,
  Palette,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { listBriefDrafts } from '@/lib/brief/briefDrafts'
import { resolveTeamForServerComponent } from '@/lib/authz/serverTeam'
import { draftVisibilityWhere, postVisibilityWhere } from '@/lib/authz/visibility'
import type { TeamAuthedUser } from '@/lib/api/handler'
import { PageHead } from '@/components/ui/PageHead'
import { Panel } from '@/components/ui/Panel'
import { SectionHead } from '@/components/ui/SectionHead'
import { FOCUS, ICON } from '@/components/ui/atoms'
import { RecentDraftsCard } from '@/components/dashboard/RecentDraftsCard'
import { NoTeamNotice } from '@/components/dashboard/NoTeamNotice'
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

async function getDashboardData(user: TeamAuthedUser) {
  const teamId = user.teamId
  const [
    draftsReady,
    postsPublished,
    activeCampaigns,
    aiProviders,
    recentDrafts,
    recentPublished,
    recentProviders,
  ] = await Promise.all([
    // KPI counts use the same D6 visibility as the library/posts listings —
    // a bare { teamId } count shows an editor team-wide numbers their own
    // list pages then contradict ("13 drafts ready", library shows 2).
    prisma.draft.count({ where: { ...draftVisibilityWhere(user), status: 'EXPORTED' } }),
    prisma.post.count({ where: { ...postVisibilityWhere(user), status: 'PUBLISHED' } }),
    prisma.campaign.count({ where: { isDeleted: false, teamId } }),
    prisma.availableProvider.count({ where: { isEnabled: true, teamId } }),
    // D6 visibility (fixes the prior leak: this used to show every team's
    // drafts to every signed-in user, no scoping at all).
    prisma.draft.findMany({
      where: draftVisibilityWhere(user),
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
      where: { ...postVisibilityWhere(user), status: 'PUBLISHED' },
      take: 5,
      orderBy: { publishedAt: 'desc' },
      include: { draft: { include: { brief: { select: { topic: true } } } } },
    }),
    // AvailableProvider is team-wide (no personal ownership concept).
    prisma.availableProvider.findMany({ where: { teamId }, take: 5, orderBy: { createdAt: 'desc' } }),
  ])

  // The viewer's own unfinished (autosaved) briefs, scoped to the active team
  // (a multi-team user's other-team drafts must not surface here — Resume
  // would otherwise dead-end on the briefs POST route's cross-team 404).
  // listBriefDrafts also runs the lazy 7-day TTL sweep.
  const unfinishedBriefs = await listBriefDrafts(user.userId, user.teamId)

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
      text: `${p.slot === 'COPY' ? 'Caption' : 'Image'} provider added — ${p.label}`,
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

// A KPI (021 design.md §8): a sentence-case muted label over a bold
// tabular numeral. The four sit in one bezel card, split by hairlines from lg.
function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 lg:border-l lg:border-line-subtle lg:pl-5 lg:first:border-l-0 lg:first:pl-0">
      <div className="text-ui-xs font-medium text-fg-muted">{label}</div>
      <div className="mt-1.5 text-ui-2xl font-bold leading-none tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  )
}

// A quick action: a link drawn as the secondary pill (the study's .btn-sec,
// 021 design.md §4.3). The floating Create post button is the view's one
// primary, so these stay secondary.
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
      className={`inline-flex h-control-md items-center gap-2 whitespace-nowrap rounded-ui-pill bg-surface-raised px-4 text-ui-sm font-semibold text-fg shadow-panel ring-1 ring-inset ring-line-subtle transition-[transform,box-shadow] duration-fast ease-standard hover:shadow-raised active:scale-[0.98] motion-reduce:active:scale-100 ${FOCUS}`}
    >
      {icon}
      {label}
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const resolution = await resolveTeamForServerComponent()

  if (resolution?.team.kind === 'choice-required') {
    redirect('/choose-team')
  }

  if (!resolution || resolution.team.kind === 'no-team') {
    return <NoTeamNotice isSuperAdmin={resolution?.isSuperAdmin ?? false} />
  }

  const teamUser: TeamAuthedUser = {
    userId: resolution.userId,
    teamId: resolution.team.teamId,
    teamRole: resolution.team.teamRole,
    isSuperAdmin: resolution.isSuperAdmin,
  }
  const data = await getDashboardData(teamUser)

  return (
    <>
      <PageHead
        eyebrow="Overview"
        title="Dashboard"
        lead="At-a-glance status across drafts, posts, and campaigns."
        className="mb-6"
      />

      {/* KPI summary: one bezel card (021 design.md §8) */}
      <Panel bezel className="grid grid-cols-2 gap-5 p-5 lg:grid-cols-4">
        <KpiCard label="Drafts Ready" value={data.draftsReady} />
        <KpiCard label="Posts Published" value={data.postsPublished} />
        <KpiCard label="Active Campaigns" value={data.activeCampaigns} />
        <KpiCard label="AI providers" value={data.aiProviders} />
      </Panel>

      {/* Quick actions */}
      <div className="mt-5 flex flex-wrap gap-2">
        <QuickAction href="/brief" label="New post" icon={<FilePlus2 {...ICON} aria-hidden />} />
        <QuickAction href="/library" label="View library" icon={<BookOpen {...ICON} aria-hidden />} />
        <QuickAction
          href="/admin/brandkits"
          label="Manage brand kits"
          icon={<Palette {...ICON} aria-hidden />}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        {/* Recent drafts — collapsed 8 / expandable to the full fetched list */}
        <RecentDraftsCard
          className="min-w-0 lg:col-span-2"
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

        {/* Activity feed: a bezel card of ruled rows */}
        <Panel bezel className="min-w-0 p-5">
          <SectionHead title="Activity" className="mb-3" />

          {data.events.length === 0 ? (
            <p className="py-8 text-center text-ui-sm text-fg-muted">
              No recent activity.
            </p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {data.events.map(e => (
                <li key={e.id} className="min-w-0 py-2.5">
                  <p className="truncate text-ui-sm text-fg">{e.text}</p>
                  <p className="text-ui-xs text-fg-muted">{relativeTime(e.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
