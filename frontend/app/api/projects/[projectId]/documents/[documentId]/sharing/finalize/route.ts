import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { lockFileInStorage, StorageNotSupportedError, type DowngradedPermission } from '@/lib/files/storage-lock'
import { requireEngagementMember, isEngagementLeadRole, blockIfEngagementCompleted } from '@/lib/engagement-access'
import { isDocumentFinalized } from '@/lib/sharing-settings'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { StorageFailure } from '@/lib/connectors/storage-failure'

const NO_STORAGE = "No storage is connected to this engagement, so the file can't be locked. Reconnect the storage, then try again."

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/sharing/finalize
 * Lock document version (Engagement Lead only): Drive read-only for collaborators + optional content restriction.
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
    if (!member || !isEngagementLeadRole(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const completed = await blockIfEngagementCompleted(projectId)
    if (completed) return completed

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo)
      return NextResponse.json({ error: 'File not found in this project' }, { status: 404 })

    const compound = {
      engagementId: projectId,
      firmId: fileInfo.organizationId,
      externalId: fileInfo.externalId,
    }

    const existing = await prisma.engagementDocument.findUnique({
      where: { engagementId_firmId_externalId: compound },
      select: { id: true, clientId: true, connectorId: true, fileName: true, settings: true, isFolder: true },
    })
    if (!existing)
      return NextResponse.json({ error: 'Share record not found' }, { status: 404 })

    if (existing.isFolder) {
      return NextResponse.json({ error: 'Version lock applies to files only' }, { status: 400 })
    }

    if (isDocumentFinalized(existing.settings)) {
      return NextResponse.json({ error: 'Document is already locked' }, { status: 409 })
    }

    // The connector the document is on (its own, else its client's), as the regrant route resolves it.
    const connectorId = await resolveEngagementConnectorId(projectId, existing.connectorId)
    if (!connectorId) {
      return NextResponse.json({ error: NO_STORAGE, code: 'no_connector' }, { status: 409 })
    }

    // The file itself: editors become viewers, the content read-only (lib/files/storage-lock.ts,
    // which approving a document uses too). All or nothing: a refusal is answered with its reason,
    // what was downgraded is put back, and nothing is recorded (AP-1).
    let downgraded: DowngradedPermission[]
    try {
      downgraded = await lockFileInStorage(connectorId, fileInfo.externalId)
    } catch (e) {
      if (e instanceof StorageNotSupportedError) return NextResponse.json({ error: e.message, code: 'unsupported' }, { status: 502 })
      if (e instanceof StorageFailure) return NextResponse.json({ error: e.message, code: e.reason }, { status: e.status })
      throw e
    }

    const now = new Date().toISOString()
    const prevSettings = (existing.settings as Record<string, unknown>) || {}
    const share = (prevSettings.share as Record<string, unknown> | undefined) || {}
    const nextSettings: Record<string, unknown> = {
      ...prevSettings,
      // Unified lock model — cleared by /sharing/unlock
      lock: { type: 'finalize', finalizedBy: user.id, finalizedAt: now, downgraded },
      share: { ...share, finalizedAt: now },
    }

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: nextSettings as object, updatedAt: new Date() },
    })

    audit(AUDIT_EVENT.DOCUMENT_FINALIZED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(fileInfo.organizationId)
      .client(existing.clientId ?? undefined)
      .engagement(projectId)
      .document(existing.id)
      .actor(user.id)
      .meta({ fileName: existing.fileName })
      .fireAndForget()

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH sharing/finalize error', e)
    return NextResponse.json({ error: "Couldn't lock this version. Something went wrong on our side. Try again." }, { status: 500 })
  }
}
