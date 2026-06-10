import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveEngagementConnector } from '@/lib/connectors/resolve-client-connector'

/**
 * GET /api/proxy/thumbnail/[externalId]
 * Fetches a Google Drive thumbnail for the given externalId.
 * Google Drive thumbnailLink URLs are short-lived. This proxy handles 
 * trying the cached DB link first, and if 403 (expired), fetches a fresh 
 * one from the Drive API.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ externalId: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { externalId } = await params
        const { searchParams } = new URL(request.url)
        const firmId = searchParams.get('firmId')
        const size = searchParams.get('size') ?? '220'

        if (!firmId) return NextResponse.json({ error: 'Missing firmId' }, { status: 400 })

        const indexRow = await prisma.engagementDocument.findFirst({
            where: { externalId, firmId },
            select: { metadata: true, id: true, engagementId: true },
        })

        const metadata = (indexRow?.metadata as any) || {}
        let thumbnailUrl: string | null = metadata.thumbnailLink || metadata.thumbnail_link || null

        // 2. Try to fetch the cached URL
        if (thumbnailUrl) {
            const finalUrl = thumbnailUrl.replace(/-s\d+$/, `-s${size}`)
            const cachedResponse = await fetch(finalUrl)

            if (cachedResponse.ok) {
                const imageBuffer = await cachedResponse.arrayBuffer()
                const contentType = cachedResponse.headers.get('content-type') ?? 'image/jpeg'
                return new NextResponse(imageBuffer, {
                    status: 200,
                    headers: {
                        'Content-Type': contentType,
                        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
                    },
                })
            }
        }

        // 3. If no stored URL, or the cached URL failed (e.g. 403 Expired), fetch fresh from Drive API
        const connector = indexRow?.engagementId
            ? await resolveEngagementConnector(indexRow.engagementId)
            : null

        if (!connector || connector.type !== 'GOOGLE_DRIVE' || connector.status !== 'ACTIVE') {
            return NextResponse.json({ error: 'No active storage connector found' }, { status: 404 })
        }

        const { googleDriveConnector } = await import('@/lib/google-drive-connector')
        const meta = await googleDriveConnector.getFileMetadata(connector.id, externalId)
        thumbnailUrl = meta?.thumbnailLink ?? null

        if (!thumbnailUrl) {
            return NextResponse.json({ error: 'No thumbnail available for this file' }, { status: 404 })
        }

        if (indexRow) {
            const newMeta = { ...metadata, thumbnailLink: thumbnailUrl }
            await prisma.engagementDocument.update({
                where: { id: indexRow.id },
                data: { metadata: newMeta },
            })
        }

        // 5. Fetch using the fresh url
        const freshFinalUrl = thumbnailUrl.replace(/-s\d+$/, `-s${size}`)
        const response = await fetch(freshFinalUrl)

        if (!response.ok) {
            return NextResponse.json({ error: 'Failed to fetch fresh thumbnail' }, { status: response.status })
        }

        const imageBuffer = await response.arrayBuffer()
        const contentType = response.headers.get('content-type') ?? 'image/jpeg'

        return new NextResponse(imageBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600, s-maxage=3600',
            },
        })
    } catch (e) {
        console.error('Thumbnail proxy error', e)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
