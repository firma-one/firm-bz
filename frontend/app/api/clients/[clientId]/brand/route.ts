import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ clientId: string }> }
) {
    const { clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { settings: true } })
    const brandId = (client?.settings as any)?.brandId
    if (!brandId) return NextResponse.json({ brand: null })

    const brand = await (prisma as any).brand.findUnique({
        where: { id: brandId },
        select: {
            id: true,
            name: true,
            subtext: true,
            logoData: true,
            logoUrl: true,
            logoAspectRatio: true,
            primaryColor: true,
            secondaryColor: true,
        },
    })
    return NextResponse.json({ brand: brand ?? null })
}
