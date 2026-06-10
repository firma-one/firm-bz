import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { isExternalEngagementRole } from '@/lib/engagement-access'
import { resolveEngagementConnector } from '@/lib/connectors/resolve-client-connector'

export async function POST(request: NextRequest) {
    try {
        // 1. Auth Check
        const authHeader = request.headers.get('authorization')
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { createClient } = require('@supabase/supabase-js')
        const supabase = createClient(
            (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // 2. Parse JSON
        let body
        try {
            body = await request.json()
        } catch (err: any) {
            return NextResponse.json({ error: 'Invalid JSON body', details: err.message }, { status: 400 })
        }

        // projectId is the wire name sent by clients — aliased to engagementId internally
        const { name, mimeType, parentId: clientParentId, connectionId, fileId, projectId: engagementId } = body

        if (!name || !mimeType) return NextResponse.json({ error: 'Missing name or mimeType' }, { status: 400 })
        if (!clientParentId && !fileId && !engagementId) return NextResponse.json({ error: 'No parent folder specified' }, { status: 400 })

        // 3. Find Connector + handle EC/EV access
        let connector: any
        let resolvedParentId: string | undefined = clientParentId

        if (engagementId) {
            const [resolvedConnector, engagement] = await Promise.all([
                resolveEngagementConnector(engagementId),
                prisma.engagement.findFirst({
                    where: { id: engagementId, isDeleted: false },
                    include: {
                        client: { select: { slug: true, name: true } },
                        members: { where: { userId: user.id } }
                    }
                })
            ])
            if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

            const member = engagement.members[0]
            if (!member) return NextResponse.json({ error: 'Not a member of this engagement' }, { status: 403 })

            connector = resolvedConnector
            if (!connector) return NextResponse.json({ error: 'No active storage connector found' }, { status: 404 })

            // EC/EV uploads: use generalFolderId only when no specific parentId was provided
            if (isExternalEngagementRole(member.role) && !clientParentId) {
                const folderIds = await googleDriveConnector.getProjectFolderIds(connector.id, engagement.slug, {
                    projectName: engagement.name,
                    clientSlug: engagement.client.slug,
                    clientName: engagement.client.name,
                    projectFolderId: engagement.connectorRootFolderId
                })
                if (!folderIds.generalFolderId) {
                    return NextResponse.json({ error: 'General folder not configured for this engagement' }, { status: 400 })
                }
                resolvedParentId = folderIds.generalFolderId
            }
        } else if (connectionId) {
            connector = await prisma.connector.findUnique({ where: { id: connectionId } })
        }

        if (!connector) return NextResponse.json({ error: 'No active storage connector found' }, { status: 404 })
        if (!resolvedParentId && !fileId) return NextResponse.json({ error: 'No parent folder specified' }, { status: 400 })

        // 4. Get Resumable Upload URL
        const origin = request.headers.get('origin') || request.headers.get('referer') || ''
        const accessToken = await googleDriveConnector.getAccessToken(connector.id)
        if (!accessToken) {
            return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 })
        }

        const uploadUrl = await googleDriveConnector.getResumableUploadUrl(accessToken, {
            name,
            mimeType,
            parents: resolvedParentId ? [resolvedParentId] : undefined
        }, fileId, origin)

        return NextResponse.json({ uploadUrl, resolvedParentId: resolvedParentId ?? null })

    } catch (e: any) {
        console.error('Upload Init Error:', e)
        return NextResponse.json({ error: e.message || 'Upload initialization failed' }, { status: 500 })
    }
}
