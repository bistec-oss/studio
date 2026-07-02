// Static option lists and copy for the brief wizard steps.

import React from 'react'
import { Square, RectangleVertical } from 'lucide-react'
import type { AspectRatio } from '@prisma/client'
import { dimensionsLabel } from '@/lib/aspectRatio'
import { CHANNEL_VALUES } from '@/lib/channels'

// Channels are no longer chosen at brief time — the publish step picks them. Every
// brief targets both feeds by default; the brief now captures the post SIZE instead.
export const DEFAULT_CHANNELS = CHANNEL_VALUES

// Campaign comes first so its assigned brand kit (campaign → project) can default
// the brand-kit selection on the next step, which in turn filters the templates.
export const STEPS = ['Campaign', 'Size & Design', 'Content', 'Images', 'Review']

// Post size options shown on step 1. Dimensions/labels come from the shared lib so
// the wizard, the render pipeline, and the previews never disagree.
export const ASPECT_OPTIONS: { value: AspectRatio; icon: React.ElementType; sub: string }[] = [
  { value: 'SQUARE', icon: Square, sub: dimensionsLabel('SQUARE') },
  { value: 'PORTRAIT', icon: RectangleVertical, sub: dimensionsLabel('PORTRAIT') },
]

export const GOAL_OPTIONS = [
  { value: 'awareness', label: 'Awareness' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'conversion', label: 'Conversion' },
  { value: 'hiring', label: 'Hiring' },
  { value: 'announcement', label: 'Announcement' },
]

export const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'bold', label: 'Bold' },
  { value: 'empathetic', label: 'Empathetic' },
]

export const SOURCE_LABEL: Record<string, string> = {
  explicit: 'Selected for this post',
  campaign: 'Campaign override',
  project: 'Inherited from project',
  system: 'System default',
}
