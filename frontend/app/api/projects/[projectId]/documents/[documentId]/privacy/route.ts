import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { requireEngagementMember, isEngagementLeadRole, blockIfEngagementCompleted } from '@/lib/engagement-access'
import { loadPrivacyRows, restoreClientAccess, whyPrivacyRefused, withdrawClientAccess } from '@/lib/files/private-documents'
import { isDocumentPrivate, privateSubtreeIds } from '@/lib/sharing-settings'
import { deliverableOf } from '@/lib/files/deliverable-of'
import { applyDerivedMove, confirmationOf, derivedMove, needsConfirmation, STAGE_ROW_SELECT } from '@/lib/files/deliverable-stage'
import { StageAccessError } from '@/lib/files/apply-stage-change'
import { resolveProjectContext } from '@/lib/resolve-project-context'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/privacy
 * Set or clear the `settings.lock = { type: 'private' }` flag (Engagement Lead only).
 * Private files are hidden from EC/EV users everywhere, without moving them in Drive; the firm's
 * members still see them. What it refuses, and what follows, is in lib/files/private-documents.ts.
 *
 * Internal only documents don't count toward a deliverable's stage, so changing a mark can move the
 * deliverable. A move that matters is asked about first, with a 409, as a stage move does.
 *
 * Making it internal only takes back what clients were granted in storage, in the request (AC-12). Asked
 * again of a document already internal only, it finishes that, so "try again" works. When storage keeps
 * someone's access, the mark still stands and the answer says so (`warning`).
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

    const completed = await blockIfEngagementCompleted(projectId)
    if (completed) return completed

    let body: { private?: boolean; confirm?: boolean } = {}
    try {
      const text = await request.text()
      body = text ? JSON.parse(text) : {}
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const makePrivate = body.private === true
    const confirmed = body.confirm === true

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

    const rows = await loadPrivacyRows(projectId)

    // Already internal only: finish taking access back, which an earlier try may not have done.
    if (makePrivate && isDocumentPrivate(prevSettings)) {
      const taken = await withdrawClientAccess(projectId, existing, rows, user.id)
      return NextResponse.json({ ok: true, ...(taken.stillHolding ? { warning: `Internal only is set, but ${taken.stillHolding}` } : {}) })
    }
    // Already so: nothing to do. In particular, "make public" must never lift a finalize or intake lock.
    if (isDocumentPrivate(prevSettings) === makePrivate) return NextResponse.json({ ok: true })

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

    const deliverableRef = await deliverableOf(projectId, existing.parentId)
    const deliverable = deliverableRef
      ? await prisma.engagementDocument.findUnique({ where: { id: deliverableRef.id }, select: STAGE_ROW_SELECT })
      : null
    const internalOnlyAfter = privateSubtreeIds(rows.map((r) => (r.id === existing.id ? { ...r, settings: nextSettings } : r)))
    const move = deliverable ? await derivedMove(projectId, deliverable, new Map(), internalOnlyAfter) : null
    if (needsConfirmation(move) && !confirmed) {
      return NextResponse.json({ needsConfirmation: confirmationOf(move) }, { status: 409 })
    }

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: nextSettings as object, updatedAt: new Date() },
    })

    const warnings: string[] = []
    if (makePrivate) {
      const taken = await withdrawClientAccess(projectId, existing, rows, user.id)
      if (taken.stillHolding) warnings.push(`Internal only is set, but ${taken.stillHolding}`)
    } else {
      await restoreClientAccess(projectId, existing, user.id)
    }

    if (move) {
      const ctx = await resolveProjectContext(projectId)
      try {
        await applyDerivedMove(move, { projectId, firmId: existing.firmId, clientId: ctx?.clientId ?? null, actorUserId: user.id })
      } catch (e) {
        if (!(e instanceof StageAccessError)) throw e
        warnings.push(`Its deliverable stayed where it was · clients couldn't be given access to its documents. Try again.`)
      }
    }

    return NextResponse.json({ ok: true, ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}) })
  } catch (e) {
    console.error('PATCH privacy error', e)
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 })
  }
}
