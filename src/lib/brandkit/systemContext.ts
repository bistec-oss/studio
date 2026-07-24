import type { ResolvedBrandKit } from './resolve'

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
    ? kit.fonts.map((f) => `${f.name} (${f.url})`).join(', ')
    : 'system fonts'
  const voicePrompt = kit?.voicePrompt ?? 'not specified'
  return `Brand guidelines:\n- Colors: ${colors}\n- Fonts: ${fonts}\n${logoBlock(kit)}\n- Brand voice: ${voicePrompt}`
}
