import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { isExternalEngagementRole, requireEngagementMember, visibleDocumentIdsFor } from '@/lib/engagement-access'
import { parseSettingsFromDb, privateSubtreeIds } from '@/lib/sharing-settings'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { getPermissionAdapter, getContentAdapter } from '@/lib/connectors/registry'
import { isFileInEngagementTree } from '@/lib/connectors/engagement-file-scope'
import { StorageFailure } from '@/lib/connectors/storage-failure'

const MAX_FILES = 100
/** How many left-out files are named in X-Bulk-Download-Not-Included; the counts cover the rest. */
const MAX_NAMED = 20

/** A file left out of the ZIP, and why, in words for the person ("isn't available to download"). */
type LeftOut = { name: string; reason: string }

/**
 * POST /api/projects/[projectId]/documents/bulk-download
 * Body: { externalIds: string[] }  — may include folder IDs; folders are expanded recursively.
 * Returns a ZIP file preserving the folder structure.
 *
 * Only what's in this engagement: an id that isn't one of its documents, nor inside its folder tree,
 * is left out. A Limited Access contributor or Reviewer gets exactly what `download-share` would give
 * them one file at a time: nothing private to the firm (privateSubtreeIds), nothing not shared with
 * them, and only files whose `allowDownload` is on for their role. A Reviewer's PDF-only file is left
 * out (it downloads on its own, as its PDF copy).
 *
 * A partial ZIP is still a ZIP (decision 1), and these headers say what it's short of, for the browser
 * to say "Downloaded 96 of 100. Not included: …":
 *   X-Bulk-Download-Included      files in the ZIP
 *   X-Bulk-Download-Skipped       items whose details or folder listing couldn't be read from storage
 *   X-Bulk-Download-Failed        files whose content couldn't be downloaded
 *   X-Bulk-Download-Withheld      files this person's role may not download (or that aren't shared with them)
 *   X-Bulk-Download-Capped        "true" when the selection held more than the limit, and the rest was left out
 *   X-Bulk-Download-Limit         the limit, in files (100)
 *   X-Bulk-Download-Not-Included  encodeURIComponent(JSON) of up to 20 { name, reason }; a file not shared
 *                                 with the person is counted but never named
 * Nothing in the ZIP is an error, not an empty ZIP: `{ error, notIncluded }`.
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

    const body = await request.json().catch(() => ({}))
    const rootIds: string[] = Array.from(new Set(
      (Array.isArray(body?.externalIds) ? body.externalIds : []).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
    ))
    if (!rootIds.length) return NextResponse.json({ error: 'No files specified' }, { status: 400 })

    const engagement = await prisma.engagement.findUnique({
      where: { id: projectId },
      select: { firmId: true, name: true, clientId: true },
    })
    if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

    const connectorId = await resolveEngagementConnectorId(projectId)
    if (!connectorId) {
      return NextResponse.json({ error: 'No storage is connected to this engagement. Reconnect the storage, then try again.', code: 'no_connector' }, { status: 409 })
    }

    const permissionAdapter = await getPermissionAdapter(connectorId)
    const contentAdapter = await getContentAdapter(connectorId)
    if (!permissionAdapter || !contentAdapter) {
      return NextResponse.json({ error: "This engagement's storage can't be read right now. Reconnect the storage, then try again.", code: 'unsupported' }, { status: 502 })
    }

    // The engagement's documents: what belongs to it, and what a client may take.
    const rows = await prisma.engagementDocument.findMany({
      where: { engagementId: projectId },
      select: { externalId: true, parentId: true, fileName: true, settings: true },
    })
    const rowOf = new Map(rows.map((r) => [r.externalId, r]))
    const isClient = isExternalEngagementRole(member.role)
    const isReviewer = member.role === 'eng_viewer'
    const visible = isClient ? await visibleDocumentIdsFor(projectId, member.role) : null
    const hidden = isClient ? privateSubtreeIds(rows) : new Set<string>()

    /** Why this person may not download it: the rules download-share applies, one file at a time. */
    const withheldBecause = (externalId: string, isFolder: boolean): { reason: string; named: boolean } | null => {
      if (!isClient) return null
      const row = rowOf.get(externalId)
      if (!row || hidden.has(externalId) || (visible && !visible.has(externalId))) return { reason: "isn't shared with you", named: false }
      if (isFolder) return null
      const share = parseSettingsFromDb(row.settings).share
      if (isReviewer) {
        if (!share?.guest?.options?.allowDownload) return { reason: "isn't available to download", named: true }
        if (share.guest.options.sharePdfOnly) return { reason: 'is shared as a PDF only, so download it on its own', named: true }
        return null
      }
      return share?.externalCollaborator?.options?.allowDownload ? null : { reason: "isn't available to download", named: true }
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
    const leftOut: LeftOut[] = []
    let skippedCount = 0
    let withheldCount = 0
    let capped = false

    // The selection itself: only what's in this engagement.
    const roots: string[] = []
    for (const id of rootIds) {
      let inEngagement: boolean
      try {
        inEngagement = rowOf.has(id) || (!isClient && await isFileInEngagementTree(projectId, connectorId, id))
      } catch (e) {
        // The storage refused the check (P2-37): left out as unreadable, not as "not in this engagement".
        if (!(e instanceof StorageFailure)) throw e
        skippedCount++
        leftOut.push({ name: 'An item', reason: "couldn't be read from storage" })
        continue
      }
      if (inEngagement) {
        roots.push(id)
      } else {
        withheldCount++
        if (!isClient) leftOut.push({ name: 'An item', reason: "isn't in this engagement" })
      }
    }

    const collectFiles = async (ids: string[], pathPrefix: string): Promise<void> => {
      for (const id of ids) {
        if (capped) return
        let meta: Awaited<ReturnType<typeof permissionAdapter.getFileMetadata>> = null
        try {
          meta = await permissionAdapter.getFileMetadata(connectorId, id)
        } catch {
          meta = null
        }
        if (!meta) {
          skippedCount++
          if (!withheldBecause(id, false) || !isClient) leftOut.push({ name: rowOf.get(id)?.fileName ?? 'An item', reason: "couldn't be read from storage" })
          continue
        }
        const isFolder = meta.mimeType === 'application/vnd.google-apps.folder' || !meta.mimeType
        const withheld = withheldBecause(id, isFolder)
        if (withheld) {
          withheldCount++
          if (withheld.named) leftOut.push({ name: meta.name, reason: withheld.reason })
          continue
        }
        const path = pathPrefix ? `${pathPrefix}/${meta.name}` : meta.name
        if (isFolder) {
          let childIds: string[]
          try {
            const children = await permissionAdapter.listFiles(connectorId, id, 500)
            childIds = (children as { id: string }[]).map((c) => c.id).filter(Boolean)
          } catch {
            skippedCount++
            leftOut.push({ name: meta.name, reason: "couldn't be listed in storage" })
            continue
          }
          await collectFiles(childIds, path)
        } else {
          // The limit counts files: past it, the rest is left out and the browser is told.
          if (fileEntries.length >= MAX_FILES) {
            capped = true
            return
          }
          fileEntries.push({ id, path })
        }
      }
    }

    await collectFiles(roots, '')
    if (skippedCount > 0) {
      console.warn(`bulk-download: skipped ${skippedCount} unreadable file(s)/folder(s) for engagement ${projectId}`)
    }

    // Download and zip
    let downloadFailures = 0
    await Promise.all(
      fileEntries.map(async ({ id, path }) => {
        try {
          const { stream } = await contentAdapter.getRenderableContent(connectorId, id, 'native')
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
          leftOut.push({ name: path.split('/').pop() ?? path, reason: "couldn't be downloaded from storage" })
        }
      })
    )

    const included = fileEntries.length - downloadFailures
    if (included === 0) {
      // Nothing to give is an error, never an empty ZIP.
      const named = leftOut.slice(0, MAX_NAMED)
      const listed = named.map((l) => `${l.name} (${l.reason})`).join(', ')
      const onlyWithheld = skippedCount === 0 && downloadFailures === 0 && withheldCount > 0
      return NextResponse.json({
        error: onlyWithheld
          ? `None of these files can be downloaded${listed ? `. Not included: ${listed}.` : '.'}`
          : `None of these files could be downloaded${listed ? `. Not included: ${listed}.` : '. Try again in a moment.'}`,
        code: onlyWithheld ? 'not_permitted' : 'nothing_downloaded',
        notIncluded: named,
      }, { status: onlyWithheld ? 403 : 502 })
    }

    const zipUint8 = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })

    const safeName = engagement.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
    // The bytes themselves, not a Buffer's `.buffer`: a small Buffer is a slice of a shared pool, and
    // its `.buffer` is the whole pool.
    return new NextResponse(zipUint8 as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeName}.zip"`,
        'Content-Length': zipUint8.byteLength.toString(),
        // What the ZIP is short of, for the browser to say so (documented above).
        'X-Bulk-Download-Included': String(included),
        'X-Bulk-Download-Skipped': String(skippedCount),
        'X-Bulk-Download-Failed': String(downloadFailures),
        'X-Bulk-Download-Withheld': String(withheldCount),
        'X-Bulk-Download-Capped': String(capped),
        'X-Bulk-Download-Limit': String(MAX_FILES),
        'X-Bulk-Download-Not-Included': encodeURIComponent(JSON.stringify(leftOut.slice(0, MAX_NAMED))),
      },
    })
  } catch (e) {
    console.error('bulk-download error', e)
    return NextResponse.json({ error: "Couldn't make the ZIP. Something went wrong on our side. Try again." }, { status: 500 })
  }
}
