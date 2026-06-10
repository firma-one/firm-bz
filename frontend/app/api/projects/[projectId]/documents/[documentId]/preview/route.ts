import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from "@/lib/google-drive-connector"
import { getFileInfo } from '@/lib/file-utils'
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

        // 2. Permission check — user must belong to the organisation
        const membership = await prisma.firmMember.findFirst({
            where: { userId: user.id, firmId: fileInfo.organizationId }
        })
        if (!membership) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }

        // 3. Find the connector that indexed this file (preferred for access), falling
        //    back to any active connector for the org.
        let connector = fileInfo.connectorId
            ? await prisma.connector.findFirst({
                where: { id: fileInfo.connectorId, type: 'GOOGLE_DRIVE', status: 'ACTIVE' }
            })
            : null

        if (!connector) {
            const org = await prisma.firm.findUnique({
                where: { id: fileInfo.organizationId },
                include: { connector: true }
            })
            connector = org?.connector && org.connector.type === 'GOOGLE_DRIVE' && org.connector.status === 'ACTIVE'
                ? org.connector
                : null
        }

        if (!connector) {
            return NextResponse.json({ error: 'No active storage connector found' }, { status: 404 })
        }

        // 4. Get a fresh access token
        const accessToken = await googleDriveConnector.getAccessToken(connector.id)
        if (!accessToken) {
            logger.error(`Failed to get access token for connector ${connector.id}`, undefined, 'PreviewProxy', { projectId, documentId: documentIdParam })
            return NextResponse.json({ error: 'Failed to authenticate with Google Drive' }, { status: 401 })
        }

        // 5. Fetch file metadata — include exportLinks so we can convert Office files to PDF.
        //    supportsAllDrives=true is required for files stored in Shared Drives.
        const metaRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileInfo.externalId}?fields=mimeType,name,exportLinks&supportsAllDrives=true`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        )

        if (!metaRes.ok) {
            const errText = await metaRes.text()
            const status = metaRes.status
            logger.error(`Preview metadata fetch failed for ${fileInfo.externalId}: ${status}`, undefined, 'PreviewProxy', {
                projectId, documentId: documentIdParam, externalId: fileInfo.externalId, status, connectorId: connector.id
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

        const metadata = await metaRes.json()
        const mimeType: string = metadata.mimeType ?? ''
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

        if (pdfExportUrl) {
            // Covers Google Docs/Sheets/Slides AND uploaded DOCX/PPTX/XLSX
            downloadUrl = pdfExportUrl
            contentType = 'application/pdf'
        } else if (mimeType === 'application/pdf') {
            downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileInfo.externalId}?alt=media&supportsAllDrives=true`
            contentType = 'application/pdf'
        } else if (mimeType.startsWith('image/')) {
            downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileInfo.externalId}?alt=media&supportsAllDrives=true`
            contentType = mimeType
        } else {
            // Last resort: attempt Drive's export-to-PDF endpoint.
            // Works reliably for Google Workspace files (Docs/Sheets/Slides) and
            // occasionally for uploaded Office files that Google has internally processed.
            const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileInfo.externalId}/export?mimeType=application/pdf&supportsAllDrives=true`
            const exportRes = await fetch(exportUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } })
            if (exportRes.ok) {
                const exportHeaders = new Headers()
                exportHeaders.set('Content-Type', 'application/pdf')
                exportHeaders.set('Content-Disposition', 'inline')
                exportHeaders.set('Cache-Control', 'private, max-age=3600')
                return new NextResponse(exportRes.body, { status: 200, headers: exportHeaders })
            }
            // Export not supported for this file type; inform the user.
            logger.info(`Preview: export to PDF not available (${exportRes.status}) for ${mimeType} ${fileInfo.externalId}`, 'PreviewProxy')
            return unsupportedPreviewHtml(mimeType)
        }

        // 7. Fetch the content and stream it back to the client
        const contentRes = await fetch(downloadUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        if (!contentRes.ok) {
            const errText = await contentRes.text()
            logger.error(`Preview content fetch failed for ${fileInfo.externalId}: ${contentRes.status} ${errText}`, undefined, 'PreviewProxy', {
                projectId, documentId: documentIdParam, status: contentRes.status
            })
            return NextResponse.json({ error: 'Failed to fetch document content from Google Drive' }, { status: 502 })
        }

        const headers = new Headers()
        headers.set('Content-Type', contentType)
        headers.set('Content-Disposition', 'inline')
        headers.set('Cache-Control', 'private, max-age=3600')

        audit(AUDIT_EVENT.DOCUMENT_OPENED)
            .scope(AUDIT_SCOPE.DOCUMENT)
            .firm(fileInfo.organizationId)
            .client(engagementClientId)
            .engagement(projectId)
            .actor(user.id)
            .meta({ externalId: fileInfo.externalId, mimeType: contentType })
            .fireAndForget()

        return new NextResponse(contentRes.body, { status: 200, headers })

    } catch (error) {
        logger.error('Preview proxy error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
