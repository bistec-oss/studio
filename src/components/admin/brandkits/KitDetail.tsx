'use client'

import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Star, Upload, ToggleLeft, ToggleRight, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { GlassInput } from '@/components/ui/GlassInput'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/apiFetch'
import type { AspectRatio } from '@prisma/client'
import { ASPECT_LABELS, ASPECT_VALUES, dimensionsLabel } from '@/lib/aspectRatio'
import type { AdminBrandKitDetail } from '@/lib/api-types'
import { ColorEditor } from './ColorEditor'
import { FontEditor } from './FontEditor'
import { PromptSection } from './PromptSection'
import { ColorSwatch, SectionHeader } from './shared'
import { BrandKitAssistantPanel } from './BrandKitAssistantPanel'

// ─── Kit Detail Panel ─────────────────────────────────────────────────────────

// AdminBrandKitDetail is the full-detail shape (all prompt versions, all
// templates/artifacts) returned by GET /api/admin/brandkits/[id].
type BrandKit = AdminBrandKitDetail

interface KitDetailProps {
  kit: BrandKit
  onRefresh: () => void
}

export function KitDetail({ kit, onRefresh }: KitDetailProps) {
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(kit.name)
  const [colors, setColors] = useState<string[]>(kit.colors)
  const [fonts, setFonts] = useState<Array<{ name: string; url: string }>>(kit.fonts)
  const [saving, setSaving] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateHtml, setTemplateHtml] = useState('')
  const [templateRatio, setTemplateRatio] = useState<AspectRatio>('SQUARE')
  const [addingTemplate, setAddingTemplate] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [templateFromImageBusy, setTemplateFromImageBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const artifactRef = useRef<HTMLInputElement>(null)
  const templateImageRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(kit.name)
    setColors(kit.colors)
    setFonts(kit.fonts)
  }, [kit])

  async function saveEdit() {
    setSaving(true)
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, colors, fonts }),
      })
      setEditing(false)
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setSaving(false) }
  }

  async function uploadAsset(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    const data = await apiFetch<{ url: string }>(`/api/admin/brandkits/${kit.id}/upload`, { method: 'POST', body: fd })
    return data.url
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
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleArtifactUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      // Images become REFERENCE_IMAGE (vision + color sampling); PDFs/DOCX/TXT/MD
      // become REFERENCE_DOC (text-parsed voice/color grounding).
      const isImage = file.type.startsWith('image/')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', isImage ? 'REFERENCE_IMAGE' : 'REFERENCE_DOC')
      fd.append('name', file.name)
      fd.append('feedToAI', 'false')
      await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts`, { method: 'POST', body: fd })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
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
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function deleteArtifact(id: string) {
    if (!(await confirm({ title: 'Delete this artifact?', confirmLabel: 'Delete' }))) return
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts/${id}`, { method: 'DELETE' })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function addTemplate() {
    if (!templateName.trim() || !templateHtml.trim()) return
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName, htmlTemplate: templateHtml, aspectRatio: templateRatio }),
      })
      setTemplateName(''); setTemplateHtml(''); setTemplateRatio('SQUARE'); setAddingTemplate(false)
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function handleTemplateFromImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (templateImageRef.current) templateImageRef.current.value = ''
    if (!file) return
    setTemplateFromImageBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await apiFetch<{ html: string; aspectRatio: AspectRatio }>(
        `/api/admin/brandkits/${kit.id}/templates/from-image`,
        { method: 'POST', body: fd },
      )
      // Drop the generated HTML into the editor for review, then the admin saves
      // via the normal "Save template" flow.
      setTemplateHtml(result.html)
      setTemplateRatio(result.aspectRatio)
      setTemplateName(file.name.replace(/\.[^.]+$/, ''))
      setAddingTemplate(true)
      toast.success('Template generated from image — review and save.')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate a template from the image')
    } finally {
      setTemplateFromImageBusy(false)
    }
  }

  async function deleteTemplate(tid: string) {
    if (!(await confirm({ title: 'Delete this template?', confirmLabel: 'Delete' }))) return
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}/templates/${tid}`, { method: 'DELETE' })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function setDefault() {
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
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
          <Button variant="ghost" size="sm" onClick={() => setAssistantOpen(true)}>
            <Sparkles size={14} /> Extract from references
          </Button>
          {!kit.isDefault && (
            <Button variant="ghost" size="sm" onClick={setDefault}>
              <Star size={14} /> Set default
            </Button>
          )}
          {editing ? (
            <>
              <Button size="sm" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setName(kit.name); setColors(kit.colors); setFonts(kit.fonts) }}>Cancel</Button>
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
        {editing ? (
          <FontEditor fonts={fonts} onChange={setFonts} />
        ) : fonts.length === 0 ? (
          <span className="text-sm text-light-text-muted dark:text-dark-text-muted">No fonts added</span>
        ) : (
          <ul className="space-y-1">
            {fonts.map(f => (
              <li key={f.name} className="text-sm text-light-text dark:text-dark-text flex items-center gap-2">
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
            <div className="flex gap-2">
              <input
                ref={templateImageRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleTemplateFromImage}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => templateImageRef.current?.click()}
                disabled={templateFromImageBusy}
                title="Upload an image; the AI turns it into an editable template"
              >
                {templateFromImageBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                From image
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAddingTemplate(v => !v)}>
                <Plus size={13} /> Add
              </Button>
            </div>
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
              <label className="text-sm font-medium text-light-text dark:text-dark-text">Size</label>
              <div className="flex gap-2">
                {ASPECT_VALUES.map(r => {
                  const selected = templateRatio === r
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setTemplateRatio(r)}
                      className={[
                        'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                        selected
                          ? 'bg-primary/10 dark:bg-primary-light/15 text-primary dark:text-primary-light border-primary/30 dark:border-primary-light/30'
                          : 'glass-input border-transparent text-light-text-muted dark:text-dark-text-muted',
                      ].join(' ')}
                    >
                      {ASPECT_LABELS[r]} <span className="opacity-70">· {dimensionsLabel(r)}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                The HTML should be sized for the chosen canvas. Briefs only offer this template at the matching size.
              </p>
            </div>
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
              <Button variant="ghost" size="sm" onClick={() => { setAddingTemplate(false); setTemplateName(''); setTemplateHtml(''); setTemplateRatio('SQUARE') }}>Cancel</Button>
            </div>
          </div>
        )}
        {kit.templates.length === 0 ? (
          <span className="text-sm text-light-text-muted dark:text-dark-text-muted">No templates linked</span>
        ) : (
          <ul className="space-y-2">
            {kit.templates.map(t => (
              <li key={t.id} className="flex items-center justify-between glass-input rounded-xl px-3 py-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-light-text dark:text-dark-text truncate">{t.name}</span>
                  <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[0.62rem] font-semibold bg-primary/10 dark:bg-primary-light/15 text-primary dark:text-primary-light">
                    {ASPECT_LABELS[t.aspectRatio]}
                  </span>
                </span>
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
              <input
                ref={artifactRef}
                type="file"
                accept="image/*,.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                className="hidden"
                onChange={handleArtifactUpload}
              />
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
                    aria-pressed={a.feedToAI}
                    aria-label={`Feed ${a.name} to AI`}
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

      <BrandKitAssistantPanel
        kitId={kit.id}
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onApplied={() => { setAssistantOpen(false); onRefresh() }}
      />
    </div>
  )
}
