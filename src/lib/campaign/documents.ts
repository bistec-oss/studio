import mammoth from "mammoth"
import { PDFParse } from "pdf-parse"
import { prisma } from "@/lib/prisma"

// Campaign source documents: parsing + prompt-context assembly for the AI
// briefing assistant. Uploads are parsed once (at upload time) and the text is
// stored on the CampaignDocument row, so chat turns never re-parse files.

export const MAX_DOCS_PER_CAMPAIGN = 5
// Per-file cap on stored parsed text.
export const MAX_DOC_TEXT_CHARS = 60_000
// Global cap on document context injected into a prompt (both providers see
// the whole transcript each turn — keep it sane, especially in CLI mode).
export const MAX_DOCS_CONTEXT_CHARS = 50_000

const PDF_TYPES = ["application/pdf"]
const DOCX_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]
const TEXT_TYPES = ["text/plain", "text/markdown"]

export const DOC_MIME_TYPES = [...PDF_TYPES, ...DOCX_TYPES, ...TEXT_TYPES]

// Browsers often report .md files as empty/octet-stream — accept by extension.
export function isAllowedDocument(contentType: string, filename: string): boolean {
  if (DOC_MIME_TYPES.includes(contentType)) return true
  return /\.(md|markdown|txt)$/i.test(filename)
}

export interface ParsedDocument {
  text: string
  truncated: boolean
}

function capText(raw: string): ParsedDocument {
  const text = raw.replace(/\r\n/g, "\n").trim()
  if (text.length <= MAX_DOC_TEXT_CHARS) return { text, truncated: false }
  return { text: text.slice(0, MAX_DOC_TEXT_CHARS), truncated: true }
}

export async function parseDocumentText(
  buffer: Buffer,
  contentType: string,
  filename: string
): Promise<ParsedDocument> {
  if (PDF_TYPES.includes(contentType) || /\.pdf$/i.test(filename)) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    try {
      const result = await parser.getText()
      return capText(result.text ?? "")
    } finally {
      await parser.destroy()
    }
  }
  if (DOCX_TYPES.includes(contentType) || /\.docx$/i.test(filename)) {
    const result = await mammoth.extractRawText({ buffer })
    return capText(result.value ?? "")
  }
  // txt / md — plain UTF-8.
  return capText(buffer.toString("utf-8"))
}

export interface DocsContext {
  text: string
  truncated: boolean
}

// Pure assembly of parsed documents into one prompt-ready block, enforcing the
// global context cap. Split from the DB read so it is unit-testable.
export function buildDocsContext(
  docs: Array<{ name: string; parsedText: string; truncated: boolean }>
): DocsContext {
  if (docs.length === 0) return { text: "", truncated: false }

  let truncated = docs.some((d) => d.truncated)
  let remaining = MAX_DOCS_CONTEXT_CHARS
  const parts: string[] = []
  for (const doc of docs) {
    if (remaining <= 0) {
      truncated = true
      break
    }
    let body = doc.parsedText
    if (body.length > remaining) {
      body = body.slice(0, remaining)
      truncated = true
    }
    parts.push(`### ${doc.name}\n\n${body}`)
    remaining -= body.length
  }
  return { text: parts.join("\n\n"), truncated }
}

// Concatenates a campaign's parsed documents for prompt building. Returns
// empty text when no docs exist.
export async function collectCampaignDocsContext(campaignId: string): Promise<DocsContext> {
  const docs = await prisma.campaignDocument.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
    select: { name: true, parsedText: true, truncated: true },
  })
  return buildDocsContext(docs)
}
