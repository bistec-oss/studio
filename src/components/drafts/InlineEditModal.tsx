'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { apiFetch } from '@/lib/apiFetch'
import { stripEditingChrome } from '@/lib/drafts/inlineEdit'
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
  const onIframeLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return

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

    // Plain-text paste only.
    doc.body?.addEventListener('paste', (e: ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      doc.execCommand('insertText', false, text)
    })

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
      onClose={onClose}
      title="Edit inline"
      size="2xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save &amp; re-export
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
          Click any text to edit it in place, or hover an image and choose{' '}
          <strong className="font-semibold text-light-text dark:text-dark-text">Replace photo</strong>{' '}
          to swap it. Changes save as a new revision.
        </p>
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
            <iframe
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
      </div>
    </Modal>
  )
}
