'use client'

import React, { useCallback, useRef, useState } from 'react'
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
  [contenteditable="true"]{outline:2px dashed transparent;transition:outline-color .15s}
  [contenteditable="true"]:hover{outline-color:rgba(37,99,235,.5)}
  [contenteditable="true"]:focus{outline-color:rgba(37,99,235,.9)}
  [data-inline-edit-chrome="img-wrap"]{position:relative;display:inline-block}
  [data-inline-edit-chrome="img-wrap"] .inline-replace-btn{
    position:absolute;top:6px;left:6px;z-index:2;font:600 12px system-ui;
    background:rgba(0,0,0,.6);color:#fff;border:0;border-radius:6px;padding:4px 8px;cursor:pointer}
`

// Display width the true-size canvas is scaled down to fit inside the dialog.
const DISPLAY_W = 640

export function InlineEditModal({
  open,
  onClose,
  draftId,
  html,
  aspectRatio,
  onSaved,
}: InlineEditModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [saving, setSaving] = useState(false)
  const { width, height } = dimensionsFor(aspectRatio)
  const scale = Math.min(1, DISPLAY_W / width)

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

    // Make every text-leaf element editable (all child nodes are text).
    doc.body?.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (['SCRIPT', 'STYLE', 'IMG'].includes(el.tagName)) return
      const onlyText =
        el.childNodes.length > 0 &&
        Array.from(el.childNodes).every((n) => n.nodeType === Node.TEXT_NODE)
      if (onlyText) el.setAttribute('contenteditable', 'true')
    })

    // Plain-text paste only.
    doc.body?.addEventListener('paste', (e: ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      doc.execCommand('insertText', false, text)
    })

    // Wrap each <img> with a "Replace photo" control.
    doc.body?.querySelectorAll('img').forEach((img) => {
      if (img.parentElement?.getAttribute('data-inline-edit-chrome') === 'img-wrap') return
      const wrap = doc.createElement('span')
      wrap.setAttribute('data-inline-edit-chrome', 'img-wrap')
      img.replaceWith(wrap)
      wrap.appendChild(img)
      const btn = doc.createElement('button')
      btn.type = 'button'
      btn.className = 'inline-replace-btn'
      btn.textContent = 'Replace photo'
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
      size="lg"
      className="max-w-4xl"
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
      <div className="space-y-3">
        <div className="rounded-lg bg-primary/5 dark:bg-primary-light/10 px-3 py-2 text-xs text-light-text dark:text-dark-text">
          ✎ Click any text to edit · hover an image and click <strong>Replace photo</strong> to swap
          it.
        </div>
        <div
          className="mx-auto overflow-hidden rounded-lg border border-light-border dark:border-dark-border"
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
    </Modal>
  )
}
