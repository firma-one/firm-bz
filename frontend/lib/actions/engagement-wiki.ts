'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { resolveClientConnector } from '@/lib/connectors/resolve-client-connector'
import { getContentAdapter, getPermissionAdapter } from '@/lib/connectors/registry'
import { ensureOneDriveFolderPath } from '@/lib/connectors/adapters/onedrive-file-ops'
import { renameOneDriveFile } from '@/lib/connectors/adapters/onedrive-file-ops'

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

/** Look up connectorId and connectorRootFolderId for an engagement. */
async function getEngagementDriveContext(engagementId: string): Promise<{ connectorId: string; connectorRootFolderId: string }> {
  const engagement = await (prisma as any).engagement.findUnique({
    where: { id: engagementId },
    select: {
      clientId: true,
      connectorRootFolderId: true,
    },
  })
  if (!engagement) throw new Error('Engagement not found')
  if (!engagement.connectorRootFolderId) throw new Error('No connector root folder for this engagement')
  const { connectorId } = await resolveClientConnector(engagement.clientId)
  if (!connectorId) throw new Error('No active connector for this client')
  return {
    connectorId,
    connectorRootFolderId: engagement.connectorRootFolderId,
  }
}

/** Ensure `_wiki/` folder exists under engagement root, return its ID. */
async function ensureWikiFolder(connectorId: string, connectorRootFolderId: string): Promise<string> {
  const folderId = await ensureFolderPath(connectorId, connectorRootFolderId, ['_wiki'])
  if (!folderId) throw new Error('Failed to create _wiki folder')
  return folderId
}

/** Ensure `_wiki/{sectionTitle}/` folder exists, return its ID. */
async function ensureSectionFolder(connectorId: string, connectorRootFolderId: string, sectionTitle: string): Promise<string> {
  const folderId = await ensureFolderPath(connectorId, connectorRootFolderId, ['_wiki', sectionTitle])
  if (!folderId) throw new Error(`Failed to create section folder "${sectionTitle}"`)
  return folderId
}

export async function getWikiPages(engagementId: string): Promise<WikiPage[]> {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')

  return (prisma as any).engagementWikiPage.findMany({
    where: { engagementId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  }) as Promise<WikiPage[]>
}

export async function getWikiPageContent(id: string): Promise<string> {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')

  const row = await (prisma as any).engagementWikiPage.findUnique({
    where: { id },
    select: {
      driveFileId: true,
      parentId: true,
      engagement: { select: { firm: { select: { connectorId: true } } } },
    },
  })

  // Sections (parentId === null) or pages without a Drive file return empty
  if (!row?.driveFileId || row.parentId === null) return ''

  const connectorId: string | undefined = row.engagement?.firm?.connectorId
  if (!connectorId) return ''

  const contentAdapter = await getContentAdapter(connectorId)
  if (!contentAdapter) return ''
  const { stream } = await contentAdapter.getRenderableContent(connectorId, row.driveFileId, 'native')
  const body = Buffer.isBuffer(stream) ? new Uint8Array(stream) : stream
  return new Response(body as BodyInit).text()
}

export async function createWikiPage(
  engagementId: string,
  firmId: string,
  opts: { title: string; parentId?: string | null }
): Promise<WikiPage> {
  const user = await getUser()
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
      createdBy: user?.id ?? null,
      updatedBy: user?.id ?? null,
    },
  }) as Promise<WikiPage>
}

export async function updateWikiPage(
  id: string,
  patch: { title?: string; content?: string }
): Promise<WikiPage> {
  const user = await getUser()

  const row = await (prisma as any).engagementWikiPage.findUnique({
    where: { id },
    select: {
      driveFileId: true,
      title: true,
      parentId: true,
      engagementId: true,
      engagement: { select: { firm: { select: { connectorId: true } } } },
    },
  })

  const connectorId: string | undefined = row?.engagement?.firm?.connectorId

  if (connectorId) {
    const onOneDrive = await isOneDriveConnector(connectorId)

    // Rename Drive file/folder when title changes
    if (patch.title !== undefined && row?.driveFileId) {
      const newName = row.parentId === null ? patch.title : `${patch.title}.md`
      if (onOneDrive) {
        await renameOneDriveFile(connectorId, row.driveFileId, newName).catch(() => {})
      } else {
        await googleDriveConnector.patchFileProperties(connectorId, row.driveFileId, { name: newName }).catch(() => {})
      }
    }

    // Write content to Drive
    if (patch.content !== undefined) {
      const contentAdapter = await getContentAdapter(connectorId)
      if (contentAdapter) {
        const currentTitle = patch.title ?? row?.title ?? 'content'
        const fileName = `${currentTitle}.md`
        let driveFileId: string | null = row?.driveFileId ?? null

        if (!driveFileId && row?.parentId) {
          // Lazy migration: page predates Drive storage — find/create its section folder and create the file
          const { connectorRootFolderId } = await getEngagementDriveContext(row.engagementId)
          const section = await (prisma as any).engagementWikiPage.findUnique({
            where: { id: row.parentId },
            select: { driveFileId: true, title: true },
          })
          const sectionFolderId = section?.driveFileId
            ?? await ensureSectionFolder(connectorId, connectorRootFolderId, section?.title ?? 'Untitled Section')

          if (sectionFolderId) {
            const result = await contentAdapter.createFile(connectorId, sectionFolderId, fileName, Buffer.from(patch.content, 'utf-8'), 'text/plain')
            driveFileId = result?.id ?? null
            if (driveFileId) {
              await (prisma as any).engagementWikiPage.update({ where: { id }, data: { driveFileId } })
            }
          }
        } else if (driveFileId) {
          await contentAdapter.overwriteFileContent(connectorId, driveFileId, Buffer.from(patch.content, 'utf-8'), 'text/plain')
        }
      }
    }
  }

  const dbData: Record<string, unknown> = { updatedBy: user?.id ?? null }
  if (patch.title !== undefined) dbData.title = patch.title

  return (prisma as any).engagementWikiPage.update({
    where: { id },
    data: dbData,
  }) as Promise<WikiPage>
}

export async function deleteWikiPage(id: string): Promise<void> {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')

  const row = await (prisma as any).engagementWikiPage.findUnique({
    where: { id },
    select: {
      parentId: true,
      driveFileId: true,
      children: { select: { id: true, driveFileId: true } },
      engagement: { select: { firm: { select: { connectorId: true } } } },
    },
  })
  if (!row) return

  const connectorId: string | undefined = row.engagement?.firm?.connectorId

  if (connectorId) {
    const permissionAdapter = await getPermissionAdapter(connectorId)
    if (permissionAdapter) {
      for (const child of (row.children ?? []) as Array<{ id: string; driveFileId: string | null }>) {
        if (child.driveFileId) {
          await permissionAdapter.trashFile(connectorId, child.driveFileId).catch(() => {})
        }
      }
      if (row.driveFileId) {
        await permissionAdapter.trashFile(connectorId, row.driveFileId).catch(() => {})
      }
    }
  }

  if (row.parentId === null) {
    await (prisma as any).engagementWikiPage.deleteMany({ where: { parentId: id } })
  }
  await (prisma as any).engagementWikiPage.delete({ where: { id } })
}

export async function reorderPages(orderedIds: string[]): Promise<void> {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')

  await Promise.all(
    orderedIds.map((pageId, index) =>
      (prisma as any).engagementWikiPage.update({
        where: { id: pageId },
        data: { order: index },
      })
    )
  )
}
