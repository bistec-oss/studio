'use client'

import Link from 'next/link'
import { FileText, CheckCircle, Upload, RefreshCw, Palette, Zap, ArrowRight, Instagram, Linkedin } from 'lucide-react'
import Header from '@/components/Header'
import KPICard from '@/components/KPICard'
import { Badge } from '@/components/Badge'
import { drafts, campaigns, brandKits, providers, activityFeed } from '@/data/mock'
import { statusConfig } from '@/lib/utils'

const platformIcon = { instagram: Instagram, linkedin: Linkedin }

const activityIconMap = {
  check:    { icon: CheckCircle, cls: 'text-emerald-600 bg-emerald-50' },
  publish:  { icon: Upload,      cls: 'text-blue-600 bg-blue-50' },
  brief:    { icon: FileText,    cls: 'text-violet-600 bg-violet-50' },
  revision: { icon: RefreshCw,   cls: 'text-amber-600 bg-amber-50' },
  provider: { icon: Zap,         cls: 'text-slate-500 bg-slate-100' },
}

export default function Dashboard() {
  const readyCount    = drafts.filter(d => d.status === 'ready').length
  const publishedCount = drafts.filter(d => d.status === 'published').length
  const connectedProviders = providers.filter(p => p.status === 'connected').length
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Header title="Dashboard" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* KPI row */}
        <div id="tour-kpis" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6 stagger">
          <KPICard label="Drafts Ready" value={String(readyCount)} accent="cyan"
            trend="+2 today" trendDir="up" sub="Awaiting review or publish" />
          <KPICard label="Posts Published" value={String(publishedCount)} accent="emerald"
            trend="+1 today" trendDir="up" sub="All-time published posts" />
          <KPICard label="Active Campaigns" value={String(activeCampaigns)} accent="violet"
            sub="Q3 Launch · Hiring Push" />
          <KPICard label="AI Providers" value={`${connectedProviders}/${providers.length}`} accent="amber"
            sub={connectedProviders === providers.length ? 'All configured' : `${providers.length - connectedProviders} unconfigured`} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
          {/* Recent drafts */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[0.88rem] font-semibold text-slate-700">Recent Drafts</h2>
              <Link href="/library" className="text-[0.75rem] text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium transition-colors">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-2">
              {drafts.map(draft => {
                const PlatformIcon = platformIcon[draft.platform]
                return (
                  <Link
                    key={draft.id}
                    href={`/draft/${draft.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0">
                      <PlatformIcon size={16} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.82rem] font-medium text-slate-700 truncate">{draft.briefSummary}</span>
                        <span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 flex-shrink-0">Path {draft.pathType}</span>
                      </div>
                      <div className="text-[0.7rem] text-slate-400">{draft.campaignName} · {draft.revisions.length} revision{draft.revisions.length !== 1 ? 's' : ''}</div>
                    </div>
                    <Badge status={draft.status} config={statusConfig} />
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Activity feed + quick actions */}
          <div className="flex flex-col gap-4">
            {/* Quick actions */}
            <div className="glass rounded-xl p-5">
              <h2 className="text-[0.88rem] font-semibold text-slate-700 mb-3">Quick Actions</h2>
              <div className="space-y-2">
                <Link href="/brief/new" className="flex items-center gap-3 p-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors group">
                  <FileText size={15} />
                  <span className="text-[0.82rem] font-semibold">New Brief</span>
                  <ArrowRight size={13} className="ml-auto opacity-60 group-hover:opacity-100 transition-opacity" />
                </Link>
                <Link href="/admin/brandkits" className="flex items-center gap-3 p-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors group">
                  <Palette size={15} />
                  <span className="text-[0.82rem] font-medium">Manage Brand Kits</span>
                  <ArrowRight size={13} className="ml-auto opacity-40 group-hover:opacity-70 transition-opacity" />
                </Link>
                <Link href="/library" className="flex items-center gap-3 p-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors group">
                  <CheckCircle size={15} />
                  <span className="text-[0.82rem] font-medium">Review Ready Drafts</span>
                  <ArrowRight size={13} className="ml-auto opacity-40 group-hover:opacity-70 transition-opacity" />
                </Link>
              </div>
            </div>

            {/* Activity feed */}
            <div className="glass rounded-xl p-5 flex-1">
              <h2 className="text-[0.88rem] font-semibold text-slate-700 mb-3">Activity</h2>
              <div className="space-y-3">
                {activityFeed.map(event => {
                  const cfg = activityIconMap[event.icon]
                  const Icon = cfg.icon
                  return (
                    <div key={event.id} className="flex items-start gap-2.5">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.cls}`}>
                        <Icon size={12} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[0.75rem] font-medium text-slate-700">{event.title}</div>
                        <div className="text-[0.68rem] text-slate-400 truncate">{event.meta}</div>
                      </div>
                      <span className="text-[0.62rem] text-slate-400 flex-shrink-0">{event.time}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
