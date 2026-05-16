import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { requireEngagementMember } from '@/lib/engagement-access'

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
      select: { firmId: true, name: true },
    })
    if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

    const firm = await prisma.firm.findUnique({
      where: { id: engagement.firmId },
      select: { connectorId: true },
    })
    const connectorId = firm?.connectorId
    if (!connectorId) return NextResponse.json({ error: 'No connector found' }, { status: 500 })

    const { googleDriveConnector } = await import('@/lib/google-drive-connector')
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    // Collect all files to download: expand folder IDs recursively, preserving paths
    type FileEntry = { id: string; path: string }
    const fileEntries: FileEntry[] = []

    const collectFiles = async (ids: string[], pathPrefix: string): Promise<void> => {
      for (const id of ids) {
        if (fileEntries.length >= MAX_FILES) break
        try {
          const meta = await googleDriveConnector.getFileMetadata(connectorId!, id)
          if (!meta) continue
          const isFolder = meta.mimeType === 'application/vnd.google-apps.folder'
          if (isFolder) {
            const children = await googleDriveConnector.listFiles(connectorId!, id, 500)
            const childIds = (children as { id: string }[]).map(c => c.id).filter(Boolean)
            await collectFiles(childIds, pathPrefix ? `${pathPrefix}/${meta.name}` : meta.name)
          } else {
            fileEntries.push({ id, path: pathPrefix ? `${pathPrefix}/${meta.name}` : meta.name })
          }
        } catch {
          // skip
        }
      }
    }

    await collectFiles(rootIds, '')

    // Download and zip
    await Promise.all(
      fileEntries.map(async ({ id, path }) => {
        try {
          const { stream } = await googleDriveConnector.downloadFile(connectorId!, id)
          const reader = stream.getReader()
          const chunks: Uint8Array[] = []
          let done = false
          while (!done) {
            const { value, done: d } = await reader.read()
            if (value) chunks.push(value)
            done = d
          }
          const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
          const buffer = new Uint8Array(totalLength)
          let offset = 0
          for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
          zip.file(path, buffer)
        } catch {
          // skip individual failures silently
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
      },
    })
  } catch (e) {
    console.error('bulk-download error', e)
    return NextResponse.json({ error: 'Failed to create ZIP' }, { status: 500 })
  }
}
