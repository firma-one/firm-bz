import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { requireEngagementMember } from '@/lib/engagement-access'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { getContentAdapter } from '@/lib/connectors/registry'
import { ConnectorContentError } from '@/lib/connectors/types'
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

        // 4. Resolve the best inline-previewable representation of the file. This hides all
        //    Drive-specific indirection (shortcuts, .gdoc/.gsheet stubs, PDF export/conversion
        //    decisions) behind the content adapter — see getPreviewableContent for details.
        const contentAdapter = await getContentAdapter(connector.id)
        if (!contentAdapter) {
            return NextResponse.json({ error: 'No content adapter available for connector' }, { status: 400 })
        }

        let content: { stream: ReadableStream | Buffer; mimeType: string; fileName: string }
        try {
            content = await contentAdapter.getPreviewableContent(connector.id, fileInfo.externalId)
        } catch (err) {
            if (err instanceof ConnectorContentError) {
                if (err.code === 'not_found') {
                    return NextResponse.json({
                        error: 'File not found in Google Drive',
                        details: 'The file may have been deleted or the linked account no longer has access.',
                    }, { status: 404 })
                }
                if (err.code === 'forbidden') {
                    return NextResponse.json({
                        error: 'Access denied to Google Drive file',
                        details: 'The account linked to Pockett does not have permission to view this file.',
                    }, { status: 403 })
                }
                return unsupportedPreviewHtml(err.mimeType ?? 'unknown')
            }
            logger.error(`Preview content fetch failed for ${fileInfo.externalId}: ${err}`, undefined, 'PreviewProxy', {
                projectId, documentId: documentIdParam
            })
            return NextResponse.json({ error: 'Failed to fetch document content from Google Drive' }, { status: 502 })
        }

        const headers = new Headers()
        headers.set('Content-Type', content.mimeType)
        headers.set('Content-Disposition', 'inline')
        headers.set('Cache-Control', 'no-store')
        // Discourage browser save/download/print via Permissions-Policy
        headers.set('Permissions-Policy', 'clipboard-write=(), downloads=()')

        audit(AUDIT_EVENT.DOCUMENT_OPENED)
            .scope(AUDIT_SCOPE.DOCUMENT)
            .firm(fileInfo.organizationId)
            .client(engagementClientId)
            .engagement(projectId)
            .actor(user.id)
            .meta({ externalId: fileInfo.externalId, mimeType: content.mimeType })
            .fireAndForget()

        const body = Buffer.isBuffer(content.stream) ? new Uint8Array(content.stream) : content.stream
        return new NextResponse(body, { status: 200, headers })

    } catch (error) {
        logger.error('Preview proxy error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
