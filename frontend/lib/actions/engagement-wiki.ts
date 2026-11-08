'use server'

import { prisma } from '@/lib/prisma'
import { assertEngagementNotCompleted } from '@/lib/engagement-access'
import { createClient } from '@/utils/supabase/server'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { resolveClientConnector } from '@/lib/connectors/resolve-client-connector'
import { getContentAdapter, getPermissionAdapter } from '@/lib/connectors/registry'
import { ensureOneDriveFolderPath } from '@/lib/connectors/adapters/onedrive-file-ops'
import { renameOneDriveFile } from '@/lib/connectors/adapters/onedrive-file-ops'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canEditProject, canViewProjectInternalTabs } from '@/lib/permission-helpers'
import { asResult, userFacing, type ActionResult } from '@/lib/actions/action-result'
import { asResultWithWarning, connectorProviderName, gone, notAllowed, readableReason, signedOut } from '@/lib/actions/action-reasons'
import { logger } from '@/lib/logger'

async function isOneDriveConnector(connectorId: string): Promise<boolean> {
  const connector = await prisma.connector.findUnique({ where: { id: connectorId }, select: { type: true } })
  return connector?.type === 'ONEDRIVE'
}

/** Ensure a nested folder path exists under `rootFolderId`, provider-agnostic. */
async function ensureFolderPath(connectorId: string, rootFolderId: string, segments: string[]): Promise<string | null> {
  if (await isOneDriveConnector(connectorId)) {
    return ensureOneDriveFolderPath(connectorId, rootFolderId, segments)
  }
  return googleDriveConnector.ensureFolderPath(connectorId, rootFolderId, segments)
}

export type WikiPage = {
  id: string
  engagementId: string
  firmId: string
  title: string
  slug: string
  driveFileId: string | null
  order: number
  parentId: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
  children?: WikiPage[]
}

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * The Dossier (wiki) is an internal engagement tab: the engagement page only shows it to users with
 * project:can_view_internal (eng_admin / eng_member / firm admin), never to EC/EV guests. Every action
 * here is a callable endpoint taking an engagement or page id, so each one re-checks that rule
 * server-side — reading needs internal access, changing anything also needs project:can_edit.
 * Returns the caller and the engagement's firm (never the caller's say-so).
 */
async function requireWikiAccess(engagementId: string, mode: 'read' | 'write'): Promise<{ userId: string; firmId: string }> {
  const user = await getUser()
  if (!user) throw signedOut()
  const ctx = await resolveProjectContext(engagementId)
  if (!ctx) throw gone('This engagement was deleted.')
  const allowed =
    (await canViewProjectInternalTabs(ctx.firmId, ctx.clientId, ctx.projectId)) &&
    (mode === 'read' || (await canEditProject(ctx.firmId, ctx.clientId, ctx.projectId)))
  if (!allowed) throw notAllowed(mode === 'read' ? "see this engagement's Dossier" : "change this engagement's Dossier")
  if (mode === 'write') await assertEngagementNotCompleted(engagementId)
  return { userId: user.id, firmId: ctx.firmId }
}

/** Access check for an action addressed by wiki page id: resolves the page's own engagement first. */
async function requireWikiPageAccess(pageId: string, mode: 'read' | 'write'): Promise<{ userId: string; engagementId: string }> {
  const page = await (prisma as any).engagementWikiPage.findUnique({ where: { id: pageId }, select: { engagementId: true } })
  if (!page) throw gone('This page was deleted.')
  const { userId } = await requireWikiAccess(page.engagementId, mode)
  return { userId, engagementId: page.engagementId }
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'untitled'
}

async function uniqueSlug(engagementId: string, base: string, excludeId?: string): Promise<string> {
  let slug = base
  let n = 1
  while (true) {
    const existing = await (prisma as any).engagementWikiPage.findFirst({
      where: { engagementId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (!existing) return slug
    slug = `${base}-${++n}`
  }
}

/**
 * The connector an engagement's Dossier lives on: its client's (resolveClientConnector), the same one
 * createWikiPage writes with. Reads, saves, renames and deletes used the legacy `Firm.connectorId`,
 * which is empty for firms connected the current way, so every save "worked" and wrote nothing.
 */
async function engagementConnectorId(engagementId: string): Promise<string> {
  const engagement = await (prisma as any).engagement.findUnique({ where: { id: engagementId }, select: { clientId: true } })
  if (!engagement) throw gone('This engagement was deleted.')
  const { connectorId } = await resolveClientConnector(engagement.clientId)
  if (!connectorId) throw userFacing("This engagement's client has no storage connected, so its Dossier can't be read or saved.", 'no_connector')
  return connectorId
}

/** Look up connectorId and connectorRootFolderId for an engagement. */
async function getEngagementDriveContext(engagementId: string): Promise<{ connectorId: string; connectorRootFolderId: string }> {
  const engagement = await (prisma as any).engagement.findUnique({
    where: { id: engagementId },
    select: {
      clientId: true,
      connectorRootFolderId: true,
    },
  })
  if (!engagement) throw gone('This engagement was deleted.')
  if (!engagement.connectorRootFolderId) {
    throw userFacing("This engagement has no folder in storage yet. Set it up from Files, then try again.", 'no_folder')
  }
  const { connectorId } = await resolveClientConnector(engagement.clientId)
  if (!connectorId) throw userFacing("This engagement's client has no storage connected, so its Dossier can't be saved.", 'no_connector')
  return {
    connectorId,
    connectorRootFolderId: engagement.connectorRootFolderId,
  }
}

/** Ensure `_wiki/` folder exists under engagement root, return its ID. */
async function ensureWikiFolder(connectorId: string, connectorRootFolderId: string): Promise<string> {
  const folderId = await ensureFolderPath(connectorId, connectorRootFolderId, ['_wiki'])
  if (!folderId) throw userFacing(`Couldn't create the Dossier's folder in ${await connectorProviderName(connectorId)}. Try again.`, 'storage_setup_failed')
  return folderId
}

/** Ensure `_wiki/{sectionTitle}/` folder exists, return its ID. */
async function ensureSectionFolder(connectorId: string, connectorRootFolderId: string, sectionTitle: string): Promise<string> {
  const folderId = await ensureFolderPath(connectorId, connectorRootFolderId, ['_wiki', sectionTitle])
  if (!folderId) {
    throw userFacing(`Couldn't create the folder for "${sectionTitle}" in ${await connectorProviderName(connectorId)}. Try again.`, 'storage_setup_failed')
  }
  return folderId
}

export async function getWikiPages(engagementId: string): Promise<ActionResult<WikiPage[]>> {
  return asResult('getWikiPages', async () => {
    await requireWikiAccess(engagementId, 'read')

    return (prisma as any).engagementWikiPage.findMany({
      where: { engagementId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    }) as Promise<WikiPage[]>
  })
}

/**
 * A page's text, read from its file in storage. A section, or a page with no file yet, is empty. A read
 * that fails answers its reason, never "": the editor would show a blank page and its first autosave
 * would write that blank over the real file.
 */
export async function getWikiPageContent(id: string): Promise<ActionResult<string>> {
  return asResult('getWikiPageContent', () => getWikiPageContentOrThrow(id))
}

async function getWikiPageContentOrThrow(id: string): Promise<string> {
  const { engagementId } = await requireWikiPageAccess(id, 'read')

  const row = await (prisma as any).engagementWikiPage.findUnique({
    where: { id },
    select: { driveFileId: true, parentId: true },
  })

  // Sections (parentId === null) and pages not yet written to storage have no content.
  if (!row) throw gone('This page was deleted.')
  if (!row.driveFileId || row.parentId === null) return ''

  const connectorId = await engagementConnectorId(engagementId)
  const contentAdapter = await getContentAdapter(connectorId)
  if (!contentAdapter) throw userFacing(`${await connectorProviderName(connectorId)} can't be read from here. Reconnect it, then try again.`, 'no_adapter')
  const { stream } = await contentAdapter.getRenderableContent(connectorId, row.driveFileId, 'native')
  const body = Buffer.isBuffer(stream) ? new Uint8Array(stream) : stream
  return new Response(body as BodyInit).text()
}

export async function createWikiPage(
  engagementId: string,
  _callerFirmId: string,
  opts: { title: string; parentId?: string | null }
): Promise<ActionResult<WikiPage>> {
  return asResult('createWikiPage', () => createWikiPageOrThrow(engagementId, opts))
}

async function createWikiPageOrThrow(
  engagementId: string,
  opts: { title: string; parentId?: string | null }
): Promise<WikiPage> {
  // The firm comes from the engagement, not the caller — the second argument is kept only so
  // existing call sites keep compiling.
  const { userId, firmId } = await requireWikiAccess(engagementId, 'write')
  if (!opts.title?.trim()) throw userFacing('A page needs a title.', 'title_required')
  if (opts.parentId) {
    const parent = await (prisma as any).engagementWikiPage.findUnique({ where: { id: opts.parentId }, select: { engagementId: true } })
    if (!parent || parent.engagementId !== engagementId) throw gone('That section was deleted.')
  }
  const baseSlug = toSlug(opts.title)
  const slug = await uniqueSlug(engagementId, baseSlug)

  const siblings = await (prisma as any).engagementWikiPage.findMany({
    where: { engagementId, parentId: opts.parentId ?? null },
    select: { order: true },
    orderBy: { order: 'desc' },
  })
  const maxOrder: number = siblings[0]?.order ?? -1

  let driveFileId: string | null = null
  const { connectorId, connectorRootFolderId } = await getEngagementDriveContext(engagementId)

  if (!opts.parentId) {
    // Section → create a Drive folder at _wiki/{title}/
    const folderId = await ensureSectionFolder(connectorId, connectorRootFolderId, opts.title)
    driveFileId = folderId
  } else {
    // Page → find the parent section's Drive folder, create {title}.md inside it
    const section = await (prisma as any).engagementWikiPage.findUnique({
      where: { id: opts.parentId },
      select: { driveFileId: true, title: true },
    })
    // Use stored folder ID if available, else fall back to ensureSectionFolder by title
    const sectionFolderId = section?.driveFileId
      ?? await ensureSectionFolder(connectorId, connectorRootFolderId, section?.title ?? 'Untitled Section')

    if (sectionFolderId) {
      const fileName = `${opts.title}.md`
      const contentAdapter = await getContentAdapter(connectorId)
      if (contentAdapter) {
        const result = await contentAdapter.createFile(connectorId, sectionFolderId, fileName, Buffer.from('', 'utf-8'), 'text/plain')
        driveFileId = result?.id ?? null
      }
    }
  }

  return (prisma as any).engagementWikiPage.create({
    data: {
      engagementId,
      firmId,
      title: opts.title,
      slug,
      parentId: opts.parentId ?? null,
      order: maxOrder + 1,
      driveFileId,
      createdBy: userId,
      updatedBy: userId,
    },
  }) as Promise<WikiPage>
}

/**
 * Saves a page's title and text. The text is written to its file in storage first; when that fails the
 * answer is the reason, so the editor keeps the words and says "Not saved". A title that changes here
 * but can't be renamed in storage answers ok with a `warning`.
 */
export async function updateWikiPage(
  id: string,
  patch: { title?: string; content?: string }
): Promise<ActionResult<WikiPage>> {
  return asResultWithWarning('updateWikiPage', () => updateWikiPageOrThrow(id, patch))
}

async function updateWikiPageOrThrow(
  id: string,
  patch: { title?: string; content?: string }
): Promise<{ data: WikiPage; warning?: string }> {
  const { userId, engagementId } = await requireWikiPageAccess(id, 'write')
  if (patch.title !== undefined && !patch.title.trim()) throw userFacing('A page needs a title.', 'title_required')

  const row = await (prisma as any).engagementWikiPage.findUnique({
    where: { id },
    select: {
      driveFileId: true,
      title: true,
      parentId: true,
      engagementId: true,
    },
  })
  if (!row) throw gone('This page was deleted.')

  let warning: string | undefined
  const touchesStorage = patch.content !== undefined || (patch.title !== undefined && !!row.driveFileId)
  if (touchesStorage) {
    const connectorId = await engagementConnectorId(engagementId)
    const provider = await connectorProviderName(connectorId)
    const onOneDrive = await isOneDriveConnector(connectorId)

    // Write content to storage. Not saved there is not saved: the error reaches the editor.
    if (patch.content !== undefined) {
      const contentAdapter = await getContentAdapter(connectorId)
      if (!contentAdapter) throw userFacing(`Couldn't save this page: ${provider} can't be written to from here. Reconnect it, then try again.`, 'no_adapter')
      const currentTitle = patch.title ?? row.title ?? 'content'
      const fileName = `${currentTitle}.md`
      let driveFileId: string | null = row.driveFileId ?? null

      if (!driveFileId && row.parentId) {
        // Lazy migration: page predates Drive storage — find/create its section folder and create the file
        const { connectorRootFolderId } = await getEngagementDriveContext(row.engagementId)
        const section = await (prisma as any).engagementWikiPage.findUnique({
          where: { id: row.parentId },
          select: { driveFileId: true, title: true },
        })
        const sectionFolderId = section?.driveFileId
          ?? await ensureSectionFolder(connectorId, connectorRootFolderId, section?.title ?? 'Untitled Section')

        const result = await contentAdapter.createFile(connectorId, sectionFolderId, fileName, Buffer.from(patch.content, 'utf-8'), 'text/plain')
        driveFileId = result?.id ?? null
        if (!driveFileId) throw userFacing(`Couldn't save this page: ${provider} didn't create its file. Try again.`, 'storage_write_failed')
        await (prisma as any).engagementWikiPage.update({ where: { id }, data: { driveFileId } })
      } else if (driveFileId) {
        await contentAdapter.overwriteFileContent(connectorId, driveFileId, Buffer.from(patch.content, 'utf-8'), 'text/plain')
      }
    }

    // Rename the file or folder when the title changes. The new title is Firma's either way; a rename
    // storage refuses is said, not dropped.
    if (patch.title !== undefined && row.driveFileId && patch.title !== row.title) {
      const newName = row.parentId === null ? patch.title : `${patch.title}.md`
      try {
        if (onOneDrive) {
          await renameOneDriveFile(connectorId, row.driveFileId, newName)
        } else {
          await googleDriveConnector.patchFileProperties(connectorId, row.driveFileId, { name: newName })
        }
      } catch (e) {
        logger.error('[updateWikiPage] Rename in storage failed', e as Error)
        const why = readableReason(e)
        warning = `Renamed here, but not in ${provider}${why ? ` · ${why}` : ''}.`
      }
    }
  }

  const dbData: Record<string, unknown> = { updatedBy: userId }
  if (patch.title !== undefined) dbData.title = patch.title

  const page = await (prisma as any).engagementWikiPage.update({
    where: { id },
    data: dbData,
  }) as WikiPage
  return { data: page, ...(warning ? { warning } : {}) }
}

/**
 * Deletes a page, or a section with its pages, here and in storage (to the trash). The rows go either
 * way; a file storage wouldn't trash is answered as the result's `warning`.
 */
export async function deleteWikiPage(id: string): Promise<ActionResult> {
  return asResultWithWarning('deleteWikiPage', async () => {
    const warning = await deleteWikiPageOrThrow(id)
    return { data: undefined, ...(warning ? { warning } : {}) }
  })
}

async function deleteWikiPageOrThrow(id: string): Promise<string | undefined> {
  const { engagementId } = await requireWikiPageAccess(id, 'write')

  const row = await (prisma as any).engagementWikiPage.findUnique({
    where: { id },
    select: {
      parentId: true,
      driveFileId: true,
      children: { select: { id: true, driveFileId: true } },
    },
  })
  if (!row) return undefined

  const fileIds = [
    ...((row.children ?? []) as Array<{ id: string; driveFileId: string | null }>).map((c) => c.driveFileId),
    row.driveFileId as string | null,
  ].filter((f): f is string => !!f)

  let warning: string | undefined
  if (fileIds.length > 0) {
    const connectorId = await engagementConnectorId(engagementId)
    const provider = await connectorProviderName(connectorId)
    const permissionAdapter = await getPermissionAdapter(connectorId)
    let left = 0
    let why: string | undefined
    if (!permissionAdapter) {
      left = fileIds.length
    } else {
      for (const fileId of fileIds) {
        try {
          await permissionAdapter.trashFile(connectorId, fileId)
        } catch (e) {
          logger.error('[deleteWikiPage] Trash in storage failed', e as Error)
          left++
          why ??= readableReason(e)
        }
      }
    }
    if (left > 0) {
      const what = row.parentId === null ? 'its folder' : 'the file'
      warning = `Deleted here, but ${left === fileIds.length ? what : `${left} of its files`} ${left === 1 || left === fileIds.length ? 'is' : 'are'} still in ${provider}${why ? ` · ${why}` : ''}.`
    }
  }

  if (row.parentId === null) {
    await (prisma as any).engagementWikiPage.deleteMany({ where: { parentId: id } })
  }
  await (prisma as any).engagementWikiPage.delete({ where: { id } })
  return warning
}

export async function reorderPages(orderedIds: string[]): Promise<ActionResult> {
  return asResult('reorderPages', async () => {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) return
    const pages = await (prisma as any).engagementWikiPage.findMany({
      where: { id: { in: orderedIds } },
      select: { engagementId: true },
    })
    const engagementIds = Array.from(new Set(pages.map((p: { engagementId: string }) => p.engagementId)))
    if (pages.length !== new Set(orderedIds).size || engagementIds.length !== 1) throw notAllowed('reorder these pages')
    await requireWikiAccess(engagementIds[0] as string, 'write')

    await Promise.all(
      orderedIds.map((pageId, index) =>
        (prisma as any).engagementWikiPage.update({
          where: { id: pageId },
          data: { order: index },
        })
      )
    )
  })
}
