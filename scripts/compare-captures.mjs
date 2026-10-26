// Pixel-exact compare of two capture-ui.mjs runs (change 014, AC-04).
//
// A review tool, not a gate, like capture-ui.mjs: nothing imports it. For each
// PNG in <before-dir> it decodes the same-named PNG in <after-dir> with sharp
// (raw RGBA), compares every pixel exactly, and writes a red-on-grey diff PNG
// to <diff-dir> for any shot with a differing pixel. Shots of different sizes
// are compared over the larger canvas; a pixel only one of them has counts as
// differing.
//
// Usage:
//   node scripts/compare-captures.mjs <before-dir> <after-dir> <diff-dir> [--expect <glob>...] [--noise <file>]
//
//   --expect <glob>  marks matching shots as expected drift (repeatable;
//                    `*` and `?` wildcards, matched against the file name with
//                    or without `.png`), e.g. --expect 'draft-*'
//   --noise <file>   the noise list: one shot name (or glob) per line, the shots
//                    that differ between two runs of unchanged code. Default
//                    <before-dir>/../noise.txt; a missing file is an empty list.
//
// Prints "identical N, different M, total T", then one line per differing shot
// with its pixel count and whether it is expected, noise or unexpected.
// Exits 1 if any differing shot is neither expected nor noise.

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

let sharp
try {
  sharp = (await import('sharp')).default
} catch (err) {
  console.error(
    `[compare-captures] cannot load sharp (${err.message}). It ships as a Next.js dependency; run \`npm install\`.`,
  )
  process.exit(1)
}

function log(msg) {
  console.log(`[compare-captures] ${msg}`)
}

function usage(msg) {
  console.error(`[compare-captures] ${msg}`)
  console.error(
    'usage: node scripts/compare-captures.mjs <before-dir> <after-dir> <diff-dir> [--expect <glob>...] [--noise <file>]',
  )
  process.exit(1)
}

const positional = []
const expect = []
let noiseArg = null
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--expect' || args[i] === '--noise') {
    const value = args[++i]
    if (!value) usage(`${args[i - 1]} needs a value`)
    if (args[i - 1] === '--expect') expect.push(value)
    else noiseArg = value
  } else {
    positional.push(args[i])
  }
}
if (positional.length !== 3) usage('expected <before-dir> <after-dir> <diff-dir>')
const [BEFORE, AFTER, DIFF] = positional.map((p) => resolve(p))
if (!existsSync(BEFORE)) usage(`no such directory: ${BEFORE}`)
if (!existsSync(AFTER)) usage(`no such directory: ${AFTER}`)

const NOISE_FILE = resolve(noiseArg ?? join(dirname(BEFORE), 'noise.txt'))
const noise = existsSync(NOISE_FILE)
  ? readFileSync(NOISE_FILE, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  : []

function globToRegExp(glob) {
  const body = glob
    .replace(/\.png$/i, '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${body}$`)
}
const expectRes = expect.map(globToRegExp)
const noiseRes = noise.map(globToRegExp)
const matches = (res, name) => res.some((re) => re.test(name))

async function decode(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

// Count differing pixels and build the diff: the before shot as faint grey,
// every differing pixel solid red.
async function compare(beforeFile, afterFile, diffFile) {
  const a = await decode(beforeFile)
  const b = await decode(afterFile)
  const width = Math.max(a.width, b.width)
  const height = Math.max(a.height, b.height)
  const out = Buffer.alloc(width * height * 3)
  let differing = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inA = x < a.width && y < a.height
      const inB = x < b.width && y < b.height
      const ia = (y * a.width + x) * 4
      const ib = (y * b.width + x) * 4
      const o = (y * width + x) * 3
      let same = inA && inB
      if (same) {
        for (let c = 0; c < 4; c++) {
          if (a.data[ia + c] !== b.data[ib + c]) {
            same = false
            break
          }
        }
      }
      if (same) {
        const lum = 0.299 * a.data[ia] + 0.587 * a.data[ia + 1] + 0.114 * a.data[ia + 2]
        const grey = Math.round(192 + lum / 4)
        out[o] = out[o + 1] = out[o + 2] = grey
      } else {
        differing++
        out[o] = 255
        out[o + 1] = 0
        out[o + 2] = 0
      }
    }
  }
  if (differing > 0) {
    await sharp(out, { raw: { width, height, channels: 3 } })
      .png()
      .toFile(diffFile)
  }
  const sizeNote =
    a.width !== b.width || a.height !== b.height
      ? ` (size ${a.width}×${a.height} → ${b.width}×${b.height})`
      : ''
  return { differing, sizeNote }
}

async function main() {
  mkdirSync(DIFF, { recursive: true })
  log(`${BEFORE} → ${AFTER} (diffs in ${DIFF})`)
  log(`noise list: ${NOISE_FILE}${existsSync(NOISE_FILE) ? ` (${noise.length})` : ' (none)'}`)

  const shots = readdirSync(BEFORE)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort()
  let identical = 0
  const different = []
  for (const file of shots) {
    const name = basename(file, '.png')
    const afterFile = join(AFTER, file)
    let result
    if (!existsSync(afterFile)) {
      result = { differing: Infinity, sizeNote: ' (missing in after)' }
    } else {
      result = await compare(join(BEFORE, file), afterFile, join(DIFF, file))
    }
    if (result.differing === 0) {
      identical++
      continue
    }
    const kind = matches(expectRes, name)
      ? 'expected'
      : matches(noiseRes, name)
        ? 'noise'
        : 'UNEXPECTED'
    different.push({ name, ...result, kind })
  }

  console.log(`identical ${identical}, different ${different.length}, total ${shots.length}`)
  for (const d of different) {
    const count = d.differing === Infinity ? '-' : String(d.differing)
    console.log(`  ${d.name}: ${count} px${d.sizeNote} [${d.kind}]`)
  }
  const unexpected = different.filter((d) => d.kind === 'UNEXPECTED').length
  if (unexpected > 0) {
    log(`${unexpected} differing shot(s) are neither expected nor noise`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`[compare-captures] failed: ${err.stack ?? err}`)
  process.exit(1)
})
