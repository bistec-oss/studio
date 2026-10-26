// 024 FR-11 / AC-13: apiId === cliArg for every catalogue entry.
//
// resolve.ts sends `arg` (apiId in API mode, cliArg in CLI mode) across the
// boundary. A team on the API key route in a CLI-mode server runs the SDK with
// the CLI-mode `arg`, so the two strings must stay equal, or that team would
// send a CLI alias to the SDK. The `arg` rework (making `arg` follow the route)
// was cut from 024; this guard moves its cost to the one change that diverges
// the strings. Shown failing on a planted catalogue, as modelCatalogue.test.ts does.

import { describe, it, expect } from 'vitest'
import { CATALOGUE, type Catalogue } from '@/lib/models/catalogue'

function parityProblems(catalogue: Catalogue): string[] {
  return catalogue
    .filter((e) => e.apiId !== e.cliArg)
    .map(
      (e) =>
        `${e.key}: apiId and cliArg diverged. API_KEY teams in a CLI-mode server send cliArg to the SDK; make arg follow the route (ResolvedModel takes the route) before these diverge.`,
    )
}

describe('apiId === cliArg (024 FR-11)', () => {
  it('holds for every catalogue entry', () => {
    expect(parityProblems(CATALOGUE)).toEqual([])
  })

  it('fails, naming the deferred decision, on a catalogue where one entry diverges', () => {
    const planted = CATALOGUE.map((e) => ({ ...e }))
    planted[1].cliArg = 'sonnet'
    const problems = parityProblems(planted)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('SONNET')
    expect(problems[0]).toContain(
      'API_KEY teams in a CLI-mode server send cliArg to the SDK; make arg follow the route',
    )
  })
})
