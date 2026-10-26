import { expect, type Page } from '@playwright/test'

// The shared axe-core scan (018 FR-07). One copy of 014's AC-19 rule list and
// the scan, imported by every spec that runs it (a11y, captions,
// model-selection). It replaces three copies kept in step by hand: a spec file
// can't be imported (its tests would register twice), a helper can.

// The rules AC-19 names, and only those (runOnly keeps the scan scoped to what
// 014 fixes). `nested-interactive` is deliberately absent: the library tile's
// nested button predates 014 (011 T7). A rule is never removed to make the
// scan pass.
export const AXE_RULES = [
  'label',
  'select-name',
  'aria-input-field-name',
  'aria-toggle-field-name',
  'button-name',
  'link-name',
  'page-has-heading-one',
  'scrollable-region-focusable',
  'target-size',
  'aria-allowed-attr',
  'aria-valid-attr-value',
  'aria-required-attr',
]

type Axe = typeof import('axe-core')

// Inject axe-core (the declared devDependency) once, run the AC-19 rules over
// the whole document, and expect no violation. Each one is reported as
// `rule: node target`.
//
// `settle` is opt-in (018 NFR-03): it waits for `networkidle` and the fonts
// before scanning, which is what 014's own scan has always done. Callers that
// already waited for the state they assert on leave it off, as they did before.
//
// `incomplete` results (nodes axe could not decide) are logged, not failed, so
// a rule that silently stopped checking something shows up in the output.
export async function expectNoAxeViolations(page: Page, what: string, { settle = false }: { settle?: boolean } = {}) {
  if (settle) {
    await page.waitForLoadState('networkidle')
    await page.evaluate(async () => {
      await document.fonts.ready
    })
  }
  if (!(await page.evaluate(() => 'axe' in window))) {
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  }
  const { violations, incomplete } = await page.evaluate(async (rules) => {
    const { axe } = window as unknown as { axe: Axe }
    const result = await axe.run(document, { runOnly: { type: 'rule', values: rules } })
    const list = (results: typeof result.violations) =>
      results.flatMap((r) => r.nodes.map((node) => `${r.id}: ${node.target.join(' ')}`))
    return { violations: list(result.violations), incomplete: list(result.incomplete) }
  }, AXE_RULES)
  if (incomplete.length > 0) {
    console.log(`axe (014 AC-19) incomplete on ${what}:\n  ${incomplete.join('\n  ')}`)
  }
  expect(violations, `axe (014 AC-19) on ${what}`).toEqual([])
}
