import 'server-only'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import {
    getEngagementStatus,
    isEngagementMemberReadOnlyWhenCompleted,
    isExternalEngagementRole,
    requireEngagementMember,
} from '@/lib/engagement-access'
import type { EngagementRole } from '@prisma/client'

export type NotesAccess =
    | { ok: true; userId: string; role: EngagementRole; documentId: string; firmId: string; clientId: string | null; fileName: string | undefined }
    | { ok: false; status: number; error: string }

/**
 * Who may use a document's notes: the signed-in member of its engagement, in a firm role. Clients
 * never see them. The document is looked up within the engagement from the route's own params, so
 * a caller can't reach another engagement's notes. A completed engagement is read-only for writes,
 * as for its other edits.
 */
export async function notesAccess(projectId: string, documentIdParam: string, { write }: { write: boolean }): Promise<NotesAccess> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return { ok: false, status: 404, error: 'Not found' }
    if (isExternalEngagementRole(member.role)) return { ok: false, status: 403, error: "Notes are for the firm's team" }

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo) return { ok: false, status: 404, error: 'File not found' }

    if (write) {
        const status = await getEngagementStatus(projectId)
        if (isEngagementMemberReadOnlyWhenCompleted(status, member.role)) {
            return { ok: false, status: 403, error: 'This engagement is completed, so its files are read-only' }
        }
    }

    const engagement = await prisma.engagement.findUnique({ where: { id: projectId }, select: { clientId: true } })
    return {
        ok: true,
        userId: user.id,
        role: member.role,
        documentId: fileInfo.id,
        firmId: fileInfo.organizationId,
        clientId: engagement?.clientId ?? null,
        fileName: fileInfo.fileName,
    }
}
