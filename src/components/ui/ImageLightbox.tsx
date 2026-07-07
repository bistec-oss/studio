'use client'

import React, { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AspectRatio } from '@prisma/client'
import { dimensionsLabel } from '@/lib/aspectRatio'

// Full-screen lightbox for an exported post image. Radix Dialog gives us the
// focus trap, Escape-to-close, and click-outside; the shell follows the Frozen
// Light treatment: near-opaque blurred backdrop, the image fitted to the
// viewport, and a glass caption bar with the topic, dimensions, and Download.

interface ImageLightboxProps {
  open: boolean
  onClose: () => void
  src: string
  topic: string
  aspectRatio?: AspectRatio | null
}

function downloadFilename(topic: string, ratio: AspectRatio | null | undefined): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'post'}-${dimensionsLabel(ratio).replace('×', 'x')}.png`
}

export function ImageLightbox({ open, onClose, src, topic, aspectRatio }: ImageLightboxProps) {
  const [downloading, setDownloading] = useState(false)

  // The export lives on MinIO (another origin), so a plain <a download> would
  // navigate instead of saving — fetch to a blob and save that instead.
  async function download() {
    setDownloading(true)
    try {
      const res = await fetch(src)
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blobUrl = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = downloadFilename(topic, aspectRatio)
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-8 focus:outline-none animate-scale-in"
          // Clicking the empty space around the image closes, like the overlay.
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <Dialog.Title className="sr-only">{topic} — full-screen preview</Dialog.Title>

          <Dialog.Close asChild>
            <button
              aria-label="Close preview"
              className="absolute top-4 right-4 p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>
          </Dialog.Close>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={topic}
            className="max-w-full max-h-[calc(100dvh-8rem)] object-contain rounded-xl shadow-2xl"
          />

          {/* Caption bar */}
          <div className="mt-4 flex items-center gap-3 glass-panel rounded-xl px-4 py-2 max-w-full">
            <p className="text-sm text-light-text dark:text-dark-text truncate">
              {topic}
              <span className="ml-2 font-mono text-xs text-light-text-muted dark:text-dark-text-muted">
                {dimensionsLabel(aspectRatio)}
              </span>
            </p>
            <button
              onClick={download}
              disabled={downloading}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg
                bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light
                border border-primary/20 dark:border-primary-light/20
                hover:bg-primary/20 dark:hover:bg-primary-light/20 transition-colors
                disabled:opacity-50 flex-shrink-0"
            >
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Download
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
