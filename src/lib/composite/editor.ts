// 025 FR-16: what the inline editor shows for the screenshot. The stored HTML
// holds only the token; the editor's iframe gets the preview route's URL for
// display. Nothing here is stored: the save route rebuilds the one canonical
// element from the stamp, so the editor's URL never reaches a stored document.
import { COMPOSITE_TOKEN } from './render'

export const COMPOSITE_EDITOR_LABEL = 'Product screenshot (placed automatically)'

export function compositePreviewUrl(draftId: string, key: string): string {
  return `/api/briefs/screenshots?key=${encodeURIComponent(key)}&draftId=${encodeURIComponent(draftId)}`
}

// The document as the editor iframe loads it. A document with no token, or a
// draft with no stamped key, is unchanged.
export function editorSrcDoc(html: string, draftId: string, key: string | null | undefined): string {
  if (!key || !html.includes(COMPOSITE_TOKEN)) return html
  return html.split(COMPOSITE_TOKEN).join(compositePreviewUrl(draftId, key))
}

// Editor CSS for the placed element: not editable, labelled. The editor and
// element-mode styles both include it.
export const COMPOSITE_EDITOR_CSS = `
  [data-composite]{user-select:none;-webkit-user-select:none;outline:2px dashed rgba(24,24,22,.45);outline-offset:-2px}
  [data-composite]::after{content:"${COMPOSITE_EDITOR_LABEL}";position:absolute;left:8px;bottom:8px;z-index:3;font:600 12px system-ui;background:rgba(0,0,0,.6);color:#fff;border-radius:6px;padding:4px 8px;pointer-events:none}
`
