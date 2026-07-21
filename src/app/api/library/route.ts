import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withTeamAuth } from "@/lib/api/handler"
import { draftVisibilityWhere } from "@/lib/authz/visibility"
import { resolveExportUrl } from "@/lib/storage/minio"
import { Prisma, PostStatus } from "@prisma/client"

export const GET = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)))
  const statusFilter = searchParams.get("status") ?? "ALL"
  const search = searchParams.get("search")?.trim() ?? ""

  // Build the where clause with the real Prisma type (M3, final review) — the
  // old hand-rolled WhereClause type didn't match Prisma's actual
  // DraftWhereInput shape, so the visibility AND-clause below had to be
  // silenced with `as never`. That cast meant a future change to
  // draftVisibilityWhere's shape wouldn't be type-checked at this call
  // site — exactly where a silent visibility regression (D6) would hurt.
  const where: Prisma.DraftWhereInput = {}

  // Status filter
  if (statusFilter === "READY") {
    // READY = EXPORTED draft with no posts yet
    where.status = "EXPORTED"
    where.posts = { none: {} }
  } else if (
    statusFilter === "PUBLISHED" ||
    statusFilter === "SCHEDULED" ||
    statusFilter === "FAILED"
  ) {
    where.OR = [
      {
        posts: {
          some: { status: statusFilter as PostStatus },
        },
      },
    ]
  } else {
    // ALL: EXPORTED drafts OR drafts with any post
    where.OR = [
      { status: "EXPORTED" },
      { posts: { some: {} } },
    ]
  }

  // AND-ed conditions accumulate here (search + the mandatory D6 visibility
  // clause below) so the two can never accidentally overwrite each other.
  const andConditions: Prisma.DraftWhereInput[] = []

  if (search) {
    andConditions.push({
      brief: { topic: { contains: search, mode: "insensitive" } },
    })
  }

  // D6 visibility: own drafts, or anything shared via a campaign-linked brief
  // (team-wide admins/super-admins see the whole team).
  andConditions.push(draftVisibilityWhere(user))

  where.AND = andConditions

  const [drafts, total] = await Promise.all([
    // select (not include): tiles never need htmlContent (megabytes/row after
    // inline-asset restoration) or pendingConflict. Campaign/kit labels come
    // from the brief's campaign — the only way drafts are linked to campaigns.
    prisma.draft.findMany({
      where,
      select: {
        id: true,
        status: true,
        exportUrl: true,
        createdAt: true,
        brief: {
          select: {
            topic: true,
            channels: true,
            aspectRatio: true,
            campaign: {
              select: {
                name: true,
                brandKit: { select: { name: true } },
              },
            },
          },
        },
        posts: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            channel: true,
            status: true,
            scheduledAt: true,
            publishedAt: true,
            platformId: true,
            errorReason: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.draft.count({ where }),
  ])

  // exportUrl is stored as an EXPORTS object key — sign each for the browser
  // (thumbnails). Signing is local (no network round-trip), so mapping is cheap.
  const signedDrafts = await Promise.all(
    drafts.map(async (d) => ({ ...d, exportUrl: await resolveExportUrl(d.exportUrl) }))
  )

  return NextResponse.json({ drafts: signedDrafts, total, page, pageSize })
})
