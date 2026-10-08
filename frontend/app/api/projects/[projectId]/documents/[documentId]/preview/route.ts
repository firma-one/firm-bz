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

/**
 * A first Office-to-PDF conversion runs ~5-10s. When the provider rejects it, the adapter
 * trims the workbook and converts again (download + upload + a second conversion), so the
 * worst case is roughly double that. Without an explicit limit this route inherits the
 * account default, and a timeout would replace our own "preview could not be generated"
 * card with the platform's 504 page inside the iframe.
 */
export const maxDuration = 60

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
    ))
}

function previewMessageHtml({ icon, title, body }: { icon: string; title: string; body: string }): NextResponse {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center;
           height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #f8fafc; color: #475569; }
    .card { text-align: center; padding: 2rem; max-width: 340px; }
    .icon { font-size: 2.5rem; margin-bottom: 1rem; }
    h2 { margin: 0 0 0.5rem; font-size: 1rem; font-weight: 600; color: #1e293b; }
    p { margin: 0; font-size: 0.8125rem; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h2>${title}</h2>
    <p>${body}</p>
  </div>
</body>
</html>`
    return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
}

/** The file's *type* has no inline representation at all. */
function unsupportedPreviewHtml(mimeType: string): NextResponse {
    return previewMessageHtml({
        icon: '📄',
        title: 'Preview not available',
        body: `This file type (<code>${escapeHtml(mimeType)}</code>) cannot be displayed inline.<br/>Use the download button to access the file.`,
    })
}

/**
 * The type IS previewable, but this particular file could not be converted — and the
 * connector has already exhausted its retry. Say that plainly instead of blaming the
 * file type, and point at the one action that always works.
 */
function conversionFailedHtml(detail?: string): NextResponse {
    return previewMessageHtml({
        icon: '⚠️',
        title: 'Preview could not be generated',
        body: `${detail ? `${escapeHtml(detail)}<br/><br/>` : ''}The file itself is intact — please use the download button to open it.`,
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
        if (fileInfo.documentType === 'LINK') {
            return NextResponse.json({ error: 'This document is a link and cannot be previewed' }, { status: 400 })
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
            where: { id: connectorId, status: 'ACTIVE' }
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
            // `?native=1` asks for the original workbook instead of a PDF conversion, for a
            // client that renders spreadsheets as a grid. The adapters fall back to the
            // converted PDF whenever they cannot serve one, so the response is always
            // something the pane can render — it just checks what it got.
            const preferNative = request.nextUrl.searchParams.get('native') === '1'
            content = await contentAdapter.getPreviewableContent(connector.id, fileInfo.externalId, { preferNative })
        } catch (err) {
            if (err instanceof ConnectorContentError) {
                if (err.code === 'not_found') {
                    return NextResponse.json({
                        error: 'File not found in storage',
                        details: 'The file may have been deleted or the linked account no longer has access.',
                    }, { status: 404 })
                }
                if (err.code === 'forbidden') {
                    return NextResponse.json({
                        error: 'Access denied to storage file',
                        details: 'The account linked to Pockett does not have permission to view this file.',
                    }, { status: 403 })
                }
                if (err.code === 'conversion_failed') {
                    return conversionFailedHtml(err.detail)
                }
                return unsupportedPreviewHtml(err.mimeType ?? 'unknown')
            }
            logger.error(`Preview content fetch failed for ${fileInfo.externalId}: ${err}`, undefined, 'PreviewProxy', {
                projectId, documentId: documentIdParam
            })
            return NextResponse.json({ error: 'Failed to fetch document content from storage' }, { status: 502 })
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
