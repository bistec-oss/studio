// The design-data module. `designData` is the one object 007 extends with its
// own sections (typography, kit rules) beside `composition`; neither section
// knows the other's contents. Pure and client-safe (see composition.ts).
import { archetypes } from './composition'
import { lookDatasetProblems } from './validate'

export const designData = { composition: { archetypes } } as const

// A bad row fails at load outside production (the postStyles/styles.ts pattern);
// production never throws at import, the unit test is the gate.
if (process.env.NODE_ENV !== 'production') {
  const problems = lookDatasetProblems(archetypes)
  if (problems.length > 0) throw new Error('design data: ' + problems.join('; '))
}

export * from './composition'
export * from './regions'
export * from './evaluate'
export * from './layout'
export * from './plan'
export * from './stamp'
export * from './promptText'
export * from './validate'
export * from './composite'
