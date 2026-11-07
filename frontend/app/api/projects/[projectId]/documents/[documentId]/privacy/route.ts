import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { requireEngagementMember, isEngagementLeadRole } from '@/lib/engagement-access'
import { loadPrivacyRows, restoreClientAccess, whyPrivacyRefused, withdrawClientAccess } from '@/lib/files/private-documents'
import { isDocumentPrivate } from '@/lib/sharing-settings'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/privacy
 * Set or clear the `settings.lock = { type: 'private' }` flag (Engagement Lead only).
 * Private files are hidden from EC/EV users everywhere, without moving them in Drive; the firm's
 * members still see them. What it refuses, and what follows, is in lib/files/private-documents.ts.
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

    // Already so: nothing to do. In particular, "make public" must never lift a finalize or intake lock.
    if (isDocumentPrivate(prevSettings) === makePrivate) return NextResponse.json({ ok: true })

    const rows = await loadPrivacyRows(projectId)
    const refused = await whyPrivacyRefused(projectId, existing, makePrivate, rows)
    if (refused) return NextResponse.json({ error: refused, code: 'privacy_refused' }, { status: 409 })

    let nextSettings: Record<string, unknown>
    if (makePrivate) {
      const { locked: _legacy, ...rest } = prevSettings
      nextSettings = { ...rest, lock: { type: 'private' } }
    } else {
      const { lock: _lock, locked: _legacy, ...rest } = prevSettings
      nextSettings = rest
    }

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: nextSettings as object, updatedAt: new Date() },
    })

    if (makePrivate) await withdrawClientAccess(projectId, existing.firmId, existing, rows, user.id)
    else await restoreClientAccess(projectId, existing, user.id)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH privacy error', e)
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 })
  }
}
