import { NextRequest, NextResponse } from 'next/server'
import { discussionAccess, markDiscussionRead } from '@/lib/comments/discussions'

/**
 * POST /api/projects/[projectId]/documents/[documentId]/doc-comments/read
 * Marks the document's discussion read for the caller, as of now — sent when a comments pane opens
 * it, so the Discussions page drops its unread dot.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  const { projectId, documentId } = await params
  const access = await discussionAccess(projectId, documentId)
  if (access instanceof NextResponse) return access
  await markDiscussionRead(access.userId, access.documentId, projectId)
  return NextResponse.json({ ok: true })
}
