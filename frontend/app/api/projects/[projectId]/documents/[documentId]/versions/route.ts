import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { requireEngagementMember, isExternalEngagementRole } from '@/lib/engagement-access'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { getContentAdapter } from '@/lib/connectors/registry'

/**
 * GET /api/projects/[projectId]/documents/[documentId]/versions
 *
 * A document's version list, for the Details pane's Versions and Activity tabs. It replaced the
 * firm-wide /api/documents/versions (deleted 2026-10-29), which only the member who connected the
 * storage could use.
 * The firm's stored token reads the provider for anyone the engagement lets see the document:
 * membership is the gate, and the storage connection comes from the document, not the caller.
 *
 * Internal roles only. A client sees what was shared with them, not how it got there, and an
 * earlier version can't be downloaded by them either (download-share `?revisionId=`).
 *
 * Google's revisions, and Graph's versions for OneDrive and SharePoint (the content adapter's
 * listVersions). Any other storage answers `unsupported: true`, so the panes can say so instead of
 * "no versions" (.claude/plans/engagement-assets-details.md, Phase 1).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId } = await params

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (isExternalEngagementRole(member.role)) {
      return NextResponse.json({ error: 'Not available for external roles' }, { status: 403 })
    }

    // Accepts the DB UUID or the provider's id, matched against this engagement's rows only — so
    // provider ids of any shape (a personal OneDrive id has "!") work without a pattern check.
    const fileInfo = await getFileInfo(projectId, documentId)
    if (!fileInfo) return NextResponse.json({ error: 'File not found' }, { status: 404 })
    if (fileInfo.documentType === 'LINK' || fileInfo.isFolder) {
      return NextResponse.json({ error: 'Only a file has versions' }, { status: 400 })
    }

    const connectorId = await resolveEngagementConnectorId(projectId, fileInfo.connectorId)
    if (!connectorId) return NextResponse.json({ error: 'No active storage connector' }, { status: 500 })

    const connector = await prisma.connector.findUnique({ where: { id: connectorId }, select: { type: true } })
    if (connector?.type === 'GOOGLE_DRIVE') {
      const revisions = await googleDriveConnector.getRevisions(connectorId, fileInfo.externalId)
      return NextResponse.json({ revisions })
    }

    // OneDrive and SharePoint: Graph's version list, through the content adapter.
    const contentAdapter = await getContentAdapter(connectorId)
    if (!contentAdapter?.listVersions) {
      return NextResponse.json({ revisions: [], unsupported: true })
    }
    const revisions = await contentAdapter.listVersions(connectorId, fileInfo.externalId)
    return NextResponse.json({ revisions })
  } catch (e) {
    console.error('versions error', e)
    return NextResponse.json({ error: 'Failed to load versions' }, { status: 500 })
  }
}
