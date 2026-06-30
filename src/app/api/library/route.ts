import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { resolveExportUrl } from "@/lib/storage/minio"
import { PostStatus } from "@prisma/client"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)))
  const statusFilter = searchParams.get("status") ?? "ALL"
  const search = searchParams.get("search")?.trim() ?? ""

  // Build the where clause — drafted as a plain object; Prisma accepts the
  // intersection of these shapes for Draft.findMany({ where }).
  type WhereClause = {
    status?: "EXPORTED"
    posts?: { none?: Record<string, never>; some?: { status?: PostStatus } }
    OR?: Array<{
      status?: "EXPORTED"
      posts?: { some?: { status?: PostStatus } }
    }>
    AND?: Array<{ brief?: { topic?: { contains: string; mode: "insensitive" }; userId?: string } }>
  }

  const where: WhereClause = {}

  // Status filter
  if (statusFilter === "READY") {
    // READY = EXPORTED draft with no posts yet
    Object.assign(where, {
      status: "EXPORTED" as const,
      posts: { none: {} },
    })
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

  if (search) {
    const searchCondition = {
      brief: { topic: { contains: search, mode: "insensitive" as const } },
    }
    if (where.AND) {
      where.AND.push(searchCondition)
    } else {
      where.AND = [searchCondition]
    }
  }

  // Non-admins only see drafts from their own briefs (IDOR fix).
  if (user.role !== "admin") {
    const ownership = { brief: { userId: user.userId } }
    where.AND = where.AND ? [...where.AND, ownership] : [ownership]
  }

  const [drafts, total] = await Promise.all([
    prisma.draft.findMany({
      where,
      include: {
        brief: { select: { topic: true, channels: true, aspectRatio: true } },
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
        campaigns: {
          include: {
            campaign: {
              select: {
                name: true,
                brandKit: { select: { name: true } },
              },
            },
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
}
