import type { ResolvedBrandKit } from './resolve'
import { findFamily } from '@/lib/fonts/catalogue'
import { googleFontsUrl } from '@/lib/fonts/url'
import { postFontPlan } from '@/lib/fonts/plan'

// 031 FR-19, FR-23: a catalogue family's request is recomputed from its name (the stored url of
// a Google entry never reaches a prompt); any other entry, such as a FONT artifact upload, keeps
// its stored url.
function fontEntry(f: { name: string; url: string }): string {
  const url = findFamily(f.name) ? googleFontsUrl([f.name], findFamily) : f.url
  return `${f.name} (${url})`
}

// 031 FR-23: one line per script font. The app adds it to every font stack (applyPostFonts), so
// the line tells the model it is loaded; correctness never depends on the model naming it.
const SCRIPT_LABEL: Record<string, string> = { sinhala: 'Sinhala' }
function scriptFontLines(kit: ResolvedBrandKit | null): string {
  const scripts = kit?.scriptFonts ?? null
  if (!scripts) return ''
  const plan = postFontPlan({ scriptFonts: scripts })
  return Object.entries(scripts)
    .filter(([, family]) => plan.scriptFamilies.includes(family))
    .map(([script, family]) => `\n- ${SCRIPT_LABEL[script] ?? script} text: ${family} (loaded for you)`)
    .join('')
}

// The labeled logo block: primary first and marked, so the design agent can pick
// the variant that fits (and fall back to the primary). data: URIs are already
// excluded upstream (buildLogoList) — base64 must never reach a prompt.
function logoBlock(kit: ResolvedBrandKit | null): string {
  const logos = kit?.logos ?? []
  if (logos.length === 0) return '- Logos: none'
  const lines = logos
    .map((l) => `    • ${l.primary ? '[primary] ' : ''}${l.label}: ${l.url}`)
    .join('\n')
  return `- Logos (pick the variant that fits the design; use the primary if unsure):\n${lines}`
}

export function buildBrandKitSystemContext(kit: ResolvedBrandKit | null): string {
  const colors = kit?.colors.join(', ') || 'none specified'
  const fonts = kit?.fonts.length
    ? kit.fonts.map(fontEntry).join(', ')
    : 'system fonts'
  const voicePrompt = kit?.voicePrompt ?? 'not specified'
  return `Brand guidelines:\n- Colors: ${colors}\n- Fonts: ${fonts}${scriptFontLines(kit)}\n${logoBlock(kit)}\n- Brand voice: ${voicePrompt}`
}
