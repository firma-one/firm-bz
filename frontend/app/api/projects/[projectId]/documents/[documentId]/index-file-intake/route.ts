import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { requireEngagementMember, isExternalEngagementRole } from '@/lib/engagement-access'
import { getFileInfo } from '@/lib/file-utils'
import { safeInngestSend } from '@/lib/inngest/client'

/**
 * POST /api/projects/[projectId]/documents/[documentId]/index-file-intake
 * Called after EC/EV completes an upload. Sets settings.lock = { type: 'intake', ... }
 * and fires the intake/file.pending Inngest event to notify ELs.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!isExternalEngagementRole(member.role)) {
      return NextResponse.json({ error: 'Only EC/EV members can submit files for intake' }, { status: 403 })
    }

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    const doc = await prisma.engagementDocument.findFirst({
      where: { engagementId: projectId, externalId: fileInfo.externalId },
      select: { id: true, settings: true, fileName: true, firmId: true },
    })
    if (!doc) return NextResponse.json({ error: 'Document record not found' }, { status: 404 })

    const prevSettings = (doc.settings as Record<string, unknown>) || {}
    const now = new Date().toISOString()

    await prisma.engagementDocument.update({
      where: { id: doc.id },
      data: {
        settings: {
          ...prevSettings,
          lock: { type: 'intake', uploadedBy: user.id, uploadedAt: now },
        } as object,
        updatedAt: new Date(),
      },
    })

    // Re-use the existing indexing pipeline with an intake flag —
    // indexFileForSearch will handle both search indexing and EL notifications.
    await safeInngestSend('file.index.requested', {
      projectId,
      externalId: fileInfo.externalId,
      organizationId: doc.firmId,
      fileName: doc.fileName,
      uploadedBy: user.id,
      isIntakeUpload: true,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('index-file-intake error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
