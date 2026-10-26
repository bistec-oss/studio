'use client'

import React from 'react'

// Small presentational helpers shared across the brand kit admin components
// (ColorEditor, KitDetail, and the brand kits list page).

interface ColorSwatchProps {
  color: string
  // Hidden from assistive tech where the swatch sits inside a control whose
  // name it would otherwise extend (the kit-list row, 014 FR-16). The title
  // tooltip stays for sighted users.
  decorative?: boolean
}

// A kit colour, shown as the kit's own value: the fill comes from data and is
// never token-styled. Only its frame (a --line edge) is chrome.
export function ColorSwatch({ color, decorative }: ColorSwatchProps) {
  return (
    <span
      className="inline-block h-5 w-5 flex-shrink-0 rounded-ui-sm border border-line"
      style={{ backgroundColor: color }} // ui-exception: brand-kit swatch, the kit's own colour from data
      title={color}
      aria-hidden={decorative ? 'true' : undefined}
    />
  )
}
