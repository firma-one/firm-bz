import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { assertFirmSubscriptionAccess } from '@/lib/billing/subscription-gate'
import { SubscriptionRevokedError } from '@/lib/errors/api-error'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId } = await params

    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const canManage = await canManageProject(ctx.firmId, ctx.clientId, ctx.projectId)
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await assertFirmSubscriptionAccess(ctx.firmId)

    const doc = await prisma.engagementDocument.findFirst({
      where: { id: documentId, engagementId: ctx.projectId, firmId: ctx.firmId },
      select: { id: true, externalId: true, connectorId: true },
    })
    if (!doc) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    // Move file to trash via the connector abstraction (provider-agnostic, recoverable for 30 days)
    if (doc.connectorId && doc.externalId) {
      try {
        const adapter = await getPermissionAdapter(doc.connectorId)
        await adapter?.trashFile(doc.connectorId, doc.externalId)
      } catch (trashErr) {
        console.error('Failed to trash file in connector storage', trashErr)
        // Non-fatal: the local record is still archived below
      }
    }

    // Mark local record as ARCHIVED so it's excluded from future queries
    await prisma.engagementDocument.update({
      where: { id: doc.id },
      data: { status: 'ARCHIVED' },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof SubscriptionRevokedError) return NextResponse.json({ error: e.message }, { status: 403 })
    console.error('DELETE document error', e)
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}
