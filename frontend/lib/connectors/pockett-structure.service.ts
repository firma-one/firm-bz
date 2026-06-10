/**
 * Shared Pockett folder structure logic: detect, setup, import, ensure.
 * Uses a storage adapter (Google Drive, Dropbox, OneDrive) and Prisma; does not create connector records for new orgs.
 */

import { prisma } from '@/lib/prisma'
import { ConnectorType } from '@prisma/client'
import { logger } from '@/lib/logger'
import type { IConnectorStorageAdapter } from './types'
import { METADATA_FILE_NAME, METADATA_FOLDER_NAME } from './types'

export const FOLDERS = {
  GENERAL: { name: 'General', type: 'general' },
  CONFIDENTIAL: { name: 'Confidential', type: 'confidential' },
  STAGING: { name: 'Staging', type: 'staging' }
} as const

// ---------------------------------------------------------------------------
// Meta helpers (storage-agnostic)
// ---------------------------------------------------------------------------

export async function readMetaFromFolder(
  adapter: IConnectorStorageAdapter,
  connectionId: string,
  folderId: string
): Promise<Record<string, unknown> | null> {
  const children = await adapter.listFolderChildren(connectionId, folderId)
  const dotPockett = children.find((f) => f.name === METADATA_FOLDER_NAME)
  if (!dotPockett) return null
  const inner = await adapter.listFolderChildren(connectionId, dotPockett.id)
  const metaFile = inner.find((f) => f.name === METADATA_FILE_NAME)
  if (!metaFile) return null
  const content = await adapter.readFileContent(connectionId, metaFile.id)
  if (!content) return null
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }
}

async function writeMetaInFolder(
  adapter: IConnectorStorageAdapter,
  connectionId: string,
  parentFolderId: string,
  meta: Record<string, unknown>
): Promise<void> {
  const dotPockettId = await adapter.findOrCreateFolder(connectionId, parentFolderId, METADATA_FOLDER_NAME)
  await adapter.writeFile(connectionId, dotPockettId, METADATA_FILE_NAME, JSON.stringify(meta))
}

/**
 * Ensure the standard .pockett folder with meta.json (type: root) exists inside the given root folder.
 * Used when creating the default workspace root (_Pockett_Workspace_) so the structure is consistent.
 */
export async function ensureRootMetaInFolder(
  adapter: IConnectorStorageAdapter,
  connectionId: string,
  rootFolderId: string
): Promise<void> {
  await writeMetaInFolder(adapter, connectionId, rootFolderId, { type: 'root', version: 1 })
}

function restrictIfSupported(
  adapter: IConnectorStorageAdapter,
  connectionId: string,
  folderId: string,
  logLabel: string
): Promise<void> {
  if (adapter.restrictFolderToOwnerOnly) {
    return adapter.restrictFolderToOwnerOnly(connectionId, folderId).then(() => {
      logger.info(logLabel, 'PockettStructure', { folderId, connectionId })
    })
  }
  return Promise.resolve()
}

// ---------------------------------------------------------------------------
// Collision Detection Helper
// ---------------------------------------------------------------------------

/**
 * Determine the actual folder name to use for org folder.
 * If orgName collides with an existing folder in parentFolder, check whether that folder
 * is firma-managed (appProperties.firma_managed = 'true'). If it is, reuse the name so
 * findOrCreateFolder picks it up — this handles the Remove → re-add with same workspace case.
 * Only fall back to slug when the collision is with a folder we don't own.
 * Returns { folderName, collision } for audit trail.
 */
export async function getOrgFolderName(
  adapter: IConnectorStorageAdapter,
  connectionId: string,
  parentFolderId: string,
  orgName: string,
  orgSlug: string
): Promise<{ folderName: string; collision: boolean }> {
  try {
    const children = await adapter.listFolderChildren(connectionId, parentFolderId)
    const colliding = children.find((f) => f.name === orgName)

    if (!colliding) {
      return { folderName: orgName, collision: false }
    }

    // If the colliding folder is firma-managed, reuse the name — findOrCreateFolder will pick it up.
    // This handles Remove → re-add with the same workspace folder (firm.firmFolderId was nulled but Drive folder still exists).
    const isFirmaManaged = (colliding as any).appProperties?.firma_managed === 'true'
    if (isFirmaManaged) {
      logger.warn(`Folder name collision: '${orgName}' is firma-managed — reusing existing folder`, 'PockettStructure', { parentFolderId, connectionId, folderId: colliding.id })
      return { folderName: orgName, collision: false }
    }

    logger.warn(`Folder name collision detected: '${orgName}' already exists (not firma-managed). Using slug: '${orgSlug}'`, 'PockettStructure', { parentFolderId, connectionId })
    return { folderName: orgSlug, collision: true }
  } catch (e) {
    logger.error(`Error checking folder collision: ${e instanceof Error ? e.message : String(e)}`, e instanceof Error ? e : new Error(String(e)))
    // On error, default to name (safer than forcing slug)
    return { folderName: orgName, collision: false }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DetectResult {
  detected: boolean
  importRootFolderId?: string
}

/**
 * Detect if the selected folder already contains a Pockett structure.
 */
export async function detectExistingStructure(
  connectionId: string,
  parentFolderId: string,
  adapter: IConnectorStorageAdapter
): Promise<DetectResult> {
  const children = await adapter.listFolderChildren(connectionId, parentFolderId)
  const dotPockett = children.find((f) => f.name === METADATA_FOLDER_NAME)
  if (!dotPockett) return { detected: false }

  const meta = await readMetaFromFolder(adapter, connectionId, parentFolderId)
  if (!meta) return { detected: false }

  if (meta.type === 'root') {
    return { detected: true, importRootFolderId: parentFolderId }
  }
  if (meta.type === 'organization') {
    const parentId = await adapter.getFileParent(connectionId, parentFolderId)
    if (parentId) return { detected: true, importRootFolderId: parentId }
  }

  const otherFolders = children.filter((f) => f.name !== METADATA_FOLDER_NAME)
  const childMetas = await Promise.all(
    otherFolders.map((folder) => readMetaFromFolder(adapter, connectionId, folder.id))
  )
  if (childMetas.some((m) => m?.type === 'organization')) {
    return { detected: true, importRootFolderId: parentFolderId }
  }
  return { detected: false }
}

/** Child folder under workspace root whose `.meta/meta.json` marks a sandbox firm (`type: firm` or sandbox `organization`). */
export interface SandboxFirmUnderWorkspaceRoot {
  folderId: string
  meta: Record<string, unknown>
  slug: string
}

function isSandboxFirmMeta(meta: Record<string, unknown> | null): meta is Record<string, unknown> & { slug: string } {
  if (!meta || meta.sandboxOnly !== true) return false
  const slug = meta.slug
  if (typeof slug !== 'string' || !slug.length) return false
  if (meta.type === 'firm') return true
  if (meta.type === 'organization') return true
  return false
}

/**
 * One sandbox per workspace root: find a direct child folder whose meta is a sandbox firm.
 * If several exist, uses the first in lexicographic folder name order and logs a warning.
 */
export async function findSandboxFirmUnderWorkspaceRoot(
  adapter: IConnectorStorageAdapter,
  connectionId: string,
  driveRootFolderId: string
): Promise<SandboxFirmUnderWorkspaceRoot | null> {
  const children = await adapter.listFolderChildren(connectionId, driveRootFolderId)
  const folders = children
    .filter((f) => f.name !== METADATA_FOLDER_NAME && !f.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))

  const candidates: SandboxFirmUnderWorkspaceRoot[] = []
  for (const folder of folders) {
    const meta = await readMetaFromFolder(adapter, connectionId, folder.id)
    if (isSandboxFirmMeta(meta)) {
      candidates.push({ folderId: folder.id, meta, slug: meta.slug })
    }
  }
  if (candidates.length === 0) return null
  if (candidates.length > 1) {
    logger.warn('Multiple sandbox firm folders under workspace root; using first (sorted by folder name)', {
      connectionId,
      driveRootFolderId,
      slugs: candidates.map((c) => c.slug),
    })
  }
  return candidates[0]
}

export interface SetupOrgFolderResult {
  rootId: string
  orgId: string
}

/**
 * CLEAN onboarding: create root .pockett (meta root) and firm folder with .pockett (meta firm).
 * Uses slug-based naming if firm name collides with existing folder.
 */
export async function setupFirmFolder(
  connectionId: string,
  parentFolderId: string,
  adapter: IConnectorStorageAdapter,
  firmId: string,
  options?: { userId?: string }
): Promise<SetupOrgFolderResult> {
  const connector = await prisma.connector.findUnique({
    where: { id: connectionId }
  })
  if (!connector) throw new Error('Connection not found')

  const firm = await (prisma as any).firm.findUnique({
    where: { id: firmId }
  })
  if (!firm) throw new Error(`Firm ${firmId} not found`)

  const metadataFolderId = await adapter.findOrCreateFolder(connectionId, parentFolderId, METADATA_FOLDER_NAME)
  await writeMetaInFolder(adapter, connectionId, parentFolderId, { type: 'root', version: 1 })
  await restrictIfSupported(adapter, connectionId, metadataFolderId, 'Restricted .pockett folder to owner-only')

  // Check for folder name collision and use slug as fallback
  const { folderName, collision } = await getOrgFolderName(
    adapter,
    connectionId,
    parentFolderId,
    firm.name,
    firm.slug
  )

  const orgFolderId = await adapter.findOrCreateFolder(connectionId, parentFolderId, folderName)
  const isDefault = options?.userId
    ? !!(await (prisma as any).firmMember.findFirst({
      where: { firmId: firm.id, userId: options.userId },
    }))?.isDefault
    : false

  // Update the Firm record immediately with the newly created folder ID
  await (prisma as any).firm.update({
    where: { id: firm.id },
    data: { firmFolderId: orgFolderId }
  })

  // Store both original name and actual folder name for audit trail
  await writeMetaInFolder(adapter, connectionId, orgFolderId, {
    type: 'firm',
    slug: firm.slug,
    originalName: firm.name,
    folderName: folderName,
    collision: collision,
    isDefault,
    sandboxOnly: (firm as any).sandboxOnly === true
  })
  await restrictIfSupported(adapter, connectionId, orgFolderId, 'Restricted firm folder to owner-only')

  const settings = (connector.settings as any) || {}
  const organizations = settings.organizations || {}

  await prisma.connector.update({
    where: { id: connectionId },
    data: {
      settings: {
        ...settings,
        // Workspace root is the folder that contains `.meta` / org folders — not the `.meta` folder itself.
        rootFolderId: parentFolderId,
        parentFolderId,
        // Flat orgFolderId so getProjectFolderIds can resolve client/project folders
        // without needing a project to be created first (fixes Files tab for fresh custom orgs)
        orgFolderId,
        organizations: {
          ...organizations,
          [firm.id]: {
            ...(organizations[firm.id] || {}),
            orgFolderId
          }
        }
      }
    }
  })

  return { rootId: parentFolderId, orgId: orgFolderId }
}

/** @deprecated Legacy alias (Org → Firm rename) */
export async function setupOrgFolder(
  connectionId: string,
  parentFolderId: string,
  adapter: IConnectorStorageAdapter,
  organizationId: string,
  options?: { userId?: string }
): Promise<SetupOrgFolderResult> {
  return setupFirmFolder(connectionId, parentFolderId, adapter, organizationId, options)
}

export type OnCreateConnectorForOrg = (orgId: string) => Promise<void>

export interface ImportStructureResult {
  rootId: string
  orgId: string
  slug: string
}

/**
 * IMPORT: Scan folder structure, create missing orgs/clients/projects in DB, update connector settings.
 * Caller must create connector records for newly created orgs via onCreateConnectorForOrg(orgId).
 */
export async function importStructureFromDrive(
  connectionId: string,
  parentFolderId: string,
  userId: string,
  stepOneOrgSlug: string | null,
  connectorType: ConnectorType,
  adapter: IConnectorStorageAdapter,
  onCreateConnectorForOrg: OnCreateConnectorForOrg
): Promise<ImportStructureResult> {
  const connector = await prisma.connector.findUnique({
    where: { id: connectionId }
  })
  if (!connector) throw new Error('Connection not found')

  const children = await adapter.listFolderChildren(connectionId, parentFolderId)
  const dotPockett = children.find((f) => f.name === METADATA_FOLDER_NAME)
  if (!dotPockett) throw new Error('No .pockett folder found')
  const rootFolderId = dotPockett.id
  const orgFolders = children.filter((f) => f.name !== METADATA_FOLDER_NAME)
  let firstOrgSlug: string | null = null
  let stepOneOrgFolderId: string | null = null
  /** When we update step-one org slug to Drive meta, return this so redirect uses the new URL */
  let effectiveStepOneSlug: string | null = null

  const orgAdminPersona = await (prisma as any).persona.findUnique({ where: { slug: 'firm_admin' } })
  if (!orgAdminPersona) throw new Error('System Error: firm_admin persona not found')

  let stepOneOrg: { id: string; name: string; slug: string } | null = null
  if (stepOneOrgSlug) {
    stepOneOrg = await prisma.firm.findUnique({
      where: { slug: stepOneOrgSlug },
      select: { id: true, name: true, slug: true }
    })
  }

  for (const orgFolder of orgFolders) {
    const orgChildren = await adapter.listFolderChildren(connectionId, orgFolder.id)
    const orgDotPockett = orgChildren.find((f) => f.name === METADATA_FOLDER_NAME)
    if (!orgDotPockett) continue
    const orgMeta = await readMetaFromFolder(adapter, connectionId, orgFolder.id)
    if (!orgMeta || orgMeta.type !== 'organization' || typeof orgMeta.slug !== 'string') continue

    // Skip sandbox orgs from the import lists (UX Polish)
    if (orgMeta.sandboxOnly === true) continue

    const slug = orgMeta.slug as string
    const isDefault = orgMeta.isDefault === true

    // Check for folder name collision (log for audit trail)
    const { collision } = await getOrgFolderName(
      adapter,
      connectionId,
      parentFolderId,
      orgFolder.name,
      slug
    )
    let org = await prisma.firm.findUnique({ where: { slug } })
    let conn: { id: string; settings: unknown } | null = null

    if (org) {
      // Get the connector that's assigned to this organization
      if (org.connectorId) {
        conn = await prisma.connector.findFirst({
          where: { id: org.connectorId, type: connectorType }
        })
      }
    } else if (stepOneOrg && stepOneOrg.name === orgFolder.name) {
      const stepOneOrgRecord = await prisma.firm.findUnique({ where: { id: stepOneOrg.id } })
      if (!stepOneOrgRecord) continue
      org = stepOneOrgRecord
      conn = await prisma.connector.findFirst({
        where: { id: connectionId }
      })
      stepOneOrgFolderId = orgFolder.id
      // Reimport: reuse firm slug from Drive meta so URLs like /d/f/pockett-1mpm/... resolve
      if (slug !== org.slug) {
        const taken = await prisma.firm.findUnique({ where: { slug }, select: { id: true } })
        if (!taken) {
          await prisma.firm.update({ where: { id: org.id }, data: { slug } })
          org = { ...org, slug }
          effectiveStepOneSlug = slug
        }
      } else {
        effectiveStepOneSlug = slug
      }
    } else {
      try {
        org = await prisma.firm.create({
          data: {
            name: orgFolder.name,
            slug,
            settings: {}
          }
        })
      } catch (e: unknown) {
        const err = e as { code?: string }
        if (err?.code === 'P2002') org = await prisma.firm.findUnique({ where: { slug } })
        else throw e
      }
      if (!org) throw new Error('Failed to create or find organization')

      // Update organization folder ID column (Parity)
      await prisma.firm.update({
        where: { id: org.id },
        data: { firmFolderId: orgFolder.id }
      })

      await (prisma as any).firmMember.create({
        data: {
          userId,
          firmId: org.id,
          role: 'firm_admin',
          membershipType: 'internal',
          isDefault
        }
      })
      await onCreateConnectorForOrg(org.id)
      // After creating a connector for the org, find it
      const updatedOrg = await prisma.firm.findUnique({ where: { id: org.id } })
      if (updatedOrg?.connectorId) {
        conn = await prisma.connector.findFirst({
          where: { id: updatedOrg.connectorId, type: connectorType }
        })
      }
      if (!firstOrgSlug) firstOrgSlug = org.slug
    }

    if (org && org.slug === stepOneOrgSlug) stepOneOrgFolderId = orgFolder.id

    const settings: Record<string, unknown> = {
      rootFolderId,
      orgFolderId: orgFolder.id,
      parentFolderId
    }
    const clientFolderIds: Record<string, string> = {}
    const projectFolderIds: Record<string, string> = {}
    const projectFolderSettings: Record<string, { generalFolderId?: string }> = {}
    const clientChildren = await adapter.listFolderChildren(connectionId, orgFolder.id)
    for (const clientFolder of clientChildren.filter((f) => f.name !== METADATA_FOLDER_NAME)) {
      const clientMeta = await readMetaFromFolder(adapter, connectionId, clientFolder.id)
      if (!clientMeta || clientMeta.type !== 'client' || typeof clientMeta.slug !== 'string') continue
      const clientSlug = clientMeta.slug as string
      let client = await prisma.client.findFirst({
        where: { firmId: org!.id, slug: clientSlug }
      })
      if (!client) {
        const { generateClientSlug } = await import('@/lib/slug-utils')
        // Reimport: prefer existing slug from Drive meta so DB matches structure
        let cSlug = clientSlug
        let attempts = 0
        while (attempts < 10) {
          const exists = await prisma.client.findUnique({
            where: { firmId_slug: { firmId: org!.id, slug: cSlug } }
          })
          if (!exists) break
          cSlug = generateClientSlug(clientFolder.name)
          attempts++
        }
        client = await prisma.client.create({
          data: { firmId: org!.id, name: clientFolder.name, slug: cSlug, driveFolderId: clientFolder.id }
        })
        // Create ClientMember for the importing user so they can see this client
        const engAdminPersona = await (prisma as any).persona.findUnique({ where: { slug: 'eng_admin' } })
        if (engAdminPersona) {
          await (prisma as any).clientMember.create({
            data: { clientId: client.id, userId, personaId: engAdminPersona.id }
          })
          const firmAdminMember = await prisma.firmMember.findFirst({
            where: { firmId: org!.id, role: 'firm_admin' }
          })
          if (firmAdminMember && firmAdminMember.userId !== userId) {
            await (prisma as any).clientMember.create({
              data: { clientId: client.id, userId: firmAdminMember.userId, personaId: engAdminPersona.id }
            })
          }
        }
      } else if (client && (client.driveFolderId !== clientFolder.id)) {
        // Sync column if missing or mismatched
        await prisma.client.update({
          where: { id: client.id },
          data: { driveFolderId: clientFolder.id }
        })
      }
      clientFolderIds[client.slug] = clientFolder.id
      const projectChildren = await adapter.listFolderChildren(connectionId, clientFolder.id)
      for (const projectFolder of projectChildren.filter((f) => f.name !== METADATA_FOLDER_NAME)) {
        const projectMeta = await readMetaFromFolder(adapter, connectionId, projectFolder.id)
        const projectSlugFromMeta = projectMeta?.type === 'project' && typeof projectMeta.slug === 'string' ? (projectMeta.slug as string) : null
        let project = projectSlugFromMeta
          ? await prisma.engagement.findFirst({ where: { clientId: client!.id, slug: projectSlugFromMeta } })
          : null
        if (!project) {
          project = await prisma.engagement.findFirst({ where: { clientId: client!.id, name: projectFolder.name } })
        }
        if (!project && projectSlugFromMeta) {
          const { ensureProjectPersonasForProject } = await import('@/lib/actions/personas')
          const { generateProjectSlug } = await import('@/lib/slug-utils')
          // Reimport: prefer existing slug from Drive meta so DB matches structure
          let pSlug = projectSlugFromMeta
          let attempts = 0
          while (attempts < 10) {
            const exists = await prisma.engagement.findUnique({
              where: { clientId_slug: { clientId: client!.id, slug: pSlug } }
            })
            if (!exists) break
            pSlug = generateProjectSlug(projectFolder.name)
            attempts++
          }
          project = await prisma.engagement.create({
            data: {
              firmId: org!.id,
              clientId: client!.id,
              name: projectFolder.name,
              slug: pSlug,
              connectorRootFolderId: projectFolder.id // Sync column (Parity)
            }
          })
          await ensureProjectPersonasForProject(project.id)
          await (prisma as any).engagementMember.create({
            data: { engagementId: project.id, userId, role: 'eng_admin' }
          })
          const firmAdmin = await prisma.firmMember.findFirst({
            where: { firmId: org!.id, role: 'firm_admin' }
          })
          if (firmAdmin && firmAdmin.userId !== userId) {
            await prisma.engagementMember.create({
              data: { engagementId: project.id, userId: firmAdmin.userId, role: 'eng_admin' }
            })
          }
        } else if (project && (project.connectorRootFolderId !== projectFolder.id)) {
          // Sync column if missing or mismatched
          await prisma.engagement.update({
            where: { id: project.id },
            data: { connectorRootFolderId: projectFolder.id }
          })
        }
        if (!project) continue
        projectFolderIds[project.slug] = projectFolder.id
        const docChildren = await adapter.listFolderChildren(connectionId, projectFolder.id)
        let generalId: string | undefined
        let confidentialId: string | undefined
        let stagingId: string | undefined
        for (const doc of docChildren.filter((f) => f.name !== METADATA_FOLDER_NAME)) {
          const docMeta = await readMetaFromFolder(adapter, connectionId, doc.id)
          const nameLower = doc.name.toLowerCase()
          if (docMeta?.type === 'document' && docMeta.folderType) {
            if (docMeta.folderType === 'general') generalId = doc.id
            else if (docMeta.folderType === 'confidential') confidentialId = doc.id
            else if (docMeta.folderType === 'staging') stagingId = doc.id
          } else if (!generalId && nameLower === 'general') {
            generalId = doc.id
          } else if (!confidentialId && nameLower === 'confidential') {
            confidentialId = doc.id
          } else if (!stagingId && nameLower === 'staging') {
            stagingId = doc.id
          }
        }
        projectFolderSettings[project!.slug] = { generalFolderId: generalId }
      }
    }
    settings.clientFolderIds = clientFolderIds
    settings.projectFolderIds = projectFolderIds
    settings.projectFolderSettings = projectFolderSettings
    if (conn) {
      await prisma.connector.update({
        where: { id: conn.id },
        data: { settings: { ...((conn.settings as object) || {}), ...settings } }
      })
    }
  }

  if (stepOneOrgSlug && stepOneOrgFolderId) {
    await prisma.connector.update({
      where: { id: connectionId },
      data: {
        settings: {
          ...((connector.settings as object) || {}),
          rootFolderId,
          orgFolderId: stepOneOrgFolderId,
          parentFolderId
        }
      }
    })
  }

  const slug = effectiveStepOneSlug ?? stepOneOrgSlug ?? firstOrgSlug ?? ''
  const orgId = stepOneOrgFolderId ?? orgFolders[0]?.id ?? rootFolderId
  return { rootId: rootFolderId, orgId, slug }
}

export interface ProjectFolderStructure {
  rootId: string
  orgId: string
  clientId: string
  projectId?: string
  generalFolderId?: string
}

/**
 * Ensure client (and optionally project + document folders) exist under the org folder; update connector settings and connectorLinkedFile.
 */
export async function ensureAppFolderStructure(
  connectorId: string,
  clientName: string,
  clientSlug: string,
  adapter: IConnectorStorageAdapter,
  organizationId: string,
  projectInfo?: { projectName: string; projectSlug: string }
): Promise<ProjectFolderStructure> {
  const connector = await prisma.connector.findUnique({
    where: { id: connectorId }
  })
  if (!connector) throw new Error('Connector not found')

  const org = await prisma.firm.findUnique({
    where: { id: organizationId }
  })
  if (!org) throw new Error(`Organization ${organizationId} not found`)

  const settings = (connector.settings as any) || {}
  const orgSettings = settings.organizations?.[org.id] || {}
  let rootFolderId = settings.rootFolderId as string | undefined
  let orgFolderId = (org as any).firmFolderId || orgSettings.orgFolderId
  let clientFolderId = orgSettings.clientFolderIds?.[clientSlug]
  const projectName = projectInfo?.projectName
  const projectSlug = projectInfo?.projectSlug
  let projectFolderId = projectSlug ? orgSettings.projectFolderIds?.[projectSlug] : undefined

  if (!rootFolderId || !orgFolderId) {
    if ((org as any)?.firmFolderId) {
      orgFolderId = (org as any).firmFolderId
      logger.info('Recovered orgFolderId from database fallback', { orgFolderId, organizationId: org.id })
    } else {
      throw new Error('Organization folder not configured; complete Drive setup first.')
    }
  }

  const projectFolderSettings = orgSettings.projectFolderSettings || {}

  if (!clientFolderId && clientName) {
    clientFolderId = await adapter.findOrCreateFolder(connectorId, orgFolderId, clientName)
    await writeMetaInFolder(adapter, connectorId, clientFolderId, { type: 'client', slug: clientSlug })
    await restrictIfSupported(adapter, connectorId, clientFolderId, 'Restricted client folder to owner-only')
  } else if (clientFolderId) {
    const exists = await adapter.fileExists(connectorId, clientFolderId)
    if (!exists) {
      clientFolderId = await adapter.findOrCreateFolder(connectorId, orgFolderId, clientName)
      await writeMetaInFolder(adapter, connectorId, clientFolderId, { type: 'client', slug: clientSlug })
      await restrictIfSupported(adapter, connectorId, clientFolderId, 'Restricted client folder to owner-only')
    } else {
      await restrictIfSupported(adapter, connectorId, clientFolderId, 'Restricted client folder to owner-only')
    }
  }

  // Update Client record with driveFolderId if we have a match
  if (org && clientFolderId) {
    const client = await prisma.client.findUnique({
      where: { firmId_slug: { firmId: org.id, slug: clientSlug } }
    })
    if (client) {
      await prisma.client.update({
        where: { id: client.id },
        data: {
          driveFolderId: clientFolderId,
          settings: {
            ...(client.settings as any || {}),
            driveFolderId: clientFolderId
          }
        }
      })
    }
  }

  let generalFolderId: string | undefined
  let projectSubfolders: { generalFolderId?: string } | undefined

  if (projectName && projectSlug && clientFolderId) {
    if (!projectFolderId) {
      projectFolderId = await adapter.findOrCreateFolder(connectorId, clientFolderId, projectName)
      await writeMetaInFolder(adapter, connectorId, projectFolderId, { type: 'project', slug: projectSlug })
      await restrictIfSupported(adapter, connectorId, projectFolderId, 'Restricted project folder to owner-only')
    } else {
      const exists = await adapter.fileExists(connectorId, projectFolderId)
      if (!exists) {
        projectFolderId = await adapter.findOrCreateFolder(connectorId, clientFolderId, projectName)
        await writeMetaInFolder(adapter, connectorId, projectFolderId, { type: 'project', slug: projectSlug })
        await restrictIfSupported(adapter, connectorId, projectFolderId, 'Restricted project folder to owner-only')
      } else {
        await restrictIfSupported(adapter, connectorId, projectFolderId, 'Restricted project folder to owner-only')
      }
    }

    // Update Engagement record with connectorRootFolderId
    if (org && projectFolderId) {
      const clientRow = await prisma.client.findUnique({
        where: { firmId_slug: { firmId: org.id, slug: clientSlug } },
        select: { id: true }
      })
      if (clientRow) {
        const engagement = await prisma.engagement.findUnique({
          where: { clientId_slug: { clientId: clientRow.id, slug: projectSlug } }
        })
        if (engagement) {
          await prisma.engagement.update({
            where: { id: engagement.id },
            data: { connectorRootFolderId: projectFolderId }
          })
        }
      }
    }

    if (projectFolderId && projectSlug) {
      const currentProjectSettings = projectFolderSettings[projectSlug] || {}
      generalFolderId = currentProjectSettings.generalFolderId

      const ensureDocumentFolder = async (
        config: typeof FOLDERS[keyof typeof FOLDERS],
        currentId: string | undefined
      ): Promise<string> => {
        let id = currentId
        const name = config.name
        const folderType = config.type

        if (!id) {
          id = await adapter.findOrCreateFolder(connectorId, projectFolderId!, name)
          await writeMetaInFolder(adapter, connectorId, id, { type: 'document', folderType })
          if (folderType !== 'general') {
            await restrictIfSupported(adapter, connectorId, id, `Created ${name} folder`)
          } else {
            logger.info(`Created ${name} folder`, 'PockettStructure', { id, projectFolderId, connectorId })
          }
        } else {
          const exists = await adapter.fileExists(connectorId, id)
          if (!exists) {
            id = await adapter.findOrCreateFolder(connectorId, projectFolderId!, name)
            await writeMetaInFolder(adapter, connectorId, id, { type: 'document', folderType })
            if (folderType !== 'general') await restrictIfSupported(adapter, connectorId, id, `Created ${name} folder`)
            else logger.info(`Created ${name} folder`, 'PockettStructure', { id, projectFolderId, connectorId })
          } else if (folderType !== 'general') {
            await restrictIfSupported(adapter, connectorId, id, `Restricted ${name} folder`)
          }
        }
        return id
      }

      generalFolderId = await ensureDocumentFolder(FOLDERS.GENERAL, generalFolderId)

      projectSubfolders = { generalFolderId }
    }
  }

  // Update connector settings registry with isolated org settings
  const updatedSettings = (connector.settings as any) || {}
  const updatedOrgs = updatedSettings.organizations || {}

  const currentOrgSettings = {
    ...orgSettings,
    orgFolderId,
    clientFolderIds: {
      ...(orgSettings.clientFolderIds || {}),
      [clientSlug]: clientFolderId
    },
    projectFolderIds: projectInfo ? {
      ...(orgSettings.projectFolderIds || {}),
      [projectInfo.projectSlug]: projectFolderId
    } : (orgSettings.projectFolderIds || {}),
    projectFolderSettings: projectInfo && projectSubfolders ? {
      ...(orgSettings.projectFolderSettings || {}),
      [projectInfo.projectSlug]: projectSubfolders
    } : (orgSettings.projectFolderSettings || {})
  }

  await prisma.connector.update({
    where: { id: connectorId },
    data: {
      settings: {
        ...updatedSettings,
        organizations: {
          ...updatedOrgs,
          [org.id]: currentOrgSettings
        }
      }
    }
  })

  return { rootId: rootFolderId || '', orgId: orgFolderId, clientId: clientFolderId!, projectId: projectFolderId, generalFolderId }
}

// ---------------------------------------------------------------------------
// Sandbox: parallel Drive creation (single connector update)
// ---------------------------------------------------------------------------

export interface SandboxDriveClient {
  clientId: string
  clientSlug: string
  clientName: string
  projects: Array<{ projectId: string; projectSlug: string; projectName: string }>
}

export interface SandboxDriveStructureResult {
  clientFolderIds: Record<string, string>
  projectFolderIds: Record<string, string>
  projectFolderSettings: Record<string, { generalFolderId: string }>
}

/**
 * Create all sandbox client and project folders on Drive in parallel waves.
 * Does not update connector or Client/Project records; caller does one connector.update and bulk DB updates.
 */
export async function createSandboxDriveStructure(
  connectorId: string,
  adapter: IConnectorStorageAdapter,
  orgFolderId: string,
  clients: SandboxDriveClient[]
): Promise<SandboxDriveStructureResult> {
  // Wave 1: create all client folders in parallel
  const clientResults = await Promise.all(
    clients.map(async (c) => {
      const clientFolderId = await adapter.findOrCreateFolder(connectorId, orgFolderId, c.clientName)
      await writeMetaInFolder(adapter, connectorId, clientFolderId, { type: 'client', slug: c.clientSlug })
      await restrictIfSupported(adapter, connectorId, clientFolderId, 'Restricted client folder to owner-only')
      return { clientSlug: c.clientSlug, clientFolderId }
    })
  )
  const clientFolderIds: Record<string, string> = Object.fromEntries(clientResults.map((r) => [r.clientSlug, r.clientFolderId]))

  // Flat list of projects with their clientFolderId for wave 2
  const flatProjects: Array<{
    projectId: string
    projectSlug: string
    projectName: string
    clientFolderId: string
  }> = []
  for (const c of clients) {
    const clientFolderId = clientFolderIds[c.clientSlug]
    if (!clientFolderId) continue
    for (const p of c.projects) {
      flatProjects.push({
        projectId: p.projectId,
        projectSlug: p.projectSlug,
        projectName: p.projectName,
        clientFolderId,
      })
    }
  }

  // Wave 2: create all project folders + General/Staging/Confidential in parallel (one task per project)
  const projectResults = await Promise.all(
    flatProjects.map(async (p) => {
      const projectFolderId = await adapter.findOrCreateFolder(connectorId, p.clientFolderId, p.projectName)
      await writeMetaInFolder(adapter, connectorId, projectFolderId, { type: 'project', slug: p.projectSlug })
      await restrictIfSupported(adapter, connectorId, projectFolderId, 'Restricted project folder to owner-only')

      const ensureDocFolder = async (
        config: typeof FOLDERS[keyof typeof FOLDERS]
      ): Promise<string> => {
        const id = await adapter.findOrCreateFolder(connectorId, projectFolderId, config.name)
        await writeMetaInFolder(adapter, connectorId, id, { type: 'document', folderType: config.type })
        if (config.type !== 'general') {
          await restrictIfSupported(adapter, connectorId, id, `Created ${config.name} folder`)
        }
        return id
      }
      const generalFolderId = await ensureDocFolder(FOLDERS.GENERAL)
      return {
        projectSlug: p.projectSlug,
        projectFolderId,
        generalFolderId,
      }
    })
  )

  const projectFolderIds: Record<string, string> = Object.fromEntries(
    projectResults.map((r) => [r.projectSlug, r.projectFolderId])
  )
  const projectFolderSettings: Record<string, { generalFolderId: string }> = {}
  for (const r of projectResults) {
    projectFolderSettings[r.projectSlug] = {
      generalFolderId: r.generalFolderId,
    }
  }

  return { clientFolderIds, projectFolderIds, projectFolderSettings }
}
