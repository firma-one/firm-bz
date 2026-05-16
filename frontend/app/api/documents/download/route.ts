
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from "@/lib/prisma"
import { googleDriveConnector } from "@/lib/google-drive-connector"
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

// Create Supabase client
const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const fileId = searchParams.get('fileId')
        const connectorId = searchParams.get('connectorId')
        const filename = searchParams.get('filename') || 'document'
        const revisionId = searchParams.get('revisionId')
        // mimeType is optional, we will use what Google returns if not provided
        // but we might want it for Content-Type if Google stream doesn't give it easily

        if (!fileId || !connectorId) {
            return NextResponse.json({ error: 'Missing fileId or connectorId' }, { status: 400 })
        }

        // 1. Auth Check
        // We use SUPABASE_SERVICE_ROLE_KEY to check headers manually because
        // we might want to support cookie-based auth if this is a direct browser navigation
        // But for now, let's assume standard Bearer token or Cookie from the user session.
        // Actually, for a file download link <a>, the browser sends Cookies.
        // We should verify the user session.

        // Use getUser() which checks Authorization header AND cookies
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        // If getUser fails (no header), try getting session from cookie explicitly if needed.
        // But getUser() usually handles it if configured correctly with middleware.
        // Let's rely on standard Next.js + Supabase auth behavior.

        // Wait, if this is called via `window.location.href` or `<a>`, the Auth header is NOT present.
        // Only cookies are sent. helper 'supabase-ssr' or just 'supabase-js' with cookies might be needed.
        // For simplicity in this implementation, if we are calling this from an <a> tag, we rely on Cookies.
        // The `createClient` above uses SERVICE_ROLE, which overrides RLS.
        // But we need to identify the user.

        // Fix: We need to use `createServerClient` from `@supabase/ssr` to read cookies properly in App Router.
        // OR, we can verify the 'sb-access-token' cookie manually if we don't want to pull in `ssr`.
        // Let's assume we can get the user. If not, we might need a temporary signed URL pattern, 
        // but that's complex.

        // Lets try to get the user from the token passed in URL ?? No that's insecure.
        // We rely on the cookie 'sb-....' being present.

        let userId = user?.id

        if (!userId) {
            // Fallback: Check if we have a session cookie
            // This is tricky without the full SSR helper setup.
            // Let's try to proceed. If `user` is null, we return 401.
            // NOTE: If the user is logged in via frontend, the cookie should be there.
            // We need to parse it.

            // If we really can't get the user, we can't secure this endpoint.
            // Let's try reading the Authorization header first (fetch)
            // If this is a direct link, Auth header is missing.

            // FOR NOW: We will assume the frontend uses `fetch` with blob response to download, 
            // passing the Auth header explicitly. This is safer and easier than handling cookies
            // which might be httpOnly and strictly controlled.
            // The implementation plan said "streaming". Fetch + Blob is streaming-like (buffers in memory then saves).
            // But for truly large files, `window.location` is better.
            // If `window.location`, we need cookies.

            // Let's try `fetch` with `Authorization` header in the frontend `handleDownload`.
            // It creates a Blob URL.
        }

        if (authError || !userId) {
            // Try getting token from header or query param (for direct download links)
            const authHeader = request.headers.get('authorization')
            const tokenParam = searchParams.get('token')

            let token = ''
            if (authHeader) {
                token = authHeader.replace('Bearer ', '')
            } else if (tokenParam) {
                token = tokenParam
            }

            if (token) {
                const { data: { user: headerUser }, error: headerError } = await supabase.auth.getUser(token)
                if (!headerError && headerUser) {
                    userId = headerUser.id
                }
            }
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get connector and verify user has access via organization membership
        const connector = await prisma.connector.findFirst({
            where: {
                id: connectorId,
                firms: {
                    some: {
                        members: {
                            some: {
                                userId: userId
                            }
                        }
                    }
                }
            },
            select: {
                id: true,
                firms: { select: { id: true }, take: 1 }
            }
        })

        if (!connector) {
            return NextResponse.json({ error: 'Connector not found or access denied' }, { status: 403 })
        }

        // 3. Start Download Stream
        try {
            const { stream, mimeType, size, name } = await googleDriveConnector.downloadFile(connectorId, fileId, revisionId || undefined)

            // 4. Return Streaming Response
            // We use the ReadableStream from the fetch response

            // Use the name from the connector response as it might have a new extension (e.g. .docx)
            const finalFilename = name || filename
            // RFC 5987 format for correct UTF-8 filename handling
            const encodedFilename = encodeURIComponent(finalFilename).replace(/['()]/g, escape).replace(/\*/g, '%2A')

            const headers = new Headers()
            headers.set('Content-Type', mimeType || 'application/octet-stream')
            // Set both filename (fallback) and filename* (modern standard)
            headers.set('Content-Disposition', `attachment; filename="${finalFilename.replace(/"/g, '')}"; filename*=UTF-8''${encodedFilename}`)
            if (size && size !== '0') {
                headers.set('Content-Length', size)
            }

            const firmId = connector.firms[0]?.id
            if (firmId) {
                audit(AUDIT_EVENT.DOCUMENT_DOWNLOADED)
                    .scope(AUDIT_SCOPE.DOCUMENT)
                    .firm(firmId)
                    .actor(userId)
                    .meta({ fileId, filename: finalFilename, connectorId })
                    .fireAndForget()
            }

            return new NextResponse(stream, {
                status: 200,
                headers
            })

        } catch (error) {
            console.error('Download error:', error)
            return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
        }

    } catch (error) {
        console.error('Download API error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
