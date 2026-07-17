import type { ResolvedBrandKit } from './resolve'

export function buildBrandKitSystemContext(kit: ResolvedBrandKit | null): string {
  const colors = kit?.colors.join(', ') || 'none specified'
  const fonts = kit?.fonts.length ? kit.fonts.map((f) => `${f.name} (${f.url})`).join(', ') : 'system fonts'
  // data: URIs are unreadable base64 that blow the model context — never emit
  // them into a prompt; render the logo as absent instead.
  const logoUrl = kit?.logoUrl && !kit.logoUrl.startsWith('data:') ? kit.logoUrl : 'none'
  const voicePrompt = kit?.voicePrompt ?? 'not specified'
  return `Brand guidelines:\n- Colors: ${colors}\n- Fonts: ${fonts}\n- Logo URL: ${logoUrl}\n- Brand voice: ${voicePrompt}`
}
