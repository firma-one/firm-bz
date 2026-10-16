import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/hierarchy?firmSlug=…
 * The caller's first client and its first engagement in the firm (used by the demo tour to build
 * its deep links). Scoped the same way as getFirmHierarchy: the caller must belong to the firm,
 * and only clients/engagements they are a member of are considered.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const firmSlug = searchParams.get('firmSlug')
  if (!firmSlug) return NextResponse.json({ error: 'firmSlug required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await prisma.firm.findUnique({
    where: { slug: firmSlug },
    select: { id: true },
  })
  if (!firm) return NextResponse.json({ clients: [] })

  // A non-member gets the same answer as an unknown slug, so the route can't be used to probe
  // which firm slugs exist.
  const membership = await prisma.firmMember.findFirst({
    where: { userId: user.id, firmId: firm.id },
    select: { id: true },
  })
  if (!membership) return NextResponse.json({ clients: [] })

  const clients = await prisma.client.findMany({
    where: {
      firmId: firm.id,
      deletedAt: null,
      OR: [
        { members: { some: { userId: user.id } } },
        { engagements: { some: { isDeleted: false, members: { some: { userId: user.id } } } } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 1,
    select: {
      slug: true,
      engagements: {
        where: { isDeleted: false, members: { some: { userId: user.id } } },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { slug: true },
      },
    },
  })

  return NextResponse.json({ clients })
}
