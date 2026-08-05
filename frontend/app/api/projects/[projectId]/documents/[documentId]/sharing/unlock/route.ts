import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import type { ConnectorRole } from '@/lib/connectors/types'
import { requireEngagementMember, isEngagementLeadRole } from '@/lib/engagement-access'
import { getLock } from '@/lib/sharing-settings'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/sharing/unlock
 * Restore Drive roles recorded at lock time (Engagement Lead only).
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
      select: { id: true, clientId: true, connectorId: true, fileName: true, settings: true },
    })
    if (!existing)
      return NextResponse.json({ error: 'Share record not found' }, { status: 404 })

    const lockData = getLock(existing.settings)
    if (!lockData) {
      return NextResponse.json({ error: 'Document is not locked' }, { status: 409 })
    }

    let connectorId = existing.connectorId
    if (!connectorId && fileInfo.organizationId) {
      const org = await prisma.firm.findUnique({
        where: { id: fileInfo.organizationId },
        select: { connectorId: true },
      })
      connectorId = org?.connectorId ?? null
    }
    if (!connectorId) {
      return NextResponse.json({ error: 'No active storage connection' }, { status: 500 })
    }

    const permissionAdapter = await getPermissionAdapter(connectorId)
    if (permissionAdapter) {
      // previousRole may be stored as either Google-native strings (writer/reader/...) from
      // older locks, or the provider-agnostic ConnectorRole vocabulary (editor/viewer/commenter)
      // from locks created after the registry migration — normalize both.
      const toConnectorRole = (r: string): ConnectorRole | null => {
        if (r === 'writer' || r === 'fileOrganizer' || r === 'organizer' || r === 'editor') return 'editor'
        if (r === 'commenter') return 'commenter'
        if (r === 'reader' || r === 'viewer') return 'viewer'
        return null
      }
      for (const row of (lockData.downgraded ?? [])) {
        const role = toConnectorRole(row.previousRole)
        if (role) {
          await permissionAdapter.patchFilePermissionRole(
            connectorId,
            fileInfo.externalId,
            row.permissionId,
            role
          )
        }
      }

      await permissionAdapter.setFileContentReadOnly(connectorId, fileInfo.externalId, false)
    }

    const prevSettings = (existing.settings as Record<string, unknown>) || {}
    const share = (prevSettings.share as Record<string, unknown> | undefined) || {}
    const nextSettings: Record<string, unknown> = {
      ...prevSettings,
      share: { ...share, finalizedAt: null },
    }
    delete nextSettings.lock

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: nextSettings as object, updatedAt: new Date() },
    })

    audit(AUDIT_EVENT.DOCUMENT_UNLOCKED)
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
    console.error('PATCH sharing/unlock error', e)
    return NextResponse.json({ error: 'Failed to unlock' }, { status: 500 })
  }
}
