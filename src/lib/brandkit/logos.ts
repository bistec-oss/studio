// A logo is a BrandKitArtifact type='LOGO' (name = label). BrandKit.logoUrl is
// the primary pointer. These pure helpers own the "which logo is primary / how
// do we present them to the model" policy — no DB, no side effects.

export interface LogoEntry {
  label: string
  url: string
  primary: boolean
}

const isDataUrl = (u: string) => u.startsWith('data:')

// Build the labeled logo list for prompts. data: URLs are excluded (incident
// guard). A legacy kit whose logoUrl matches no artifact still yields one
// unlabeled primary. Primary-first, otherwise input order preserved.
export function buildLogoList(
  logoArtifacts: { name: string; url: string }[],
  logoUrl: string | null,
): LogoEntry[] {
  const primaryUrl = logoUrl && !isDataUrl(logoUrl) ? logoUrl : null
  const entries: LogoEntry[] = []
  const seen = new Set<string>()

  for (const a of logoArtifacts) {
    if (isDataUrl(a.url)) continue
    entries.push({ label: a.name || 'Logo', url: a.url, primary: a.url === primaryUrl })
    seen.add(a.url)
  }
  if (primaryUrl && !seen.has(primaryUrl)) {
    entries.unshift({ label: 'Primary logo', url: primaryUrl, primary: true })
  }

  // Stable primary-first sort (Array.prototype.sort is stable in modern V8).
  return entries.slice().sort((x, y) => (x.primary === y.primary ? 0 : x.primary ? -1 : 1))
}

// Should a freshly-uploaded LOGO auto-become the primary? Only the FIRST one —
// when there is no other logo and no primary set yet.
export function shouldBecomePrimary(existingLogoCount: number, logoUrl: string | null): boolean {
  return existingLogoCount === 0 && !logoUrl
}

// After deleting the current primary, choose the next primary from what remains
// (prefer a usable non-data URL), or null when no logos remain.
export function pickNextPrimaryUrl(remainingLogoUrls: string[]): string | null {
  return remainingLogoUrls.find((u) => !isDataUrl(u)) ?? remainingLogoUrls[0] ?? null
}
