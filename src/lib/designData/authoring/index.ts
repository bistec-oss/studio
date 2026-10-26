// The authoring dataset's one entry point. NOT re-exported by
// `src/lib/designData/index.ts`: generation code imports that module and must
// never be able to reach these keys (007 FR-16, a guard test enforces it).
import { entries } from './entries'

export const authoring = { entries } as const

export * from './entries'
export * from './measurable'
export * from './detect'
export * from './validate'
export * from './roles'
export * from './typography'
