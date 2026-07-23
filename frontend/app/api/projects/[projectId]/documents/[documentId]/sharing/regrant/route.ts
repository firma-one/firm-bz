import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPermissionAdapter, getContentAdapter } from '@/lib/connectors/registry'
import { createClient } from '@/utils/supabase/server'
import { getFileInfo } from '@/lib/file-utils'
import { DocumentSharingPermissionStatus } from '@prisma/client'
import {
  getEngagementStatus,
  isEngagementMemberReadOnlyWhenCompleted,
  isExternalEngagementRole,
  requireEngagementMember,
} from '@/lib/engagement-access'
import { isDocumentFinalized, parseSettingsFromDb, buildSettingsForDb } from '@/lib/sharing-settings'
import { applyDiagonalWatermark } from '@/lib/watermark-pdf'
import { isDescendantOfGrantedFolder } from '@/lib/document-sharing-access'

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
            let inheritedAccess = false

            if (isExternalEngagementRole(projectMember.role)) {
                const hasDirectShare = (() => {
                    const s = (document.settings as Record<string, unknown>) ?? {}
                    const isExtCollab = (s.share as any)?.externalCollaborator?.enabled === true
                    const isGuest = (s.share as any)?.guest?.enabled === true
                    return isExtCollab || isGuest
                })()

                if (!hasDirectShare) {
                    const reachable = await isDescendantOfGrantedFolder(document.id, user.id, projectId)
                    if (!reachable) {
                        return NextResponse.json({ error: 'File is not accessible' }, { status: 403 })
                    }
                    inheritedAccess = true
                }
            }

            sharingUser = await prisma.engagementDocumentSharingUser.create({
                data: {
                    projectDocumentId: document.id,
                    engagementId: projectId,
                    userId: user.id,
                    sharingPermissionStatus: inheritedAccess
                        ? DocumentSharingPermissionStatus.INHERITED
                        : DocumentSharingPermissionStatus.GRANTED,
                    createdBy: user.id,
                    updatedBy: user.id,
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

        const permissionAdapter = await getPermissionAdapter(connectorId)
        const contentAdapter = await getContentAdapter(connectorId)
        if (!permissionAdapter || !contentAdapter) {
            return NextResponse.json({ error: 'No active Google Drive connection found' }, { status: 500 })
        }

        if (sharingUser.connectorPermissionId) {
            try {
                await permissionAdapter.revokePermission(connectorId, fileInfo.externalId, sharingUser.connectorPermissionId)
            } catch (e) {
                console.warn('revokePermission failed (stale permissionId?), continuing:', e)
            }
            await prisma.engagementDocumentSharingUser.update({
                where: { id: sharingUser.id },
                data: { connectorPermissionId: null, updatedBy: user.id },
            })
        }

        const versionLocked = isDocumentFinalized(document.settings)

        let role: 'editor' | 'viewer' = projectMember.role === 'eng_viewer' ? 'viewer' : 'editor'
        if (engagementStatus && isEngagementMemberReadOnlyWhenCompleted(engagementStatus, projectMember.role)) {
            role = 'viewer'
        }
        if (versionLocked) {
            role = 'viewer'
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

        let targetFileId = fileInfo.externalId

        // Branch A: Viewer + sharePdfOnly = true
        if (sharePdfOnly) {
            try {
                // 1. Export to PDF
                const exported = await contentAdapter.getRenderableContent(connectorId, fileInfo.externalId, 'pdf')
                const pdfBytes = exported.stream as Buffer

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
                let pdfDriveId: string | undefined = guestOptions.sharedPdfDriveId ?? undefined
                const pdfFileName = `${fileName}.pdf`

                if (pdfDriveId) {
                    // Overwrite existing PDF
                    await contentAdapter.overwriteFileContent(connectorId, pdfDriveId, finalPdfBytes, 'application/pdf')
                } else {
                    // Upload new PDF next to the original file (same parent folder)
                    const originalMeta = await permissionAdapter.getFileMetadata(connectorId, fileInfo.externalId)
                    const parentFolderId = originalMeta?.parents?.[0]
                    if (!parentFolderId) {
                        throw new Error('Could not resolve parent folder for original file')
                    }
                    const created = await contentAdapter.createFile(connectorId, parentFolderId, pdfFileName, finalPdfBytes, 'application/pdf')
                    pdfDriveId = created.id

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
                        },
                        actorId: user.id,
                    })
                    await prisma.engagementDocument.update({
                        where: { id: document.id },
                        data: { settings: updatedSettings }
                    })
                }

                // 4. Always block Drive's native download — Firma controls download via its own action menu
                await contentAdapter.setCopyRestricted(connectorId, pdfDriveId, true)

                // 5. Revoke old permission on PDF if exists
                if (sharingUser.connectorPermissionId) {
                    try {
                        await permissionAdapter.revokePermission(connectorId, pdfDriveId, sharingUser.connectorPermissionId)
                    } catch (e) {
                        // Ignore revoke errors on PDF (may not exist yet)
                    }
                }

                // 6. Grant permission on PDF file
                targetFileId = pdfDriveId
            } catch (pdfError) {
                console.error('Failed to process PDF-only sharing:', pdfError)
                // Drive PDF operations failed — fall through with original file as target.
                // The grant may fail downstream too; the final !permissionId fallback
                // will return success so the modal still shows for valid members.
                targetFileId = fileInfo.externalId
            }
        } else {
            // Branch B: Viewer + sharePdfOnly = false -> always block Drive's native download
            if (isViewer) {
                try {
                    await contentAdapter.setCopyRestricted(connectorId, fileInfo.externalId, true)
                } catch (e) {
                    console.error('Failed to set copyRequiresWriterPermission:', e)
                }
            }
        }

        // EC persona: always block Drive's native download regardless of allowDownload setting
        if (!isViewer && isExternalEngagementRole(projectMember.role)) {
            try {
                await contentAdapter.setCopyRestricted(connectorId, fileInfo.externalId, true)
            } catch (e) {
                console.error('Failed to set copyRequiresWriterPermission for EC:', e)
            }
        }

        let permissionId = await permissionAdapter.grantFilePermission(connectorId, targetFileId, email, role, { message })

        if (!permissionId) {
            // Grant failed — most common cause: user already has a Drive permission on this file
            // (duplicate grant). Check listFilePermissions and reuse the existing one if found.
            try {
                const existingPerms = await permissionAdapter.listFilePermissions(connectorId, targetFileId)
                const existingPerm = existingPerms.find(
                    (p) => p.email?.toLowerCase() === email.toLowerCase()
                )
                if (existingPerm?.id) {
                    permissionId = existingPerm.id
                }
            } catch {
                // Non-fatal: if listing fails, fall through to error handling below
            }
        }

        if (!permissionId) {
            // Any active engagement member can proceed — the Drive grant failed (or no existing
            // permission was found), but membership is the access authority. Return success so the
            // modal shows. If the Drive issue is real, the user won't receive the verification email
            // and should contact support; the root cause is visible in server logs.
            await prisma.engagementDocumentSharingUser.update({
                where: { id: sharingUser.id },
                data: { sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED, updatedBy: user.id },
            })
            return NextResponse.json({ success: true })
        }

        await prisma.engagementDocumentSharingUser.update({
            where: { id: sharingUser.id },
            data: {
                connectorPermissionId: permissionId,
                sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
                updatedBy: user.id,
            },
        })

        return NextResponse.json({ success: true })
    } catch (e) {
        console.error('POST regrant sharing error', e)
        return NextResponse.json({ error: 'Failed to authenticate editor access' }, { status: 500 })
    }
}
