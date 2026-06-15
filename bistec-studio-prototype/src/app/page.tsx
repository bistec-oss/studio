'use client'

import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import KPICard from '@/components/KPICard'
import { posts, drafts, campaigns, feedItems } from '@/data/mock'
import { Instagram, Linkedin, Zap, Calendar, Send, AlertCircle, CheckCircle2, Clock } from 'lucide-react'

const scheduled = posts.filter(p => p.status === 'SCHEDULED')
const published = posts.filter(p => p.status === 'PUBLISHED')
const inProgress = drafts.filter(d => d.status === 'IN_PROGRESS')
const activeCampaigns = campaigns.filter(c => !c.isDeleted)

const channelIcon: Record<string, React.ElementType> = { INSTAGRAM: Instagram, LINKEDIN: Linkedin }
const channelColor: Record<string, string> = { INSTAGRAM: 'text-pink-400', LINKEDIN: 'text-blue-400' }

const postStatusMap: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  PUBLISHED: { label: 'Published', cls: 'bg-emerald-400/10 text-emerald-400', icon: CheckCircle2 },
  SCHEDULED: { label: 'Scheduled', cls: 'bg-blue-400/10 text-blue-400', icon: Calendar },
  FAILED: { label: 'Failed', cls: 'bg-red-400/10 text-red-400', icon: AlertCircle },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-amber-400/10 text-amber-400', icon: Clock },
}

export default function Dashboard() {
  const router = useRouter()

  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* KPI Row */}
        <div id="tour-kpis" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6 stagger">
          <KPICard label="Published This Month" value={published.length.toString()} trend="↑ 3" trendDir="up" sub="Instagram + LinkedIn" accent="emerald" />
          <KPICard label="Scheduled" value={scheduled.length.toString()} sub="firing next 48 hours" accent="cyan" />
          <KPICard label="Drafts In Progress" value={inProgress.length.toString()} trend="↑ 2" trendDir="up" sub="awaiting export" accent="violet" />
          <KPICard label="Active Campaigns" value={activeCampaigns.length.toString()} sub="across all projects" accent="amber" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4 animate-fade-in" style={{ animationDelay: '0.15s' }}>
          {/* Recent Posts table */}
          <div className="glass rounded-xl">
            <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-[0.8rem] font-semibold">Recent Posts</span>
              <button onClick={() => router.push('/library')} className="text-[0.72rem] text-cyan-400 hover:text-cyan-300 transition-colors">View all →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>{['Topic', 'Campaign', 'Channel', 'Status', 'Date'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[0.62rem] font-bold tracking-[0.06em] uppercase text-slate-600 border-b border-white/[0.04]">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {posts.slice(0, 5).map(post => {
                    const ChIcon = channelIcon[post.channel]
                    const st = postStatusMap[post.status]
                    const StIcon = st.icon
                    return (
                      <tr key={post.id} onClick={() => router.push(`/draft/${post.draftId}`)}
                        className="cursor-pointer hover:bg-white/[0.03] transition-colors group">
                        <td className="px-4 py-3 border-b border-white/[0.03]">
                          <div className="text-[0.82rem] text-slate-300 group-hover:text-slate-200 truncate max-w-[180px]">{post.topic}</div>
                        </td>
                        <td className="px-4 py-3 border-b border-white/[0.03]">
                          <div className="text-[0.72rem] text-slate-500 truncate max-w-[130px]">{post.campaignName ?? 'Uncategorized'}</div>
                        </td>
                        <td className="px-4 py-3 border-b border-white/[0.03]">
                          <div className={`flex items-center gap-1 ${channelColor[post.channel]}`}>
                            <ChIcon size={12} />
                            <span className="text-[0.72rem] capitalize">{post.channel.toLowerCase()}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 border-b border-white/[0.03]">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-medium ${st.cls}`}>
                            <StIcon size={9} />{st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 border-b border-white/[0.03]">
                          <div className="text-[0.72rem] text-slate-600">
                            {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                              : post.scheduledAt ? new Date(post.scheduledAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                              : post.createdAt}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Quick Action */}
            <div className="glass rounded-xl p-4">
              <div className="text-[0.8rem] font-semibold mb-3">Quick Start</div>
              <button onClick={() => router.push('/brief')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/10 border border-cyan-400/20 hover:border-cyan-400/40 transition-all group">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 flex-shrink-0">
                  <Zap size={14} className="text-white" />
                </div>
                <div className="text-left">
                  <div className="text-[0.82rem] font-semibold text-slate-200">New Post</div>
                  <div className="text-[0.65rem] text-slate-500">Brief → AI → Canva → Publish</div>
                </div>
              </button>
            </div>

            {/* Scheduled */}
            <div className="glass rounded-xl">
              <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center gap-2">
                <Calendar size={13} className="text-blue-400" />
                <span className="text-[0.8rem] font-semibold">Scheduled</span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {scheduled.length === 0 && <div className="px-4 py-6 text-[0.78rem] text-slate-600 text-center">No posts scheduled</div>}
                {scheduled.map(post => {
                  const ChIcon = channelIcon[post.channel]
                  return (
                    <div key={post.id} onClick={() => router.push(`/draft/${post.draftId}`)}
                      className="px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-start gap-2">
                        <ChIcon size={12} className={`mt-0.5 flex-shrink-0 ${channelColor[post.channel]}`} />
                        <div className="min-w-0">
                          <div className="text-[0.78rem] text-slate-300 truncate">{post.topic}</div>
                          <div className="text-[0.65rem] text-slate-600 mt-0.5">
                            {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Activity */}
            <div className="glass rounded-xl">
              <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center gap-2">
                <Send size={13} className="text-cyan-400" />
                <span className="text-[0.8rem] font-semibold">Activity</span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {feedItems.map((item, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${item.status === 'processing' ? 'bg-amber-400 animate-pulse-dot' : 'bg-emerald-400'}`} />
                    <div className="min-w-0">
                      <div className="text-[0.72rem] text-slate-400 font-medium">{item.actor}</div>
                      <div className="text-[0.72rem] text-slate-500 leading-relaxed" dangerouslySetInnerHTML={{ __html: item.action }} />
                      <div className="text-[0.6rem] text-slate-700 mt-0.5">{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
