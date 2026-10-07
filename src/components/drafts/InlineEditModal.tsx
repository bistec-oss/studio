'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/apiFetch'
import { stripEditingChrome, inlineEditBlockReason, type ElementEditKind } from '@/lib/drafts/inlineEdit'
import { asciiLower } from '@/lib/drafts/htmlLocator'
import { dimensionsFor } from '@/lib/aspectRatio'
import type { DraftDetail } from '@/lib/api-types'
import type { AspectRatio } from '@prisma/client'
import {
  buildElementEditBody,
  canEditElementStyle,
  canEditElementText,
  postElementEdit,
  relativeElementPath,
  resolveEditorPath,
  seedColorValue,
  snapshotElementLocator,
  type ElementNavDirection,
} from '@/components/drafts/inlineElementEdit'
import { ElementEditPanel, type ElementNotice, type ElementSelection } from '@/components/drafts/ElementEditPanel'

interface InlineEditModalProps {
  open: boolean
  onClose: () => void
  draftId: string
  // `html` and `baseRevisionNumber` must come from the SAME draft read
  // (htmlContent and currentRevisionNumber of one GET /api/drafts/[id]). They
  // are the FIRST PAINT only: on mount the modal re-reads the draft itself
  // (fix round 1), and nothing can be saved or applied until that read lands.
  // The caller's copy can be older than the stored draft (a reopen inside the
  // page's post-save refetch), and a whole-document save from it would revert
  // the save made just before. The caller mounts the modal per open.
  html: string
  baseRevisionNumber: number | null
  aspectRatio: AspectRatio
  onSaved: () => void
}

type EditMode = 'document' | 'element'

// The document in the iframe and the revision it is, from ONE read. `seq`
// remounts the iframe, so every load starts from a pristine parse of `html`.
interface LoadedDoc {
  html: string
  revisionNumber: number | null
  seq: number
}

const MODE_OPTIONS = [
  { value: 'document', label: 'Whole document' },
  { value: 'element', label: 'Single element' },
]

const STALE_MESSAGE =
  'The design changed after you selected this element: another tab, a refine or another edit got there first. The latest version is loaded. Select the element again.'
const SUPERSEDED_MESSAGE =
  'Your change was saved, but the design changed again straight after it (another tab or action). The latest version is loaded.'

// Parent-injected editing chrome (whole-document mode only). It is kept in one
// place so that stripEditingChrome (the pure string version) and this DOM
// wiring stay in sync on the marker names.
const EDITOR_STYLE = `
  [contenteditable="true"]{outline:2px dashed transparent;outline-offset:1px;transition:outline-color .15s;cursor:text}
  [contenteditable="true"]:hover{outline-color:rgba(37,99,235,.35)}
  [contenteditable="true"]:focus{outline-color:rgba(37,99,235,.9)}
  [data-inline-edit-chrome="img-wrap"]{position:relative;display:inline-block;cursor:default}
  [data-inline-edit-chrome="img-wrap"] .inline-replace-btn{
    position:absolute;top:6px;left:6px;z-index:2;font:600 12px system-ui;
    background:rgba(0,0,0,.6);color:#fff;border:0;border-radius:6px;padding:4px 8px;cursor:pointer}
`

// Single-element mode injects nothing into <body>: no contenteditable, no
// img-wrap, no button. The iframe DOM stays the browser's parse of the stored
// HTML, and the path and fingerprint describe exactly what the server resolves.
// The only addition is this cursor rule in <head>, which is outside every
// path. The highlight is drawn by the parent, over the iframe.
const SELECT_STYLE = '*{cursor:pointer !important}'

export function InlineEditModal({
  open,
  onClose,
  draftId,
  html,
  baseRevisionNumber,
  aspectRatio,
  onSaved,
}: InlineEditModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const confirm = useConfirm()
  const [saving, setSaving] = useState(false)
  const { width, height } = dimensionsFor(aspectRatio)

  const [mode, setMode] = useState<EditMode>('document')
  const [loaded, setLoaded] = useState<LoadedDoc>(() => ({ html, revisionNumber: baseRevisionNumber, seq: 0 }))
  // Unsaved whole-document typing. Switching mode reloads the saved design.
  const [dirty, setDirty] = useState(false)

  // Single-element mode.
  const [selection, setSelection] = useState<ElementSelection | null>(null)
  const [hoverEl, setHoverEl] = useState<Element | null>(null)
  const [inFlight, setInFlight] = useState<ElementEditKind | null>(null)
  // The request gate. State lags a render behind, so a double click could pass
  // a state check; the ref can't.
  const inFlightRef = useRef(false)
  const [fieldError, setFieldError] = useState<{ kind: ElementEditKind; message: string } | null>(null)
  const [notice, setNotice] = useState<ElementNotice | null>(null)
  // True from mount until the first own read of the draft lands (fix round 1).
  const [reloading, setReloading] = useState(true)
  // The first own read landed, so {html, pointer} are the stored draft's, not
  // the caller's possibly stale copy. Save and Apply stay disabled until then.
  const [synced, setSynced] = useState(false)
  const [syncFailed, setSyncFailed] = useState(false)
  // The iframe key whose document has been wired (parsed, with listeners and
  // chrome attached). Save, selection and Apply wait for it, so nothing ever
  // acts on a remounting frame's blank document.
  const [wiredKey, setWiredKey] = useState<string | null>(null)
  // Focus "Select the whole design" after a stale reload cleared the selection.
  const [focusStart, setFocusStart] = useState(false)
  const selectionSeq = useRef(0)
  // After a save, the same element is re-selected in the reloaded document,
  // but only if that document IS the revision the save produced.
  const pendingReselectRef = useRef<{
    path: number[]
    tag: string
    revisionNumber: number | null
    focusId: string
  } | null>(null)
  const wiredDocs = useRef(new WeakSet<Document>())
  // Documents whose paste/dirty listeners are already registered. Parent-side on
  // purpose: a marker attribute on <body> is saved into the stored HTML.
  const pasteWiredDocs = useRef(new WeakSet<Document>())

  // The true-size canvas is scaled down to fit the stage on BOTH axes (the old
  // width-only fit let tall ratios — PORTRAIT/STORY — overflow). Seed from the
  // viewport to avoid a first-paint jump, then refine against the measured stage.
  const [scale, setScale] = useState(() => {
    if (typeof window === 'undefined') return 0.5
    return Math.min(1, (window.innerWidth * 0.6) / width, (window.innerHeight * 0.66) / height)
  })

  useEffect(() => {
    if (!open) return
    const el = stageRef.current
    if (!el) return
    const compute = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0) setScale(Math.min(1, w / width, h / height))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, width, height, mode])

  // Whole-document mode. The iframe is wired once it has rendered the srcDoc.
  // No scripts run inside the sandbox (allow-same-origin only), so ALL wiring
  // happens from the parent. It is idempotent and safe to call more than once
  // (see the load event and the effect below): the style, contenteditable,
  // paste handler and img wrappers are each guarded, so a second call is a
  // no-op.
  const wireEditor = useCallback((doc: Document) => {
    if (!doc.body) return

    // Inject the editor stylesheet.
    if (!doc.getElementById('inline-edit-style')) {
      const style = doc.createElement('style')
      style.id = 'inline-edit-style'
      style.textContent = EDITOR_STYLE
      doc.head?.appendChild(style)
    }

    // Make every element that DIRECTLY contains visible text editable. The rule
    // is "has a non-empty direct text-node child" — NOT "all children are text".
    // That distinction is the fix for the reported bug: mixed-content elements
    // like `<p>Some <b>bold</b> text</p>` keep their plain-text runs ("Some ",
    // " text") as direct children of <p>, so the old all-children-are-text test
    // skipped <p> and those runs were uneditable. Since every visible text node
    // is a direct child of exactly one element, marking that element editable
    // guarantees ALL text on the page is editable.
    doc.body?.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (['SCRIPT', 'STYLE', 'IMG'].includes(el.tagName)) return
      const hasDirectText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
      )
      if (hasDirectText) el.setAttribute('contenteditable', 'true')
    })

    // Plain-text paste only. Registered once (a duplicate listener would insert
    // the pasted text twice) — guarded by a parent-side WeakSet of documents.
    if (!pasteWiredDocs.current.has(doc)) {
      pasteWiredDocs.current.add(doc)
      doc.body.addEventListener('paste', (e: ClipboardEvent) => {
        e.preventDefault()
        const text = e.clipboardData?.getData('text/plain') ?? ''
        doc.execCommand('insertText', false, text)
      })
      // Tracks unsaved typing, so a mode switch can warn before it discards it.
      doc.body.addEventListener('input', () => setDirty(true))
    }

    // Wrap each <img> with a "Replace photo" control. The wrapper is marked
    // contenteditable="false" so it stays a protected, non-editable island even
    // when its parent element is now editable (mixed-content parents above) —
    // the button and image can't be caret-edited or accidentally typed into.
    doc.body?.querySelectorAll('img').forEach((img) => {
      if (img.parentElement?.getAttribute('data-inline-edit-chrome') === 'img-wrap') return
      const wrap = doc.createElement('span')
      wrap.setAttribute('data-inline-edit-chrome', 'img-wrap')
      wrap.setAttribute('contenteditable', 'false')
      img.replaceWith(wrap)
      wrap.appendChild(img)
      const btn = doc.createElement('button')
      btn.type = 'button'
      btn.className = 'inline-replace-btn'
      btn.textContent = 'Replace photo'
      btn.setAttribute('data-inline-edit-chrome', 'img-btn')
      btn.addEventListener('click', () => {
        const input = doc.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.addEventListener('change', async () => {
          const file = input.files?.[0]
          if (!file) return
          try {
            const fd = new FormData()
            fd.append('file', file)
            const { url } = await apiFetch<{ url: string }>('/api/briefs/images', {
              method: 'POST',
              body: fd,
            })
            img.setAttribute('src', url)
            setDirty(true)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed')
          }
        })
        input.click()
      })
      wrap.appendChild(btn)
    })
  }, [])

  // Single-element mode: select `el`, snapshotting its locator NOW, against
  // the document it lives in and the revision that document was loaded at.
  // `focusId` is the panel control to focus once it is enabled (keyboard use).
  // It is null for a mouse selection, which must not pull focus off the canvas.
  const selectElement = useCallback(
    (el: Element, revisionNumber: number | null, focusId: string | null = null) => {
      const doc = el.ownerDocument
      if (!doc.body) return
      const locator = snapshotElementLocator(el, doc.body, revisionNumber)
      if (!locator) return // editor chrome, or outside <body>
      const cs = doc.defaultView?.getComputedStyle(el)
      const has = (dir: ElementNavDirection) => relativeElementPath(doc.body, locator.path, dir) !== null
      selectionSeq.current += 1
      setSelection({
        id: selectionSeq.current,
        el,
        locator,
        tag: asciiLower(el.tagName),
        canText: canEditElementText(el),
        canStyle: canEditElementStyle(el),
        nav: { parent: has('parent'), firstChild: has('firstChild'), previous: has('previous'), next: has('next') },
        initial: {
          text: locator.text,
          color: seedColorValue(cs?.color ?? '').text,
          background: seedColorValue(cs?.backgroundColor ?? '').text,
          fontSize: cs?.fontSize ?? '',
        },
        focusId,
      })
      setFieldError(null)
      setFocusStart(false)
      // A fresh selection supersedes a stale, superseded or unsupported
      // notice. A busy one stays until "Check again" clears it.
      setNotice((prev) => (prev?.kind === 'busy' ? prev : null))
    },
    [],
  )

  const wireSelector = useCallback(
    (doc: Document, revisionNumber: number | null) => {
      if (!doc.body || wiredDocs.current.has(doc)) return
      wiredDocs.current.add(doc)

      const style = doc.createElement('style')
      style.id = 'inline-edit-select-style'
      style.textContent = SELECT_STYLE
      doc.head?.appendChild(style)

      const elementTarget = (e: Event): Element | null => {
        const t = e.target as Node | null
        return t && t.nodeType === 1 ? (t as Element) : null
      }
      // Capture phase, default prevented: a click on a link or button in the
      // design selects it, and never follows or activates it.
      doc.addEventListener(
        'click',
        (e) => {
          e.preventDefault()
          e.stopPropagation()
          if (inFlightRef.current) return
          const t = elementTarget(e)
          if (t) selectElement(t, revisionNumber)
        },
        true,
      )
      doc.addEventListener('mousemove', (e) => {
        const t = elementTarget(e)
        setHoverEl((prev) => (prev === t ? prev : t))
      })
      doc.documentElement.addEventListener('mouseleave', () => setHoverEl(null))

      const pending = pendingReselectRef.current
      if (pending && pending.revisionNumber === revisionNumber) {
        pendingReselectRef.current = null
        const again = resolveEditorPath(doc.body, pending.path) as Element | null
        if (again && asciiLower(again.tagName) === pending.tag) {
          selectElement(again, revisionNumber, pending.focusId)
        }
      }
    },
    [selectElement],
  )

  const frameKey = `${mode}-${loaded.seq}`
  const wire = useCallback(
    (doc: Document) => {
      if (mode === 'element') wireSelector(doc, loaded.revisionNumber)
      else wireEditor(doc)
      setWiredKey(`${mode}-${loaded.seq}`)
    },
    [mode, loaded, wireEditor, wireSelector],
  )

  const onIframeLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (doc) wire(doc)
  }, [wire])

  // Backup wiring — do NOT rely on the iframe `load` event alone. For a srcDoc
  // iframe the load event can fire before React attaches onLoad (so it never
  // runs), AND the frame first exposes a blank about:blank document that is
  // already "complete" before the srcDoc content parses in. Either one leaves
  // the editor un-wired — the intermittent "nothing is editable" bug. So poll
  // until the frame's document actually holds the rendered content (body has
  // children), then wire it directly. Both wirings are idempotent, so onLoad
  // firing too is harmless.
  useEffect(() => {
    if (!open) return
    let raf = 0
    let tries = 0
    const attempt = () => {
      const doc = iframeRef.current?.contentDocument
      const hasContent =
        doc && doc.body && doc.readyState !== 'loading' && doc.body.children.length > 0
      if (hasContent) {
        wire(doc)
        return
      }
      if (tries++ < 600) raf = requestAnimationFrame(attempt) // ~10s safety cap
    }
    attempt()
    return () => cancelAnimationFrame(raf)
  }, [open, loaded, wire])

  // Re-read the draft, then load its htmlContent and currentRevisionNumber
  // TOGETHER. Both come from one response, so the next locator is always
  // computed against the revision it names.
  //
  // It FAILS CLOSED (fix round 2). Every caller re-reads because the document
  // on the canvas may no longer be the stored one: after a save, after a stale
  // reply, on "Check again", on the switch into whole-document mode. So a
  // failed read clears `synced`, and every write (Save, Apply, selection)
  // stays blocked behind the "Try again" overlay until a read succeeds. The
  // old document is never left writable, and a whole-document save from it
  // would silently revert what was just committed.
  const reloadFromServer = useCallback(async (): Promise<Omit<LoadedDoc, 'seq'> | null> => {
    setReloading(true)
    const failClosed = () => {
      setSynced(false)
      setSyncFailed(true)
      return null
    }
    try {
      const d = await apiFetch<DraftDetail>(`/api/drafts/${draftId}`)
      if (!d.htmlContent) {
        toast.error('This draft has no design to edit')
        return failClosed()
      }
      const next = { html: d.htmlContent, revisionNumber: d.currentRevisionNumber }
      setSelection(null)
      setHoverEl(null)
      setLoaded((prev) => ({ ...next, seq: prev.seq + 1 }))
      const blocked = inlineEditBlockReason(d.status, d.pendingAction)
      setNotice((prev) =>
        blocked ? { kind: 'busy', message: blocked } : prev?.kind === 'busy' ? null : prev,
      )
      setSynced(true)
      setSyncFailed(false)
      return next
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not reload the draft')
      return failClosed()
    } finally {
      setReloading(false)
    }
  }, [draftId])

  // The first own read (fix round 1; see the props comment), and "Try again".
  // Until a read lands, the stage is covered and Save and Apply are disabled.
  // A failed read keeps them disabled (reloadFromServer fails closed) and offers
  // a retry. It never falls back to the caller's copy.
  const syncWithServer = useCallback(async () => {
    setSyncFailed(false)
    await reloadFromServer()
  }, [reloadFromServer])

  const syncStarted = useRef(false)
  useEffect(() => {
    if (syncStarted.current) return
    syncStarted.current = true
    void syncWithServer()
  }, [syncWithServer])

  // One element edit: one request, never two at once.
  async function applyElementEdit(kind: ElementEditKind, value: string) {
    if (inFlightRef.current || !selection || notice?.kind === 'busy') return
    inFlightRef.current = true
    setInFlight(kind)
    setFieldError(null)
    try {
      const out = await postElementEdit(draftId, buildElementEditBody(selection.locator, kind, value))
      switch (out.kind) {
        case 'saved': {
          setNotice(null)
          toast.success('Saved a new revision')
          onSaved()
          pendingReselectRef.current = {
            path: selection.locator.path,
            tag: selection.tag,
            revisionNumber: out.revisionNumber,
            focusId: `apply-${kind}`,
          }
          const reloaded = await reloadFromServer()
          if (reloaded && reloaded.revisionNumber !== out.revisionNumber) {
            pendingReselectRef.current = null
            setNotice({ kind: 'stale', message: SUPERSEDED_MESSAGE })
          }
          break
        }
        case 'stale':
          setNotice({ kind: 'stale', message: STALE_MESSAGE })
          setFocusStart(true)
          await reloadFromServer()
          break
        case 'busy':
          setNotice({ kind: 'busy', message: out.message })
          break
        case 'unsupported':
          setNotice({ kind: 'unsupported', message: out.message })
          break
        case 'invalid':
          setFieldError({ kind, message: out.message })
          break
        case 'not-found':
          toast.error('Draft not found')
          onClose()
          break
        case 'team-choice-required':
          window.location.href = '/choose-team'
          break
        case 'error':
          toast.error(out.message)
          break
      }
    } finally {
      inFlightRef.current = false
      setInFlight(null)
    }
  }

  // Keyboard navigation moves one step through the same tree the locator
  // uses, so it never reaches editor chrome. The target is selected like a
  // click.
  function navigate(dir: ElementNavDirection) {
    if (!selection || inFlightRef.current) return
    const body = selection.el.ownerDocument.body
    const next = relativeElementPath(body, selection.locator.path, dir)
    const el = next && (resolveEditorPath(body, next) as Element | null)
    if (el) selectElement(el, selection.locator.baseRevisionNumber, `nav-${dir}`)
  }

  function selectBody() {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body || inFlightRef.current || !synced || wiredKey !== frameKey) return
    selectElement(doc.body, loaded.revisionNumber, 'heading')
  }

  async function switchMode(next: string) {
    const target = next as EditMode
    if (target === mode || inFlightRef.current || saving) return
    if (mode === 'document' && dirty) {
      const ok = await confirm({
        title: 'Discard unsaved edits?',
        description:
          'Single-element mode starts from the saved design, so the text changes you have not saved yet will be lost.',
        confirmLabel: 'Discard edits',
      })
      if (!ok) return
    }
    setDirty(false)
    setSelection(null)
    setHoverEl(null)
    setFieldError(null)
    setNotice(null)
    setMode(target)
    // Whole-document mode serializes the canvas as the new revision, with no
    // base revision to check it against. So it always starts from a fresh
    // {html, pointer} read (fix round 2), through the same gated path: Save
    // stays disabled until the read lands, and blocked if it fails.
    if (target === 'document') await reloadFromServer()
  }

  async function handleSave() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    setSaving(true)
    try {
      // Serialize the live doc, then strip the editor chrome with the shared
      // pure helper so the saved HTML is a normal snapshot.
      const raw = '<!doctype html>' + doc.documentElement.outerHTML
      const cleaned = stripEditingChrome(raw)
      await apiFetch(`/api/drafts/${draftId}/inline-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: cleaned }),
      })
      toast.success('Saved a new revision')
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // The highlight boxes, in stage pixels. The iframe is scaled from its top-left
  // corner, so an element's box inside it maps by `scale` alone.
  const boxFor = (el: Element | null) => {
    if (!el || !el.isConnected) return null
    const r = el.getBoundingClientRect()
    return { left: r.left * scale, top: r.top * scale, width: r.width * scale, height: r.height * scale }
  }
  const elementMode = mode === 'element'
  const selectedBox = elementMode ? boxFor(selection?.el ?? null) : null
  const hoverBox = elementMode && hoverEl !== selection?.el ? boxFor(hoverEl) : null
  // Everything that acts on the document waits for the first own read, and for
  // the current frame to be wired.
  const editorReady = synced && !reloading && wiredKey === frameKey
  const editorDisabled = inFlight !== null || !editorReady || notice?.kind === 'busy'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit inline"
      size="2xl"
      footer={
        elementMode ? (
          <Button size="sm" onClick={onClose} disabled={inFlight !== null}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !editorReady}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save &amp; re-export
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted max-w-2xl">
            {elementMode ? (
              <>
                Click an element to select it, then change its text, colour or size. Each change
                saves straight away as a new revision.
              </>
            ) : (
              <>
                Click any text to edit it in place, or hover an image and choose{' '}
                <strong className="font-semibold text-light-text dark:text-dark-text">Replace photo</strong>{' '}
                to swap it. Changes save as a new revision.
              </>
            )}
          </p>
          <SegmentedToggle options={MODE_OPTIONS} value={mode} onChange={switchMode} />
        </div>
        <div className={elementMode ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]' : undefined}>
          {/* Neutral stage: the canvas is centered and fit to this box on both
              axes, so square, portrait and story ratios are all as large as they
              can be without overflowing. */}
          <div
            ref={stageRef}
            className="flex items-center justify-center overflow-hidden rounded-xl bg-black/[0.04] dark:bg-white/[0.04] ring-1 ring-inset ring-light-border dark:ring-dark-border p-4"
            style={{ height: 'min(74vh, 820px)' }}
          >
            <div
              className="relative overflow-hidden rounded-lg bg-white shadow-xl"
              style={{ width: width * scale, height: height * scale }}
              data-editor-ready={editorReady ? 'true' : 'false'}
            >
              <iframe
                key={frameKey}
                ref={iframeRef}
                onLoad={onIframeLoad}
                title="Inline editor"
                sandbox="allow-same-origin"
                srcDoc={loaded.html}
                style={{
                  width,
                  height,
                  border: 0,
                  transformOrigin: 'top left',
                  transform: `scale(${scale})`,
                }}
              />
              {hoverBox && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute rounded-sm border border-dashed border-primary/70 dark:border-primary-light/70"
                  style={hoverBox}
                />
              )}
              {selectedBox && (
                <div
                  aria-hidden
                  data-testid="element-highlight"
                  className="pointer-events-none absolute rounded-sm ring-2 ring-primary dark:ring-primary-light bg-primary/10 dark:bg-primary-light/10"
                  style={selectedBox}
                />
              )}
              {/* It covers the canvas, and takes its clicks and typing, until
                  the document on it is the stored one and is wired. */}
              {(!editorReady || syncFailed) && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/60 dark:bg-black/50"
                  role="status"
                  aria-live="polite"
                >
                  {syncFailed ? (
                    <>
                      <p className="text-sm font-medium text-light-text dark:text-dark-text">
                        Couldn&apos;t load the latest version of this design.
                      </p>
                      <Button variant="secondary" size="sm" onClick={() => void syncWithServer()}>
                        Try again
                      </Button>
                    </>
                  ) : (
                    <>
                      <Loader2 size={20} className="animate-spin text-primary dark:text-primary-light" aria-hidden />
                      <span className="sr-only">Loading the latest version</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          {elementMode && (
            <div className="flex flex-col" style={{ maxHeight: 'min(74vh, 820px)' }}>
              <ElementEditPanel
                selection={selection}
                disabled={editorDisabled}
                inFlight={inFlight}
                fieldError={fieldError}
                notice={notice}
                focusStart={focusStart}
                onApply={applyElementEdit}
                onSelectBody={selectBody}
                onNavigate={navigate}
                onClearSelection={() => {
                  setSelection(null)
                  setFieldError(null)
                }}
                onCheckAgain={() => {
                  if (!inFlightRef.current) void reloadFromServer()
                }}
                onUseWholeDocument={() => void switchMode('document')}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
