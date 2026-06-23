'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronRight, Star, Upload, ToggleLeft, ToggleRight, Sparkles, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { GlassInput } from '@/components/ui/GlassInput'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandKit {
  id: string
  name: string
  colors: string[]
  fonts: Array<{ name: string; url: string }>
  logoUrl: string | null
  isDefault: boolean
  prompts: Prompt[]
  templates: Template[]
  artifacts: Artifact[]
}

interface Prompt { id: string; content: string; version: number; isActive: boolean; createdAt: string }
interface Template { id: string; name: string; htmlTemplate: string; createdAt: string }
interface Artifact { id: string; name: string; type: string; url: string; feedToAI: boolean }

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText)
  return res.status === 204 ? null : res.json()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-5 h-5 rounded-md border border-black/10 dark:border-white/10 flex-shrink-0"
      style={{ background: color }}
      title={color}
    />
  )
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
        {title}
      </h3>
      {action}
    </div>
  )
}

// ─── Color Palette Editor ─────────────────────────────────────────────────────

function ColorEditor({ colors, onChange }: { colors: string[]; onChange: (c: string[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => {
    const val = input.trim()
    if (val && /^#[0-9a-fA-F]{3,8}$/.test(val) && !colors.includes(val)) {
      onChange([...colors, val])
      setInput('')
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {colors.map(c => (
          <div key={c} className="flex items-center gap-1.5 glass-input rounded-lg px-2 py-1">
            <ColorSwatch color={c} />
            <span className="font-mono text-xs text-light-text dark:text-dark-text">{c}</span>
            <button
              onClick={() => onChange(colors.filter(x => x !== c))}
              className="text-light-text-muted dark:text-dark-text-muted hover:text-red-500 ml-1"
            >×</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="#1A2B3C"
          className="glass-input rounded-xl px-3 py-2 text-sm w-36 text-light-text dark:text-dark-text"
        />
        <Button variant="secondary" size="sm" onClick={add}>Add</Button>
      </div>
    </div>
  )
}

// ─── Prompt Section ───────────────────────────────────────────────────────────

function PromptSection({ kitId, prompts, onRefresh }: { kitId: string; prompts: Prompt[]; onRefresh: () => void }) {
  const [draft, setDraft] = useState('')
  const [aiDraft, setAiDraft] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'active' | 'history' | 'new'>('active')

  const active = prompts.find(p => p.isActive)

  async function generate() {
    setLoading(true)
    try {
      const data = await apiFetch(`/api/admin/brandkits/${kitId}/prompts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      setAiDraft(data.draft)
      setDraft(data.draft)
      setView('new')
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  async function improve() {
    setLoading(true)
    try {
      const data = await apiFetch(`/api/admin/brandkits/${kitId}/prompts/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setAiDraft(data.draft)
      setDraft(data.draft)
      setView('new')
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  async function saveVersion() {
    if (!draft.trim()) return
    try {
      await apiFetch(`/api/admin/brandkits/${kitId}/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      setDraft(''); setAiDraft(''); setView('active')
      onRefresh()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function activate(promptId: string) {
    try {
      await apiFetch(`/api/admin/brandkits/${kitId}/prompts/${promptId}/activate`, { method: 'POST' })
      onRefresh()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs">
        {(['active', 'history', 'new'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-2.5 py-1 rounded-lg capitalize transition-colors ${
              view === v
                ? 'bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light font-medium'
                : 'text-light-text-muted dark:text-dark-text-muted hover:bg-primary/5'
            }`}
          >
            {v === 'active' ? 'Active' : v === 'history' ? 'History' : 'New Version'}
          </button>
        ))}
      </div>

      {view === 'active' && (
        <div className="space-y-3">
          {active ? (
            <div className="glass-input rounded-xl p-3 text-sm text-light-text dark:text-dark-text whitespace-pre-wrap leading-relaxed">
              {active.content}
            </div>
          ) : (
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">No active prompt. Generate one below.</p>
          )}
          <div className="flex gap-2">
            {active ? (
              <Button variant="secondary" size="sm" onClick={improve} disabled={loading}>
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Improving…' : 'Improve with AI'}
              </Button>
            ) : (
              <div className="flex gap-2 w-full">
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe your brand in a few sentences…"
                  className="glass-input rounded-xl px-3 py-2 text-sm flex-1 text-light-text dark:text-dark-text"
                />
                <Button variant="secondary" size="sm" onClick={generate} disabled={loading || !description.trim()}>
                  <Sparkles size={13} />
                  {loading ? 'Generating…' : 'Generate'}
                </Button>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => { setDraft(''); setView('new') }}>
              Write manually
            </Button>
          </div>
        </div>
      )}

      {view === 'history' && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {prompts.length === 0 && (
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">No versions yet.</p>
          )}
          {prompts.map(p => (
            <div key={p.id} className="glass-input rounded-xl p-3 flex items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs text-light-text-muted dark:text-dark-text-muted">v{p.version}</span>
                {p.isActive && (
                  <span className="ml-2 text-xs bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light px-1.5 py-0.5 rounded-full">active</span>
                )}
                <p className="text-xs text-light-text dark:text-dark-text mt-1 line-clamp-2">{p.content}</p>
              </div>
              {!p.isActive && (
                <Button variant="ghost" size="sm" onClick={() => activate(p.id)}>Restore</Button>
              )}
            </div>
          ))}
        </div>
      )}

      {view === 'new' && (
        <div className="space-y-3">
          {aiDraft && (
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted">AI-generated draft — review and edit before saving.</p>
          )}
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={8}
            placeholder="Write your brand voice prompt…"
            className="glass-input rounded-xl px-3 py-2.5 text-sm w-full text-light-text dark:text-dark-text resize-none"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveVersion} disabled={!draft.trim()}>Save as new version</Button>
            <Button variant="ghost" size="sm" onClick={() => { setDraft(''); setAiDraft(''); setView('active') }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Kit Detail Panel ─────────────────────────────────────────────────────────

function KitDetail({ kit, onRefresh }: { kit: BrandKit; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(kit.name)
  const [colors, setColors] = useState<string[]>(kit.colors)
  const [saving, setSaving] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateHtml, setTemplateHtml] = useState('')
  const [addingTemplate, setAddingTemplate] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const artifactRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(kit.name)
    setColors(kit.colors)
  }, [kit])

  async function saveEdit() {
    setSaving(true)
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, colors }),
      })
      setEditing(false)
      onRefresh()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  async function uploadFile(file: File, type: string) {
    const fd = new FormData()
    fd.append('file', file)
    await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts`, {
      method: 'POST',
      body: Object.assign(fd, (() => { fd.append('type', type); fd.append('name', file.name); return {} })()),
    })
    onRefresh()
  }

  async function uploadAsset(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    const data = await apiFetch(`/api/admin/brandkits/${kit.id}/upload`, { method: 'POST', body: fd })
    return data.url as string
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadAsset(file)
      await apiFetch(`/api/admin/brandkits/${kit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: url }),
      })
      onRefresh()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleArtifactUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', 'REFERENCE_IMAGE')
      fd.append('name', file.name)
      fd.append('feedToAI', 'false')
      await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts`, { method: 'POST', body: fd })
      onRefresh()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    if (artifactRef.current) artifactRef.current.value = ''
  }

  async function toggleFeedToAI(artifactId: string, current: boolean) {
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts/${artifactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedToAI: !current }),
      })
      onRefresh()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function deleteArtifact(id: string) {
    if (!confirm('Delete this artifact?')) return
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts/${id}`, { method: 'DELETE' })
      onRefresh()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function addTemplate() {
    if (!templateName.trim() || !templateHtml.trim()) return
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName, htmlTemplate: templateHtml }),
      })
      setTemplateName(''); setTemplateHtml(''); setAddingTemplate(false)
      onRefresh()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function deleteTemplate(tid: string) {
    if (!confirm('Delete this template?')) return
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}/templates/${tid}`, { method: 'DELETE' })
      onRefresh()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function setDefault() {
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      onRefresh()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {editing ? (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="glass-input rounded-xl px-3 py-2 text-xl font-semibold text-light-text dark:text-dark-text"
            />
          ) : (
            <h2 className="text-xl font-semibold text-light-text dark:text-dark-text flex items-center gap-2">
              {kit.name}
              {kit.isDefault && (
                <span className="text-xs bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light px-2 py-0.5 rounded-full font-normal">
                  System default
                </span>
              )}
            </h2>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {!kit.isDefault && (
            <Button variant="ghost" size="sm" onClick={setDefault}>
              <Star size={14} /> Set default
            </Button>
          )}
          {editing ? (
            <>
              <Button size="sm" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setName(kit.name); setColors(kit.colors) }}>Cancel</Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Edit
            </Button>
          )}
        </div>
      </div>

      {/* Colors */}
      <GlassPanel className="p-4">
        <SectionHeader title="Color Palette" />
        {editing ? (
          <ColorEditor colors={colors} onChange={setColors} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {kit.colors.length === 0 ? (
              <span className="text-sm text-light-text-muted dark:text-dark-text-muted">No colors defined</span>
            ) : kit.colors.map(c => (
              <div key={c} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/5 dark:bg-primary-light/5">
                <ColorSwatch color={c} />
                <span className="font-mono text-xs text-light-text dark:text-dark-text">{c}</span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* Logo */}
      <GlassPanel className="p-4">
        <SectionHeader
          title="Logo"
          action={
            <>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload size={13} /> {kit.logoUrl ? 'Replace' : 'Upload'}
              </Button>
            </>
          }
        />
        {kit.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={kit.logoUrl} alt="Brand logo" className="h-16 object-contain rounded-lg" />
        ) : (
          <span className="text-sm text-light-text-muted dark:text-dark-text-muted">No logo uploaded</span>
        )}
      </GlassPanel>

      {/* Fonts */}
      <GlassPanel className="p-4">
        <SectionHeader title="Fonts" />
        {kit.fonts.length === 0 ? (
          <span className="text-sm text-light-text-muted dark:text-dark-text-muted">No fonts added</span>
        ) : (
          <ul className="space-y-1">
            {kit.fonts.map(f => (
              <li key={f.url} className="text-sm text-light-text dark:text-dark-text flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary dark:bg-primary-light flex-shrink-0" />
                {f.name}
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>

      {/* Templates */}
      <GlassPanel className="p-4">
        <SectionHeader
          title="HTML Templates"
          action={
            <Button variant="ghost" size="sm" onClick={() => setAddingTemplate(v => !v)}>
              <Plus size={13} /> Add
            </Button>
          }
        />
        {addingTemplate && (
          <div className="mb-4 space-y-2 animate-fade-in">
            <GlassInput
              label="Template name"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="e.g. Event Announcement"
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-light-text dark:text-dark-text">HTML/CSS</label>
              <textarea
                value={templateHtml}
                onChange={e => setTemplateHtml(e.target.value)}
                rows={6}
                placeholder="<!DOCTYPE html>…"
                className="glass-input rounded-xl px-3 py-2.5 text-sm font-mono text-light-text dark:text-dark-text resize-y"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addTemplate} disabled={!templateName.trim() || !templateHtml.trim()}>Save template</Button>
              <Button variant="ghost" size="sm" onClick={() => { setAddingTemplate(false); setTemplateName(''); setTemplateHtml('') }}>Cancel</Button>
            </div>
          </div>
        )}
        {kit.templates.length === 0 ? (
          <span className="text-sm text-light-text-muted dark:text-dark-text-muted">No templates linked</span>
        ) : (
          <ul className="space-y-2">
            {kit.templates.map(t => (
              <li key={t.id} className="flex items-center justify-between glass-input rounded-xl px-3 py-2">
                <span className="text-sm text-light-text dark:text-dark-text">{t.name}</span>
                <Button variant="ghost" size="sm" onClick={() => deleteTemplate(t.id)}>
                  <Trash2 size={13} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>

      {/* Brand Voice Prompt */}
      <GlassPanel className="p-4">
        <SectionHeader title="Brand Voice Prompt" />
        <PromptSection kitId={kit.id} prompts={kit.prompts} onRefresh={onRefresh} />
      </GlassPanel>

      {/* Artifacts */}
      <GlassPanel className="p-4">
        <SectionHeader
          title="Artifacts"
          action={
            <>
              <input ref={artifactRef} type="file" accept="image/*" className="hidden" onChange={handleArtifactUpload} />
              <Button variant="ghost" size="sm" onClick={() => artifactRef.current?.click()}>
                <Upload size={13} /> Upload
              </Button>
            </>
          }
        />
        {kit.artifacts.length === 0 ? (
          <span className="text-sm text-light-text-muted dark:text-dark-text-muted">No artifacts uploaded</span>
        ) : (
          <ul className="space-y-2">
            {kit.artifacts.map(a => (
              <li key={a.id} className="flex items-center justify-between glass-input rounded-xl px-3 py-2">
                <div>
                  <span className="text-sm text-light-text dark:text-dark-text">{a.name}</span>
                  <span className="ml-2 font-mono text-xs text-light-text-muted dark:text-dark-text-muted">{a.type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleFeedToAI(a.id, a.feedToAI)}
                    title={a.feedToAI ? 'Fed to AI — click to disable' : 'Not fed to AI — click to enable'}
                    className={`transition-colors ${a.feedToAI ? 'text-primary dark:text-primary-light' : 'text-light-text-muted dark:text-dark-text-muted'}`}
                  >
                    {a.feedToAI ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => deleteArtifact(a.id)}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  )
}

// ─── Add Kit Modal ────────────────────────────────────────────────────────────

function AddKitModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const kit = await apiFetch('/api/admin/brandkits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), colors: [], fonts: [] }),
      })
      onCreated(kit.id)
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <GlassPanel className="w-full max-w-sm p-6 animate-scale-in">
        <h2 className="text-base font-semibold text-light-text dark:text-dark-text mb-4">New Brand Kit</h2>
        <form onSubmit={submit} className="space-y-4">
          <GlassInput
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Bistec 2026"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create'}</Button>
          </div>
        </form>
      </GlassPanel>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrandKitsPage() {
  const [kits, setKits] = useState<BrandKit[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedKit, setSelectedKit] = useState<BrandKit | null>(null)
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchKits = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/brandkits')
      setKits(data)
    } catch (e: unknown) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  const fetchSelected = useCallback(async (id: string) => {
    try {
      const data = await apiFetch(`/api/admin/brandkits/${id}`)
      setSelectedKit(data)
    } catch (e: unknown) { console.error(e) }
  }, [])

  useEffect(() => { fetchKits() }, [fetchKits])

  useEffect(() => {
    if (selectedId) fetchSelected(selectedId)
    else setSelectedKit(null)
  }, [selectedId, fetchSelected])

  function handleCreated(id: string) {
    setAdding(false)
    fetchKits().then(() => setSelectedId(id))
  }

  function handleRefresh() {
    fetchKits()
    if (selectedId) fetchSelected(selectedId)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this brand kit?')) return
    try {
      await apiFetch(`/api/admin/brandkits/${id}`, { method: 'DELETE' })
      if (selectedId === id) setSelectedId(null)
      fetchKits()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  return (
    <>
      {adding && <AddKitModal onClose={() => setAdding(false)} onCreated={handleCreated} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Brand Kits</h1>
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
            Manage brand identities, templates, and voice prompts.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} /> Add Kit
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar list */}
        <div className="space-y-2">
          {loading && (
            <div className="text-sm text-light-text-muted dark:text-dark-text-muted px-2 py-4">Loading…</div>
          )}
          {!loading && kits.length === 0 && (
            <GlassPanel className="p-4 text-center">
              <p className="text-sm text-light-text-muted dark:text-dark-text-muted">No brand kits yet.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAdding(true)}>
                <Plus size={13} /> Create one
              </Button>
            </GlassPanel>
          )}
          {kits.map(kit => (
            <div
              key={kit.id}
              className={`glass-panel rounded-xl px-4 py-3 cursor-pointer transition-all flex items-center justify-between gap-2 ${
                selectedId === kit.id
                  ? 'border-primary/40 dark:border-primary-light/30 bg-primary/5 dark:bg-primary-light/5'
                  : 'hover:bg-primary/5 dark:hover:bg-primary-light/5'
              }`}
              onClick={() => setSelectedId(kit.id)}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-light-text dark:text-dark-text truncate">{kit.name}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  {kit.colors.slice(0, 5).map(c => <ColorSwatch key={c} color={c} />)}
                  {kit.isDefault && (
                    <span className="text-xs text-primary dark:text-primary-light font-mono ml-1">default</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(kit.id) }}
                  className="p-1 rounded-lg text-light-text-muted dark:text-dark-text-muted hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
                <ChevronRight size={14} className={`text-light-text-muted dark:text-dark-text-muted transition-transform ${selectedId === kit.id ? 'rotate-90' : ''}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div>
          {selectedKit ? (
            <KitDetail kit={selectedKit} onRefresh={handleRefresh} />
          ) : (
            <GlassPanel className="p-8 text-center text-light-text-muted dark:text-dark-text-muted">
              Select a brand kit to view details
            </GlassPanel>
          )}
        </div>
      </div>
    </>
  )
}
