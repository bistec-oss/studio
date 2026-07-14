// Campaign source documents: text extraction caps, type gating, and the
// prompt-context assembly cap (both providers see the whole context each
// turn, so the caps are load-bearing for cost and latency).

import { describe, it, expect } from 'vitest'
import {
  parseDocumentText,
  buildDocsContext,
  isAllowedDocument,
  isAllowedDocImage,
  MAX_DOC_TEXT_CHARS,
  MAX_DOCS_CONTEXT_CHARS,
} from '@/lib/campaign/documents'

describe('parseDocumentText — plain text', () => {
  it('parses utf-8 text and normalises CRLF', async () => {
    const result = await parseDocumentText(
      Buffer.from('line one\r\nline two'),
      'text/plain',
      'notes.txt'
    )
    expect(result.text).toBe('line one\nline two')
    expect(result.truncated).toBe(false)
  })

  it('caps oversized text and sets the truncated flag', async () => {
    const big = 'x'.repeat(MAX_DOC_TEXT_CHARS + 500)
    const result = await parseDocumentText(Buffer.from(big), 'text/markdown', 'big.md')
    expect(result.text.length).toBe(MAX_DOC_TEXT_CHARS)
    expect(result.truncated).toBe(true)
  })
})

describe('parseDocumentText — pdf', () => {
  it('extracts text from a minimal PDF', async () => {
    // Handwritten single-page PDF; pdfjs tolerates the missing xref table.
    const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 60 >> stream
BT /F1 24 Tf 72 720 Td (Hello campaign PDF) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R /Size 6 >>
%%EOF`
    const result = await parseDocumentText(Buffer.from(pdf), 'application/pdf', 'doc.pdf')
    expect(result.text).toContain('Hello campaign PDF')
  })
})

describe('isAllowedDocument', () => {
  it('accepts the allow-listed MIME types', () => {
    expect(isAllowedDocument('application/pdf', 'a.pdf')).toBe(true)
    expect(
      isAllowedDocument(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'a.docx'
      )
    ).toBe(true)
    expect(isAllowedDocument('text/plain', 'a.txt')).toBe(true)
    expect(isAllowedDocument('text/markdown', 'a.md')).toBe(true)
  })

  it('accepts .md/.txt by extension when the browser sends no useful MIME', () => {
    expect(isAllowedDocument('application/octet-stream', 'notes.md')).toBe(true)
    expect(isAllowedDocument('', 'notes.txt')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isAllowedDocument('application/octet-stream', 'run.exe')).toBe(false)
    expect(isAllowedDocument('image/png', 'pic.png')).toBe(false)
    expect(isAllowedDocument('image/svg+xml', 'pic.svg')).toBe(false)
  })
})

describe('isAllowedDocImage', () => {
  it('accepts png/jpg by MIME', () => {
    expect(isAllowedDocImage('image/png', 'pic.png')).toBe(true)
    expect(isAllowedDocImage('image/jpeg', 'pic.jpg')).toBe(true)
  })

  it('accepts by extension when the browser sends no useful MIME', () => {
    expect(isAllowedDocImage('application/octet-stream', 'pic.jpeg')).toBe(true)
    expect(isAllowedDocImage('', 'pic.png')).toBe(true)
  })

  it('rejects non-raster and script-bearing types', () => {
    expect(isAllowedDocImage('image/svg+xml', 'pic.svg')).toBe(false)
    expect(isAllowedDocImage('application/pdf', 'a.pdf')).toBe(false)
    expect(isAllowedDocImage('image/webp', 'pic.webp')).toBe(false)
  })
})

describe('buildDocsContext', () => {
  it('returns empty for no documents', () => {
    expect(buildDocsContext([])).toEqual({ text: '', truncated: false })
  })

  it('skips image "documents" (empty parsedText) instead of emitting empty sections', () => {
    const ctx = buildDocsContext([
      { name: 'pic.png', parsedText: '', truncated: false },
      { name: 'notes.md', parsedText: 'Notes body', truncated: false },
    ])
    expect(ctx.text).toBe('### notes.md\n\nNotes body')
  })

  it('joins documents under ### name headers', () => {
    const ctx = buildDocsContext([
      { name: 'strategy.pdf', parsedText: 'Strategy body', truncated: false },
      { name: 'notes.md', parsedText: 'Notes body', truncated: false },
    ])
    expect(ctx.text).toBe('### strategy.pdf\n\nStrategy body\n\n### notes.md\n\nNotes body')
    expect(ctx.truncated).toBe(false)
  })

  it('propagates a per-file truncation flag', () => {
    const ctx = buildDocsContext([{ name: 'a.txt', parsedText: 'short', truncated: true }])
    expect(ctx.truncated).toBe(true)
  })

  it('enforces the global context cap across documents', () => {
    const half = 'x'.repeat(Math.ceil(MAX_DOCS_CONTEXT_CHARS * 0.6))
    const ctx = buildDocsContext([
      { name: 'one.txt', parsedText: half, truncated: false },
      { name: 'two.txt', parsedText: half, truncated: false },
      { name: 'three.txt', parsedText: 'never included', truncated: false },
    ])
    expect(ctx.truncated).toBe(true)
    const bodyLength = ctx.text.length
    // Headers add a little; the bodies themselves stay within the cap.
    expect(bodyLength).toBeLessThan(MAX_DOCS_CONTEXT_CHARS + 200)
    expect(ctx.text).not.toContain('never included')
  })
})
