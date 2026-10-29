import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { requireEngagementMember, visibleDocumentIdsFor } from '@/lib/engagement-access'
import { deliverableOf } from '@/lib/files/deliverable-of'

/**
 * GET /api/projects/[projectId]/documents/[documentId]/deliverable
 *
 * The deliverable a document is in — where its discussion happens — or null. The engagement's
 * members only; an external one only for a document shared with them, and only a deliverable they
 * can see.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { projectId, documentId } = await params
        const member = await requireEngagementMember(projectId, user.id)
        if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

        const fileInfo = await getFileInfo(projectId, documentId)
        if (!fileInfo) return NextResponse.json({ error: 'File not found' }, { status: 404 })

        const visible = await visibleDocumentIdsFor(projectId, member.role)
        if (visible && !visible.has(fileInfo.externalId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

        const row = await prisma.engagementDocument.findUnique({ where: { id: fileInfo.id }, select: { parentId: true } })
        const deliverable = await deliverableOf(projectId, row?.parentId ?? null)
        if (deliverable && visible) {
            const folder = await prisma.engagementDocument.findUnique({ where: { id: deliverable.id }, select: { externalId: true } })
            if (!folder || !visible.has(folder.externalId)) return NextResponse.json({ deliverable: null })
        }
        return NextResponse.json({ deliverable })
    } catch (e) {
        console.error('GET document deliverable error', e)
        return NextResponse.json({ error: 'Failed to find the deliverable' }, { status: 500 })
    }
}
