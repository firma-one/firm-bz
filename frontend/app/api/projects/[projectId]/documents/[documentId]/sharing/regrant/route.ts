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
import { parseSettingsFromDb, buildSettingsForDb } from '@/lib/sharing-settings'
import { applyDiagonalWatermark } from '@/lib/watermark-pdf'

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

        // Parse sharing settings
        const parsedSettings = parseSettingsFromDb(document.settings)
        const guestOptions = parsedSettings.share?.guest?.options || {}
        const isViewer = projectMember.role === 'eng_viewer'
        const sharePdfOnly = isViewer && guestOptions.sharePdfOnly
        const addWatermark = isViewer && guestOptions.addWatermark
        const allowDownload = guestOptions.allowDownload ?? false

        const fileName = document.fileName || 'a document'
        const message = `POCKETT SECURE ACCESS\n\nYou have requested to open "${fileName}". For your security, Google Drive requires a one-time email verification. Please click the "Open" button below to receive your one-time passcode and access the document.`
        const options = { rm: 'minimal', ui: '2', sendNotificationEmail: 'true' }

        let targetFileId = fileInfo.externalId

        // Branch A: Viewer + sharePdfOnly = true
        if (sharePdfOnly) {
            try {
                // 1. Export to PDF
                const pdfBytes = await drive.exportFileToPdf(connectorId, fileInfo.externalId)

                // 2. Apply watermark if needed
                let finalPdfBytes = pdfBytes
                if (addWatermark) {
                    const firm = await prisma.firm.findUnique({
                        where: { id: fileInfo.organizationId },
                        select: { name: true }
                    })
                    const watermarkText = firm?.name || 'FIRMA'
                    finalPdfBytes = await applyDiagonalWatermark(pdfBytes, watermarkText)
                }

                // 3. Upload or overwrite PDF file
                let pdfDriveId = guestOptions.sharedPdfDriveId
                const pdfFileName = `[FIRMA_PDF] ${fileName}.pdf`

                if (pdfDriveId) {
                    // Overwrite existing PDF
                    await drive.overwriteFileContent(connectorId, pdfDriveId, finalPdfBytes, 'application/pdf')
                } else {
                    // Upload new PDF
                    pdfDriveId = await drive.uploadNewFile(connectorId, pdfFileName, finalPdfBytes, 'application/pdf')

                    // Update document settings with the PDF Drive ID
                    const updatedSettings = buildSettingsForDb(document.settings as Record<string, unknown>, {
                        share: {
                            guest: {
                                enabled: parsedSettings.share?.guest?.enabled ?? true,
                                options: {
                                    ...guestOptions,
                                    sharedPdfDriveId: pdfDriveId
                                }
                            }
                        }
                    })
                    await prisma.engagementDocument.update({
                        where: { id: document.id },
                        data: { settings: updatedSettings }
                    })
                }

                // 4. Set copyRequiresWriterPermission on PDF based on allowDownload
                await drive.patchFileProperties(connectorId, pdfDriveId, {
                    copyRequiresWriterPermission: !allowDownload
                })

                // 5. Revoke old permission on PDF if exists
                if (sharingUser.googlePermissionId) {
                    try {
                        await drive.revokePermission(connectorId, pdfDriveId, sharingUser.googlePermissionId)
                    } catch (e) {
                        // Ignore revoke errors on PDF (may not exist yet)
                    }
                }

                // 6. Grant permission on PDF file
                targetFileId = pdfDriveId
            } catch (pdfError) {
                console.error('Failed to process PDF-only sharing:', pdfError)
                return NextResponse.json({ error: 'Failed to process document for sharing' }, { status: 500 })
            }
        } else {
            // Branch B: Viewer + sharePdfOnly = false -> enforce allowDownload on original file
            if (isViewer && !allowDownload) {
                try {
                    await drive.patchFileProperties(connectorId, fileInfo.externalId, {
                        copyRequiresWriterPermission: true
                    })
                } catch (e) {
                    console.error('Failed to set copyRequiresWriterPermission:', e)
                    // Continue anyway - this is not a blocker
                }
            }
        }

        const permissionId = await drive.grantFilePermission(connectorId, targetFileId, email, role, message, options)

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
