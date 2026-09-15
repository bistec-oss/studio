'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { apiFetch } from '@/lib/apiFetch'
import {
  stripEditingChrome,
  ELEMENT_EDITABLE_TAGS,
  ELEMENT_SIZE_UNITS,
} from '@/lib/drafts/inlineEdit'
import { dimensionsFor } from '@/lib/aspectRatio'
import type { AspectRatio } from '@prisma/client'

interface InlineEditModalProps {
  open: boolean
  onClose: () => void
  draftId: string
  html: string
  aspectRatio: AspectRatio
  onSaved: () => void
}

// Parent-injected editing chrome. Kept in one place so stripEditingChrome (the
// pure string version) and this DOM wiring stay in sync on the marker names.
const EDITOR_STYLE = `
  [contenteditable="true"]{outline:2px dashed transparent;outline-offset:1px;transition:outline-color .15s;cursor:text}
  [contenteditable="true"]:hover{outline-color:rgba(37,99,235,.35)}
  [contenteditable="true"]:focus{outline-color:rgba(37,99,235,.9)}
  [data-inline-edit-chrome="img-wrap"]{position:relative;display:inline-block;cursor:default}
  [data-inline-edit-chrome="img-wrap"] .inline-replace-btn{
    position:absolute;top:6px;left:6px;z-index:2;font:600 12px system-ui;
    background:rgba(0,0,0,.6);color:#fff;border:0;border-radius:6px;padding:4px 8px;cursor:pointer}
`

// ---------------------------------------------------------------------------
// Element mode (FR-15…FR-19) — a SECOND, NARROWER mode beside the whole-document
// editor above, not a replacement for it and not a hardening of it. `EDITOR_STYLE`,
// `wireEditor` and `handleSave` are the existing surface and are unchanged;
// element mode never serializes the iframe, never calls `stripEditingChrome`,
// and never sends a document. It sends one tag, the text the user saw in that
// node, a kind and a value — and the SERVER re-resolves the node against its own
// current HTML. Nothing here names a position, because the request type has no
// field that could carry one (AC-26).
// ---------------------------------------------------------------------------

const PICKER_STYLE = `
  [data-inline-edit-pick]{cursor:pointer}
  [data-inline-edit-pick="one"]{outline:2px dashed rgba(37,99,235,.4);outline-offset:2px;transition:outline-color .15s}
  [data-inline-edit-pick="one"]:hover{outline:2px solid rgba(37,99,235,.9)}
  [data-inline-edit-pick="many"]{outline:2px dotted rgba(217,119,6,.55);outline-offset:2px;cursor:not-allowed}
  [data-inline-edit-picked="1"]{outline:3px solid rgba(37,99,235,1) !important;outline-offset:3px}
`

// The server compares a whitespace-collapsed address (`normalizeAddressText` in
// `src/lib/drafts/inlineEdit.ts`), because the DOM the user read had already
// collapsed it. Collapse identically here or the counts below would disagree
// with the server's.
const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim()

// Mirrors `MAX_ADDRESS_TEXT` in the server module. A node past it is refused
// there with a 400, which in this UI is the "fix your value" surface — the wrong
// story for a node that simply cannot be addressed, so it is not offered at all.
const MAX_ADDRESS_TEXT = 4000

type ElementKind = 'text' | 'color' | 'fontSize'

interface ElementSelection {
  readonly tag: string
  readonly text: string
}

/**
 * Is this element addressable by the SERVER's resolver?
 *
 * Three conditions, each one a restatement of a server-side rule rather than a
 * UI preference:
 *
 *  1. The tag is in `ELEMENT_EDITABLE_TAGS` — the same exported closed list the
 *     server validates against, imported rather than copied so the two cannot
 *     drift.
 *  2. It is a TEXT LEAF. The server's match pattern uses `[^<]*` for the
 *     content, so an element holding ANY child element can never resolve. The
 *     DOM equivalent is `children.length === 0` — note this is child *elements*,
 *     not child nodes, which is exactly the distinction `[^<]*` draws. This is
 *     why "click any node" is not on offer: it is a promise the server cannot
 *     keep, so the client must not make it.
 *  3. It has non-empty, in-bounds text — an empty address is refused server-side.
 */
function isAddressableLeaf(el: Element): boolean {
  if (!(ELEMENT_EDITABLE_TAGS as readonly string[]).includes(el.tagName.toLowerCase())) return false
  if (el.children.length > 0) return false
  const text = normalizeText(el.textContent ?? '')
  return text !== '' && text.length <= MAX_ADDRESS_TEXT
}

// POSTed with `fetch`, not `apiFetch`, ON PURPOSE: `apiFetch` collapses a failed
// response into `new Error(body.error)` and drops the status, and the status is
// exactly what distinguishes "your value is wrong, retype it" (400, the panel
// stays open) from "this address is dead, start again" (409, the selection is
// discarded). The two need different UI, so the status has to survive.
async function postElementEdit(
  draftId: string,
  element: { tag: string; text: string; kind: ElementKind; value: string },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const res = await fetch(`/api/drafts/${draftId}/inline-edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ element }),
  })
  if (res.ok) return { ok: true }
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return { ok: false, status: res.status, error: body.error ?? 'Save failed' }
}

export function InlineEditModal({
  open,
  onClose,
  draftId,
  html,
  aspectRatio,
  onSaved,
}: InlineEditModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const { width, height } = dimensionsFor(aspectRatio)

  // 'document' is the pre-existing whole-page editor and stays the default, so
  // opening the modal behaves exactly as it did before this change.
  const [mode, setMode] = useState<'document' | 'element'>('document')
  const [selection, setSelection] = useState<ElementSelection | null>(null)
  const [kind, setKind] = useState<ElementKind>('text')
  const [textValue, setTextValue] = useState('')
  const [colorValue, setColorValue] = useState('')
  const [sizeAmount, setSizeAmount] = useState('')
  const [sizeUnit, setSizeUnit] = useState<(typeof ELEMENT_SIZE_UNITS)[number]>('px')
  // Two separate error channels, because the user's next action differs: a
  // `valueError` sits under the input and is fixed by retyping; an `addressError`
  // means the node itself is gone and replaces the whole panel.
  const [valueError, setValueError] = useState<string | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)

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
  }, [open, width, height])

  // Wire the iframe once it has rendered the srcDoc. No scripts run inside the
  // sandbox (allow-same-origin only), so ALL wiring happens from the parent.
  // Idempotent — safe to call more than once (see the load event + effect
  // below): the style, contenteditable, paste handler and img wrappers are each
  // guarded so a second call is a no-op.
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
    // the pasted text twice) — guarded by a marker on <body>.
    if (!doc.body.dataset.inlineEditPasteWired) {
      doc.body.dataset.inlineEditPasteWired = '1'
      doc.body.addEventListener('paste', (e: ClipboardEvent) => {
        e.preventDefault()
        const text = e.clipboardData?.getData('text/plain') ?? ''
        doc.execCommand('insertText', false, text)
      })
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
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed')
          }
        })
        input.click()
      })
      wrap.appendChild(btn)
    })
  }, [])

  // Element-mode wiring. Same mechanism the whole-document editor already uses
  // and for the same reason: the iframe is `sandbox="allow-same-origin"` with NO
  // `allow-scripts`, so nothing inside the frame can run — every listener is a
  // PARENT-realm function attached to the frame's same-origin document from out
  // here. That is precisely how the existing `paste` listener and the
  // "Replace photo" button handler above already work, so this adds no new
  // capability to the sandbox and weakens nothing.
  //
  // Idempotent (the poll below can call it repeatedly): the marker attributes
  // are simply rewritten, and the delegated listener is guarded by a flag on
  // <body>.
  const wireElementMode = useCallback((doc: Document) => {
    if (!doc.body) return

    if (!doc.getElementById('inline-edit-style')) {
      const style = doc.createElement('style')
      style.id = 'inline-edit-style'
      style.textContent = PICKER_STYLE
      doc.head?.appendChild(style)
    }

    // Count identical (tag, text) pairs first. Two nodes with the same visible
    // text are indistinguishable to a content address by construction — the
    // server rejects that pair as ambiguous — so they are marked "many" and are
    // not offered. Refusing at SELECTION time is what makes ambiguity legible:
    // the user learns it about that node, before typing a replacement.
    const leaves = Array.from(doc.body.querySelectorAll('*')).filter(isAddressableLeaf)
    const counts = new Map<string, number>()
    for (const el of leaves) {
      const key = JSON.stringify([el.tagName.toLowerCase(), normalizeText(el.textContent ?? '')])
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const el of leaves) {
      const key = JSON.stringify([el.tagName.toLowerCase(), normalizeText(el.textContent ?? '')])
      el.setAttribute('data-inline-edit-pick', (counts.get(key) ?? 0) > 1 ? 'many' : 'one')
    }

    if (doc.body.dataset.inlineEditPickWired) return
    doc.body.dataset.inlineEditPickWired = '1'
    doc.addEventListener('click', (e: MouseEvent) => {
      // Anchors and form controls would otherwise act on the click; the sandbox
      // blocks navigation anyway, but picking a node should never also do
      // something else.
      e.preventDefault()
      const target = e.target as Element | null
      const el = target?.closest?.('[data-inline-edit-pick]') ?? null
      if (!el) return
      if (el.getAttribute('data-inline-edit-pick') === 'many') {
        toast.error(
          'Two elements share that exact text, so it cannot be identified uniquely — use Whole design to edit it.',
        )
        return
      }
      doc
        .querySelectorAll('[data-inline-edit-picked]')
        .forEach((p) => p.removeAttribute('data-inline-edit-picked'))
      el.setAttribute('data-inline-edit-picked', '1')
      const text = normalizeText(el.textContent ?? '')
      setSelection({ tag: el.tagName.toLowerCase(), text })
      setTextValue(text)
      setColorValue('')
      setSizeAmount('')
      setValueError(null)
    })
  }, [])

  const onIframeLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    if (mode === 'element') wireElementMode(doc)
    else wireEditor(doc)
  }, [mode, wireEditor, wireElementMode])

  // Backup wiring — do NOT rely on the iframe `load` event alone. For a srcDoc
  // iframe the load event can fire before React attaches onLoad (so it never
  // runs), AND the frame first exposes a blank about:blank document that is
  // already "complete" before the srcDoc content parses in. Either one leaves
  // the editor un-wired — the intermittent "nothing is editable" bug. So poll
  // until the frame's document actually holds the rendered content (body has
  // children), then wire it directly. wireEditor is idempotent, so onLoad
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
        if (mode === 'element') wireElementMode(doc)
        else wireEditor(doc)
        return
      }
      if (tries++ < 600) raf = requestAnimationFrame(attempt) // ~10s safety cap
    }
    attempt()
    return () => cancelAnimationFrame(raf)
  }, [open, html, mode, wireEditor, wireElementMode])

  function resetElementState() {
    setSelection(null)
    setKind('text')
    setTextValue('')
    setColorValue('')
    setSizeAmount('')
    setValueError(null)
    setAddressError(null)
  }

  function handleClose() {
    resetElementState()
    onClose()
  }

  function switchMode(next: 'document' | 'element') {
    resetElementState()
    setMode(next)
  }

  // The assembled value the closed grammars on the server will parse. Size is
  // the only composite one; the unit list is imported from the same module that
  // enforces it, so the picker cannot offer a unit the parser rejects.
  const elementValue =
    kind === 'text' ? textValue : kind === 'color' ? colorValue : `${sizeAmount.trim()}${sizeUnit}`
  const canSaveElement = selection !== null && (kind === 'fontSize' ? sizeAmount : elementValue).trim() !== ''

  async function handleElementSave() {
    if (!selection) return
    setSaving(true)
    setValueError(null)
    try {
      const res = await postElementEdit(draftId, {
        tag: selection.tag,
        text: selection.text,
        kind,
        value: elementValue,
      })
      if (res.ok) {
        toast.success('Saved a new revision')
        onSaved()
        handleClose()
        return
      }
      // 400 — the ADDRESS resolved and the VALUE was refused. The selection is
      // still good, so the panel stays exactly as it is and the message lands
      // under the input the user must correct.
      if (res.status === 400) {
        setValueError(res.error)
        return
      }
      // 409 — the address itself no longer resolves (the design moved under the
      // editor, or this node cannot be rewritten safely). Retrying the same
      // click cannot help, so the selection is discarded and the server's own
      // sentence — which names the next step — replaces the panel.
      if (res.status === 409) {
        setSelection(null)
        setAddressError(res.error)
        return
      }
      toast.error(res.error)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
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

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit inline"
      size="2xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={mode === 'element' ? handleElementSave : handleSave}
            disabled={saving || (mode === 'element' && !canSaveElement)}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save &amp; re-export
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant={mode === 'document' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => switchMode('document')}
            disabled={saving}
          >
            Whole design
          </Button>
          <Button
            variant={mode === 'element' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => switchMode('element')}
            disabled={saving}
          >
            One element
          </Button>
        </div>
        {mode === 'document' ? (
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
            Click any text to edit it in place, or hover an image and choose{' '}
            <strong className="font-semibold text-light-text dark:text-dark-text">
              Replace photo
            </strong>{' '}
            to swap it. Changes save as a new revision.
          </p>
        ) : (
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
            Click one outlined text element to select it, then change its text, colour or size. Only
            that element is rewritten. Elements that share their exact text with another element
            can&apos;t be picked out on their own — edit those in{' '}
            <strong className="font-semibold text-light-text dark:text-dark-text">
              Whole design
            </strong>
            .
          </p>
        )}
        {/* Neutral stage: the canvas is centered and fit to this box on both
            axes, so square, portrait and story ratios are all as large as they
            can be without overflowing. */}
        <div
          ref={stageRef}
          className="flex items-center justify-center overflow-hidden rounded-xl bg-black/[0.04] dark:bg-white/[0.04] ring-1 ring-inset ring-light-border dark:ring-dark-border p-4"
          style={{ height: 'min(74vh, 820px)' }}
        >
          <div
            className="overflow-hidden rounded-lg bg-white shadow-xl"
            style={{ width: width * scale, height: height * scale }}
          >
            {/* `key={mode}` remounts the frame from the pristine `srcDoc` when
                the mode changes, so neither mode ever sees the other's injected
                chrome — which is how the whole-document editor stays exactly
                the document it was before this change. */}
            <iframe
              key={mode}
              ref={iframeRef}
              onLoad={onIframeLoad}
              title="Inline editor"
              sandbox="allow-same-origin"
              srcDoc={html}
              style={{
                width,
                height,
                border: 0,
                transformOrigin: 'top left',
                transform: `scale(${scale})`,
              }}
            />
          </div>
        </div>
        {mode === 'element' && (
          <div className="rounded-xl ring-1 ring-inset ring-light-border dark:ring-dark-border p-3">
            {addressError ? (
              // The 409 surface. The selection is already gone; the server's own
              // sentence names the next step (reopen the editor, or move to the
              // whole-design mode), so it is shown verbatim rather than
              // paraphrased.
              <div className="flex flex-col gap-2">
                <p className="text-xs text-amber-600 dark:text-amber-400">{addressError}</p>
                <div>
                  <Button variant="secondary" size="sm" onClick={handleClose}>
                    Close editor
                  </Button>
                </div>
              </div>
            ) : !selection ? (
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                No element selected yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                  Selected <code className="font-mono">&lt;{selection.tag}&gt;</code> —{' '}
                  <span className="text-light-text dark:text-dark-text">
                    &ldquo;{selection.text.slice(0, 80)}
                    {selection.text.length > 80 ? '…' : ''}&rdquo;
                  </span>
                </p>
                <div className="flex items-center gap-1">
                  {(
                    [
                      ['text', 'Text'],
                      ['color', 'Colour'],
                      ['fontSize', 'Size'],
                    ] as const
                  ).map(([k, label]) => (
                    <Button
                      key={k}
                      variant={kind === k ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => {
                        setKind(k)
                        setValueError(null)
                      }}
                      disabled={saving}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {kind === 'text' && (
                  <input
                    className="glass-input w-full rounded-lg px-3 py-1.5 text-xs"
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder="Replacement text"
                    disabled={saving}
                  />
                )}
                {kind === 'color' && (
                  <input
                    className="glass-input w-full rounded-lg px-3 py-1.5 text-xs"
                    value={colorValue}
                    onChange={(e) => setColorValue(e.target.value)}
                    placeholder="#1a2b3c, rgb(0, 0, 0) or a basic colour name"
                    disabled={saving}
                  />
                )}
                {kind === 'fontSize' && (
                  <div className="flex items-center gap-2">
                    <input
                      className="glass-input w-24 rounded-lg px-3 py-1.5 text-xs"
                      value={sizeAmount}
                      onChange={(e) => setSizeAmount(e.target.value)}
                      placeholder="48"
                      inputMode="decimal"
                      disabled={saving}
                    />
                    <select
                      className="glass-input rounded-lg px-3 py-1.5 text-xs"
                      value={sizeUnit}
                      onChange={(e) =>
                        setSizeUnit(e.target.value as (typeof ELEMENT_SIZE_UNITS)[number])
                      }
                      disabled={saving}
                    >
                      {/* Built from the exported list the parser enforces, so
                          the picker cannot offer a rejected unit. */}
                      {ELEMENT_SIZE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {valueError && (
                  // The 400 surface: attached to the input the user must fix,
                  // with the selection deliberately left intact.
                  <p className="text-xs text-red-600 dark:text-red-400">{valueError}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
