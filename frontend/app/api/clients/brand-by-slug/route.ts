import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl
    const firmSlug = searchParams.get('firmSlug')
    const clientSlug = searchParams.get('clientSlug')
    if (!firmSlug || !clientSlug) {
        return NextResponse.json({ error: 'firmSlug and clientSlug are required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const firm = await prisma.firm.findUnique({ where: { slug: firmSlug }, select: { id: true } })
    if (!firm) return NextResponse.json({ brand: null })

    const client = await prisma.client.findFirst({
        where: {
            slug: clientSlug,
            firmId: firm.id,
            OR: [
                { members: { some: { userId: user.id } } },
                { firm: { members: { some: { userId: user.id } } } },
            ],
        },
        select: {
            id: true,
            settings: true,
        },
    })

    if (!client) return NextResponse.json({ brand: null })

    const brandId = (client.settings as any)?.brandId
    let brand: Record<string, unknown> | null = null
    if (brandId) {
        brand = await (prisma as any).brand.findUnique({
            where: { id: brandId },
            select: {
                name: true,
                subtext: true,
                logoData: true,
                logoUrl: true,
                logoAspectRatio: true,
                primaryColor: true,
                secondaryColor: true,
            },
        })
    }

    // If logoData present, replace logoUrl with proxy path and strip the raw blob
    if (brand?.logoData) {
        brand = { ...brand, logoUrl: `/api/clients/${client.id}/brand/logo`, logoData: undefined }
    }

    return NextResponse.json({ brand: brand ?? null })
}
