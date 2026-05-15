import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { isExternalEngagementRole } from '@/lib/engagement-access'

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

        const { name, mimeType, parentId: clientParentId, connectionId, fileId, projectId } = body

        if (!name || !mimeType) return NextResponse.json({ error: 'Missing name or mimeType' }, { status: 400 })
        if (!clientParentId && !fileId && !projectId) return NextResponse.json({ error: 'No parent folder specified' }, { status: 400 })

        // 3. Find Connector + handle EC/EV access
        let connector: any
        let resolvedParentId: string | undefined = clientParentId

        if (projectId) {
            // Look up the project and the user's membership
            const project = await prisma.engagement.findFirst({
                where: { id: projectId, isDeleted: false },
                include: {
                    client: {
                        include: {
                            firm: { include: { connector: true } }
                        }
                    },
                    members: { where: { userId: user.id } }
                }
            })
            if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

            const member = project.members[0]
            if (!member) return NextResponse.json({ error: 'Not a member of this project' }, { status: 403 })

            connector = project.client.firm.connector ?? undefined
            if (!connector) return NextResponse.json({ error: 'No active Google Drive connection found' }, { status: 404 })

            // EC/EV uploads must go to generalFolderId regardless of client-supplied parentId
            if (isExternalEngagementRole(member.role)) {
                const folderIds = await googleDriveConnector.getProjectFolderIds(connector.id, project.slug, {
                    projectName: project.name,
                    clientSlug: project.client.slug,
                    clientName: project.client.name,
                    projectFolderId: project.connectorRootFolderId
                })
                if (!folderIds.generalFolderId) {
                    return NextResponse.json({ error: 'General folder not configured for this project' }, { status: 400 })
                }
                resolvedParentId = folderIds.generalFolderId
            }
        } else if (connectionId) {
            connector = await prisma.connector.findUnique({ where: { id: connectionId } })
        } else {
            const membership = await prisma.firmMember.findFirst({
                where: { userId: user.id },
                orderBy: { isDefault: 'desc' },
                include: { firm: { include: { connector: true } } }
            })
            connector = membership?.firm?.connector ?? undefined
        }

        if (!connector) return NextResponse.json({ error: 'No active Google Drive connection found' }, { status: 404 })
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
