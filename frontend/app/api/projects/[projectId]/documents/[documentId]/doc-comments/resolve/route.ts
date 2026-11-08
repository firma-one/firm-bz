import { NextRequest, NextResponse } from 'next/server'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
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
  const completed = await blockIfEngagementCompleted(projectId)
  if (completed) return completed
  try {
    await setDiscussionResolved(access.documentId, projectId, resolve ? access.userId : null)
  } catch (e) {
    console.error('doc-comments resolve: not saved', { projectId, documentId, resolve, message: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: "It wasn't saved on our side. Try again." }, { status: 500 })
  }
  return NextResponse.json({ ok: true, resolved: resolve })
}

export async function POST(_request: NextRequest, ctx: Params) {
  return setResolved(ctx, true)
}

export async function DELETE(_request: NextRequest, ctx: Params) {
  return setResolved(ctx, false)
}
