// Fixtures for the hero sampler and layout tests (change 009, T3).
//
// Image fixtures are HTML rasterized through the production renderer at test
// time (renderHtmlToPng, at 2x), so the pixels the sampler reads are real
// Chromium output, not hand-built bytes. The one exception is the A3 one-pixel
// grid, which is encoded in Node: a pixel-exact pattern cannot go through a
// 2x rasterizer and stay a one-pixel pattern. Everything here is SYNTHETIC; the
// thresholds tuned on it say nothing about the fallback rate on real model
// images (that is OP-1's evidence).
import { deflateSync } from "node:zlib"
import { renderHtmlToPng } from "@/lib/renderer/puppeteer"

export type Shape = "SQUARE" | "PORTRAIT"
// The 009 fixtures stay on Shape; the 028 look fixtures add the 9:16 shape.
export type LookShape = Shape | "STORY"

// Image pixels the fixtures produce (css viewport x2).
export const IMAGE_PX: Record<LookShape, { w: number; h: number }> = {
  SQUARE: { w: 1024, h: 1024 },
  PORTRAIT: { w: 1024, h: 1536 },
  STORY: { w: 1024, h: 1536 },
}
// The post canvas for each shape.
export const CANVAS: Record<LookShape, { width: number; height: number }> = {
  SQUARE: { width: 1080, height: 1080 },
  PORTRAIT: { width: 1080, height: 1350 },
  STORY: { width: 1080, height: 1920 },
}

export const toDataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`

// Rasterize a page whose body fills the image at half size (the renderer is 2x).
export async function raster(shape: LookShape, bodyCss: string, inner = ""): Promise<string> {
  const { w, h } = IMAGE_PX[shape]
  const html =
    `<!doctype html><html><head><style>html,body{margin:0;width:${w / 2}px;height:${h / 2}px;overflow:hidden}` +
    `body{position:relative;${bodyCss}}.abs{position:absolute;left:0;width:100%}</style></head><body>${inner}</body></html>`
  return toDataUrl(await renderHtmlToPng(html, w / 2, h / 2, null))
}

export const CALM = "background:linear-gradient(135deg,#0b1220,#16243a)"
// 4 css px black / 4 css px white vertical stripes (8 image px each at 2x).
export const STRIPES = "repeating-linear-gradient(90deg,#000 0 4px,#fff 4px 8px)"

// A calm dark gradient: the image a hero archetype wants behind light text.
export const calmDark = (shape: Shape) => raster(shape, CALM)
// A busy black/white stripe pattern.
export const busyStripes = (shape: Shape) => raster(shape, `background:${STRIPES}`)
// A flat mid grey (#808080, L about 0.216): calm, but too light for white text.
export const midGrey = (shape: Shape) => raster(shape, "background:#808080")

// A 1024x1536 image, calm dark, with a busy stripe band either only in rows the
// cover fit crops off a 1080x1350 canvas (image rows 0..119 and 1416..1535;
// the visible rows are 128..1408) or inside the visible rows (600..719).
export const cropRowsBusy = (where: "cropped" | "visible") => {
  const band = (top: number, height: number) =>
    `<div class="abs" style="top:${top / 2}px;height:${height / 2}px;background:${STRIPES}"></div>`
  const inner = where === "cropped" ? band(0, 120) + band(1416, 120) : band(600, 120)
  return raster("PORTRAIT", CALM, inner)
}

// ── A3: a one-pixel checkerboard, encoded in Node ────────────────────────────

let crcTable: Uint32Array | null = null
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Encode RGBA (8-bit, non-interlaced) as a PNG with no colour chunks, so the
// browser applies no colour management and the bytes are the pixels.
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, "latin1"), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

// A one-pixel black/white checkerboard. `transparentLeft` makes the left half
// fully transparent (the alpha-drop case).
export function checkerboard(size: number, opts: { transparentLeft?: boolean } = {}): string {
  const rgba = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = (x + y) % 2 === 0 ? 0 : 255
      const i = (y * size + x) * 4
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v
      rgba[i + 3] = opts.transparentLeft && x < size / 2 ? 0 : 255
    }
  }
  return toDataUrl(encodePng(size, size, rgba))
}

// ── Layout page (hero-layout.test.ts) ────────────────────────────────────────

const svgUrl = (w: number, h: number, fill: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`
  ).toString("base64")}`

export const KIT_LOGO = svgUrl(120, 60, "#c00")
export const BRIEF_IMAGE = svgUrl(200, 200, "#0a0")
export const BACKGROUND = svgUrl(40, 40, "#123")

// A 1080x1080 post: text in the left column, the kit logo bottom-left, a
// background image, a full-bleed decoration, a brief image on the right, and
// three kinds of hidden text. `extra` is spliced in before </body>.
export function layoutPage(extra = ""): string {
  return `<!doctype html><html><head><style>
html,body{margin:0;width:1080px;height:1080px;overflow:hidden;font-family:Arial,sans-serif;background:#0b1220;color:#fff}
.bg{position:absolute;left:0;top:0;width:1080px;height:1080px;background-image:url('${BACKGROUND}');background-size:cover}
.fullbleed{position:absolute;left:0;top:0;width:1080px;height:1080px}
.col{position:absolute;left:60px;top:80px;width:440px}
h1{margin:0;font-size:56px;line-height:64px}
.logo{position:absolute;left:60px;top:900px;width:120px;height:60px}
.brief{position:absolute;left:700px;top:300px;width:300px;height:300px}
</style></head><body>
<div class="bg"></div>
<img class="fullbleed" src="${BACKGROUND}">
<div class="col"><h1>Hi</h1></div>
<img class="logo" src="${KIT_LOGO}">
<img class="brief" src="${BRIEF_IMAGE}">
<p style="display:none">display none words</p>
<p style="visibility:hidden;position:absolute;left:700px;top:700px">hidden words</p>
<p style="opacity:0;position:absolute;left:700px;top:800px">transparent words</p>
${extra}
</body></html>`
}
