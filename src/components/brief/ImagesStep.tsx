'use client'

import React from 'react'
import { Upload, X, Image as ImageIcon, Link as LinkIcon, Loader2 } from 'lucide-react'
import type { UploadedImage } from './types'
import { Button } from '@/components/ui/Button'
import { FOCUS, ICON, ICON_BUTTON } from '@/components/ui/atoms'
import { StepHead } from './StepHead'

// ─── Step 3 — Images ─────────────────────────────────────────────────────────

interface ImagesStepProps {
  images: UploadedImage[]
  uploading: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
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
      <StepHead
        title={<>Images <span className="font-normal text-ui-sm text-fg-muted">(optional)</span></>}
      >
        Attach images to use in the design. Choose how each one is used: embed it directly in the design, or use it as style inspiration only.
      </StepHead>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => onFilesPicked(e.target.files)}
      />

      {/* Ruled rows on --line-subtle (DESIGN_SYSTEM.md §6) */}
      {images.length > 0 && (
        <div className="mb-6 divide-y divide-line-subtle">
          {images.map(img => (
            <div key={img.id} className="flex items-center gap-3 py-3">
              {/* The user's own image, shown as uploaded: never token-styled. */}
              <span className="w-10 h-10 rounded-ui-sm border border-line-subtle bg-surface flex items-center justify-center flex-shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.filename} className="w-full h-full object-cover" />
              </span>
              <span className="text-ui-sm text-fg flex-1 min-w-0 truncate">{img.filename}</span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="secondary" size="sm" onClick={() => toggleIntent(img.id)}>
                  {img.intent === 'embed'
                    ? <><ImageIcon {...ICON} aria-hidden /> Embed</>
                    : <><LinkIcon {...ICON} aria-hidden /> Style reference</>}
                </Button>
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className={`ml-1 ${ICON_BUTTON} hover:bg-surface-raised hover:text-status-failed ${FOCUS}`}
                  aria-label="Remove image"
                >
                  <X {...ICON} aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={`flex h-12 w-full items-center justify-center gap-2 rounded-ui-md border border-dashed border-line bg-canvas text-ui-sm font-semibold text-fg-muted hover:border-fg hover:text-fg transition-colors duration-fast ease-standard disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`}
      >
        {uploading
          ? <><Loader2 {...ICON} aria-hidden className="animate-spin" /> Uploading…</>
          : <><Upload {...ICON} aria-hidden /> Add image</>}
      </button>

      {images.length > 0 && (
        <p className="mt-4 rounded-ui-md bg-canvas px-4 py-3 ring-1 ring-inset ring-line-subtle text-ui-xs text-fg-muted leading-relaxed">
          <strong className="font-semibold text-fg">Embed</strong> — the design places this image directly.<br />
          <strong className="font-semibold text-fg">Style reference</strong> — used for visual inspiration only, never embedded.
        </p>
      )}
    </div>
  )
}
