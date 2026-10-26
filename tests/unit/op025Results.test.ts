// 025 T6: device-screen v1 may declare a size only if that size passed the
// real-image check (OP-025): 2 attempts that kept the look and that the user
// accepted. The evidence is the committed results file. OP-025 passed all three
// sizes on 2026-10-26 (after Amendment A1), so no size was removed from v1.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { probeVerdicts } from '../../scripts/look-check/lookCheck.mjs'
import { archetypes } from '@/lib/designData/composition'

const RESULTS_PATH = join(process.cwd(), '.specclaw/changes/025-hero-reference-images/look-check/results.json')
const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'))
const verdicts = probeVerdicts(results) as Record<string, { passed: boolean; accepted: number; status: string }>

describe('OP-025 gates device-screen v1 (025 T6)', () => {
  const v1 = archetypes['device-screen'].versions[1]
  const declared = Object.keys(v1.sizes)

  it('declares exactly SQUARE, PORTRAIT and STORY, the sizes that passed', () => {
    expect(declared.sort()).toEqual(['PORTRAIT', 'SQUARE', 'STORY'])
  })

  for (const size of ['SQUARE', 'PORTRAIT', 'STORY']) {
    it(`${size}: every declared size has a passing verdict (2 kept and accepted)`, () => {
      if (!declared.includes(size)) return
      expect(verdicts[`device-screen:${size}`]).toMatchObject({ passed: true, status: 'pass' })
      expect(verdicts[`device-screen:${size}`].accepted).toBeGreaterThanOrEqual(2)
    })
  }

  it('stays inside the cap of 9 attempts', () => {
    const ledger = readFileSync(join(process.cwd(), '.specclaw/changes/025-hero-reference-images/look-check/ledger.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
    expect(ledger.length).toBeLessThanOrEqual(9)
  })
})
