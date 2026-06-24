'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, RotateCcw, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { GlassInput } from '@/components/ui/GlassInput'
import { Select } from '@/components/ui/Select'
import { apiFetch } from '@/lib/apiFetch'

interface Project {
  id: string
  name: string
  defaultTone: string | null
  isDeleted: boolean
  defaultBrandKit: { id: string; name: string } | null
  _count: { campaigns: number }
}

interface BrandKitOption {
  id: string
  name: string
  previewColor: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBrandKitId, setNewBrandKitId] = useState('')
  const [brandKits, setBrandKits] = useState<BrandKitOption[]>([])
  const [showDeleted, setShowDeleted] = useState(false)

  const fetchProjects = useCallback(async () => {
    try {
      const data = await apiFetch('/api/projects')
      setProjects(data)
    } catch (e: unknown) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])
  useEffect(() => {
    apiFetch<BrandKitOption[]>('/api/brandkits').then(setBrandKits).catch(console.error)
  }, [])

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
      fetchProjects()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function softDelete(id: string) {
    if (!confirm('Delete this project?')) return
    try {
      await apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
      fetchProjects()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function restore(id: string) {
    try {
      await apiFetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDeleted: false }),
      })
      fetchProjects()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  const visible = projects.filter(p => showDeleted ? p.isDeleted : !p.isDeleted)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Projects</h1>
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
            Organise campaigns under projects with shared brand kits and tones.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowDeleted(v => !v)}>
            {showDeleted ? 'Show active' : 'Show deleted'}
          </Button>
          <Button onClick={() => setCreating(v => !v)}>
            <Plus size={16} /> New Project
          </Button>
        </div>
      </div>

      {creating && (
        <GlassPanel className="p-4 mb-4 animate-fade-in">
          <form onSubmit={create} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <GlassInput
              label="Project name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Q3 Product Launch"
              className="flex-1"
              autoFocus
            />
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
        </GlassPanel>
      )}

      {loading && (
        <div className="text-sm text-light-text-muted dark:text-dark-text-muted py-8 text-center">Loading…</div>
      )}

      {!loading && visible.length === 0 && (
        <GlassPanel className="p-8 text-center">
          <FolderOpen size={32} className="mx-auto mb-3 text-light-text-muted dark:text-dark-text-muted" />
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
            {showDeleted ? 'No deleted projects.' : 'No projects yet.'}
          </p>
        </GlassPanel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(project => (
          <GlassPanel key={project.id} className="p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/projects/${project.id}`}
                className="text-base font-semibold text-light-text dark:text-dark-text hover:text-primary dark:hover:text-primary-light transition-colors"
              >
                {project.name}
              </Link>
              {project.isDeleted ? (
                <Button variant="ghost" size="sm" onClick={() => restore(project.id)}>
                  <RotateCcw size={13} /> Restore
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => softDelete(project.id)}>
                  <Trash2 size={13} />
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-light-text-muted dark:text-dark-text-muted">
              <span>{project._count.campaigns} campaign{project._count.campaigns !== 1 ? 's' : ''}</span>
              {project.defaultBrandKit && (
                <span className="bg-primary/8 dark:bg-primary-light/8 text-primary dark:text-primary-light px-2 py-0.5 rounded-full">
                  {project.defaultBrandKit.name}
                </span>
              )}
              {project.defaultTone && (
                <span className="bg-primary/5 dark:bg-primary-light/5 px-2 py-0.5 rounded-full capitalize">
                  {project.defaultTone}
                </span>
              )}
            </div>
          </GlassPanel>
        ))}
      </div>
    </>
  )
}
