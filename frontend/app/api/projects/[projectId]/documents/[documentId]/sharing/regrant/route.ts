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
import { logger } from '@/lib/logger'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { GraphSharingPolicyError } from '@/lib/connectors/adapters/onedrive-permission-adapter'

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
        if (fileInfo.documentType === 'LINK') {
            return NextResponse.json({ error: 'This document is a link and does not support secure access grants' }, { status: 400 })
        }

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

        // resolveEngagementConnectorId's priority chain is: documentConnectorId (if set) → the
        // CLIENT's own connector → firm-level legacy connector (last resort only). The route
        // previously fell back straight from document.connectorId to the legacy Firm.connectorId,
        // skipping the client's actual connector entirely — for a firm with both a Google and a
        // OneDrive connector, a document with no connectorId of its own could silently resolve to
        // the wrong (Google) connector even though its client is OneDrive/SharePoint-attached.
        // Confirmed live 2026-08-14: a SharePoint document's regrant granted a Google Drive
        // permission instead, because this fallback picked the firm's legacy Google connector.
        // See .claude/plans/connector-microsoft-impl.md.
        const connectorId = await resolveEngagementConnectorId(projectId, document.connectorId)

        if (!connectorId) {
            return NextResponse.json({ error: 'No active storage connection found' }, { status: 500 })
        }

        const permissionAdapter = await getPermissionAdapter(connectorId)
        const contentAdapter = await getContentAdapter(connectorId)
        if (!permissionAdapter || !contentAdapter) {
            return NextResponse.json({ error: 'No active storage connection found' }, { status: 500 })
        }

        const connectorRecord = await prisma.connector.findUnique({ where: { id: connectorId }, select: { type: true } })
        const isOneDriveConnector = connectorRecord?.type === 'ONEDRIVE'

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
        const message = `POCKETT SECURE ACCESS\n\nYou have requested to open "${fileName}". For your security, your storage provider requires a one-time email verification. Please click the "Open" button below to receive your one-time passcode and access the document.`

        let targetFileId = fileInfo.externalId
        // Tracks whether setCopyRestricted(true) was requested on the eventual target file, so
        // the OneDrive grant below can use its download-blocked link path instead of a normal
        // /invite grant — see IConnectorPermissionAdapter.grantFilePermission's preventDownload
        // doc-comment and item 12 in .claude/plans/connector-microsoft-impl.md for why OneDrive
        // needs this threaded into the grant call itself rather than a separate file-level toggle.
        let copyRestricted = false

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
                copyRestricted = true

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
                    copyRestricted = true
                } catch (e) {
                    console.error('Failed to set copyRequiresWriterPermission:', e)
                }
            }
        }

        // EC persona: always block Drive's native download regardless of allowDownload setting
        if (!isViewer && isExternalEngagementRole(projectMember.role)) {
            try {
                await contentAdapter.setCopyRestricted(connectorId, fileInfo.externalId, true)
                copyRestricted = true
            } catch (e) {
                console.error('Failed to set copyRequiresWriterPermission for EC:', e)
            }
        }

        // Resolve the document's own webViewLink FIRST — needed both as the fallback "open" URL
        // and as inviteRedirectUrl below, so a first-time external guest's redemption lands
        // directly on this document rather than a generic page.
        let documentUrl: string | undefined
        if (isOneDriveConnector) {
            try {
                const filesMeta = await permissionAdapter.getFilesMetadata?.(connectorId, [targetFileId])
                documentUrl = filesMeta?.[0]?.webViewLink
                if (!documentUrl) {
                    logger.warn('[regrant] Could not resolve document webViewLink', { connectorId, targetFileId })
                }
            } catch (metaErr) {
                logger.error('[regrant] Failed to resolve document webViewLink', metaErr as Error, 'OneDrive', { targetFileId })
            }
        }

        // Pre-invite the guest to capture inviteRedeemUrl BEFORE the actual permission grant —
        // deliberately SEQUENTIAL, not parallel. Parallelizing these (tried 2026-08-15 to fix a
        // timeout) caused a real regression: opening the returned inviteRedeemUrl signed the user
        // in successfully but landed on SharePoint's "You need access" page — confirmed live
        // against BOTH a brand-new external Gmail address AND a returning one from a prior test,
        // ruling out "only races for genuinely-new identities." The two Graph calls are NOT safely
        // independent despite both targeting the same email: driveItem:invite (called via
        // grantFilePermission) does its own internal guest resolution/creation when it doesn't yet
        // see a guest for that email, and running that concurrently with our own explicit
        // preInviteGuest call risked the two resolving to different guest objects — the permission
        // landing on one, the redemption ticket pointing at the other. Reverted to sequential;
        // the earlier 16.6s-over-15s-timeout problem is addressed by raising the client timeout
        // (use-secure-open-document.ts) instead of by parallelizing. inviteRedeemUrl is a
        // ticket-bound redemption link tied to this specific invitation; when available it
        // replaces documentUrl as the link opened for OneDrive/SharePoint, resolving identity
        // server-side instead of showing a genuinely new external guest a blank "enter your email"
        // sign-in prompt. Both best-effort — either failing just falls back to prior behavior. See
        // preInviteGuest's doc comment (onedrive-permission-adapter.ts) and
        // .claude/plans/connector-microsoft-impl.md.
        if (isOneDriveConnector) {
            try {
                const { inviteRedeemUrl } = await permissionAdapter.preInviteGuest?.(connectorId, email, documentUrl) ?? { inviteRedeemUrl: null }
                if (inviteRedeemUrl) {
                    documentUrl = inviteRedeemUrl
                    // Ticket's `user` query param is the guest object ID this redemption resolves
                    // to — logged here so it can be diffed against grantItemPermission's
                    // grantedToUserId below to confirm/rule out an identity mismatch between the
                    // two Graph calls. See .claude/plans/connector-microsoft-impl.md.
                    try {
                        const ticketUserId = new URL(inviteRedeemUrl).searchParams.get('rd')
                            ? new URLSearchParams(new URL(decodeURIComponent(new URL(inviteRedeemUrl).searchParams.get('rd')!)).search).get('user')
                            : null
                        logger.warn('[regrant] inviteRedeemUrl ticket details', { connectorId, targetFileId, email, ticketUserId, inviteRedeemUrl })
                    } catch (parseErr) {
                        logger.warn('[regrant] Could not parse ticketUserId from inviteRedeemUrl', { inviteRedeemUrl, error: parseErr instanceof Error ? parseErr.message : String(parseErr) })
                    }
                }
            } catch (inviteErr) {
                logger.warn('[regrant] preInviteGuest failed, falling back to webViewLink', {
                    connectorId, targetFileId, email, error: inviteErr instanceof Error ? inviteErr.message : String(inviteErr),
                })
            }
        }

        let permissionId: string | null = null
        try {
            permissionId = await permissionAdapter.grantFilePermission(connectorId, targetFileId, email, role, { message, preventDownload: copyRestricted })
        } catch (grantErr) {
            if (grantErr instanceof GraphSharingPolicyError) {
                // Confirmed live 2026-08-14: this specific Graph error only occurs for external
                // (cross-tenant-domain) recipients — the identical /invite call succeeds for an
                // internal recipient on the same tenant. Not something the app can fix or retry;
                // surface it distinctly instead of falling back to the generic modal, which
                // previously gave no indication that sharing had actually failed.
                logger.warn('[regrant] Graph sharing policy blocked this grant', {
                    connectorId, targetFileId, email, error: grantErr.message,
                })
                return NextResponse.json({
                    error: `This document's storage provider (SharePoint) is configured to block sharing with external accounts like ${email}. Ask your Microsoft 365 administrator to allow external sharing for this site, or ask your engagement lead to switch you to an internal Microsoft account.`,
                    code: 'external_sharing_blocked',
                }, { status: 403 })
            }
            throw grantErr
        }

        if (!permissionId) {
            // Grant failed — most common cause: user already has a Drive permission on this file
            // (duplicate grant). Check listFilePermissions and reuse the existing one if found.
            try {
                const existingPerms = await permissionAdapter.listFilePermissions(connectorId, targetFileId)
                logger.warn('[regrant] Grant failed — existing permissions on this item', {
                    connectorId, targetFileId, email, existingPerms,
                })
                const existingPerm = existingPerms.find(
                    (p) => p.email?.toLowerCase() === email.toLowerCase()
                )
                if (existingPerm?.id) {
                    permissionId = existingPerm.id
                }
            } catch (listErr) {
                logger.warn('[regrant] listFilePermissions also failed', {
                    connectorId, targetFileId, error: listErr instanceof Error ? listErr.message : String(listErr),
                })
            }
        }

        if (!permissionId) {
            // Any active engagement member can proceed — the Drive/Graph grant failed (or no
            // existing permission was found), but membership is the access authority. Return
            // success so the modal shows. The actual Graph/Drive failure reason is logged by the
            // adapter (e.g. onedrive-permission-adapter.ts's grantItemPermission) — this line just
            // confirms the route hit this fallback path, since it previously returned silently
            // with no trace at all here.
            logger.warn('[regrant] grantFilePermission returned no permissionId — falling back to membership-only access', {
                connectorId, targetFileId, email, isOneDriveConnector,
            })
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

        // documentUrl was already resolved above (webViewLink, upgraded to inviteRedeemUrl when
        // preInviteGuest succeeded) — Graph's own sendInvitation email is known to silently fail
        // to deliver for recipients with no existing Microsoft account (unresolved Graph/B2B guest
        // invitation delivery issue), and the permission above is granted regardless of whether it
        // sends — sendInvitation only controls the notification email and has zero effect on the
        // requireSignIn/OTP authorization gate. Rather than route through any email, this is a
        // synchronous click from the recipient's own browser (both first grant and regrant) — the
        // recipient is already present, so the frontend opens documentUrl directly in a new tab,
        // same as Google's existing "Open in browser" pattern elsewhere in this app
        // (document-edit-sheet.tsx). See .claude/plans/connector-microsoft-impl.md.
        return NextResponse.json({ success: true, documentUrl })
    } catch (e) {
        console.error('POST regrant sharing error', e)
        return NextResponse.json({ error: 'Failed to authenticate editor access' }, { status: 500 })
    }
}
