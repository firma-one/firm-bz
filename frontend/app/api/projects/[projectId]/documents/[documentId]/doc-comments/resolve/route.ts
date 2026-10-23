import { NextRequest, NextResponse } from 'next/server'
import { discussionAccess, setDiscussionResolved } from '@/lib/comments/discussions'

/**
 * POST   /api/projects/[projectId]/documents/[documentId]/doc-comments/resolve — resolves the discussion.
 * DELETE /api/projects/[projectId]/documents/[documentId]/doc-comments/resolve — reopens it.
 * Anyone who may post in the discussion may resolve or reopen it; a new comment reopens it too.
 */
type Params = { params: Promise<{ projectId: string; documentId: string }> }

async function setResolved({ params }: Params, resolve: boolean) {
  const { projectId, documentId } = await params
  const access = await discussionAccess(projectId, documentId)
  if (access instanceof NextResponse) return access
  await setDiscussionResolved(access.documentId, projectId, resolve ? access.userId : null)
  return NextResponse.json({ ok: true, resolved: resolve })
}

export async function POST(_request: NextRequest, ctx: Params) {
  return setResolved(ctx, true)
}

export async function DELETE(_request: NextRequest, ctx: Params) {
  return setResolved(ctx, false)
}
