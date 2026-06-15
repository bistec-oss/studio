'use client'

import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { projects, campaigns, posts, getBrandKit, getCampaignsForProject, getPostsForCampaign, type Campaign } from '@/data/mock'
import { FolderOpen, Megaphone, ChevronRight, BookOpen, Instagram, Linkedin, CheckCircle2, Calendar, AlertCircle } from 'lucide-react'

const channelIcon: Record<string, React.ElementType> = { INSTAGRAM: Instagram, LINKEDIN: Linkedin }
const channelColor: Record<string, string> = { INSTAGRAM: 'text-pink-400', LINKEDIN: 'text-blue-400' }
const statusCls: Record<string, string> = {
  PUBLISHED: 'bg-emerald-400/10 text-emerald-400',
  SCHEDULED: 'bg-blue-400/10 text-blue-400',
  FAILED: 'bg-red-400/10 text-red-400',
  IN_PROGRESS: 'bg-amber-400/10 text-amber-400',
}

export default function ProjectDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const project = projects.find(p => p.id === id)

  if (!project) {
    return (
      <>
        <Header breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: 'Not found' }]} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-slate-500 text-[0.82rem]">Project not found</div>
        </main>
      </>
    )
  }

  const kit = getBrandKit(project.defaultBrandKitId)
  const projectCampaigns = getCampaignsForProject(id)

  return (
    <>
      <Header breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project.name }]} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* Project header card */}
        <div className="glass rounded-xl p-5 mb-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-500/10 border border-cyan-400/20 flex items-center justify-center flex-shrink-0">
              <FolderOpen size={20} className="text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[1rem] font-bold text-slate-200 mb-1">{project.name}</h1>
              <div className="flex flex-wrap gap-2 items-center">
                {kit && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400 text-[0.65rem]">
                    <BookOpen size={9} /> {kit.name}
                  </span>
                )}
                {project.defaultTone && (
                  <span className="text-[0.7rem] text-slate-500">{project.defaultTone}</span>
                )}
              </div>
            </div>
            <div className="flex gap-4 text-center flex-shrink-0">
              <div>
                <div className="text-[1.2rem] font-bold text-slate-200">{project.campaignCount}</div>
                <div className="text-[0.6rem] text-slate-600">campaigns</div>
              </div>
              <div>
                <div className="text-[1.2rem] font-bold text-slate-200">{project.postCount}</div>
                <div className="text-[0.6rem] text-slate-600">posts</div>
              </div>
            </div>
          </div>
        </div>

        {/* Campaigns in this project */}
        <div className="mb-2 text-[0.72rem] font-bold tracking-[0.1em] uppercase text-slate-600">Campaigns</div>
        {projectCampaigns.length === 0 ? (
          <div className="glass rounded-xl py-12 text-center text-slate-600 text-[0.82rem]">No campaigns in this project</div>
        ) : (
          <div className="space-y-3">
            {projectCampaigns.map(campaign => {
              const campaignKit = getBrandKit(campaign.brandKitId)
              const campPosts = getPostsForCampaign(campaign.id)
              return (
                <div key={campaign.id} className="glass rounded-xl overflow-hidden">
                  <div
                    className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => router.push('/campaigns/' + campaign.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Megaphone size={15} className="text-violet-400 flex-shrink-0" />
                      <div>
                        <div className="text-[0.85rem] font-semibold text-slate-200">{campaign.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {campaignKit
                            ? <span className="text-[0.62rem] text-cyan-400">{campaignKit.name}</span>
                            : <span className="text-[0.62rem] text-slate-600">Inherited kit</span>
                          }
                          {campaign.defaultTone && <span className="text-[0.62rem] text-slate-600">· {campaign.defaultTone}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[0.68rem] text-slate-500">{campaign.postCount} posts</span>
                      <ChevronRight size={14} className="text-slate-600" />
                    </div>
                  </div>
                  {/* Latest posts for this campaign */}
                  {campPosts.slice(0, 3).length > 0 && (
                    <div className="border-t border-white/[0.04] px-5 py-2 flex gap-3 overflow-x-auto">
                      {campPosts.slice(0, 3).map(post => {
                        const ChIcon = channelIcon[post.channel]
                        return (
                          <div
                            key={post.id}
                            onClick={() => router.push('/draft/' + post.draftId)}
                            className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer transition-colors"
                          >
                            <ChIcon size={11} className={channelColor[post.channel]} />
                            <span className="text-[0.68rem] text-slate-400 max-w-[120px] truncate">{post.topic}</span>
                            <span className={`text-[0.58rem] px-1.5 py-0.5 rounded-full ${statusCls[post.status]}`}>{post.status.toLowerCase()}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
