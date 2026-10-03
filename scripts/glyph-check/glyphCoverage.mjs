// Glyph-coverage ("tofu") detection over a rasterized PNG — the shared core of
// the render-fidelity harness (tests/render/) and the in-image check
// (check-glyphs.mjs, run inside the built Docker runner image).
//
// Deliberately dependency-free plain ESM (node:zlib only): the runner image has
// no dev dependencies, no TypeScript and no tests, so this one file must run
// there unchanged AND be importable from the vitest harness. Only the way the
// PNG is produced differs between the two callers; decoding and judging are
// this module, so the host harness and the image check can never disagree
// about what counts as tofu.
//
// How tofu is detected — glyph-agnostically, by comparison with a control:
// every candidate glyph is drawn in its own cell next to a known-covered
// control glyph ("H") at the same font size. A codepoint no installed font
// covers is drawn as the primary font's .notdef glyph, which is either a
// rectangle (hollow, filled, or with a mark inside) or nothing at all. So a
// candidate FAILS when
//   - it left (almost) no ink compared with the control         -> "blank", or
//   - its ink's bounding box is inked along all four edges, i.e. it is a
//     rectangle, AND that rectangle is glyph-sized relative to the control
//     (at least half the control's height, a quarter of it wide)  -> "rectangle".
// No real glyph in the target set (stars, checks, arrows, bullets, letters) is
// inked along all four edges of its own bounding box. The control-relative size
// test is what stops rules and bars (— | _), which ARE thin filled rectangles,
// from reading as tofu. Known limit: a glyph whose genuine shape is a
// glyph-sized closed rectangle (□ ■ █ 口 田) cannot be judged by shape and
// will report "rectangle" even when covered — assert those another way.

import { inflateSync } from "node:zlib"

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 }

/**
 * Decode an 8-bit, non-interlaced greyscale/RGB(A) PNG — what Chromium's
 * screenshot encoder emits — into RGBA pixels. Throws on anything else rather
 * than guessing.
 *
 * @param {Uint8Array} buf
 * @returns {{ width: number, height: number, data: Uint8Array }} RGBA, row-major
 */
export function decodePng(buf) {
  const bytes = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("decodePng: not a PNG (bad signature)")
  }
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = -1
  let interlace = 0
  const idat = []
  let off = 8
  while (off + 8 <= bytes.length) {
    const len = bytes.readUInt32BE(off)
    const type = bytes.toString("latin1", off + 4, off + 8)
    const data = bytes.subarray(off + 8, off + 8 + len)
    off += 12 + len
    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === "IDAT") {
      idat.push(data)
    } else if (type === "IEND") {
      break
    }
  }
  const channels = CHANNELS_BY_COLOR_TYPE[colorType]
  if (!width || !height || !channels || bitDepth !== 8 || interlace !== 0) {
    throw new Error(
      `decodePng: unsupported PNG (colorType ${colorType}, bitDepth ${bitDepth}, interlace ${interlace}) — ` +
        "only 8-bit non-interlaced grey/RGB/RGBA is handled"
    )
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  if (raw.length < height * (stride + 1)) throw new Error("decodePng: truncated image data")
  const out = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const p = y * (stride + 1)
    const filter = raw[p]
    const cur = new Uint8Array(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      let pred
      switch (filter) {
        case 0: pred = 0; break
        case 1: pred = a; break
        case 2: pred = b; break
        case 3: pred = (a + b) >> 1; break
        case 4: {
          const pa = Math.abs(b - c)
          const pb = Math.abs(a - c)
          const pc = Math.abs(a + b - 2 * c)
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
        default:
          throw new Error(`decodePng: bad filter type ${filter} on row ${y}`)
      }
      cur[x] = (raw[p + 1 + x] + pred) & 0xff
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels
      const d = (y * width + x) * 4
      if (channels === 1 || channels === 2) {
        out[d] = out[d + 1] = out[d + 2] = cur[s]
        out[d + 3] = channels === 2 ? cur[s + 1] : 255
      } else {
        out[d] = cur[s]
        out[d + 1] = cur[s + 1]
        out[d + 2] = cur[s + 2]
        out[d + 3] = channels === 4 ? cur[s + 3] : 255
      }
    }
    prev = cur
  }
  return { width, height, data: out }
}

/**
 * Ink statistics for one rectangular region of a decoded image. Ink = a pixel
 * darker than `threshold` (dark-on-light rendering, as the probe draws it).
 * Other tests can call this on any region of any rasterized HTML.
 *
 * @param {{ width: number, height: number, data: Uint8Array }} image
 * @param {{ x: number, y: number, width: number, height: number }} rect  image pixels
 * @param {number} [threshold]  luminance 0–255
 */
export function measureInk(image, rect, threshold = 128) {
  const x0r = Math.max(0, Math.round(rect.x))
  const y0r = Math.max(0, Math.round(rect.y))
  const x1r = Math.min(image.width, Math.round(rect.x + rect.width))
  const y1r = Math.min(image.height, Math.round(rect.y + rect.height))
  const w = x1r - x0r
  const h = y1r - y0r
  const inked = new Uint8Array(Math.max(0, w * h))
  let ink = 0
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = ((y0r + y) * image.width + (x0r + x)) * 4
      const lum = 0.299 * image.data[d] + 0.587 * image.data[d + 1] + 0.114 * image.data[d + 2]
      if (lum < threshold) {
        inked[y * w + x] = 1
        ink++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (ink === 0) {
    return { ink: 0, bbox: null, edgeFill: null, clipped: false }
  }
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  // Best fill of any line within a thin band along each bbox edge. A rectangle
  // outline fills its edge lines ~completely; a real glyph touches its own
  // bbox edges only at a few extremal points.
  const bandH = Math.max(1, Math.round(bh * 0.04))
  const bandW = Math.max(1, Math.round(bw * 0.04))
  const rowFill = (y) => {
    let n = 0
    for (let x = minX; x <= maxX; x++) n += inked[y * w + x]
    return n / bw
  }
  const colFill = (x) => {
    let n = 0
    for (let y = minY; y <= maxY; y++) n += inked[y * w + x]
    return n / bh
  }
  const bandMax = (from, step, count, fill) => {
    let best = 0
    for (let i = 0; i < count; i++) best = Math.max(best, fill(from + i * step))
    return best
  }
  const edgeFill = {
    top: bandMax(minY, 1, bandH, rowFill),
    bottom: bandMax(maxY, -1, bandH, rowFill),
    left: bandMax(minX, 1, bandW, colFill),
    right: bandMax(maxX, -1, bandW, colFill),
  }
  const clipped = minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1
  return { ink, bbox: { x: minX, y: minY, width: bw, height: bh }, edgeFill, clipped }
}

/** Thresholds, exported so a failure message can quote them. */
export const TOFU_RULES = Object.freeze({
  blankInkRatio: 0.01, // candidate ink below 1% of the control's = drew nothing
  edgeFill: 0.9, // all four bbox edges ≥ 90% inked = a rectangle
  minHeightRatio: 0.5, // … that is at least half the control's height
  minWidthRatio: 0.25, // … and a quarter of the control's height wide
})

/**
 * Judge one glyph against the control glyph rendered at the same size.
 *
 * @param {ReturnType<typeof measureInk>} candidate
 * @param {ReturnType<typeof measureInk>} control
 * @returns {{ covered: boolean, reason: "ok" | "blank" | "rectangle" }}
 */
export function judgeGlyph(candidate, control) {
  if (!control.bbox) throw new Error("judgeGlyph: the control glyph rendered no ink — the render itself is broken")
  if (!candidate.bbox || candidate.ink < control.ink * TOFU_RULES.blankInkRatio) {
    return { covered: false, reason: "blank" }
  }
  const e = candidate.edgeFill
  const allEdges = Math.min(e.top, e.bottom, e.left, e.right) >= TOFU_RULES.edgeFill
  const glyphSized =
    candidate.bbox.height >= control.bbox.height * TOFU_RULES.minHeightRatio &&
    candidate.bbox.width >= control.bbox.height * TOFU_RULES.minWidthRatio
  if (allEdges && glyphSized) return { covered: false, reason: "rectangle" }
  return { covered: true, reason: "ok" }
}

/** "★" -> "U+2605"; multi-codepoint strings -> "U+0041 U+0301". */
export function codepointLabel(glyph) {
  return [...glyph].map((ch) => "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ")
}

const toCharRefs = (s) => [...s].map((ch) => `&#x${ch.codePointAt(0).toString(16)};`).join("")

/**
 * Probe document: the control glyph, then each candidate, one per fixed-size
 * cell, black on white, all at the same font size and family. Glyphs are
 * written as numeric character references so no encoding step can alter them.
 * The default family is the generic `sans-serif` with no web fonts, so what is
 * measured is exactly the OS fontconfig fallback the rendered posts rely on.
 *
 * @param {string[]} glyphs
 * @param {{ control?: string, fontSize?: number, fontFamily?: string, columns?: number }} [opts]
 */
export function buildGlyphProbe(glyphs, opts = {}) {
  const control = opts.control ?? "H"
  const fontSize = opts.fontSize ?? 120
  const fontFamily = opts.fontFamily ?? "sans-serif"
  const cellSize = Math.round(fontSize * 2)
  const all = [control, ...glyphs]
  const columns = Math.max(1, Math.min(opts.columns ?? 8, all.length))
  const rows = Math.ceil(all.length / columns)
  const cells = all.map((glyph, i) => ({
    glyph,
    role: i === 0 ? "control" : "candidate",
    x: (i % columns) * cellSize,
    y: Math.floor(i / columns) * cellSize,
    width: cellSize,
    height: cellSize,
  }))
  const body = cells
    .map(
      (c) =>
        `<div class="cell" style="left:${c.x}px;top:${c.y}px">${toCharRefs(c.glyph)}</div>`
    )
    .join("")
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `html,body{margin:0;padding:0;background:#fff}` +
    `.cell{position:absolute;width:${cellSize}px;height:${cellSize}px;display:flex;` +
    `align-items:center;justify-content:center;overflow:hidden;color:#000;` +
    `font-family:${fontFamily};font-size:${fontSize}px;line-height:1}` +
    `</style></head><body>${body}</body></html>`
  return { html, width: columns * cellSize, height: rows * cellSize, cells }
}

/**
 * Measure and judge every cell of a rasterized probe. The image may be at any
 * device scale factor; cell geometry is scaled from CSS pixels.
 *
 * @param {{ width: number, height: number, data: Uint8Array }} image
 * @param {ReturnType<typeof buildGlyphProbe>} probe
 */
export function assessGlyphProbe(image, probe) {
  const scale = image.width / probe.width
  const measure = (c) =>
    measureInk(image, { x: c.x * scale, y: c.y * scale, width: c.width * scale, height: c.height * scale })
  const [controlCell, ...candidateCells] = probe.cells
  const control = measure(controlCell)
  if (!control.bbox) throw new Error(`glyph probe: control "${controlCell.glyph}" rendered no ink — render is broken`)
  if (!judgeGlyph(control, control).covered) {
    throw new Error(`glyph probe: control "${controlCell.glyph}" itself looks like tofu — choose a covered control`)
  }
  const results = candidateCells.map((cell) => {
    const metrics = measure(cell)
    const verdict = judgeGlyph(metrics, control)
    return { glyph: cell.glyph, codepoints: codepointLabel(cell.glyph), ...verdict, metrics }
  })
  return { control: { glyph: controlCell.glyph, metrics: control }, results }
}

/** One human-readable line per result, for logs and failure messages. */
export function formatGlyphResult(r) {
  const m = r.metrics
  const size = m.bbox ? `${m.bbox.width}x${m.bbox.height}px` : "no ink"
  const edges = m.edgeFill
    ? ` edges t${m.edgeFill.top.toFixed(2)} b${m.edgeFill.bottom.toFixed(2)} l${m.edgeFill.left.toFixed(2)} r${m.edgeFill.right.toFixed(2)}`
    : ""
  return `${r.covered ? "PASS" : "FAIL"} ${r.glyph} ${r.codepoints} — ${r.reason} (${size}, ink ${m.ink}${edges})`
}
