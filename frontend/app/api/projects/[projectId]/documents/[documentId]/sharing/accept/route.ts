import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { lockFileInStorage, StorageNotSupportedError, type DowngradedPermission } from '@/lib/files/storage-lock'
import { requireEngagementMember, externalMemberCanAccessDocument, blockIfEngagementCompleted } from '@/lib/engagement-access'
import { isDocumentFinalized } from '@/lib/sharing-settings'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

const EXTERNAL_ROLES = new Set(['eng_ext_collaborator', 'eng_viewer'])

const NO_STORAGE = "This document can't be accepted right now: its storage isn't connected. Ask the engagement's Lead to reconnect it."

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/sharing/accept
 * Client acceptance: EC or EV marks the document as accepted, which locks it (version-finalized).
 * Uses the same settings.lock = { type: 'finalize' } model as the EL finalize route.
 * Engagement Lead can still unlock it afterwards via /sharing/unlock.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params

    const member = await requireEngagementMember(projectId, user.id)
    if (!member || !EXTERNAL_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Only Limited Access contributors and Reviewers can accept documents' }, { status: 403 })
    }

    const completed = await blockIfEngagementCompleted(projectId)
    if (completed) return completed

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo)
      return NextResponse.json({ error: 'File not found in this project' }, { status: 404 })

    const canAccess = await externalMemberCanAccessDocument(projectId, member.role, fileInfo.externalId)
    if (!canAccess)
      return NextResponse.json({ error: 'Access denied to this document' }, { status: 403 })

    const compound = {
      engagementId: projectId,
      firmId: fileInfo.organizationId,
      externalId: fileInfo.externalId,
    }

    const existing = await prisma.engagementDocument.findUnique({
      where: { engagementId_firmId_externalId: compound },
    })
    if (!existing)
      return NextResponse.json({ error: 'Document record not found' }, { status: 404 })

    if (existing.isFolder)
      return NextResponse.json({ error: 'Acceptance applies to files only' }, { status: 400 })

    if (isDocumentFinalized(existing.settings))
      return NextResponse.json({ error: 'Document is already finalized' }, { status: 409 })

    // The connector the document is on (its own, else its client's), as the regrant route resolves it.
    const connectorId = await resolveEngagementConnectorId(projectId, existing.connectorId)
    if (!connectorId)
      return NextResponse.json({ error: NO_STORAGE, code: 'no_connector' }, { status: 409 })

    // The same lock as Finalize (lib/files/storage-lock.ts): all or nothing, so a refusal is
    // answered with its reason and nothing is recorded as accepted (AP-1).
    let downgraded: DowngradedPermission[]
    try {
      downgraded = await lockFileInStorage(connectorId, fileInfo.externalId)
    } catch (e) {
      if (e instanceof StorageNotSupportedError) return NextResponse.json({ error: e.message, code: 'unsupported' }, { status: 502 })
      if (e instanceof StorageFailure) {
        return NextResponse.json({ error: e.message.replace("Couldn't lock this", "Couldn't accept this. It couldn't be locked"), code: e.reason }, { status: e.status })
      }
      throw e
    }

    const now = new Date().toISOString()
    const prevSettings = (existing.settings as Record<string, unknown>) || {}
    const share = (prevSettings.share as Record<string, unknown> | undefined) || {}
    const nextSettings: Record<string, unknown> = {
      ...prevSettings,
      // Unified lock model — same as finalize route; unlocked via /sharing/unlock
      lock: { type: 'finalize', finalizedBy: user.id, finalizedAt: now, acceptedBy: user.id, acceptedAt: now, downgraded },
      share: { ...share, finalizedAt: now, acceptedAt: now, acceptedBy: user.id },
    }

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: nextSettings as object, updatedAt: new Date() },
    })

    // Notify all engagement leads
    try {
      const leads = await prisma.engagementMember.findMany({
        where: { engagementId: projectId, role: 'eng_admin', userId: { not: user.id } },
        select: { userId: true },
      })
      if (leads.length) {
        const rows = leads.map((l) => ({
          organizationId: fileInfo.organizationId,
          clientId: existing.clientId,
          projectId,
          documentId: existing.id,
          userId: l.userId,
          type: 'DOCUMENT_ACCEPTED_BY_CLIENT',
          priority: 'INFO',
          title: 'Document accepted',
          body: `"${existing.fileName}" has been accepted and locked.`,
          ctaUrl: null,
          metadata: { fileName: existing.fileName, acceptedBy: user.id },
          channels: { inApp: true, email: false },
          dedupeKey: `doc:${existing.id}:accepted`,
        }))
        await (prisma as any).notification.createMany({ data: rows, skipDuplicates: true })
      }
    } catch {
      // non-critical
    }

    audit(AUDIT_EVENT.DOCUMENT_FINALIZED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(fileInfo.organizationId)
      .client(existing.clientId ?? undefined)
      .engagement(projectId)
      .document(existing.id)
      .actor(user.id)
      .meta({ fileName: existing.fileName, acceptedByClient: true })
      .fireAndForget()

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH sharing/accept error', e)
    return NextResponse.json({ error: "Couldn't accept this document. Something went wrong on our side. Try again." }, { status: 500 })
  }
}
