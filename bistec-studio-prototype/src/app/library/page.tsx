'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { posts, projects, campaigns, getCampaignsForProject, type Post } from '@/data/mock'
import { FolderOpen, Megaphone, Instagram, Linkedin, CheckCircle2, Calendar, AlertCircle, Clock, ChevronRight } from 'lucide-react'

type Filter = { type: 'all' | 'project' | 'campaign' | 'uncategorized'; id?: string }

function statusBadge(status: Post['status']) {
  const map: Record<string, string> = {
    PUBLISHED: 'bg-emerald-400/10 text-emerald-400',
    SCHEDULED: 'bg-blue-400/10 text-blue-400',
    FAILED: 'bg-red-400/10 text-red-400',
    CANCELLED: 'bg-white/[0.04] text-slate-500',
  }
  const icons: Record<string, JSX.Element> = {
    PUBLISHED: <CheckCircle2 size={9} />,
    SCHEDULED: <Calendar size={9} />,
    FAILED: <AlertCircle size={9} />,
    CANCELLED: <Clock size={9} />,
  }
  return (
    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.6rem] font-medium ${map[status] ?? 'bg-white/[0.04] text-slate-500'}`}>
      {icons[status]}
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'INSTAGRAM') return <Instagram size={11} className="text-pink-400" />
  if (channel === 'LINKEDIN') return <Linkedin size={11} className="text-blue-400" />
  return null
}

function channelLabel(channel: string) {
  if (channel === 'INSTAGRAM') return <span className="text-pink-400">Instagram</span>
  if (channel === 'LINKEDIN') return <span className="text-blue-400">LinkedIn</span>
  return <span className="text-slate-400">{channel}</span>
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

export default function LibraryPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>({ type: 'all' })
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  const activeProjects = projects.filter((p) => !p.deleted)

  const filteredPosts = posts.filter((post) => {
    if (filter.type === 'all') return true
    if (filter.type === 'uncategorized') return !post.campaignId
    if (filter.type === 'project') {
      const project = projects.find((p) => p.id === filter.id)
      if (!project) return false
      return post.projectName === project.name
    }
    if (filter.type === 'campaign') {
      return post.campaignId === filter.id
    }
    return true
  })

  function toggleProject(projectId: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  function filterLabel() {
    if (filter.type === 'all') return null
    if (filter.type === 'uncategorized') return 'Uncategorized'
    if (filter.type === 'project') {
      const project = projects.find((p) => p.id === filter.id)
      return project ? project.name : ''
    }
    if (filter.type === 'campaign') {
      const camp = campaigns.find((c) => c.id === filter.id)
      return camp ? camp.name : ''
    }
    return null
  }

  const label = filterLabel()

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 px-4 py-6 max-w-6xl mx-auto w-full">

        {/* Mobile pill strip */}
        <div className="md:hidden flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
          {/* All */}
          <button
            onClick={() => setFilter({ type: 'all' })}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-[0.72rem] font-medium transition-colors ${
              filter.type === 'all'
                ? 'bg-cyan-400/[0.15] text-cyan-400 border border-cyan-400/30'
                : 'bg-white/[0.04] text-slate-400 border border-white/[0.06]'
            }`}
          >
            All
          </button>
          {activeProjects.map((project) => (
            <button
              key={project.id}
              onClick={() => setFilter({ type: 'project', id: project.id })}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[0.72rem] font-medium transition-colors ${
                filter.type === 'project' && filter.id === project.id
                  ? 'bg-cyan-400/[0.15] text-cyan-400 border border-cyan-400/30'
                  : 'bg-white/[0.04] text-slate-400 border border-white/[0.06]'
              }`}
            >
              {project.name}
            </button>
          ))}
          <button
            onClick={() => setFilter({ type: 'uncategorized' })}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-[0.72rem] font-medium transition-colors ${
              filter.type === 'uncategorized'
                ? 'bg-cyan-400/[0.15] text-cyan-400 border border-cyan-400/30'
                : 'bg-white/[0.04] text-slate-400 border border-white/[0.06]'
            }`}
          >
            Uncategorized
          </button>
        </div>

        {/* Desktop layout */}
        <div className="grid md:grid-cols-[220px_1fr] gap-4">

          {/* LEFT SIDEBAR */}
          <aside className="hidden md:block">
            <div className="glass rounded-xl p-3 h-fit">
              <div className="text-[0.58rem] font-bold tracking-[0.12em] uppercase text-slate-600 px-2 mb-2">
                Filter
              </div>

              {/* All Posts */}
              <div
                onClick={() => setFilter({ type: 'all' })}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-[0.78rem] transition-colors ${
                  filter.type === 'all'
                    ? 'bg-cyan-400/[0.08] text-cyan-400 rounded-lg'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-white/[0.03] rounded-lg'
                }`}
              >
                All Posts
              </div>

              {/* Projects */}
              {activeProjects.map((project) => {
                const isExpanded = expandedProjects.has(project.id)
                const isProjectActive = filter.type === 'project' && filter.id === project.id
                const projectCampaigns = getCampaignsForProject(project.id)

                return (
                  <div key={project.id}>
                    <div
                      onClick={() => {
                        toggleProject(project.id)
                        setFilter({ type: 'project', id: project.id })
                      }}
                      className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-[0.78rem] transition-colors ${
                        isProjectActive
                          ? 'bg-cyan-400/[0.08] text-cyan-400 rounded-lg'
                          : 'text-slate-400 hover:text-slate-300 hover:bg-white/[0.03] rounded-lg'
                      }`}
                    >
                      <FolderOpen size={12} className="flex-shrink-0" />
                      <span className="flex-1 truncate">{project.name}</span>
                      {projectCampaigns.length > 0 && (
                        <ChevronRight
                          size={10}
                          className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                      )}
                    </div>

                    {/* Campaigns under project */}
                    {isExpanded && projectCampaigns.map((camp) => {
                      const isCampActive = filter.type === 'campaign' && filter.id === camp.id
                      return (
                        <div
                          key={camp.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setFilter({ type: 'campaign', id: camp.id })
                          }}
                          className={`flex items-center gap-2 pl-6 pr-2 py-1.5 cursor-pointer text-[0.72rem] transition-colors ${
                            isCampActive
                              ? 'bg-cyan-400/[0.08] text-cyan-400 rounded-lg'
                              : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03] rounded-lg'
                          }`}
                        >
                          <Megaphone size={10} className="flex-shrink-0" />
                          <span className="truncate">{camp.name}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Uncategorized */}
              <div
                onClick={() => setFilter({ type: 'uncategorized' })}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-[0.78rem] transition-colors mt-1 ${
                  filter.type === 'uncategorized'
                    ? 'bg-cyan-400/[0.08] text-cyan-400 rounded-lg'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-white/[0.03] rounded-lg'
                }`}
              >
                Uncategorized
              </div>
            </div>
          </aside>

          {/* RIGHT CONTENT */}
          <div>
            {/* Header row */}
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[0.88rem] font-semibold">Posts</h2>
              <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400 text-[0.65rem] font-medium">
                {filteredPosts.length}
              </span>
              {label && (
                <>
                  <span className="text-slate-700 text-[0.7rem]">·</span>
                  <span className="text-[0.72rem] text-slate-500">{label}</span>
                </>
              )}
            </div>

            {/* Posts grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
              {filteredPosts.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-600 text-[0.82rem]">
                  No posts in this filter
                </div>
              ) : (
                filteredPosts.map((post) => (
                  <div
                    key={post.id}
                    className="glass glass-hover rounded-xl overflow-hidden cursor-pointer card-shine"
                    onClick={() => router.push('/draft/' + post.draftId)}
                  >
                    {/* Image */}
                    <img
                      src={post.exportUrl}
                      alt=""
                      className="w-full h-36 object-cover"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />

                    {/* Failed banner */}
                    {post.status === 'FAILED' && (
                      <div className="px-3 py-1.5 bg-red-500/10 border-t border-red-500/20 text-[0.65rem] text-red-400 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {post.errorReason}
                      </div>
                    )}

                    <div className="p-3">
                      {/* Channel + status */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1 text-[0.7rem]">
                          <ChannelIcon channel={post.channel} />
                          {channelLabel(post.channel)}
                        </div>
                        {statusBadge(post.status)}
                      </div>

                      {/* Topic */}
                      <div className="text-[0.8rem] text-slate-200 font-medium leading-snug line-clamp-2 mb-1">
                        {post.topic}
                      </div>

                      {/* Campaign */}
                      <div className="text-[0.65rem] text-slate-600">
                        {post.campaignName ?? 'Uncategorized'}
                      </div>

                      {/* Date */}
                      <div className="text-[0.6rem] text-slate-700 mt-1">
                        {formatDate(post.createdAt ?? post.scheduledAt ?? '')}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
