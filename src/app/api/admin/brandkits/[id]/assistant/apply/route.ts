import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { findFamily } from '@/lib/fonts/catalogue'
import { validateKitFonts, validateScriptFonts, type KitFont } from '@/lib/fonts/validateKitFonts'
import { createPromptVersion } from '@/lib/brandkit/promptVersion'

type Params = { id: string }

// 031 FR-34: the brand-kit assistant's one Apply. Voice, colors, fonts and script fonts are
// validated first (FR-20, FR-21); any invalid part is a 400 and nothing is written. Then one
// transaction writes the new voice version (carrying `previousFonts` when fonts change) and the
// kit's colors, fonts and scriptFonts.
const applySchema = z
  .object({
    voice: z.string().trim().min(1).optional(),
    colors: z.array(z.string()).optional(),
    fonts: z
      .object({
        heading: z.string().trim().min(1).optional(),
        body: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
    scriptFonts: z.record(z.string()).optional(),
  })
  .strict()

export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const kit = await prisma.brandKit.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true, fonts: true, scriptFonts: true },
  })
  if (!kit || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await parseBody(req, applySchema)
  if (body.response) return body.response
  const { voice, colors, fonts, scriptFonts } = body.data

  const storedFonts: KitFont[] = Array.isArray(kit.fonts) ? (kit.fonts as KitFont[]) : []
  const storedScriptFonts =
    kit.scriptFonts && typeof kit.scriptFonts === 'object' && !Array.isArray(kit.scriptFonts)
      ? (kit.scriptFonts as Record<string, string>)
      : null

  // Validate every part before any write.
  let nextFonts: KitFont[] | undefined
  if (fonts && (fonts.heading || fonts.body)) {
    // Heading and body replace positions 0 and 1; the rest are kept. A name equal to the stored
    // entry keeps it (so a family missing from the snapshot stays valid).
    const merged: KitFont[] = [...storedFonts]
    const place = (index: number, name: string | undefined) => {
      if (!name) return
      const keep = storedFonts[index]
      merged[index] = keep && keep.name === name ? keep : { name, url: '' }
    }
    place(0, fonts.heading)
    place(1, fonts.body)
    // A body with no stored heading would leave a hole at 0: refuse rather than invent one.
    if (Array.from(merged).some((f) => !f)) {
      return NextResponse.json({ error: 'A body font needs a heading font to sit beside' }, { status: 400 })
    }
    const checked = validateKitFonts(merged, storedFonts, findFamily)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    nextFonts = checked.fonts
  }

  let nextScriptFonts: Record<string, string> | null | undefined
  if (scriptFonts !== undefined) {
    const checked = validateScriptFonts(scriptFonts, findFamily)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    nextScriptFonts = checked.scriptFonts
  }

  const fontsChange = nextFonts !== undefined || nextScriptFonts !== undefined
  if (voice === undefined && colors === undefined && !fontsChange) {
    return NextResponse.json({ error: 'Nothing to apply' }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let prompt = null
      if (voice !== undefined || fontsChange) {
        let content = voice
        if (content === undefined) {
          const active = await tx.brandKitPrompt.findFirst({
            where: { brandKitId: params.id, isActive: true },
            select: { content: true },
          })
          content = active?.content
        }
        // Fonts changed with no voice and no active version: there is no text to version.
        if (content !== undefined) {
          prompt = await createPromptVersion(
            tx,
            params.id,
            content,
            user.userId,
            fontsChange ? ({ fonts: storedFonts, scriptFonts: storedScriptFonts } as Prisma.InputJsonValue) : undefined,
          )
        }
      }
      const updated = await tx.brandKit.update({
        where: { id: params.id },
        data: {
          ...(colors !== undefined && { colors }),
          ...(nextFonts !== undefined && { fonts: nextFonts }),
          ...(nextScriptFonts !== undefined && { scriptFonts: nextScriptFonts ?? Prisma.DbNull }),
        },
      })
      return { kit: updated, prompt }
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'A concurrent edit created a new version — please retry.' }, { status: 409 })
    }
    throw err
  }
})
