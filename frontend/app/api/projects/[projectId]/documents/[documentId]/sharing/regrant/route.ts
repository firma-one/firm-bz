import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GoogleDriveConnector } from '@/lib/google-drive-connector'
import { createClient } from '@/utils/supabase/server'
import { getFileInfo } from '@/lib/file-utils'
import { DocumentSharingPermissionStatus } from '@prisma/client'
import {
  getEngagementStatus,
  isEngagementMemberReadOnlyWhenCompleted,
  isExternalEngagementRole,
  requireEngagementMember,
} from '@/lib/engagement-access'
import { isDocumentVersionLocked } from '@/lib/document-version-lock'

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || (!user.email && !user.user_metadata?.email)) {
            return NextResponse.json({ error: 'Unauthorized or missing email' }, { status: 401 })
        }

        const email = user.email || user.user_metadata?.email
        const { projectId, documentId: documentIdParam } = await params

        const fileInfo = await getFileInfo(projectId, documentIdParam)
        if (!fileInfo) return NextResponse.json({ error: 'File not found' }, { status: 404 })

        const projectMember = await requireEngagementMember(projectId, user.id)
        if (!projectMember) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        const document = await prisma.engagementDocument.findUnique({
            where: {
                engagementId_firmId_externalId: {
                    engagementId: projectId,
                    firmId: fileInfo.organizationId,
                    externalId: fileInfo.externalId,
                },
            },
        })

        if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

        let sharingUser = await prisma.engagementDocumentSharingUser.findFirst({
            where: {
                projectDocumentId: document.id,
                userId: user.id,
            },
            include: { document: true },
        })

        const engagementStatus = await getEngagementStatus(projectId)
        if (
            sharingUser?.sharingPermissionStatus === DocumentSharingPermissionStatus.REVOKED &&
            engagementStatus === 'COMPLETED'
        ) {
            return NextResponse.json({ error: 'This secure access link was revoked.' }, { status: 403 })
        }

        if (!sharingUser) {
            if (isExternalEngagementRole(projectMember.role)) {
                const isExtCollab = (document.settings as Record<string, unknown>)?.share &&
                    ((document.settings as any)?.share?.externalCollaborator?.enabled === true)
                const isGuest = (document.settings as Record<string, unknown>)?.share &&
                    ((document.settings as any)?.share?.guest?.enabled === true)

                if (!isExtCollab && !isGuest) {
                    return NextResponse.json({ error: 'File is not shared with external users' }, { status: 403 })
                }
            }

            sharingUser = await prisma.engagementDocumentSharingUser.create({
                data: {
                    projectDocumentId: document.id,
                    engagementId: projectId,
                    userId: user.id,
                    email,
                    sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
                },
                include: { document: true },
            })
        }

        let connectorId = document.connectorId
        if (!connectorId && fileInfo.organizationId) {
            const org = await prisma.firm.findUnique({
                where: { id: fileInfo.organizationId },
                include: { connector: true },
            })
            if (org?.connector?.type === 'GOOGLE_DRIVE' && org.connector.status === 'ACTIVE') {
                connectorId = org.connector.id
            }
        }

        if (!connectorId) {
            return NextResponse.json({ error: 'No active Google Drive connection found' }, { status: 500 })
        }

        const drive = GoogleDriveConnector.getInstance()

        if (sharingUser.googlePermissionId) {
            await drive.revokePermission(connectorId, fileInfo.externalId, sharingUser.googlePermissionId)
            await prisma.engagementDocumentSharingUser.update({
                where: { id: sharingUser.id },
                data: { googlePermissionId: null },
            })
        }

        const versionLocked = isDocumentVersionLocked(document.settings)

        let role: 'writer' | 'reader' = projectMember.role === 'eng_viewer' ? 'reader' : 'writer'
        if (engagementStatus && isEngagementMemberReadOnlyWhenCompleted(engagementStatus, projectMember.role)) {
            role = 'reader'
        }
        if (versionLocked) {
            role = 'reader'
        }

        const fileName = document.fileName || 'a document'
        const message = `POCKETT SECURE ACCESS\n\nYou have requested to open "${fileName}". For your security, Google Drive requires a one-time email verification. Please click the "Open" button below to receive your one-time passcode and access the document.`
        const options = { rm: 'minimal', ui: '2', sendNotificationEmail: 'true' }
        const permissionId = await drive.grantFilePermission(connectorId, fileInfo.externalId, email, role, message, options)

        if (!permissionId) {
            return NextResponse.json({ error: 'Failed to re-grant Google Drive permission' }, { status: 500 })
        }

        await prisma.engagementDocumentSharingUser.update({
            where: { id: sharingUser.id },
            data: {
                googlePermissionId: permissionId,
                sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
            },
        })

        return NextResponse.json({ success: true })
    } catch (e) {
        console.error('POST regrant sharing error', e)
        return NextResponse.json({ error: 'Failed to authenticate editor access' }, { status: 500 })
    }
}
