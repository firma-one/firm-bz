import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from "@/lib/google-drive-connector"
import { getFileInfo } from '@/lib/file-utils'
import { requireEngagementMember } from '@/lib/engagement-access'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { logger } from '@/lib/logger'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

function unsupportedPreviewHtml(mimeType: string): NextResponse {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center;
           height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #f8fafc; color: #475569; }
    .card { text-align: center; padding: 2rem; max-width: 320px; }
    .icon { font-size: 2.5rem; margin-bottom: 1rem; }
    h2 { margin: 0 0 0.5rem; font-size: 1rem; font-weight: 600; color: #1e293b; }
    p { margin: 0; font-size: 0.8125rem; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📄</div>
    <h2>Preview not available</h2>
    <p>This file type (<code>${mimeType}</code>) cannot be displayed inline.<br/>Use the download button to access the file.</p>
  </div>
</body>
</html>`
    return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { projectId, documentId: documentIdParam } = await params

        // 1. Resolve file info (organizationId + Google Drive externalId)
        const fileInfo = await getFileInfo(projectId, documentIdParam)
        if (!fileInfo) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }
        const engagementClientId = await prisma.engagement.findUnique({ where: { id: projectId }, select: { clientId: true } }).then((e) => e?.clientId ?? undefined)

        // 2. Permission check — engagement membership is the access gate for preview.
        const member = await requireEngagementMember(projectId, user.id)
        if (!member) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }

        // resolvedExternalId starts as the indexed Drive file ID and may be updated
        // below if the file turns out to be a shortcut pointing to a different file.
        let resolvedExternalId = fileInfo.externalId

        // 3. Find the connector that indexed this file (preferred for access), falling
        //    back to any active connector for the org.
        const connectorId = await resolveEngagementConnectorId(projectId, fileInfo.connectorId)
        if (!connectorId) {
            return NextResponse.json({ error: 'No active storage connector found' }, { status: 404 })
        }
        const connector = await prisma.connector.findFirst({
            where: { id: connectorId, type: 'GOOGLE_DRIVE', status: 'ACTIVE' }
        })
        if (!connector) {
            return NextResponse.json({ error: 'No active storage connector found' }, { status: 404 })
        }

        // 4. Get a fresh access token
        const accessToken = await googleDriveConnector.getAccessToken(connector.id)
        if (!accessToken) {
            logger.error(`Failed to get access token for connector ${connector.id}`, undefined, 'PreviewProxy', { projectId, documentId: documentIdParam })
            return NextResponse.json({ error: 'Failed to authenticate with Google Drive' }, { status: 401 })
        }

        // 5. Fetch file metadata — include exportLinks and shortcutDetails.
        //    supportsAllDrives=true is required for files stored in Shared Drives.
        const metaRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${resolvedExternalId}?fields=mimeType,name,size,exportLinks,shortcutDetails&supportsAllDrives=true`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        )

        if (!metaRes.ok) {
            const errText = await metaRes.text()
            const status = metaRes.status
            logger.error(`Preview metadata fetch failed for ${resolvedExternalId}: ${status}`, undefined, 'PreviewProxy', {
                projectId, documentId: documentIdParam, externalId: resolvedExternalId, status, connectorId: connector.id
            })
            if (status === 404) {
                return NextResponse.json({
                    error: 'File not found in Google Drive',
                    details: 'The file may have been deleted or the linked account no longer has access.',
                }, { status: 404 })
            }
            if (status === 403) {
                return NextResponse.json({
                    error: 'Access denied to Google Drive file',
                    details: 'The account linked to Pockett does not have permission to view this file.',
                }, { status: 403 })
            }
            return NextResponse.json({ error: 'Failed to fetch document metadata from Google Drive' }, { status: 502 })
        }

        let metadata = await metaRes.json()

        // Resolve shortcuts — .gdoc/.gsheet/.gslides stubs are Drive shortcuts pointing
        // to the real file. Fetch the target file's metadata to get the actual mimeType.
        if (metadata.mimeType === 'application/vnd.google-apps.shortcut' && metadata.shortcutDetails?.targetId) {
            const targetId = metadata.shortcutDetails.targetId
            const targetRes = await fetch(
                `https://www.googleapis.com/drive/v3/files/${targetId}?fields=mimeType,name,exportLinks&supportsAllDrives=true`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            )
            if (targetRes.ok) {
                resolvedExternalId = targetId
                metadata = await targetRes.json()
            } else {
                logger.warn(`Preview: could not resolve shortcut target ${targetId}`, 'PreviewProxy')
                return unsupportedPreviewHtml('application/vnd.google-apps.shortcut')
            }
        }

        let mimeType: string = metadata.mimeType ?? ''

        // .gdoc / .gsheet / .gslides stubs uploaded to Drive have mimeType=application/octet-stream
        // but are tiny JSON files containing the real Google Doc/Sheet/Slides ID.
        // Detect them by size (≤ 1 KB) and parse the stub to get the real file ID.
        if (mimeType === 'application/octet-stream') {
            const stubSizeStr = metadata.size ?? metadata.fileSize
            const stubSize = stubSizeStr ? parseInt(String(stubSizeStr), 10) : NaN
            if (isNaN(stubSize) || stubSize <= 1024) {
                try {
                    const stubRes = await fetch(
                        `https://www.googleapis.com/drive/v3/files/${resolvedExternalId}?alt=media&supportsAllDrives=true`,
                        { headers: { 'Authorization': `Bearer ${accessToken}` } }
                    )
                    if (stubRes.ok) {
                        const stubText = await stubRes.text()
                        const stubJson = JSON.parse(stubText)
                        const realDocId: string | undefined = stubJson.doc_id ?? stubJson.sheet_id ?? stubJson.presentation_id
                        if (realDocId) {
                            const realRes = await fetch(
                                `https://www.googleapis.com/drive/v3/files/${realDocId}?fields=mimeType,name,exportLinks&supportsAllDrives=true`,
                                { headers: { 'Authorization': `Bearer ${accessToken}` } }
                            )
                            if (realRes.ok) {
                                resolvedExternalId = realDocId
                                const realMeta = await realRes.json()
                                mimeType = realMeta.mimeType ?? mimeType
                                // Merge exportLinks from the real file
                                if (realMeta.exportLinks) metadata.exportLinks = realMeta.exportLinks
                                logger.info(`Preview: resolved .gdoc stub ${fileInfo.externalId} → ${realDocId} (${mimeType})`, 'PreviewProxy')
                            }
                        }
                    }
                } catch (e) {
                    logger.warn(`Preview: failed to parse .gdoc stub ${resolvedExternalId}: ${e}`, 'PreviewProxy')
                }
            }
        }

        // exportLinks are populated for Google Workspace files and for uploaded Office files
        // that Google has processed/converted (DOCX, PPTX, XLSX etc.).
        const pdfExportUrl: string | undefined = metadata.exportLinks?.['application/pdf']

        // 6. Choose how to serve the file so the browser renders it inline (not as a download).
        //
        //    exportLinks['application/pdf'] is populated by Google for both native Workspace
        //    files (Docs, Sheets, Slides) and uploaded Office files (DOCX, PPTX, XLSX) that
        //    Google has processed. Using it uniformly avoids special-casing by file type.
        //
        //    Priority:
        //      a) exportLinks['application/pdf'] exists  →  fetch & stream as PDF  (covers
        //         all Workspace files AND uploaded Office files in one path)
        //      b) Already a PDF  →  stream raw bytes inline
        //      c) Image  →  stream raw bytes inline (browsers render natively)
        //      d) Anything else  →  return an HTML "cannot preview" message in the iframe

        let downloadUrl: string
        let contentType: string

        const isGoogleWorkspaceMime = mimeType.startsWith('application/vnd.google-apps.')

        if (pdfExportUrl && !isGoogleWorkspaceMime) {
            // exportLinks path — for uploaded Office files Google has auto-converted
            downloadUrl = pdfExportUrl
            contentType = 'application/pdf'
        } else if (isGoogleWorkspaceMime) {
            // Native Google Workspace files: always use exportFileToPdf (handles auth correctly)
            try {
                const pdfBytes = await googleDriveConnector.exportFileToPdf(connector.id, resolvedExternalId)
                const exportHeaders = new Headers()
                exportHeaders.set('Content-Type', 'application/pdf')
                exportHeaders.set('Content-Disposition', 'inline')
                exportHeaders.set('Cache-Control', 'private, max-age=3600')
                exportHeaders.set('Permissions-Policy', 'clipboard-write=(), downloads=()')
                audit(AUDIT_EVENT.DOCUMENT_OPENED)
                    .scope(AUDIT_SCOPE.DOCUMENT)
                    .firm(fileInfo.organizationId)
                    .client(engagementClientId)
                    .engagement(projectId)
                    .actor(user.id)
                    .meta({ externalId: resolvedExternalId, mimeType: 'application/pdf' })
                    .fireAndForget()
                return new NextResponse(new Uint8Array(pdfBytes), { status: 200, headers: exportHeaders })
            } catch (err) {
                logger.warn(`Preview: exportFileToPdf failed for GWorkspace file ${resolvedExternalId}: ${err}`, 'PreviewProxy')
                return unsupportedPreviewHtml(mimeType)
            }
        } else if (mimeType === 'application/pdf') {
            downloadUrl = `https://www.googleapis.com/drive/v3/files/${resolvedExternalId}?alt=media&supportsAllDrives=true`
            contentType = 'application/pdf'
        } else if (mimeType.startsWith('image/')) {
            downloadUrl = `https://www.googleapis.com/drive/v3/files/${resolvedExternalId}?alt=media&supportsAllDrives=true`
            contentType = mimeType
        } else {
            // For Office files (DOCX, XLSX, PPTX) and Google Workspace files without exportLinks,
            // use exportFileToPdf which copy-converts to a Google Workspace file first then exports.
            const OFFICE_MIMES = [
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/vnd.ms-powerpoint',
                'application/vnd.google-apps.document',
                'application/vnd.google-apps.spreadsheet',
                'application/vnd.google-apps.presentation',
            ]
            if (OFFICE_MIMES.includes(mimeType)) {
                try {
                    const pdfBytes = await googleDriveConnector.exportFileToPdf(connector.id, resolvedExternalId)
                    const exportHeaders = new Headers()
                    exportHeaders.set('Content-Type', 'application/pdf')
                    exportHeaders.set('Content-Disposition', 'inline')
                    exportHeaders.set('Cache-Control', 'private, max-age=3600')
                    exportHeaders.set('Permissions-Policy', 'clipboard-write=(), downloads=()')
                    return new NextResponse(new Uint8Array(pdfBytes), { status: 200, headers: exportHeaders })
                } catch (err) {
                    logger.warn(`Preview: exportFileToPdf failed for ${mimeType} ${resolvedExternalId}`, 'PreviewProxy')
                }
            }
            return unsupportedPreviewHtml(mimeType)
        }

        // 7. Fetch the content and stream it back to the client
        const contentRes = await fetch(downloadUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        if (!contentRes.ok) {
            const errText = await contentRes.text()
            logger.error(`Preview content fetch failed for ${resolvedExternalId}: ${contentRes.status} ${errText}`, undefined, 'PreviewProxy', {
                projectId, documentId: documentIdParam, status: contentRes.status
            })
            return NextResponse.json({ error: 'Failed to fetch document content from Google Drive' }, { status: 502 })
        }

        const headers = new Headers()
        headers.set('Content-Type', contentType)
        headers.set('Content-Disposition', 'inline')
        headers.set('Cache-Control', 'private, max-age=3600')
        // Discourage browser save/download/print via Permissions-Policy
        headers.set('Permissions-Policy', 'clipboard-write=(), downloads=()')

        audit(AUDIT_EVENT.DOCUMENT_OPENED)
            .scope(AUDIT_SCOPE.DOCUMENT)
            .firm(fileInfo.organizationId)
            .client(engagementClientId)
            .engagement(projectId)
            .actor(user.id)
            .meta({ externalId: resolvedExternalId, mimeType: contentType })
            .fireAndForget()

        return new NextResponse(contentRes.body, { status: 200, headers })

    } catch (error) {
        logger.error('Preview proxy error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
