import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { requireEngagementMember } from '@/lib/engagement-access'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { getPermissionAdapter, getContentAdapter } from '@/lib/connectors/registry'

const MAX_FILES = 100

/**
 * POST /api/projects/[projectId]/documents/bulk-download
 * Body: { externalIds: string[] }  — may include folder IDs; folders are expanded recursively.
 * Returns a ZIP file preserving the folder structure.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const rootIds: string[] = Array.isArray(body.externalIds) ? body.externalIds : []
    if (!rootIds.length) return NextResponse.json({ error: 'No files specified' }, { status: 400 })

    const engagement = await prisma.engagement.findUnique({
      where: { id: projectId },
      select: { firmId: true, name: true, clientId: true },
    })
    if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

    const connectorId = await resolveEngagementConnectorId(projectId)
    if (!connectorId) return NextResponse.json({ error: 'No connector found' }, { status: 500 })

    const permissionAdapter = await getPermissionAdapter(connectorId)
    const contentAdapter = await getContentAdapter(connectorId)
    if (!permissionAdapter || !contentAdapter) {
      return NextResponse.json({ error: 'No adapter available for connector' }, { status: 500 })
    }

    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    // Collect all files to download: expand folder IDs recursively, preserving paths.
    // isFolder detection: Google Drive folders have a distinct mimeType; the OneDrive
    // permission adapter's getFileMetadata doesn't set mimeType for folders (Graph's `folder`
    // facet has no MIME type of its own) — absence of mimeType on an otherwise-valid item is
    // treated as "folder" for OneDrive.
    type FileEntry = { id: string; path: string }
    const fileEntries: FileEntry[] = []
    let skippedCount = 0

    const collectFiles = async (ids: string[], pathPrefix: string): Promise<void> => {
      for (const id of ids) {
        if (fileEntries.length >= MAX_FILES) break
        try {
          const meta = await permissionAdapter.getFileMetadata(connectorId!, id)
          if (!meta) { skippedCount++; continue }
          const isFolder = meta.mimeType === 'application/vnd.google-apps.folder' || !meta.mimeType
          if (isFolder) {
            const children = await permissionAdapter.listFiles(connectorId!, id, 500)
            const childIds = (children as { id: string }[]).map(c => c.id).filter(Boolean)
            await collectFiles(childIds, pathPrefix ? `${pathPrefix}/${meta.name}` : meta.name)
          } else {
            fileEntries.push({ id, path: pathPrefix ? `${pathPrefix}/${meta.name}` : meta.name })
          }
        } catch {
          skippedCount++
        }
      }
    }

    await collectFiles(rootIds, '')
    if (skippedCount > 0) {
      // No silent-success illusion for the caller — surfaced via a response header rather than
      // failing the whole ZIP, since partial results are still useful.
      console.warn(`bulk-download: skipped ${skippedCount} unreadable file(s)/folder(s) for engagement ${projectId}`)
    }

    // Download and zip
    let downloadFailures = 0
    await Promise.all(
      fileEntries.map(async ({ id, path }) => {
        try {
          const { stream } = await contentAdapter.getRenderableContent(connectorId!, id, 'native')
          let buffer: Uint8Array
          if (Buffer.isBuffer(stream)) {
            buffer = new Uint8Array(stream)
          } else {
            const reader = stream.getReader()
            const chunks: Uint8Array[] = []
            let done = false
            while (!done) {
              const { value, done: d } = await reader.read()
              if (value) chunks.push(value)
              done = d
            }
            const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
            buffer = new Uint8Array(totalLength)
            let offset = 0
            for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
          }
          zip.file(path, buffer)
        } catch {
          downloadFailures++
        }
      })
    )

    const zipUint8 = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    const zipBuffer = Buffer.from(zipUint8)

    const safeName = engagement.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
    return new NextResponse(zipBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeName}.zip"`,
        'Content-Length': zipBuffer.length.toString(),
        // Surfaced so the client can warn the user instead of a silently-incomplete ZIP —
        // no way to fail the whole request without discarding files that DID succeed.
        'X-Bulk-Download-Skipped': String(skippedCount),
        'X-Bulk-Download-Failed': String(downloadFailures),
      },
    })
  } catch (e) {
    console.error('bulk-download error', e)
    return NextResponse.json({ error: 'Failed to create ZIP' }, { status: 500 })
  }
}
