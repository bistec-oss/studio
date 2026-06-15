'use client'

import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { campaigns, projects, posts, drafts, getBrandKit, getProject, getPostsForCampaign } from '@/data/mock'
import { Megaphone, FolderOpen, BookOpen, Instagram, Linkedin, CheckCircle2, Calendar, AlertCircle, Clock, PenLine } from 'lucide-react'

const channelIcon: Record<string, React.ElementType> = { INSTAGRAM: Instagram, LINKEDIN: Linkedin }
const channelColor: Record<string, string> = { INSTAGRAM: 'text-pink-400', LINKEDIN: 'text-blue-400' }
const statusMap: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  PUBLISHED: { label: 'Published', cls: 'bg-emerald-400/10 text-emerald-400', icon: CheckCircle2 },
  SCHEDULED: { label: 'Scheduled', cls: 'bg-blue-400/10 text-blue-400', icon: Calendar },
  FAILED: { label: 'Failed', cls: 'bg-red-400/10 text-red-400', icon: AlertCircle },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-amber-400/10 text-amber-400', icon: Clock },
}

export default function CampaignDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const campaign = campaigns.find(c => c.id === id)

  if (!campaign) {
    return (
      <>
        <Header breadcrumbs={[{ label: 'Campaigns', href: '/campaigns' }, { label: 'Not found' }]} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-slate-500 text-[0.82rem]">Campaign not found</div>
        </main>
      </>
    )
  }

  const kit = getBrandKit(campaign.brandKitId)
  const campProjects = campaign.projectIds.map(pid => projects.find(p => p.id === pid)).filter(Boolean)
  const campPosts = getPostsForCampaign(id)
  const campDrafts = drafts.filter(d => d.campaignId === id)

  return (
    <>
      <Header breadcrumbs={[{ label: 'Campaigns', href: '/campaigns' }, { label: campaign.name }]} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* Campaign header */}
        <div className="glass rounded-xl p-5 mb-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400/20 to-purple-500/10 border border-violet-400/20 flex items-center justify-center flex-shrink-0">
              <Megaphone size={20} className="text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[1rem] font-bold text-slate-200 mb-1">{campaign.name}</h1>
              <div className="flex flex-wrap gap-2 items-center">
                {campProjects.length === 0
                  ? <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-500">Standalone campaign</span>
                  : campProjects.map(p => p && (
                    <button key={p.id} onClick={() => router.push('/projects/' + p.id)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-400 text-[0.65rem] hover:text-cyan-400 transition-colors">
                      <FolderOpen size={9} /> {p.name}
                    </button>
                  ))
                }
                {kit && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400 text-[0.65rem]">
                    <BookOpen size={9} /> {kit.name}
                  </span>
                )}
                {campaign.defaultTone && <span className="text-[0.7rem] text-slate-500">{campaign.defaultTone}</span>}
              </div>
            </div>
            <div className="flex gap-4 text-center flex-shrink-0">
              <div>
                <div className="text-[1.2rem] font-bold text-slate-200">{campPosts.length}</div>
                <div className="text-[0.6rem] text-slate-600">posts</div>
              </div>
              <div>
                <div className="text-[1.2rem] font-bold text-slate-200">{campDrafts.length}</div>
                <div className="text-[0.6rem] text-slate-600">drafts</div>
              </div>
            </div>
          </div>
        </div>

        {/* Posts grid */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-[0.72rem] font-bold tracking-[0.1em] uppercase text-slate-600">Posts</div>
          <button onClick={() => router.push('/brief')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-400/10 text-cyan-400 text-[0.72rem] hover:bg-cyan-400/20 border border-cyan-400/20 transition-colors">
            <PenLine size={12} /> New Post
          </button>
        </div>

        {campPosts.length === 0 ? (
          <div className="glass rounded-xl py-16 text-center text-slate-600 text-[0.82rem]">No posts yet</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
            {campPosts.map(post => {
              const ChIcon = channelIcon[post.channel]
              const st = statusMap[post.status]
              const StIcon = st?.icon ?? CheckCircle2
              return (
                <div key={post.id} onClick={() => router.push('/draft/' + post.draftId)}
                  className="glass glass-hover rounded-xl overflow-hidden cursor-pointer card-shine">
                  <img src={post.exportUrl} alt="" className="w-full h-32 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className={`flex items-center gap-1 text-[0.7rem] ${channelColor[post.channel]}`}>
                        <ChIcon size={11} />
                        <span className="capitalize">{post.channel.toLowerCase()}</span>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] ${st?.cls}`}>
                        <StIcon size={9} /> {st?.label}
                      </span>
                    </div>
                    <div className="text-[0.78rem] text-slate-200 font-medium line-clamp-2 mb-1">{post.topic}</div>
                    <div className="text-[0.62rem] text-slate-600">
                      {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : post.scheduledAt ? 'Scheduled ' + new Date(post.scheduledAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                        : post.createdAt}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* In-progress drafts */}
        {campDrafts.filter(d => d.status === 'IN_PROGRESS' || d.status === 'EXPORTED').length > 0 && (
          <div className="mt-6">
            <div className="text-[0.72rem] font-bold tracking-[0.1em] uppercase text-slate-600 mb-3">In-Progress Drafts</div>
            <div className="space-y-2">
              {campDrafts.filter(d => d.status === 'IN_PROGRESS' || d.status === 'EXPORTED').map(draft => (
                <div key={draft.id} onClick={() => router.push('/draft/' + draft.id)}
                  className="glass glass-hover rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer">
                  <Clock size={14} className="text-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[0.82rem] text-slate-200 truncate">{draft.topic}</div>
                    <div className="text-[0.65rem] text-slate-500">{draft.tone} · {draft.channels.map(c => c.toLowerCase()).join(' + ')}</div>
                  </div>
                  <span className={`text-[0.65rem] px-2 py-0.5 rounded-full ${draft.status === 'EXPORTED' ? 'bg-cyan-400/10 text-cyan-400' : 'bg-amber-400/10 text-amber-400'}`}>
                    {draft.status === 'EXPORTED' ? 'Exported' : 'In Progress'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  )
}
