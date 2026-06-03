import {
  IConnectorStorageAdapter,
  PockettMetaOrganization,
  METADATA_FOLDER_NAME,
} from '@/lib/connectors/types'
import * as pockettStructure from '@/lib/connectors/pockett-structure.service'
import { safeInngestSend } from '@/lib/inngest/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { duplicateConnectorForOrganization } from '@/lib/services/connection-manager'
import { FirmService } from '@/lib/firm-service'
import { ClientService } from '@/lib/services/client.service'
import { projectService } from '@/lib/services/project.service'
import { SampleFileService, DEFAULT_SAMPLE_FILES } from '@/lib/services/sample-file-service-server'

interface DetectedProject {
  folderId: string
  name: string
  slug: string
  alreadyImported: boolean
}

interface DetectedClient {
  folderId: string
  name: string
  slug: string
  alreadyImported: boolean
  projects: DetectedProject[]
}

export interface DetectedOrganization {
  folderId: string
  name: string
  slug: string
  metadata: PockettMetaOrganization
  hasMetaFile: boolean
  alreadyImported: boolean
  clients: DetectedClient[]
}

export interface ImportDetectedOptions {
  sandboxOnly?: boolean
  allowDomainAccess?: boolean
}

/** Build a DetectedOrganization from workspace-root sandbox firm `.meta` (type `firm` or sandbox `organization`). */
export function buildDetectedOrganizationFromSandboxDriveMeta(
  folderId: string,
  meta: Record<string, unknown>
): DetectedOrganization {
  const slug = typeof meta.slug === 'string' ? meta.slug : ''
  if (!slug) {
    throw new Error('Sandbox firm metadata is missing slug')
  }
  const name =
    (typeof meta.originalName === 'string' && meta.originalName) ||
    (typeof meta.folderName === 'string' && meta.folderName) ||
    slug
  const orgMeta: PockettMetaOrganization = {
    type: 'organization',
    slug,
    isDefault: Boolean(meta.isDefault),
    originalName: typeof meta.originalName === 'string' ? meta.originalName : undefined,
    folderName: typeof meta.folderName === 'string' ? meta.folderName : undefined,
    collision: Boolean(meta.collision),
    sandboxOnly: true,
  }
  return {
    folderId,
    name,
    slug,
    metadata: orgMeta,
    hasMetaFile: true,
    alreadyImported: false,
    clients: [],
  }
}

interface ImportResult {
  orgSlug: string
  orgId: string
  clientCount: number
  projectCount: number
  projectIds: string[]
}

/**
 * Detect all organizations in Drive and their hierarchical structure (Clients > Projects)
 */
export async function detectAllOrganizations(
  connectionId: string,
  parentFolderId: string,
  adapter: IConnectorStorageAdapter
): Promise<DetectedOrganization[]> {
  try {
    logger.info('Detecting organization hierarchy in Drive (V2)', { parentFolderId, connectionId })

    // Scope search to the configured root folder so we avoid a full-Drive scan
    // and eliminate the need for any ancestry-walk verification.
    const scopedQuery = parentFolderId && parentFolderId !== 'root'
      ? `name = '${METADATA_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentFolderId}' in parents`
      : `name = '${METADATA_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`

    const pockettFolders = await adapter.search(connectionId, scopedQuery)
    logger.info(`Found ${pockettFolders.length} ${METADATA_FOLDER_NAME} metadata folders in Drive`)

    // Process all org folders in parallel
    const results = await Promise.allSettled(pockettFolders.map(async (dotPockett) => {
      const parentId = await adapter.getFileParent(connectionId, dotPockett.id)
      if (!parentId) return null

      const metadataRaw = await pockettStructure.readMetaFromFolder(adapter, connectionId, parentId)
      if (!metadataRaw || metadataRaw.type !== 'organization') return null

      const metadata = metadataRaw as unknown as PockettMetaOrganization

      // Skip sandbox organizations from auto-import discovery
      if (metadata.sandboxOnly === true) {
        logger.info(`Skipping sandbox organization in discovery: ${metadata.slug}`)
        return null
      }

      // Check if already imported (V2) and list client folders in parallel
      const [existingOrg, clientFolders, folderName] = await Promise.all([
        prisma.firm.findUnique({
          where: { slug: metadata.slug },
          select: { id: true },
        }),
        adapter.listFolderChildren(connectionId, parentId),
        adapter.getFolderName(connectionId, parentId)
      ])

      // Process clients in parallel
      const clientResults = await Promise.allSettled(
        clientFolders
          .filter((cf: any) => !cf.name.startsWith('.'))
          .map(async (cf: any) => {
            const clientMeta = await pockettStructure.readMetaFromFolder(adapter, connectionId, cf.id)
            if (!clientMeta || clientMeta.type !== 'client') return null

            const clientSlug = (clientMeta as any).slug
            const [existingClient, projectFolders] = await Promise.all([
              existingOrg ? prisma.client.findFirst({
                where: { firmId: existingOrg.id, slug: clientSlug },
                select: { id: true }
              }) : Promise.resolve(null),
              adapter.listFolderChildren(connectionId, cf.id)
            ])

            // Process projects in parallel
            const projectResults = await Promise.allSettled(
              projectFolders
                .filter((pf: any) => !pf.name.startsWith('.'))
                .map(async (pf: any) => {
                  const projectMeta = await pockettStructure.readMetaFromFolder(adapter, connectionId, pf.id)
                  if (!projectMeta || projectMeta.type !== 'project') return null

                  const projectSlug = (projectMeta as any).slug
                  const existingProject = existingClient ? await prisma.engagement.findFirst({
                    where: { clientId: existingClient.id, slug: projectSlug },
                    select: { id: true }
                  }) : null

                  return {
                    folderId: pf.id,
                    name: pf.name,
                    slug: projectSlug,
                    alreadyImported: !!existingProject
                  } as DetectedProject
                })
            )

            const projects = projectResults
              .filter((r): r is PromiseFulfilledResult<DetectedProject | null> => r.status === 'fulfilled' && r.value !== null)
              .map(r => r.value as DetectedProject)

            return {
              folderId: cf.id,
              name: cf.name,
              slug: clientSlug,
              alreadyImported: !!existingClient,
              projects
            } as DetectedClient
          })
      )

      const clients = clientResults
        .filter((r): r is PromiseFulfilledResult<DetectedClient | null> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value as DetectedClient)

      return {
        folderId: parentId,
        name: folderName || metadata.folderName || metadata.slug,
        slug: metadata.slug,
        metadata,
        hasMetaFile: true,
        alreadyImported: !!existingOrg,
        clients
      } as DetectedOrganization
    }))

    const detected = results
      .filter((r): r is PromiseFulfilledResult<DetectedOrganization | null> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value as DetectedOrganization)

    // Log any individual failures without failing the whole detection
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.error(`Error processing potential organization folder [${i}]`, r.reason)
      }
    })

    return detected
  } catch (error) {
    logger.error('Failed to detect organizations', error as Error)
    throw error
  }
}

/**
 * Import selected organizations from Drive
 */
export async function importMultipleOrganizations(
  connectionId: string,
  parentFolderId: string,
  selectedFolderIds: string[],
  adapter: IConnectorStorageAdapter,
  userId: string,
  sourceOrgId?: string,
  allowDomainAccess?: boolean
): Promise<ImportResult[]> {
  const results: ImportResult[] = []
  try {
    const allDetected = await detectAllOrganizations(connectionId, parentFolderId, adapter)
    const toImport = allDetected.filter(
      (org) => selectedFolderIds.includes(org.folderId) && !org.alreadyImported
    )

    for (const org of toImport) {
      try {
        const result = await importDetectedOrganization(
          org,
          connectionId,
          adapter,
          userId,
          sourceOrgId,
          selectedFolderIds,
          allowDomainAccess
        )
        results.push(result)
        // Each org set as default; last one wins (setDefaultOrganization toggles others off)
        await FirmService.setDefaultFirm(userId, result.orgId)
      } catch (err) {
        logger.error(`Failed to import organization: ${org.slug}`, err as Error)
      }
    }
    return results
  } catch (error) {
    logger.error('Failed to import organizations', error as Error)
    throw error
  }
}

/**
 * Import a single organization and its allowed sub-structure (Drive → DB).
 */
export async function importDetectedOrganization(
  detectedOrg: DetectedOrganization,
  connectionId: string,
  adapter: IConnectorStorageAdapter,
  userId: string,
  sourceOrgId?: string,
  allowedFolderIds?: string[],
  allowDomainAccess?: boolean,
  importOptions?: ImportDetectedOptions
): Promise<ImportResult> {
  const slug = detectedOrg.slug
  logger.info(`Importing organization (V2): ${slug}`, { name: detectedOrg.name })

  const resolvedAllowDomain =
    importOptions?.allowDomainAccess ??
    (importOptions?.sandboxOnly ? false : (allowDomainAccess ?? true))

  const isSandbox = importOptions?.sandboxOnly ?? false
  let billingAnchorId: string | null = null
  if (!isSandbox) {
    const { resolveBillingAnchorForNewSatelliteFirm } = await import('@/lib/billing/firm-creation-gate')
    billingAnchorId = await resolveBillingAnchorForNewSatelliteFirm(userId)
    if (!billingAnchorId) {
      throw new Error('Could not attach imported workspace to your billing subscription.')
    }
  }

  // 1. Create Organization via Service
  const org = await FirmService.createFirmWithMember({
    userId,
    email: '', // Not needed for import as user already exists
    firstName: '',
    lastName: '',
    firmName: detectedOrg.name,
    connectorId: connectionId,
    firmFolderId: detectedOrg.folderId,
    allowDomainAccess: resolvedAllowDomain,
    sandboxOnly: isSandbox,
    anchorFirmId: billingAnchorId ?? undefined,
  })

  // Set the slug correctly if it differs from generated
  if (org.slug !== detectedOrg.slug) {
    await (prisma as any).firm.update({
      where: { id: org.id },
      data: { slug: detectedOrg.slug }
    })
  }

  // 2. Duplicate connection if needed
  if (sourceOrgId) {
    try {
      await duplicateConnectorForOrganization(sourceOrgId, org.id, prisma)
    } catch (err) {
      logger.warn(`Failed to duplicate connection for: ${slug}`, err as Error)
    }
  }

  const clientFolders = await adapter.listFolderChildren(connectionId, detectedOrg.folderId)
  const projectIds: string[] = []
  let createdClientCount = 0

  for (const clientFolder of clientFolders) {
    if (clientFolder.name.startsWith('.')) continue
    if (allowedFolderIds && !allowedFolderIds.includes(clientFolder.id)) continue

    try {
      const clientMetadata = await pockettStructure.readMetaFromFolder(adapter, connectionId, clientFolder.id)
      if (!clientMetadata || clientMetadata.type !== 'client') continue

      // 3. Create Client via Service
      const client = await ClientService.createClient({
        firmId: org.id,
        name: clientFolder.name,
        creatorUserId: userId,
        sandboxOnly: (clientMetadata as any)?.sandboxOnly ?? false,
        settings: { ...(clientMetadata as any || {}), driveFolderId: clientFolder.id }
      })

      // Update Client with driveFolderId and slug
      await (prisma as any).client.update({
        where: { id: client.id },
        data: {
          driveFolderId: clientFolder.id,
          slug: (clientMetadata as any).slug || client.slug
        }
      })
      createdClientCount++

      // 4. Create Projects
      const projectFolders = await adapter.listFolderChildren(connectionId, clientFolder.id)
      for (const projectFolder of projectFolders) {
        if (projectFolder.name.startsWith('.')) continue
        if (allowedFolderIds && !allowedFolderIds.includes(projectFolder.id)) continue

        try {
          const projectMetadata = await pockettStructure.readMetaFromFolder(adapter, connectionId, projectFolder.id)
          if (!projectMetadata || projectMetadata.type !== 'project') continue

          const { project } = await projectService.createProject(
            org.id,
            client.id,
            projectFolder.name,
            userId,
            ''
          )

          // Update Engagement with root folder and slug
          await prisma.engagement.update({
            where: { id: project.id },
            data: {
              connectorRootFolderId: projectFolder.id,
              slug: (projectMetadata as any).slug || project.slug,
              sandboxOnly: (projectMetadata as any)?.sandboxOnly ?? false
            }
          })

          projectIds.push(project.id)

          try {
            await safeInngestSend('project.index.scan.requested', {
              organizationId: org.id,
              projectId: project.id,
              connectorId: connectionId,
              rootFolderIds: [projectFolder.id],
            })

            // Create sample files in internal folders if sandboxOnly or if these were just created
            const subfolders = await adapter.listFolderChildren(connectionId, projectFolder.id)
            for (const sub of subfolders) {
              if (DEFAULT_SAMPLE_FILES[sub.name]) {
                await SampleFileService.createSampleFiles(
                  adapter,
                  connectionId,
                  sub.id,
                  DEFAULT_SAMPLE_FILES[sub.name]
                )
              }
            }
          } catch (err) {
            logger.warn(`Failed indexing trigger or sample files for: ${project.slug}`, err as Error)
          }
        } catch (err) {
          logger.warn(`Failed to import project: ${projectFolder.name}`, err as Error)
        }
      }
    } catch (err) {
      logger.warn(`Failed to import client: ${clientFolder.name}`, err as Error)
    }
  }

  return {
    orgSlug: detectedOrg.slug,
    orgId: org.id,
    clientCount: createdClientCount,
    projectCount: projectIds.length,
    projectIds,
  }
}
