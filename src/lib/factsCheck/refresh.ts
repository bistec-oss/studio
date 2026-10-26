// Refreshes a draft's stored facts check (027 FR-11, design section 6). The
// interactive caption writers call it after their write; it is best-effort and
// never throws, so the caller's own result is unchanged. The synchronous
// generation path calls computeFactsCheck and stores the result in the same
// transaction as the draft.
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { loadDraftCaptions } from '@/lib/captions/store'
import { redactText } from '@/lib/text/redact'
import { checkFacts, factsCheckError } from './compare'
import { loadFactsSources, type FactsBrief, type PreloadedSources } from './sources'
import { shouldMockFactError } from '@/lib/testHooks'
import { MAX_REASON_CHARS, type CheckText, type FactWhere, type FactsCheck } from './types'

export interface RefreshDeps {
  db: PrismaClient
  loadSources: (brief: FactsBrief) => Promise<string[]>
  loadCaptions: typeof loadDraftCaptions
}

const defaultDeps = (): RefreshDeps => ({
  db: prisma,
  loadSources: (brief) => loadFactsSources(brief),
  loadCaptions: loadDraftCaptions,
})

function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return redactText(message).slice(0, MAX_REASON_CHARS)
}

// The MOCK_AI seam for a check that cannot run (__MOCK_FACT_ERROR__ in the
// topic): thrown inside the wrapper's try, so it is stored as `status: 'error'`.
function throwIfMockFactError(topic: string): void {
  if (shouldMockFactError(topic)) throw new Error('mock facts check failure')
}

/**
 * The check for a synchronous generation (FR-11): the texts in hand, the
 * sources from the loader (a caller that already resolved the briefing or the
 * kit voice passes them in). Never throws: a failure is logged and returned as
 * `status: 'error'`, so the generation still returns its draft.
 */
export async function computeFactsCheck(
  input: { brief: FactsBrief; texts: CheckText[]; preloaded?: PreloadedSources },
  loadSources: (brief: FactsBrief, preloaded?: PreloadedSources) => Promise<string[]> = loadFactsSources,
): Promise<FactsCheck> {
  try {
    throwIfMockFactError(input.brief.topic)
    const sources = await loadSources(input.brief, input.preloaded)
    return checkFacts({ texts: input.texts, sources })
  } catch (err) {
    const message = describe(err)
    console.error(`[facts-check] generation: ${message}`)
    return factsCheckError(message)
  }
}

/**
 * Recomputes `Draft.factsCheck` from the draft's headline and READY captions.
 * A PENDING or FAILED caption row is skipped. On any failure it logs
 * `[facts-check] draft <id>: <message>` and tries once to store `status:
 * 'error'`. Never throws.
 */
export async function refreshFactsCheck(
  draftId: string,
  // A caller that holds its own client (a test, or a store function given `db`)
  // overrides only what it needs; the rest is the default.
  overrides: Partial<RefreshDeps> = {},
): Promise<void> {
  const deps: RefreshDeps = { ...defaultDeps(), ...overrides }
  try {
    const draft = await deps.db.draft.findUnique({
      where: { id: draftId },
      select: {
        headline: true,
        brief: {
          select: {
            teamId: true,
            topic: true,
            description: true,
            campaignId: true,
            brandKitId: true,
          },
        },
      },
    })
    if (!draft) return
    const loaded = await deps.loadCaptions(draftId, deps.db)
    const texts: CheckText[] = []
    if (draft.headline) texts.push({ where: 'headline', text: draft.headline })
    for (const row of loaded?.captions ?? [])
      if (row.status === 'READY' && row.text)
        texts.push({ where: row.channel as FactWhere, text: row.text })
    throwIfMockFactError(draft.brief.topic)
    const sources = await deps.loadSources(draft.brief)
    const check = checkFacts({ texts, sources })
    await deps.db.draft.updateMany({
      where: { id: draftId },
      data: { factsCheck: check as unknown as Prisma.InputJsonValue },
    })
  } catch (err) {
    const message = describe(err)
    console.error(`[facts-check] draft ${draftId}: ${message}`)
    try {
      await deps.db.draft.updateMany({
        where: { id: draftId },
        data: {
          factsCheck: factsCheckError(message) as unknown as Prisma.InputJsonValue,
        },
      })
    } catch {
      // The error record is best-effort as well.
    }
  }
}
