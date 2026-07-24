'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { QueryError } from '@/components/ui/QueryError'
import { PostCard } from '@/components/library/PostCard'
import { PublishDialog } from '@/components/library/PublishDialog'
import { PublishHistoryDrawer } from '@/components/library/PublishHistoryDrawer'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import type { DraftRecord, PostRecord, LibraryResponse } from '@/lib/api-types'

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'READY' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED'

// Flatten brandKitName from the brief's campaign for PostCard
function toBriefCardProps(draft: DraftRecord) {
  const brandKitName = draft.brief.campaign?.brandKit?.name ?? null
  return { ...draft, brandKitName }
}

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Ready', value: 'READY' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Published', value: 'PUBLISHED' },
  { label: 'Failed', value: 'FAILED' },
]

const PAGE_SIZE = 20

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
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const { isTeamAdmin } = useCurrentUser()

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
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['library', activeStatus, search],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
        status: activeStatus,
        ...(search ? { search } : {}),
      })
      return apiFetch<LibraryResponse>(`/api/library?${params}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length * PAGE_SIZE < lastPage.total ? allPages.length + 1 : undefined,
  })

  const drafts = data?.pages.flatMap((p) => p.drafts) ?? []

  function invalidateLibrary() {
    return queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  async function handleRetry(postId: string) {
    await apiFetch(`/api/posts/${postId}/publish`, { method: 'POST' })
    invalidateLibrary()
  }

  async function handleDelete(draftId: string) {
    const ok = await confirm({
      title: 'Delete this post?',
      description:
        'This permanently removes the draft, its revisions, its publish history (any scheduled publish is cancelled), and its brief. This cannot be undone.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await apiFetch(`/api/drafts/${draftId}`, { method: 'DELETE' })
      toast.success('Post deleted')
      invalidateLibrary()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
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
      <SegmentedToggle
        options={STATUS_TABS.map(({ label, value }) => ({ value, label }))}
        value={activeStatus}
        onChange={(v) => setActiveStatus(v as StatusFilter)}
        className="mb-5"
      />

      {/* Grid */}
      {isPending ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : drafts.length === 0 ? (
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
                isTeamAdmin={isTeamAdmin}
                onPublish={(draftId, exportUrl) =>
                  setShowPublishDialog({ draftId, exportUrl })
                }
                onViewHistory={(draftId, posts) =>
                  setSelectedDraft({ id: draftId, posts: posts as PostRecord[] })
                }
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Load more */}
          {hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Publish dialog */}
      {showPublishDialog && (
        <PublishDialog
          draftId={showPublishDialog.draftId}
          onClose={() => setShowPublishDialog(null)}
          onSuccess={() => {
            setShowPublishDialog(null)
            invalidateLibrary()
          }}
        />
      )}

      {/* Publish history drawer */}
      <PublishHistoryDrawer
        draftId={selectedDraft?.id ?? null}
        posts={selectedDraft?.posts ?? []}
        isTeamAdmin={isTeamAdmin}
        onClose={() => setSelectedDraft(null)}
        onRetry={handleRetry}
      />
    </>
  )
}
