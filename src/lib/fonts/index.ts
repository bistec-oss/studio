// Client-safe exports only: types, the pure URL builder, the pure merge and the pure validators.
// The catalogue lookup (`./catalogue`) is server-only and is imported by its own path.
export * from './types'
export { googleFontsUrl } from './url'
export { mergeCatalogue } from './merge'
export {
  validateKitFonts,
  validateScriptFonts,
  MAX_KIT_FONTS,
  type KitFont,
} from './validateKitFonts'
