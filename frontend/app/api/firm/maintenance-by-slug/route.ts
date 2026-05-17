import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/firm/maintenance-by-slug?slug=<slug>
 *
 * Lightweight endpoint called by the middleware (middleware.ts) to check whether a
 * firm is currently in maintenance mode — without importing Prisma at the edge.
 * The route runs in the Node.js runtime so Prisma is available.
 *
 * Returns { active: boolean, firmId?: string }
 * Never throws — always returns a safe fallback on error.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ active: false })

  try {
    const firm = await prisma.firm.findUnique({
      where: { slug },
      select: { id: true, settings: true },
    })
    if (!firm) return NextResponse.json({ active: false })

    const settings = (firm.settings as Record<string, unknown>) || {}
    const mode = settings.maintenanceMode as { active?: boolean; expiresAt?: string } | null | undefined

    if (!mode?.active) return NextResponse.json({ active: false })
    if (mode.expiresAt && new Date() > new Date(mode.expiresAt)) {
      return NextResponse.json({ active: false })
    }

    return NextResponse.json({ active: true, firmId: firm.id })
  } catch {
    // Non-blocking: never prevent navigation on a DB error
    return NextResponse.json({ active: false })
  }
}
