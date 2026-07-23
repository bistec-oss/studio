// Pure, node-safe helpers shared by the inline-edit route (sanitize + guard) and
// the InlineEditModal client (chrome-strip). Regex-based on purpose: no DOM
// parser is available server-side, and this is defense-in-depth — the renderer
// egress is already allowlisted and edited HTML is never served back as HTML.

// Remove <script>…</script> elements and on*="…" event-handler attributes.
export function sanitizeInlineHtml(html: string): string {
  return (
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/>/gi, '')
      // on<event>="…" | on<event>='…' | on<event>=unquoted
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
  )
}

// Remove editor-injected chrome so the saved HTML is structurally a normal
// snapshot: contenteditable attrs, the injected style block, the banner, and
// the replace-photo wrappers (unwrapped to leave the <img> in place).
export function stripEditingChrome(html: string): string {
  return html
    .replace(/\scontenteditable(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
    .replace(/<style\b[^>]*id\s*=\s*["']inline-edit-style["'][^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(
      /<div\b[^>]*data-inline-edit-chrome\s*=\s*["']banner["'][^>]*>[\s\S]*?<\/div\s*>/gi,
      '',
    )
    .replace(
      /<span\b[^>]*data-inline-edit-chrome\s*=\s*["']img-wrap["'][^>]*>([\s\S]*?)<\/span\s*>/gi,
      '$1',
    )
}

export function inlineEditBlockReason(status: string, pendingAction: string | null): string | null {
  if (pendingAction !== null) return 'Another action is already running on this draft'
  if (status !== 'EXPORTED' && status !== 'PUBLISHED') {
    return 'Only exported drafts can be edited inline'
  }
  return null
}
