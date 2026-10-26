// FR-35 re-measure. READ-ONLY: two SELECTs against bistec_studio_op1 through
// docker exec psql. No model call, no write. Run: npx tsx <this file>
import { execFileSync } from 'node:child_process'
import { parse } from 'parse5'
import * as pc from '../../../../src/lib/applyText/candidates'

const precheckApply: typeof pc.precheckApply =
  (pc as any).precheckApply ?? (pc as any).default?.precheckApply

const DRAFTS_SQL = `SELECT coalesce(json_agg(json_build_object('id', d.id, 'html', d."htmlContent", 'headline', d.headline, 'mode', b."designMode") ORDER BY d.id), '[]'::json) FROM "Draft" d JOIN "Brief" b ON b.id = d."briefId" WHERE d."htmlContent" IS NOT NULL AND d.headline IS NOT NULL AND d.headline <> ''`
const TEMPLATES_SQL = `SELECT coalesce(json_agg(json_build_object('id', id, 'name', name, 'html', "htmlTemplate") ORDER BY id), '[]'::json) FROM "BrandKitTemplate"`

function select(sql: string): any[] {
  if (!/^\s*SELECT/i.test(sql)) throw new Error('SELECT only')
  const out = execFileSync(
    'docker',
    ['exec', 'designer-postgres-1', 'psql', '-U', 'bistec', '-d', 'bistec_studio_op1', '-At', '-c', sql],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  return JSON.parse(out)
}

// A Path A template's sample headline: the text of its first h1, else h2, else h3.
function sampleHeadline(html: string): string | null {
  const doc: any = parse(html)
  const text = (n: any): string =>
    n.nodeName === '#text' ? n.value : n.tagName === 'br' ? ' ' : (n.childNodes ?? []).map(text).join('')
  for (const tag of ['h1', 'h2', 'h3']) {
    const stack = [doc]
    while (stack.length) {
      const n = stack.shift()
      if (n.tagName === tag && !['script', 'style'].includes(n.parentNode?.tagName)) {
        const t = text(n).replace(/\s+/g, ' ').trim()
        if (t) return t
      }
      stack.push(...(n.childNodes ?? []))
    }
  }
  return null
}

function run(rows: { id: string; html: string; headline: string }[]) {
  const failures: Record<string, number> = {}
  let ok = 0
  let styled = 0
  const detail: string[] = []
  for (const r of rows) {
    const res = precheckApply(r.html, r.headline, r.headline + ' (new)')
    if (res.ok) {
      ok++
      if (res.candidate.hasChildElements) styled++
      detail.push(`${r.id.slice(-6)} ok tag=${res.candidate.tagName} children=${res.candidate.hasChildElements}`)
    } else {
      failures[res.failure] = (failures[res.failure] ?? 0) + 1
      detail.push(`${r.id.slice(-6)} ${res.failure}`)
    }
  }
  return { n: rows.length, ok, styled, failures, detail }
}

const drafts = select(DRAFTS_SQL)
const pathB = run(drafts)
const templates = select(TEMPLATES_SQL)
const tRows = templates
  .map((t: any) => ({ id: t.id, name: t.name, html: t.html, headline: sampleHeadline(t.html) }))
const withHeadline = tRows.filter((t) => t.headline) as { id: string; name: string; html: string; headline: string }[]
const pathA = run(withHeadline)
const all = { n: pathB.n + pathA.n, ok: pathB.ok + pathA.ok, styled: pathB.styled + pathA.styled }
console.log(JSON.stringify({ pathB, pathA, templatesTotal: tRows.length, templatesWithoutHeadline: tRows.length - withHeadline.length, combined: { ...all, rate: all.ok / all.n, styledShare: all.styled / all.ok }, draftModes: drafts.reduce((m: any, d: any) => ((m[d.mode] = (m[d.mode] ?? 0) + 1), m), {}) }, null, 2))
