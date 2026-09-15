// Refine (AGUI) prompt builders — one source for the API tool-use loop and the
// CLI single-shot runner. The brand-conflict compliance protocol only exists in
// API mode (CLI mode applies the edit directly — a documented behavioral fork).

import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'
import type { PipelineMode } from '@/lib/agent/config'
import {
  INSTRUCTION_CLASSES,
  INSTRUCTION_CLASS_KEYS,
  type InstructionClass,
} from '@/lib/agent/instructionClasses'
import { DEFAULT_INSTRUCTION_CLASSES } from '@/lib/agent/refineEnvelope'
import { placeholderNote, SCRIPT_SUPPORT_NOTE } from './shared'

export interface RefinePromptOptions {
  kit: ResolvedBrandKit
  mode: PipelineMode
  width: number
  height: number
  hasInlineAssets: boolean
  // Freshly generated background image (agent/background.ts refine pre-step) —
  // present only when the instruction asked for a new background.
  backgroundImageUrl?: string | null
}

// ---------------------------------------------------------------------------
// Classification (FR-01/03/04/05)
// ---------------------------------------------------------------------------

// The per-class rules, rendered straight out of the one table (FR-06/AC-19).
// These strings are NOT paraphrased here and must not be: each `semantics`
// string defines the format of `supersedes` as a VERBATIM substring of the
// current HTML, and the matching post-condition in instructionClasses.ts looks
// for those locators literally. Summarise the locator sentences away and
// `replace`/`remove` miss almost every time.
function instructionClassBlock(): string {
  const rules = INSTRUCTION_CLASS_KEYS.map((key) => `- ${INSTRUCTION_CLASSES[key].semantics}`).join('\n')
  return `Instruction classes — how much of the design this edit licenses you to change:
${rules}

An instruction with more than one clause can carry more than one class; list all of them. If you cannot classify it cleanly, answer "${DEFAULT_INSTRUCTION_CLASSES.join(', ')}" — keeping everything and doing what was asked is always the safe reading. Your output is checked against the class you declare, so declare the one you actually applied.`
}

// The reply format the route parses (refineEnvelope.ts). Two header lines in
// front of the document, which land OUTSIDE it and so travel in the region
// extractHtmlDocument already isolates. Kept in one place beside the class
// block so the format asked for and the format parsed are edited together.
function envelopeProtocol(): string {
  return `- Begin your reply with exactly these two lines, in this order, before anything else:
  REFINE-CLASSES: <the class names above that apply, separated by commas>
  REFINE-SUPERSEDES: <each verbatim substring you deleted, separated by SEMICOLONS — write "none" if you deleted nothing>
- Then output the complete updated HTML document, starting with <!DOCTYPE html> and ending with </html>. No markdown code fences, no commentary before, between, or after.`
}

export interface EffectiveClassification {
  /** The classes the edit is actually judged against. Never empty. */
  classes: InstructionClass[]
  /** Destructive classes dropped for want of a named target. Empty on the normal path. */
  downgraded: InstructionClass[]
}

// FR-04's two destructive classes, named by the requirement rather than derived
// from the table: the table records what each class licenses, not whether its
// licence is destructive, and inventing a flag there to re-derive this list
// would be a second definition of the same fact.
const DESTRUCTIVE_CLASSES: readonly InstructionClass[] = ['replace', 'remove']

/**
 * FR-04 — `replace` and `remove` are permitted ONLY with a non-empty
 * `supersedes`. A destructive class with nothing named cannot delete anything:
 * there is no locator to prove absent, so the edit is unmeasurable in the
 * direction that matters, and a model that names no target has not told us what
 * it destroyed. That is exactly FR-05's ambiguity, so it resolves the same way —
 * to the preserving default, WHOLE, not by cherry-picking the surviving classes
 * (the same strictness refineEnvelope applies to an unrecognized class name:
 * keeping `remove` out of "remove, constrain" would act destructively on a
 * classification we only half understood).
 *
 * Pure, so the rule is testable without a route or a database. The route calls
 * it — the prompt is not trusted to have required a target, and neither is the
 * parser, which reports `supersedes` exactly as stated and leaves the decision
 * here on purpose.
 */
export function resolveEffectiveClasses(
  classes: readonly InstructionClass[],
  supersedes: readonly string[],
): EffectiveClassification {
  const named = supersedes.filter((s) => s.trim().length > 0)
  const downgraded = named.length === 0 ? classes.filter((c) => DESTRUCTIVE_CLASSES.includes(c)) : []
  if (downgraded.length === 0) return { classes: [...classes], downgraded: [] }
  return { classes: [...DEFAULT_INSTRUCTION_CLASSES], downgraded }
}

// Instruction fragment injected when the refine pre-step generated a new background.
function backgroundNote(backgroundImageUrl?: string | null): string {
  return backgroundImageUrl
    ? `\n\nNew background image: a background image has been generated for this instruction at ${backgroundImageUrl} — replace the design's current background with it (full-bleed: CSS background-image with background-size: cover, or an absolutely-positioned <img> behind the content), adding a subtle scrim/overlay where needed so text stays legible.`
    : ''
}

export function buildRefineSystemPrompt(opts: RefinePromptOptions): string {
  const { kit, mode, width, height, hasInlineAssets, backgroundImageUrl } = opts

  if (mode === 'cli') {
    // NOTE the blanket "Preserve everything the instruction does not touch" that
    // used to open this prompt is gone (FR-03): applied to a replacement it
    // licensed exactly the wrong thing — the model kept the superseded visual
    // AND added the new one, so the design carried both. What may be preserved
    // and what must be deleted is now the declared class's business.
    return `You are a design refinement agent. Apply the user's instruction as a targeted edit to the HTML, staying on-brand.

${buildBrandKitSystemContext(kit)}${placeholderNote(hasInlineAssets)}${backgroundNote(backgroundImageUrl)}

${instructionClassBlock()}

Output protocol (single-shot — you have NO tools):
${envelopeProtocol()}
- Apply the user's instruction as a targeted edit to the HTML above, within the rules of the class(es) you declared. Change nothing those rules do not license.
- Keep the ${width}×${height} px canvas size unless the instruction explicitly asks to resize it.
- Do NOT add external image/CDN references other than any URL explicitly named in the instruction or this system prompt. Brand font @import URLs are allowed.
- Preserve any non-Latin text (e.g. Sinhala සිංහල) exactly — never transliterate or drop glyphs. "Noto Sans Sinhala" is available and the renderer also falls back to it automatically.
- The two header lines and the document are the WHOLE reply. Nothing else — the old "output only the HTML document" rule now means "only the two header lines and the HTML document".`
  }

  return `You are a design refinement agent. Here is the current HTML design. Apply the user's instruction as a targeted edit — change only what the instruction requires and preserve everything else.

${buildBrandKitSystemContext(kit)}${backgroundNote(backgroundImageUrl)}
${SCRIPT_SUPPORT_NOTE}

Compliance instructions:
Before applying any change, check if it conflicts with the brand kit (e.g. introducing off-brand colors, removing the logo, replacing brand fonts). If it does NOT conflict, apply the change and call renderHtml(html, ${width}, ${height}) as your final step to produce the finished PNG.

If the change WOULD conflict with the brand kit, do NOT apply it and do NOT call renderHtml. Instead, your final text response must be ONLY a single JSON object, with no other text, in exactly this form:
{ "conflict": true, "explanation": "<why this conflicts with the brand kit>", "pendingHtml": "<the full modified HTML as you would have applied it>" }${placeholderNote(hasInlineAssets)}`
}

export interface RefineUserMessageOptions {
  slimHtml: string
  hasHtml: boolean
  instruction: string
  width: number
  height: number
  /**
   * FR-11's single retry: the MEASUREMENT that the previous attempt failed, as
   * verifyRefine stated it. Absent on the first attempt. A model told "the text
   * 'Our mission' is still present in your output" can act; one told "you did it
   * wrong" cannot — which is why the verifier returns a measurement and this
   * renders it verbatim.
   */
  priorMiss?: string
}

// The miss text is largely pipeline-measured, but an `add` miss can carry up to
// 400 characters of the verifier model's own `evidence` string — model text on
// its way back into a model prompt. Capped rather than fenced: it is read here
// as one more line of the task description, and wrapping our own measurement in
// an untrusted-content fence would tell the model to discount the very sentence
// it has to act on.
const MAX_PRIOR_MISS_CHARS = 1_000

function retryNote(priorMiss?: string): string {
  if (!priorMiss?.trim()) return ''
  return `

SECOND AND FINAL ATTEMPT — your previous reply did NOT apply this instruction. The pipeline measured the output and found:

${priorMiss.trim().slice(0, MAX_PRIOR_MISS_CHARS)}

Fix exactly that. The design above is still the one to edit — your previous attempt was discarded, so do not assume any of it is in place. Reply in the same REFINE-CLASSES / REFINE-SUPERSEDES / document format.`
}

export function buildRefineUserMessage(opts: RefineUserMessageOptions): string {
  const { slimHtml, hasHtml, instruction, width, height, priorMiss } = opts
  return `Current HTML design:

${hasHtml ? slimHtml : `(no current HTML — start from a blank ${width}×${height} canvas)`}

Instruction: ${instruction}${retryNote(priorMiss)}`
}
