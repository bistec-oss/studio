// 025 OP-025 recheck (Amendment A1): re-judge the saved probe renders with the SHIPPED check.
//
// Run through the runner, which spawns this with tsx:
//   node scripts/look-check/run-look-check.mjs --probe --recheck [--out <dir>]
// or directly:
//   npx tsx scripts/look-check/recheck.ts --out .specclaw/changes/025-hero-reference-images/look-check
//
// No network call and no image call: each render is decoded in the local Chromium (the sampler's
// page blocks every request but data: URLs) and judged by runHeroCheck, the same function the app
// runs. For every result in results.json that has a `render`, it writes
//   recheck: { styleKept, fallbackReason, rect }
// and it writes recheck.html next to results.json: each render with the detected rect drawn on it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dimensionsFor } from '@/lib/aspectRatio'
import {
  BUSY_STDDEV_MAX,
  CONTRAST_MIN,
  TEXT_TONE_LUMINANCE,
  archetypes,
  compositeRegionOf,
  contrastRatio,
  coverFit,
  lightness,
  planComposition,
  type Rect,
  type Region,
} from '@/lib/designData'
import { runHeroCheck } from '@/lib/renderer/heroCheck'
import { sampleRegionLuminance } from '@/lib/renderer/puppeteer'

interface ProbeResult {
  slot: string
  attempt: number
  render?: string | null
  styleKept?: boolean
  fallbackReason?: string | null
  recheck?: { styleKept: boolean; fallbackReason: string | null; rect: Rect | null }
  [k: string]: unknown
}

// The mock seams return a synthetic flat screen, which would pass every render: refuse to run.
if (process.env.MOCK_PUPPETEER === 'true' || process.env.MOCK_AI === 'true') {
  console.error('recheck refuses to run with MOCK_PUPPETEER or MOCK_AI set: unset them and use a plain shell')
  process.exit(2)
}

const argv = process.argv.slice(2)

// 031 FR-46 evidence mode (no results.json, no network, no image call):
//   npx tsx scripts/look-check/recheck.ts --regions <png> <key>@<version>:<size>
// Samples the render with the production sampler against that version's regions and prints, per
// region, the luminance std dev (CIE L*/100) against BUSY_STDDEV_MAX and the contrast fraction.
// For each text band it also samples a strip of 4% of the canvas height on each side of the
// band's inner edge, which shows where the busy pixels sit.
const regionsIdx = argv.indexOf('--regions')
if (regionsIdx >= 0) {
  const [png, spec] = [argv[regionsIdx + 1], argv[regionsIdx + 2]]
  const m = /^([a-z-]+)@(\d+):(SQUARE|PORTRAIT|STORY)$/.exec(spec ?? '')
  if (!png || !m) {
    console.error('usage: --regions <png> <key>@<version>:<SQUARE|PORTRAIT|STORY>')
    process.exit(1)
  }
  const sizeContract = archetypes[m[1]]?.versions[Number(m[2])]?.sizes[m[3] as 'SQUARE']
  const tone = archetypes[m[1]]?.versions[Number(m[2])]?.textTone
  if (!sizeContract || !tone || !existsSync(png)) {
    console.error(`unknown contract ${spec} or missing file ${png}`)
    process.exit(1)
  }
  const sd = (lum: readonly number[]) => {
    const ls = lum.map(lightness)
    const mean = ls.reduce((a, v) => a + v, 0) / ls.length
    return Math.sqrt(ls.reduce((a, v) => a + (v - mean) ** 2, 0) / ls.length)
  }
  const rows: Array<{ label: string; region: Region }> = []
  for (const r of sizeContract.regions) {
    rows.push({ label: r.purpose, region: r })
    if (r.purpose !== 'text') continue
    const { x, w, y, h } = r.rect
    const top = y === 0
    const edge = top ? y + h : y // the inner edge, toward the subject
    const strip = (label: string, sy: number): void => {
      rows.push({ label, region: { rect: { x, y: Math.max(0, Math.min(96, sy)), w, h: 4 }, purpose: 'text', minAreaPct: 0 } })
    }
    strip(`  strip inside the band at its inner edge (${top ? edge - 4 : edge}% to ${top ? edge : edge + 4}%)`, top ? edge - 4 : edge)
    strip(`  strip outside the band (${top ? edge : edge - 4}% to ${top ? edge + 4 : edge}%)`, top ? edge : edge - 4)
  }
  // Extra full-width strips: --strip <y>,<h> (canvas percent), repeatable.
  argv.forEach((a, i) => {
    const sm = a === '--strip' ? /^(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/.exec(argv[i + 1] ?? '') : null
    if (sm) rows.push({ label: `strip y ${sm[1]}% h ${sm[2]}%`, region: { rect: { x: 0, y: Number(sm[1]), w: 100, h: Number(sm[2]) }, purpose: 'text', minAreaPct: 0 } })
  })
  async function evidence() {
    const canvas = dimensionsFor(m![3] as 'SQUARE')
    const dataUrl = `data:image/png;base64,${readFileSync(png).toString('base64')}`
    const samples = await sampleRegionLuminance(dataUrl, rows.map((r) => r.region), canvas)
    console.log(`file ${png}  contract ${spec}  BUSY_STDDEV_MAX ${BUSY_STDDEV_MAX}  CONTRAST_MIN ${CONTRAST_MIN}`)
    console.log('region | rect (x,y,w,h %) | stddev | busy? | contrastFraction')
    rows.forEach((row, i) => {
      const s = samples[i]
      const r = row.region.rect
      const rect = `${r.x},${r.y},${r.w},${r.h}`
      if (!s) return console.log(`${row.label} | ${rect} | no samples`)
      const lum = s.luminance.filter(Number.isFinite)
      const std = sd(lum)
      const cf = lum.filter((l) => contrastRatio(l, TEXT_TONE_LUMINANCE[tone!]) >= CONTRAST_MIN).length / lum.length
      console.log(`${row.label}${row.region.use ? ` (${row.region.use})` : ''} | ${rect} | ${std.toFixed(4)} | ${std > BUSY_STDDEV_MAX ? 'BUSY' : 'ok'} | ${cf.toFixed(3)}`)
    })
  }
  evidence().then(
    () => process.exit(0),
    (e) => {
      console.error(e)
      process.exit(1)
    },
  )
}
const outIdx = argv.indexOf('--out')
const out = outIdx >= 0 ? argv[outIdx + 1] : '.specclaw/changes/025-hero-reference-images/look-check'
if (regionsIdx < 0 && !out) {
  console.error('--out <dir> is required')
  process.exit(1)
}
const resultsPath = join(out ?? '.', 'results.json')
if (regionsIdx < 0 && !existsSync(resultsPath)) {
  console.error(`no results.json in ${out}`)
  process.exit(1)
}

// PNG width and height, from the IHDR chunk.
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const box = (r: { l: number; t: number; w: number; h: number }, css: string, label = '') =>
  `<div style="position:absolute;left:${r.l}%;top:${r.t}%;width:${r.w}%;height:${r.h}%;${css}" title="${esc(label)}"></div>`

async function main() {
  const results: ProbeResult[] = JSON.parse(readFileSync(resultsPath, 'utf8'))
  const cards: string[] = []

  for (const r of results) {
    if (!r.render) continue
    const [key, sizeRaw] = r.slot.split(':')
    const size = sizeRaw as 'SQUARE' | 'PORTRAIT' | 'STORY'
    const plan = planComposition({ imageStyle: key, aspectRatio: size, hasCompositeSource: true })
    const file = join(out, 'renders', r.render)
    if (plan.kind !== 'hero' || !existsSync(file)) {
      console.log(`${r.slot}#${r.attempt}: skipped (${plan.kind !== 'hero' ? 'not a hero look' : 'render file missing'})`)
      continue
    }
    const bytes = readFileSync(file)
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`
    const logs: string[] = []
    const check = await runHeroCheck(dataUrl, plan, { log: (m) => logs.push(m) })
    const rect = check.ok ? (check.composites?.[0]?.rect ?? null) : null
    r.recheck = { styleKept: check.ok === true, fallbackReason: check.ok ? null : check.reason, rect }
    console.log(
      `${r.slot}#${r.attempt}: ${check.ok ? 'kept' : `fell back (${check.reason})`}` +
        (rect ? ` rect x ${rect.x}, y ${rect.y}, w ${rect.w}, h ${rect.h}` : '') +
        (logs.length ? ` [${logs.join('; ')}]` : ''),
    )

    // Draw on the image: canvas percent to image percent through the cover fit the check used.
    const canvas = dimensionsFor(size)
    const png = pngSize(bytes)
    let overlay = ''
    if (png) {
      const fit = coverFit({ w: canvas.width, h: canvas.height }, png)
      const toImg = (c: Rect) => ({
        l: ((c.x * canvas.width) / 100 - fit.offset.x) / fit.scaled.w * 100,
        t: ((c.y * canvas.height) / 100 - fit.offset.y) / fit.scaled.h * 100,
        w: ((c.w * canvas.width) / 100) / fit.scaled.w * 100,
        h: ((c.h * canvas.height) / 100) / fit.scaled.h * 100,
      })
      for (const reg of plan.sizeContract.regions) {
        if (reg.purpose === 'text') overlay += box(toImg(reg.rect), 'border:2px dotted #f5a623;box-sizing:border-box', 'text region')
      }
      const target = compositeRegionOf(plan.sizeContract)
      if (target) overlay += box(toImg(target.rect), 'border:2px dashed #4aa3ff;box-sizing:border-box', 'contract region (the target)')
      if (rect) overlay += box(toImg(rect), 'border:3px solid #ff2d55;box-sizing:border-box', 'detected screen')
    }
    cards.push(`<figure>
  <div class="img"><img src="renders/${esc(r.render)}" alt="${esc(r.slot)} attempt ${r.attempt}">${overlay}</div>
  <figcaption><b>${esc(r.slot)} #${r.attempt}</b><br>
  recheck: ${check.ok ? '<span class="ok">kept the look</span>' : `<span class="no">fell back: ${esc(check.reason)}</span>`}
  ${rect ? `<br>detected rect (canvas %): x ${rect.x}, y ${rect.y}, w ${rect.w}, h ${rect.h}` : ''}
  ${logs.length ? `<br><small>${esc(logs.join('; '))}</small>` : ''}
  <br><small>live response: styleKept ${esc(String(r.styleKept))}${r.fallbackReason ? `, ${esc(String(r.fallbackReason))}` : ''}</small></figcaption>
</figure>`)
  }

  writeFileSync(resultsPath, JSON.stringify(results, null, 2))
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OP-025 recheck</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:#111;color:#eee}
.grid{display:flex;flex-wrap:wrap;gap:20px}
figure{margin:0;width:420px}
.img{position:relative;line-height:0}
.img img{width:100%;display:block}
.ok{color:#4cd964}.no{color:#ff6b6b}
.key{margin-bottom:16px}
</style></head><body>
<h1>OP-025 recheck</h1>
<p class="key">Solid red: the screen the shipped detector found (where the screenshot would go).
Dashed blue: the contract region the prompt asked for. Dotted orange: the text band(s).
Give a verdict on each render that kept the look.</p>
<div class="grid">
${cards.join('\n')}
</div></body></html>`
  writeFileSync(join(out, 'recheck.html'), html)
  console.log(`wrote ${resultsPath} and ${join(out, 'recheck.html')}`)
}

if (regionsIdx < 0) main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
