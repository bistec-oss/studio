// The public surface of the facts check (027). The pure part (types, normalise,
// extract, compare) is client-safe. sources.ts and refresh.ts read the database
// and are imported by path from server code only (they are not re-exported
// here, so a client import of this index stays pure).
export * from './types'
export { toAsciiDigits, parseNumber } from './normalize'
export { extractValues, stripNoise, blankExempt } from './extract'
export { checkFacts, checkFactsWithKeys, factsCheckError } from './compare'
