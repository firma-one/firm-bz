import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { parseSettingsFromDb, buildSettingsForDb } from '@/lib/sharing-settings'
import { getFileInfo } from '@/lib/file-utils'
import { requireEngagementMember } from '@/lib/engagement-access'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { applyDiagonalWatermark } from '@/lib/watermark-pdf'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { getContentAdapter, getPermissionAdapter } from '@/lib/connectors/registry'

/**
 * GET /api/projects/[projectId]/documents/[documentId]/download-share
 *
 * Secure download endpoint for shared documents. Determines the correct file
 * to serve based on sharing settings (PDF copy vs original) and streams it.
 * Download access is controlled by the allowDownload flag per persona.
 * connectorId is resolved server-side from the firm — never trusted from the client.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId } = await params
    const isPreview = request.nextUrl.searchParams.get('preview') === 'true'

    const projectMember = await requireEngagementMember(projectId, user.id)
    if (!projectMember) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Resolve the document — accepts either DB UUID or Drive externalId
    const fileInfo = await getFileInfo(projectId, documentId)
    if (!fileInfo) return NextResponse.json({ error: 'File not found' }, { status: 404 })
    if (fileInfo.documentType === 'LINK') {
      return NextResponse.json({ error: 'This document is a link and has no downloadable content' }, { status: 400 })
    }

    const document = await prisma.engagementDocument.findUnique({
      where: {
        engagementId_firmId_externalId: {
          engagementId: projectId,
          firmId: fileInfo.organizationId,
          externalId: fileInfo.externalId,
        },
      },
      select: { id: true, clientId: true, connectorId: true, fileName: true, settings: true, status: true },
    })
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const settings = parseSettingsFromDb(document.settings)
    const isGuest = projectMember.role === 'eng_viewer'
    const isEC = projectMember.role === 'eng_ext_collaborator'

    // Enforce allowDownload per persona (preview bypasses this — viewing is always permitted)
    if (!isPreview) {
      if (isGuest && !settings.share?.guest?.options?.allowDownload) {
        return NextResponse.json({ error: 'Download not permitted' }, { status: 403 })
      }
      if (isEC && !settings.share?.externalCollaborator?.options?.allowDownload) {
        return NextResponse.json({ error: 'Download not permitted' }, { status: 403 })
      }
    }

    const connectorId = await resolveEngagementConnectorId(projectId, document.connectorId)
    if (!connectorId) return NextResponse.json({ error: 'No active storage connector' }, { status: 500 })

    const contentAdapter = await getContentAdapter(connectorId)
    const permissionAdapter = await getPermissionAdapter(connectorId)
    if (!contentAdapter || !permissionAdapter) {
      return NextResponse.json({ error: 'No content adapter available for connector' }, { status: 500 })
    }
    const guestOptions = settings.share?.guest?.options ?? {}
    const sharePdfOnly = isGuest && guestOptions.sharePdfOnly

    // PDF-only path: serve the Firma-managed PDF, generating it on first download if needed
    if (sharePdfOnly) {
      let pdfBuffer: Buffer
      let pdfDriveId = guestOptions.sharedPdfDriveId ?? null

      if (pdfDriveId) {
        // Fast path: cached PDF already exists — download it
        const { stream, mimeType, size, fileName: name } = await contentAdapter.getRenderableContent(connectorId, pdfDriveId, 'native')
        const baseName = (document.fileName ?? name ?? 'document').replace(/\.[^.]+$/, '')
        const filename = `${baseName}.pdf`
        const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A')
        const headers = new Headers()
        headers.set('Content-Type', mimeType || 'application/pdf')
        if (isPreview) {
          headers.set('Content-Disposition', 'inline')
        } else {
          headers.set('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodedFilename}`)
          if (size && size !== '0') headers.set('Content-Length', size)
        }
        audit(isPreview ? AUDIT_EVENT.DOCUMENT_OPENED : AUDIT_EVENT.DOCUMENT_DOWNLOADED)
          .scope(AUDIT_SCOPE.DOCUMENT)
          .firm(fileInfo.organizationId)
          .client(document.clientId ?? undefined)
          .engagement(projectId)
          .document(document.id)
          .actor(user.id)
          .meta({ fileId: pdfDriveId, filename, usedPdf: true, generated: false })
          .fireAndForget()
        const body = Buffer.isBuffer(stream) ? new Uint8Array(stream) : stream
        return new NextResponse(body, { status: 200, headers })
      }

      // Generate path: no cached PDF yet (guest downloaded before ever clicking Open)
      // Generate, upload (priming the cache), then stream back the bytes.
      const rendered = await contentAdapter.getRenderableContent(connectorId, fileInfo.externalId, 'pdf')
      const rawPdfBytes = Buffer.isBuffer(rendered.stream) ? rendered.stream : Buffer.from(await new Response(rendered.stream).arrayBuffer())
      pdfBuffer = rawPdfBytes

      if (guestOptions.addWatermark) {
        const firm = await prisma.firm.findUnique({
          where: { id: fileInfo.organizationId },
          select: { name: true },
        })
        pdfBuffer = await applyDiagonalWatermark(rawPdfBytes, firm?.name || 'FIRMA')
      }

      // Upload beside the original file and store the ID for future opens
      const originalMeta = await permissionAdapter.getFileMetadata(connectorId, fileInfo.externalId)
      const parentFolderId = originalMeta?.parents?.[0]
      if (!parentFolderId) return NextResponse.json({ error: 'Could not resolve parent folder for shared PDF' }, { status: 500 })
      const baseName = (document.fileName ?? 'document').replace(/\.[^.]+$/, '')
      const pdfFileName = `${baseName}.pdf`
      const created = await contentAdapter.createFile(connectorId, parentFolderId, pdfFileName, pdfBuffer, 'application/pdf')
      pdfDriveId = created.id

      // Lock native download on the generated PDF — Firma is the only download channel.
      // No-op for providers without an equivalent concept (e.g. OneDrive — see setCopyRestricted).
      try {
        await contentAdapter.setCopyRestricted(connectorId, pdfDriveId, true)
      } catch (e) {
        console.error('Failed to set copy-restriction on generated PDF:', e)
      }

      // Persist the new PDF Drive ID so regrant (Open) will overwrite it next time
      const updatedSettings = buildSettingsForDb(document.settings as Record<string, unknown>, {
        share: {
          guest: {
            enabled: settings.share?.guest?.enabled ?? true,
            options: { ...guestOptions, sharedPdfDriveId: pdfDriveId },
          },
        },
        actorId: user.id,
      })
      await prisma.engagementDocument.update({
        where: { id: document.id },
        data: { settings: updatedSettings },
      })

      const filename = `${baseName}.pdf`
      const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A')
      const headers = new Headers()
      headers.set('Content-Type', 'application/pdf')
      headers.set('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodedFilename}`)
      headers.set('Content-Length', pdfBuffer.length.toString())
      audit(isPreview ? AUDIT_EVENT.DOCUMENT_OPENED : AUDIT_EVENT.DOCUMENT_DOWNLOADED)
        .scope(AUDIT_SCOPE.DOCUMENT)
        .firm(fileInfo.organizationId)
        .engagement(projectId)
        .document(document.id)
        .actor(user.id)
        .meta({ fileId: pdfDriveId, filename, usedPdf: true, generated: true })
        .fireAndForget()
      return new NextResponse(new Uint8Array(pdfBuffer), { status: 200, headers })
    }

    // Original-file path (EC or Guest with sharePdfOnly=false)
    // For preview: export to PDF so the browser can render it inline (covers DOCX, Sheets, Slides etc.)
    if (isPreview) {
      const rendered = await contentAdapter.getRenderableContent(connectorId, fileInfo.externalId, 'pdf')
      const pdfBytes = Buffer.isBuffer(rendered.stream) ? rendered.stream : Buffer.from(await new Response(rendered.stream).arrayBuffer())
      const headers = new Headers()
      headers.set('Content-Type', 'application/pdf')
      headers.set('Content-Disposition', 'inline')
      audit(AUDIT_EVENT.DOCUMENT_OPENED)
        .scope(AUDIT_SCOPE.DOCUMENT)
        .firm(fileInfo.organizationId)
        .engagement(projectId)
        .document(document.id)
        .actor(user.id)
        .meta({ fileId: fileInfo.externalId, usedPdf: true })
        .fireAndForget()
      return new NextResponse(new Uint8Array(pdfBytes), { status: 200, headers })
    }

    const { stream, mimeType, size, fileName: name } = await contentAdapter.getRenderableContent(connectorId, fileInfo.externalId, 'native')
    const filename = name || document.fileName || 'document'
    const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A')
    const headers = new Headers()
    headers.set('Content-Type', mimeType || 'application/octet-stream')
    headers.set('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodedFilename}`)
    if (size && size !== '0') headers.set('Content-Length', size)

    audit(AUDIT_EVENT.DOCUMENT_DOWNLOADED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(fileInfo.organizationId)
      .engagement(projectId)
      .document(document.id)
      .actor(user.id)
      .meta({ fileId: fileInfo.externalId, filename, usedPdf: false })
      .fireAndForget()

    const body = Buffer.isBuffer(stream) ? new Uint8Array(stream) : stream
    return new NextResponse(body, { status: 200, headers })
  } catch (e) {
    console.error('download-share error', e)
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
  }
}
