// Fonts and colours are named by role, never by literal (007 FR-09): the
// replacement says "brand colour 1", so changing the kit's colours leaves the
// prompt true. The kit has no explicit font role, so the first font is "the
// headline font" and the second "the body font" (spec A2). Pure.

export interface RoleKit {
  colors: readonly string[]
  fonts: ReadonlyArray<{ name: string }>
}

export function buildRoleList(kit: RoleKit): string[] {
  const roles: string[] = []
  if (kit.fonts[0]) roles.push('the headline font')
  if (kit.fonts[1]) roles.push('the body font')
  kit.colors.forEach((_, i) => roles.push(`brand colour ${i + 1}`))
  return roles
}

const HEX = /#[0-9a-f]{3,8}(?![0-9a-z])/iu
const URL_LIKE = /https?:\/\/|www\./iu
const HTML_TAG = /<\/?[a-z][^>]*>/iu

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * True when the text holds something a replacement may not carry: a hex colour,
 * a URL, an HTML tag, a code fence, or a font name from the kit (any case).
 */
export function containsForbidden(text: string, kit: RoleKit): boolean {
  if (HEX.test(text) || URL_LIKE.test(text) || HTML_TAG.test(text) || text.includes('```'))
    return true
  for (const color of kit.colors) {
    if (color && text.toLowerCase().includes(color.toLowerCase())) return true
  }
  for (const font of kit.fonts) {
    const name = font.name.trim()
    if (!name) continue
    if (
      new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRegExp(name)}(?![\p{L}\p{N}])`, 'iu').test(
        text,
      )
    )
      return true
  }
  return false
}
