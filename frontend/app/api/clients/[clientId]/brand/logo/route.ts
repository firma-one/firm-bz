// GET /api/clients/[clientId]/brand/logo
// Returns the logo as an image response from Brand.logoData base64
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { settings: true } })
    const brandId = (client?.settings as any)?.brandId
    if (!brandId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const brand = await (prisma as any).brand.findUnique({ where: { id: brandId }, select: { logoData: true } })
    if (!brand?.logoData) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Parse data URL: "data:image/png;base64,..."
    const match = brand.logoData.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return NextResponse.json({ error: 'Invalid logo data' }, { status: 500 })
    const [, mimeType, base64] = match
    const buffer = Buffer.from(base64, 'base64')
    return new NextResponse(buffer, {
        headers: { 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=3600' }
    })
}
