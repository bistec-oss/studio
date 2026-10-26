# Review: OP-025 geometry pin (uncommitted)

Mode: full. Verdict: NOTE

## Checks

- Released looks byte-identical: `imageGeometryPin` returns null unless a region has `purpose === 'composite'`; none of the four released looks has one. `pin ? ... : decision.prompt` leaves the string untouched (no whitespace added). Test in heroPrompts.test.ts asserts null for every size of the four current looks; heroSeams asserts the plain-look prompt equals the decision prompt.
- Hero-plan only: `opts.hero ? imageGeometryPin(opts.hero.contract, opts.hero.sizeContract) : null`. Refine calls `generateBackgroundForRefine` with no hero, so it is unaffected.
- onPrompt == generateImage input: both use `imagePrompt`; the seam test asserts both equal `expected` for all three sizes, so the probe's promptHash covers the pin. The log uses it too.
- Purity/boundary: new function is pure, in `designData/promptText.ts`, exported via the existing `export * from './promptText'`. No new imports. Only the agent layer imports it (same direction as `evaluateRegions`).
- Goldens/hashes: diff touches no golden, fixture or hash file.
- FR-07: the pin reuses `imageContractText`, so the composite sentence is the data-derived FR-07 sentence verbatim; nothing is duplicated as a literal.

## Findings

### [NOTE] src/lib/agent/background.ts:215-218 — Naming/Simplicity

**Problem:** The literal blank line inside a template string (`${decision.prompt}<newline><newline>${pin}`) is easy to break (editor or CRLF normalisation would silently change the prompt and the promptHash). background.ts is LF today, so it is correct now.
**Suggestion:** `const imagePrompt = pin ? \`${decision.prompt}\n\n${pin}\` : decision.prompt`

### [NOTE] src/lib/designData/promptText.ts:63-64 — Design adherence

**Problem:** The pin repeats the `Subject:` line plus every contract line, so the image model receives the contract twice (once paraphrased by Haiku, once exact). This is the user's chosen behaviour and the tests pin it; just be aware the prompt grows. Design section 6 and spec FR-07 do not describe the pin, so add one line to design.md section 6 for the record.

### [NOTE] working copy line endings

`file` reports `promptText.ts` as CRLF in the working tree while HEAD is LF (git warns it will normalise). No logic effect (no multi-line template literal there), but avoid committing a whole-file line-ending change.

## Rationale

Behaviour is confined to composite looks on a hero plan, the pin is covered by exact-string tests at the seam and in the pure module, and released prompts are untouched. Only cosmetic notes remain.

NOTE
