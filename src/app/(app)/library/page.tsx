'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { GlassInput } from '@/components/ui/GlassInput'
import { PostCard } from '@/components/library/PostCard'
import { PublishHistoryDrawer } from '@/components/library/PublishHistoryDrawer'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'READY' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED'

interface PostRecord {
  id: string
  channel: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  platformId: string | null
  errorReason: string | null
}

interface DraftRecord {
  id: string
  exportUrl: string | null
  copyText: string
  status: string
  createdAt: string
  brief: { topic: string; channels: string[] }
  posts: PostRecord[]
  campaigns: Array<{
    campaign: {
      name: string
      brandKit: { name: string } | null
    }
  }>
}

// Flatten brandKitName from campaigns for PostCard
function toBriefCardProps(draft: DraftRecord) {
  const brandKitName =
    draft.campaigns[0]?.campaign?.brandKit?.name ?? null
  return { ...draft, brandKitName }
}

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Ready', value: 'READY' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Published', value: 'PUBLISHED' },
  { label: 'Failed', value: 'FAILED' },
]

// ── Publish dialog ────────────────────────────────────────────────────────────

interface PublishDialogProps {
  draftId: string
  exportUrl: string
  onClose: () => void
  onSuccess: () => void
}

const CHANNELS = ['INSTAGRAM', 'LINKEDIN'] as const
type Channel = (typeof CHANNELS)[number]

function PublishDialog({ draftId, onClose, onSuccess }: PublishDialogProps) {
  const [checkedChannels, setCheckedChannels] = useState<Channel[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleChannel(ch: Channel) {
    setCheckedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    )
  }

  async function handleConfirm() {
    if (checkedChannels.length === 0) {
      setError('Select at least one channel.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await Promise.all(
        checkedChannels.map((channel) =>
          fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              draftId,
              channel,
              scheduledAt: scheduledAt || undefined,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.error ?? res.statusText)
            }
          })
        )
      )
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Publish failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <GlassPanel className="p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-4">
          Publish Post
        </h2>

        {/* Channel checkboxes */}
        <p className="text-sm font-medium text-light-text dark:text-dark-text mb-2">
          Channels
        </p>
        <div className="flex gap-3 mb-4">
          {CHANNELS.map((ch) => (
            <label
              key={ch}
              className="flex items-center gap-2 cursor-pointer text-sm text-light-text dark:text-dark-text"
            >
              <input
                type="checkbox"
                checked={checkedChannels.includes(ch)}
                onChange={() => toggleChannel(ch)}
                className="accent-primary dark:accent-primary-light"
              />
              {ch === 'INSTAGRAM' ? 'Instagram' : 'LinkedIn'}
            </label>
          ))}
        </div>

        {/* Scheduled at */}
        <div className="mb-5">
          <GlassInput
            label="Schedule for (optional)"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
            Leave blank to publish immediately.
          </p>
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={submitting || checkedChannels.length === 0}
          >
            {submitting ? 'Publishing…' : 'Confirm'}
          </Button>
        </div>
      </GlassPanel>
    </div>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <GlassPanel className="flex flex-col overflow-hidden animate-pulse">
      <div className="aspect-square w-full bg-light-border/40 dark:bg-dark-border/40" />
      <div className="p-3 flex flex-col gap-2">
        <div className="h-4 rounded bg-light-border/60 dark:bg-dark-border/60 w-3/4" />
        <div className="h-3 rounded bg-light-border/40 dark:bg-dark-border/40 w-1/2" />
        <div className="h-3 rounded bg-light-border/30 dark:bg-dark-border/30 w-1/3" />
        <div className="h-7 rounded-lg bg-light-border/40 dark:bg-dark-border/40 mt-1" />
      </div>
    </GlassPanel>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [drafts, setDrafts] = useState<DraftRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  const [selectedDraft, setSelectedDraft] = useState<{
    id: string
    posts: PostRecord[]
  } | null>(null)
  const [showPublishDialog, setShowPublishDialog] = useState<{
    draftId: string
    exportUrl: string
  } | null>(null)

  // Debounce search input
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  // Fetch session / role
  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((data) => {
        const role = data?.user?.role ?? data?.session?.user?.role ?? ''
        setIsAdmin(
          typeof role === 'string'
            ? role.toLowerCase() === 'admin'
            : false
        )
      })
      .catch(() => {})
  }, [])

  const PAGE_SIZE = 20

  const fetchLibrary = useCallback(
    async (append = false) => {
      if (!append) setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
          status: activeStatus,
          ...(search ? { search } : {}),
        })
        const res = await fetch(`/api/library?${params}`)
        if (!res.ok) throw new Error(res.statusText)
        const data = await res.json()
        setDrafts((prev) => (append ? [...prev, ...data.drafts] : data.drafts))
        setTotal(data.total)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    },
    [activeStatus, search, page]
  )

  // Reset page when filter/search changes (page already reset on search debounce)
  useEffect(() => {
    setPage(1)
  }, [activeStatus])

  useEffect(() => {
    fetchLibrary(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStatus, search, page])

  function handleStatusTab(s: StatusFilter) {
    setActiveStatus(s)
    setPage(1)
    setDrafts([])
  }

  function handleLoadMore() {
    setPage((p) => p + 1)
  }

  // When page increments, append
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (page > 1) fetchLibrary(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  async function handleRetry(postId: string) {
    await fetch(`/api/posts/${postId}/publish`, { method: 'POST' })
    fetchLibrary(false)
  }

  return (
    <>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Library</h1>
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
            All exported drafts and published posts.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-light-text-muted dark:text-dark-text-muted pointer-events-none"
          />
          <input
            type="search"
            placeholder="Search by topic…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={cn(
              'glass-input w-full rounded-xl pl-8 pr-3 py-2 text-sm',
              'text-light-text dark:text-dark-text',
              'placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted',
              'focus:outline-none'
            )}
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 mb-5">
        {STATUS_TABS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => handleStatusTab(value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150',
              activeStatus === value
                ? 'bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light border border-primary/20 dark:border-primary-light/20'
                : 'text-light-text-muted dark:text-dark-text-muted hover:bg-primary/5 dark:hover:bg-primary-light/5 hover:text-primary dark:hover:text-primary-light border border-transparent'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading && drafts.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : !loading && drafts.length === 0 ? (
        <GlassPanel className="p-12 text-center">
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
            No posts found.
          </p>
        </GlassPanel>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map((draft) => (
              <PostCard
                key={draft.id}
                draft={toBriefCardProps(draft)}
                isAdmin={isAdmin}
                onPublish={(draftId, exportUrl) =>
                  setShowPublishDialog({ draftId, exportUrl })
                }
                onViewHistory={(draftId, posts) =>
                  setSelectedDraft({ id: draftId, posts: posts as PostRecord[] })
                }
              />
            ))}
          </div>

          {/* Load more */}
          {drafts.length < total && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleLoadMore}
                disabled={loading}
              >
                {loading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Publish dialog */}
      {showPublishDialog && (
        <PublishDialog
          draftId={showPublishDialog.draftId}
          exportUrl={showPublishDialog.exportUrl}
          onClose={() => setShowPublishDialog(null)}
          onSuccess={() => {
            setShowPublishDialog(null)
            fetchLibrary(false)
          }}
        />
      )}

      {/* Publish history drawer */}
      <PublishHistoryDrawer
        draftId={selectedDraft?.id ?? null}
        posts={selectedDraft?.posts ?? []}
        isAdmin={isAdmin}
        onClose={() => setSelectedDraft(null)}
        onRetry={handleRetry}
      />
    </>
  )
}
