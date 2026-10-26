'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, RotateCcw, FolderOpen, Palette, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { QueryError } from '@/components/ui/QueryError'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PageHead } from '@/components/ui/PageHead'
import { FOCUS, ICON, ICON_BUTTON, ICON_SM, TAG } from '@/components/ui/atoms'
import { apiFetch } from '@/lib/apiFetch'
import { ROW_TITLE } from '@/components/campaigns/classes'
import type { ProjectSummary, BrandKitSummary } from '@/lib/api-types'

// A project row in the list card: ruled above on --line-subtle, except the
// first row of each column (one column below lg, two from lg).
const LIST_ROW =
  'flex min-w-0 items-start gap-3 border-t border-line-subtle py-3.5 first:border-t-0 lg:[&:nth-child(2)]:border-t-0'

export default function ProjectsPage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBrandKitId, setNewBrandKitId] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)

  const {
    data: projects = [],
    isLoading: loading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectSummary[]>('/api/projects'),
  })

  const { data: brandKits = [] } = useQuery({
    queryKey: ['brandkits'],
    queryFn: () => apiFetch<BrandKitSummary[]>('/api/brandkits'),
  })

  function invalidateProjects() {
    return queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const brandKitOptions = [
    { value: '', label: 'No default brand kit' },
    ...brandKits.map(k => ({ value: k.id, label: k.name })),
  ]

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await apiFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), defaultBrandKitId: newBrandKitId || undefined }),
      })
      setNewName(''); setNewBrandKitId(''); setCreating(false)
      invalidateProjects()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function softDelete(id: string) {
    if (!(await confirm({
      title: 'Delete this project?',
      description: 'You can restore it later from "Show deleted".',
      confirmLabel: 'Delete',
    }))) return
    try {
      await apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
      invalidateProjects()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function restore(id: string) {
    try {
      await apiFetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDeleted: false }),
      })
      invalidateProjects()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  const visible = projects.filter(p => showDeleted ? p.isDeleted : !p.isDeleted)

  return (
    <>
      {/* Page head (DESIGN_SYSTEM.md §6): an eyebrow, the title, a lead. */}
      <PageHead
        className="mb-6"
        eyebrow="Organize"
        title="Projects"
        lead="Organize campaigns under projects with shared brand kits and tones."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowDeleted(v => !v)}>
              {showDeleted ? 'Show active' : 'Show deleted'}
            </Button>
            {/* One accent primary per view: while the form is open its Create is
                the primary, and this toggle shows as an open Outline button. */}
            <Button
              variant={creating ? 'secondary' : 'primary'}
              aria-expanded={creating}
              onClick={() => setCreating(v => !v)}
            >
              <Plus {...ICON} /> New Project
            </Button>
          </>
        }
      />

      {creating && (
        <Panel className="mb-5 animate-fade-in p-5">
          <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Input
                label="Project name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Q3 Product Launch"
                autoFocus
              />
            </div>
            <div className="sm:w-64">
              <Select
                label="Default brand kit"
                options={brandKitOptions}
                value={newBrandKitId}
                onChange={e => setNewBrandKitId(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!newName.trim()}>Create</Button>
              <Button variant="ghost" type="button" onClick={() => { setCreating(false); setNewName(''); setNewBrandKitId('') }}>Cancel</Button>
            </div>
          </form>
        </Panel>
      )}

      {loading && (
        <p className="py-8 text-center text-ui-sm text-fg-muted">Loading…</p>
      )}

      {isError && (
        <QueryError error={error} onRetry={() => refetch()} />
      )}

      {!loading && !isError && visible.length === 0 && (
        <Panel bezel className="py-12 text-center">
          <FolderOpen size={28} strokeWidth={1.6} aria-hidden className="mx-auto mb-3 text-fg-muted" />
          <p className="text-ui-sm text-fg-muted">
            {showDeleted ? 'No deleted projects.' : 'No projects yet.'}
          </p>
        </Panel>
      )}

      {/* Projects as ruled rows on --line-subtle (§6) in one bezel card (021
          design.md §8), two columns on wide screens. */}
      {!isError && visible.length > 0 && (
        <ul className="surface-bezel grid grid-cols-1 px-5 py-1.5 lg:grid-cols-2 lg:gap-x-10">
          {visible.map(project => (
            <li key={project.id} className={LIST_ROW}>
              <div className="min-w-0 flex-1">
                <Link href={`/projects/${project.id}`} className={`rounded-ui-sm ${ROW_TITLE} ${FOCUS}`}>
                  {project.name}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-ui-xs text-fg-muted">
                  <span>{project._count.campaigns} campaign{project._count.campaigns !== 1 ? 's' : ''}</span>
                  {project.defaultBrandKit && (
                    <span title={`Default brand kit: ${project.defaultBrandKit.name}`} className={TAG}>
                      <Palette {...ICON_SM} aria-hidden className="flex-shrink-0 text-fg-muted" />
                      <span className="truncate">{project.defaultBrandKit.name}</span>
                    </span>
                  )}
                  {project.defaultTone && (
                    <span title="Default tone" className={`${TAG} capitalize`}>
                      <MessageCircle {...ICON_SM} aria-hidden className="flex-shrink-0 text-fg-muted" />
                      <span className="truncate">{project.defaultTone}</span>
                    </span>
                  )}
                </div>
              </div>
              {project.isDeleted ? (
                <Button variant="ghost" size="sm" onClick={() => restore(project.id)}>
                  <RotateCcw {...ICON} /> Restore
                </Button>
              ) : (
                <button
                  type="button"
                  aria-label={`Delete ${project.name}`}
                  title="Delete"
                  onClick={() => softDelete(project.id)}
                  className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                >
                  <Trash2 {...ICON} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
