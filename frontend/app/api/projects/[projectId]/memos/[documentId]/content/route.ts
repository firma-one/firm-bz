import { NextRequest, NextResponse } from 'next/server'
import { memoFailureResponse, memoRouteAccess } from '@/lib/memos/memo-access'
import { memoWebUrl, readMemoText } from '@/lib/memos/memo-store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[projectId]/memos/[documentId]/content
 *
 * One internal memo's Markdown, for Discussions › Memos to show it (components/projects/engagement-memos.tsx),
 * with the link that opens it in its storage when storage gives one (`webUrl`, else null).
 *
 * Read the way Find actions reads it (readMemoText): only a memo file of this engagement, in its memos
 * folder; anything else, another engagement's memo included, is not found. The text goes to this
 * browser and nowhere else: it isn't stored, indexed or sent to Brio, and the answer isn't cached.
 *
 * Who: a Lead or a Contributor · Full Access (lib/memos/memo-access.ts); a Reviewer or a Limited Access
 * contributor is refused. A completed engagement is read only, and reading is all this does.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
    try {
        const { projectId, documentId } = await params
        const access = await memoRouteAccess(projectId)
        if (!access.ok) return access.response

        const [read, webUrl] = await Promise.all([
            readMemoText(projectId, documentId),
            memoWebUrl(projectId, documentId),
        ])
        if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status })

        return NextResponse.json(
            { data: { text: read.text, webUrl } },
            { headers: { 'Cache-Control': 'private, no-store' } },
        )
    } catch (error) {
        return memoFailureResponse(error, '[memos] content GET failed:', "Something went wrong on our side, so this memo didn't load. Try again.")
    }
}
