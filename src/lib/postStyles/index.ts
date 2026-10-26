// The public surface of post styles (027). The raw `styles` record is NOT
// exported here: a guard test bans importing `postStyles/styles` outside this
// directory, so every reader goes through the resolver.
export * from './types'
export { activeStyles, getStyle, isStyleKey, POST_STYLES_REVISION } from './styles'
export {
  resolvePostStyle,
  legacyGoalStyle,
  type ResolveInput,
  type ResolveNote,
  type ResolveResult,
  type Surface,
} from './resolve'
export {
  postStyleStampSchema,
  parsePostStyleStamp,
  stampFor,
  rulesAtStamp,
  styleSummary,
  derivedPromptVersion,
  type PostStyleStamp,
} from './stamp'
export { checklistPromptText, CHECKLIST_PREAMBLE } from './promptText'
