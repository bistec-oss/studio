'use client'

import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Star, Upload, ToggleLeft, ToggleRight, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Notice } from '@/components/ui/Notice'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { SectionHead } from '@/components/ui/SectionHead'
import { COMPACT_FIELD, EYEBROW, FOCUS, ICON, ICON_BUTTON, PILL_BADGE, TAG } from '@/components/ui/atoms'
import { apiFetch } from '@/lib/apiFetch'
import type { AspectRatio } from '@prisma/client'
import { ASPECT_LABELS, ASPECT_VALUES, dimensionsLabel } from '@/lib/aspectRatio'
import type { AdminBrandKitDetail } from '@/lib/api-types'
import { ColorEditor } from './ColorEditor'
import { FontEditor } from './FontEditor'
import { ScriptFontPicker } from './ScriptFontPicker'
import { PromptSection } from './PromptSection'
import { ColorSwatch } from './shared'
import { BrandKitAssistantPanel } from './BrandKitAssistantPanel'
import { CODE_FIELD, TITLE_FIELD, optionCls } from './classes'

// A kit section: a bezel card (021 design.md §8), its head the study's .card-hd.
const SECTION = 'surface-bezel min-w-0 p-5'

// A recessed well inside a card (the template form): canvas with a hairline.
const WELL = 'rounded-ui-lg bg-canvas p-4 ring-1 ring-inset ring-line-subtle'

// A list inside a card: rows ruled apart on --line-subtle.
const RULED_LIST = 'divide-y divide-line-subtle'

// The feed-to-AI switch: ICON_BUTTON's shape (the round --control-sm target,
// §6) with its colour left to the caller (--accent when on), since `cn` would
// not settle two text colours.
const TOGGLE_BUTTON =
  'inline-flex h-control-sm w-control-sm flex-shrink-0 items-center justify-center rounded-ui-pill transition-colors duration-fast ease-standard'

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
  const [sinhalaFont, setSinhalaFont] = useState<string | null>(kit.scriptFonts?.sinhala ?? null)
  const [saving, setSaving] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateHtml, setTemplateHtml] = useState('')
  const templateHtmlId = React.useId()
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
    setSinhalaFont(kit.scriptFonts?.sinhala ?? null)
  }, [kit])

  async function saveEdit() {
    setSaving(true)
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, colors, fonts, scriptFonts: sinhalaFont ? { sinhala: sinhalaFont } : null }),
      })
      setEditing(false)
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setSaving(false) }
  }

  async function handleAddLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', 'LOGO')
      fd.append('name', file.name.replace(/\.[^.]+$/, '')) // filename as default label
      fd.append('feedToAI', 'true')
      await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts`, { method: 'POST', body: fd })
      onRefresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  async function setPrimaryLogo(url: string) {
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: url }),
      })
      onRefresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  async function renameLogo(artifactId: string, name: string) {
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts/${artifactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      onRefresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  async function deleteLogo(id: string) {
    if (!(await confirm({ title: 'Delete this logo?', confirmLabel: 'Delete' }))) return
    try {
      await apiFetch(`/api/admin/brandkits/${kit.id}/artifacts/${id}`, { method: 'DELETE' })
      onRefresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    }
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
    // The open kit: its head, then each section on its own bezel card (021
    // design.md §8). A region named by the kit, so the open kit is a landmark
    // (and stays one while its name is being edited).
    <section aria-label={kit.name} className="min-w-0 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pb-4">
        <div className="min-w-0 flex-1 basis-60">
          {editing ? (
            <input
              aria-label="Kit name"
              value={name}
              onChange={e => setName(e.target.value)}
              className={TITLE_FIELD}
            />
          ) : (
            <h2 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ui-xl font-semibold leading-snug tracking-tight">
              <span className="min-w-0 max-w-full break-words">{kit.name}</span>
              {kit.isDefault && <span className={`${PILL_BADGE} tracking-normal`}>System default</span>}
            </h2>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAssistantOpen(true)}>
            <Sparkles {...ICON} /> Extract from references
          </Button>
          {!kit.isDefault && (
            <Button variant="ghost" size="sm" onClick={setDefault}>
              <Star {...ICON} /> Set default
            </Button>
          )}
          {editing ? (
            <>
              <Button size="sm" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setName(kit.name); setColors(kit.colors); setFonts(kit.fonts); setSinhalaFont(kit.scriptFonts?.sinhala ?? null) }}>Cancel</Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil {...ICON} /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3.5">
        {/* Colors — each swatch shows the kit's own colour (data, not tokens). */}
        <section className={SECTION}>
          <SectionHead level={3} card title="Color palette" className="mb-3" />
          {editing ? (
            <ColorEditor colors={colors} onChange={setColors} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {kit.colors.length === 0 ? (
                <span className="text-ui-sm text-fg-muted">No colors defined</span>
              ) : kit.colors.map(c => (
                <div key={c} className="flex items-center gap-1.5 rounded-ui-pill bg-canvas py-1 pl-1 pr-2.5 ring-1 ring-inset ring-line-subtle">
                  <ColorSwatch color={c} />
                  <span className="font-mono text-ui-xs text-fg">{c}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Logos — a contact sheet (§8.13's vocabulary): each logo is shown as
            uploaded, on raised paper in a hairline ring; the primary one takes
            the 1.5 px ink ring of a selected version. */}
        <section className={SECTION}>
          <SectionHead level={3} card title="Logos" className="mb-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAddLogo}
            />
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
              <Plus {...ICON} /> Add logo
            </Button>
          </SectionHead>
          {kit.artifacts.filter((a) => a.type === 'LOGO').length === 0 ? (
            <span className="text-ui-sm text-fg-muted">No logos yet.</span>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
              {kit.artifacts
                .filter((a) => a.type === 'LOGO')
                .map((logo) => {
                  const isPrimary = logo.url === kit.logoUrl
                  return (
                    <li key={logo.id} className="flex min-w-0 flex-col gap-2">
                      <div
                        className={`relative flex h-20 items-center justify-center rounded-ui-md bg-surface-raised p-2 ${
                          isPrimary ? 'shadow-panel ring-[1.5px] ring-inset ring-fg' : 'ring-1 ring-inset ring-line-subtle'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logo.url}
                          alt={logo.name}
                          className="max-h-14 max-w-full object-contain"
                        />
                      </div>
                      <input
                        defaultValue={logo.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v && v !== logo.name) renameLogo(logo.id, v)
                        }}
                        aria-label="Logo label"
                        className={`${COMPACT_FIELD} w-full min-w-0`}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => !isPrimary && setPrimaryLogo(logo.url)}
                          aria-pressed={isPrimary}
                          title={isPrimary ? 'Primary logo' : 'Set as primary'}
                          className={`inline-flex min-w-0 items-center gap-1 rounded-ui-sm text-ui-xs transition-colors duration-fast ease-standard ${FOCUS} ${
                            isPrimary ? 'font-semibold text-accent' : 'text-fg-muted hover:text-fg'
                          }`}
                        >
                          <Star {...ICON} className={`flex-shrink-0 ${isPrimary ? 'fill-current' : ''}`} />
                          {isPrimary ? 'Primary' : 'Set primary'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteLogo(logo.id)}
                          aria-label={`Delete logo ${logo.name}`}
                          title="Delete"
                          className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                        >
                          <Trash2 {...ICON} />
                        </button>
                      </div>
                    </li>
                  )
                })}
            </ul>
          )}
        </section>

        {/* Fonts */}
        <section className={SECTION}>
          <SectionHead level={3} card title="Fonts" className="mb-3" />
          {editing ? (
            <div className="space-y-4">
              <FontEditor fonts={fonts} onChange={setFonts} />
              <ScriptFontPicker value={sinhalaFont} onChange={setSinhalaFont} />
            </div>
          ) : fonts.length === 0 && !kit.scriptFonts?.sinhala ? (
            <span className="text-ui-sm text-fg-muted">No fonts added</span>
          ) : (
            <ul className={RULED_LIST}>
              {fonts.map((f, i) => (
                <li key={f.name} className="flex flex-wrap items-center gap-2 break-words py-2 text-ui-sm text-fg">
                  <span>{f.name}</span>
                  {i < 2 && <span className={TAG}>{i === 0 ? 'Heading' : 'Body'}</span>}
                </li>
              ))}
              {kit.scriptFonts?.sinhala && (
                <li className="flex flex-wrap items-center gap-2 break-words py-2 text-ui-sm text-fg">
                  <span>{kit.scriptFonts.sinhala}</span>
                  <span className={TAG}>Sinhala</span>
                </li>
              )}
            </ul>
          )}
          {kit.typographyFindings && kit.typographyFindings.length > 0 && (
            <Notice tone="warning" role="status" className="mt-3 space-y-1">
              {kit.typographyFindings.map((f) => (
                <p key={f.code + f.detail}>{f.detail}</p>
              ))}
            </Notice>
          )}
          {kit.fontCatalogueDate && (
            <p className="mt-3 text-ui-xs text-fg-muted">Font list from {kit.fontCatalogueDate}</p>
          )}
        </section>

        {/* Templates */}
        <section className={SECTION}>
          <SectionHead level={3} card title="HTML templates" className="mb-3">
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
              {templateFromImageBusy ? <Loader2 {...ICON} className="animate-spin" /> : <Sparkles {...ICON} />}
              From image
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAddingTemplate(v => !v)}>
              <Plus {...ICON} /> Add
            </Button>
          </SectionHead>
          {addingTemplate && (
            <div className={`${WELL} mb-4 animate-fade-in space-y-4`}>
              <Input
                label="Template name"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="e.g. Event Announcement"
              />
              <div className="flex flex-col gap-1.5">
                <FieldLabel as="span">Size</FieldLabel>
                <div role="group" aria-label="Size" className="flex flex-wrap gap-2">
                  {ASPECT_VALUES.map(r => {
                    const selected = templateRatio === r
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setTemplateRatio(r)}
                        className={optionCls(selected, 'px-3 py-1.5 text-ui-sm font-medium')}
                      >
                        {ASPECT_LABELS[r]} <span className="text-fg-muted">· {dimensionsLabel(r)}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-ui-xs text-fg-muted">
                  The HTML should be sized for the chosen canvas. Posts only offer this template at the matching size.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor={templateHtmlId}>HTML/CSS</FieldLabel>
                <textarea
                  id={templateHtmlId}
                  value={templateHtml}
                  onChange={e => setTemplateHtml(e.target.value)}
                  rows={6}
                  placeholder="<!DOCTYPE html>…"
                  className={`${CODE_FIELD} resize-y`}
                />
              </div>
              {/* An inline-form submit: Ink, so the kit's Save stays the view's
                  one accent primary (§8.2, 014 FR-08). */}
              <div className="flex flex-wrap gap-2">
                <Button variant="ink" size="sm" onClick={addTemplate} disabled={!templateName.trim() || !templateHtml.trim()}>Save template</Button>
                <Button variant="ghost" size="sm" onClick={() => { setAddingTemplate(false); setTemplateName(''); setTemplateHtml(''); setTemplateRatio('SQUARE') }}>Cancel</Button>
              </div>
            </div>
          )}
          {kit.templates.length === 0 ? (
            <span className="text-ui-sm text-fg-muted">No templates linked</span>
          ) : (
            <ul className={RULED_LIST}>
              {kit.templates.map(t => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-ui-sm text-fg" title={t.name}>{t.name}</span>
                    <span className={`${TAG} flex-shrink-0`}>{ASPECT_LABELS[t.aspectRatio]}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(t.id)}
                    aria-label={`Delete template ${t.name}`}
                    title="Delete"
                    className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                  >
                    <Trash2 {...ICON} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Brand Voice Prompt */}
        <section className={SECTION}>
          <SectionHead level={3} card title="Brand voice prompt" className="mb-3" />
          <PromptSection kitId={kit.id} prompts={kit.prompts} onRefresh={onRefresh} />
        </section>

        {/* Artifacts */}
        <section className={SECTION}>
          <SectionHead level={3} card title="Artifacts" className="mb-3">
            <input
              ref={artifactRef}
              type="file"
              accept="image/*,.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              className="hidden"
              onChange={handleArtifactUpload}
            />
            <Button variant="ghost" size="sm" onClick={() => artifactRef.current?.click()}>
              <Upload {...ICON} /> Upload
            </Button>
          </SectionHead>
          {kit.artifacts.length === 0 ? (
            <span className="text-ui-sm text-fg-muted">No artifacts uploaded</span>
          ) : (
            <ul className={RULED_LIST}>
              {kit.artifacts.map(a => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="min-w-0">
                    <span className="break-words text-ui-sm text-fg">{a.name}</span>
                    {/* The artifact type, a micro-label (021 FR-07). */}
                    <span className={`ml-2 ${EYEBROW}`}>{a.type}</span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleFeedToAI(a.id, a.feedToAI)}
                      aria-pressed={a.feedToAI}
                      aria-label={`Feed ${a.name} to AI`}
                      title={a.feedToAI ? 'Fed to AI — click to disable' : 'Not fed to AI — click to enable'}
                      className={`${TOGGLE_BUTTON} ${FOCUS} ${a.feedToAI ? 'text-accent' : 'text-fg-muted hover:text-fg'}`}
                    >
                      {a.feedToAI ? <ToggleRight size={18} strokeWidth={1.6} /> : <ToggleLeft size={18} strokeWidth={1.6} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteArtifact(a.id)}
                      aria-label={`Delete artifact ${a.name}`}
                      title="Delete"
                      className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                    >
                      <Trash2 {...ICON} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <BrandKitAssistantPanel
        kitId={kit.id}
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onApplied={() => { setAssistantOpen(false); onRefresh() }}
      />
    </section>
  )
}
