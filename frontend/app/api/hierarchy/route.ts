import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'

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

  const clients = await prisma.client.findMany({
    where: { firmId: firm.id },
    orderBy: { createdAt: 'asc' },
    take: 1,
    select: {
      slug: true,
      engagements: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { slug: true },
      },
    },
  })

  return NextResponse.json({ clients })
}
