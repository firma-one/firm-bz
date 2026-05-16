import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { requireEngagementMember, isEngagementLeadRole } from '@/lib/engagement-access'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/privacy
 * Set or clear the `settings.locked = 'private'` flag (Engagement Lead only).
 * Private files are hidden from EC/EV users in the file list without moving them in Drive.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params

    const member = await requireEngagementMember(projectId, user.id)
    if (!member || !isEngagementLeadRole(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { private?: boolean } = {}
    try {
      const text = await request.text()
      body = text ? JSON.parse(text) : {}
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const makePrivate = body.private === true

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo)
      return NextResponse.json({ error: 'File not found in this project' }, { status: 404 })

    const existing = await prisma.engagementDocument.findFirst({
      where: {
        engagementId: projectId,
        externalId: fileInfo.externalId,
      },
    })
    if (!existing)
      return NextResponse.json({ error: 'Document record not found' }, { status: 404 })

    const prevSettings = (existing.settings as Record<string, unknown>) || {}

    let nextSettings: Record<string, unknown>
    if (makePrivate) {
      nextSettings = { ...prevSettings, locked: 'private' }
    } else {
      const { locked: _removed, ...rest } = prevSettings
      nextSettings = rest
    }

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: nextSettings as object, updatedAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH privacy error', e)
    return NextResponse.json({ error: 'Failed to update privacy' }, { status: 500 })
  }
}
