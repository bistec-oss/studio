// Fixture for 007 AC-01 / AC-02: the Hearts Academy kit's vague phrases, built
// from the CLAUDE.md "adjective to measurable" table.
//
// Rows of that table the detector does NOT cover, by design:
//   - "IRP is fine on-image" is a naming permission (what the headline must
//     say), not a size, spacing, proportion or colour-share word.
//   - the seam row had no text to flag: the missing rule was the defect.
// Both stay in the text below to prove the detector ignores them.

export const HEARTS_PHRASES = {
  markSizeMatch: 'similar visual heights',
  clearSpace: 'generous clear space',
  canvasShare: 'primary canvas',
  edgeBlend: 'soft edge',
} as const

export const HEARTS_ADJECTIVE_TEXT = [
  'Hearts Academy posts use a teal-to-green gradient.',
  'Place the Hearts Academy and BISTEC Global logos in a compact pill with similar visual heights.',
  'Keep generous clear space around the lockup.',
  'The teal-to-green gradient is the primary canvas, with navy for accent bands.',
  'The photo sits in its own panel, with a soft edge where the photo meets the type.',
  'IRP is fine on-image.',
].join(' ')

// Brand-voice words: the detector must flag none of them.
export const BRAND_VOICE_WORDS = [
  'warm',
  'confident',
  'friendly',
  'bold',
  'modern',
  'clean',
  'professional',
  'approachable',
] as const

export const BRAND_VOICE_TEXT = `Voice: ${BRAND_VOICE_WORDS.join(', ')}. Copy is warm and confident, never pushy.`
