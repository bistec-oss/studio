'use client'

import React from 'react'
import { Upload, X, Image as ImageIcon, Link as LinkIcon, Loader2 } from 'lucide-react'
import type { UploadedImage } from './types'

// ─── Step 3 — Images ─────────────────────────────────────────────────────────

interface ImagesStepProps {
  images: UploadedImage[]
  uploading: boolean
  fileInputRef: React.RefObject<HTMLInputElement>
  onFilesPicked: (files: FileList | null) => Promise<void>
  removeImage: (id: string) => void
  toggleIntent: (id: string) => void
}

export function ImagesStep({
  images,
  uploading,
  fileInputRef,
  onFilesPicked,
  removeImage,
  toggleIntent,
}: ImagesStepProps) {
  return (
    <div>
      <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">
        Images <span className="font-normal text-light-text-muted dark:text-dark-text-muted text-sm">(optional)</span>
      </h2>
      <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-6">
        Attach images for Claude to use. Choose how each one is used: embed it directly in the design, or use it as style inspiration only.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => onFilesPicked(e.target.files)}
      />

      <div className="space-y-2 mb-4">
        {images.map(img => (
          <div key={img.id} className="flex items-center gap-3 p-3 rounded-lg glass-input">
            <span className="w-9 h-9 rounded-lg bg-white/40 dark:bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.filename} className="w-full h-full object-cover" />
            </span>
            <span className="text-sm text-light-text dark:text-dark-text flex-1 truncate">{img.filename}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => toggleIntent(img.id)}
                className={[
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border',
                  img.intent === 'embed'
                    ? 'bg-primary/10 dark:bg-primary-light/15 text-primary dark:text-primary-light border-primary/20 dark:border-primary-light/20'
                    : 'bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20',
                ].join(' ')}
              >
                {img.intent === 'embed' ? <><ImageIcon size={11} /> Embed</> : <><LinkIcon size={11} /> Style ref</>}
              </button>
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="p-1 text-light-text-muted dark:text-dark-text-muted hover:text-red-500 transition-colors ml-1"
                aria-label="Remove image"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-white/40 dark:border-white/15 text-light-text-muted dark:text-dark-text-muted hover:border-primary/40 hover:text-primary dark:hover:text-primary-light transition-all w-full justify-center text-sm font-medium disabled:opacity-50"
      >
        {uploading ? <><Loader2 size={15} className="animate-spin" /> Uploading…</> : <><Upload size={15} /> Add image</>}
      </button>

      {images.length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <strong>Embed</strong> — Claude places this image directly in the design.<br />
            <strong>Style reference</strong> — Claude uses it for visual inspiration only, won&apos;t embed it.
          </p>
        </div>
      )}
    </div>
  )
}
