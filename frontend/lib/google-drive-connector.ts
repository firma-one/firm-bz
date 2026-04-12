import { prisma, basePrisma } from './prisma'
import { Connector, ConnectorStatus, ConnectorType, WorkspaceRootLocation } from '@prisma/client'
import { ignoreParser } from './ignore-parser'
import { needsReEncryption, decrypt } from './encryption'
import { createGoogleDriveAdapter } from '@/lib/connectors/adapters/google-drive-adapter'
import * as pockettStructure from '@/lib/connectors/pockett-structure.service'
import { type IConnectorStorageAdapter } from '@/lib/connectors/types'
import { getGoogleDriveOAuthServerCredentials } from '@/lib/config'
import { SUGGESTED_WORKSPACE_FOLDER_NAME } from './suggested-workspace-folder-name'
import { logger } from '@/lib/logger'

/** Max chars of Drive API error body included in structured migrate logs. */
const DRIVE_MIGRATE_LOG_BODY_MAX_CHARS = 8192
/** Max child folder/file ids listed in migrate start log (remainder in count only). */
const DRIVE_MIGRATE_CHILD_IDS_LOG_MAX = 40

/** Parse Drive API JSON error response for structured logging. */
function parseDriveApiErrorBodyForLog(rawText: string): { googleMessage?: string; googleReasons: string[] } {
  const googleReasons: string[] = []
  let googleMessage: string | undefined
  try {
    const j = JSON.parse(rawText) as {
      error?: {
        message?: string
        errors?: { reason?: string; message?: string; domain?: string }[]
      }
    }
    const e = j.error
    googleMessage = e?.message
    for (const err of e?.errors || []) {
      if (err.reason) googleReasons.push(err.reason)
      if (err.message && err.message !== googleMessage) googleReasons.push(err.message)
      if (err.domain) googleReasons.push(`domain:${err.domain}`)
    }
  } catch {
    /* non-JSON body */
  }
  return { googleMessage, googleReasons }
}

async function fetchDriveFileMetadataForMigrateLog(
  accessToken: string,
  fileId: string
): Promise<Record<string, unknown>> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`)
  url.searchParams.set(
    'fields',
    'id,name,mimeType,driveId,parents,ownedByMe,shortcutDetails',
  )
  url.searchParams.set('supportsAllDrives', 'true')
  try {
    const metaRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!metaRes.ok) {
      return { metadataFetchHttpStatus: metaRes.status }
    }
    return (await metaRes.json()) as Record<string, unknown>
  } catch {
    return { metadataFetchFailed: true }
  }
}

/** Thrown when Drive token refresh fails; API routes map this to 401/503. */
export class GoogleDriveAuthError extends Error {
  readonly reconnectRequired: boolean
  readonly oauthMisconfigured: boolean
  constructor(
    message: string,
    opts?: { reconnectRequired?: boolean; oauthMisconfigured?: boolean }
  ) {
    super(message)
    this.name = 'GoogleDriveAuthError'
    this.reconnectRequired = !!opts?.reconnectRequired
    this.oauthMisconfigured = !!opts?.oauthMisconfigured
  }
}

/** @deprecated Use SUGGESTED_WORKSPACE_FOLDER_NAME from @/lib/suggested-workspace-folder-name */
export const DEFAULT_WORKSPACE_FOLDER_NAME = SUGGESTED_WORKSPACE_FOLDER_NAME

/** Google Drive folder color closest to Pockett logo purple (#A961EE). Must be from Drive's allowed palette (e.g. Toy eggplant). */
const DEFAULT_WORKSPACE_FOLDER_COLOR_RGB = '#a47ae2'

// Type for connector with decrypted virtual fields from Prisma extension
type ConnectorWithDecrypted = Connector & {
  accessTokenDecrypted: string
  refreshTokenDecrypted: string | null
}

export interface GoogleDriveConnection {
  id: string
  type?: ConnectorType
  email: string
  name: string
  connectedAt: string
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ERROR'
  lastSyncAt?: string
}

export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  createdTime?: string
  lastModifyingUser?: {
    displayName: string
    photoLink?: string
  }
  size?: string | number
  webViewLink?: string
  thumbnailLink?: string
  iconLink?: string
  owners?: {
    displayName: string
    photoLink?: string
    emailAddress?: string
  }[]
  parents?: string[]
  permissions?: Array<{
    id: string
    type: string
    role: string
    emailAddress?: string
  }>
  viewedByMeTime?: string
  sharedTime?: string
  activityCount?: number
  badges?: {
    type: 'risk' | 'attention' | 'cleanup' | 'sensitive' | 'stale'
    text: string
  }[]
  appProperties?: Record<string, string>
  metadata?: any
  /** Present when the file lives in a shared drive (Drive API `driveId`). */
  driveId?: string | null
}

export class GoogleDriveConnector {
  private static instance: GoogleDriveConnector

  static getInstance(): GoogleDriveConnector {
    if (!GoogleDriveConnector.instance) {
      GoogleDriveConnector.instance = new GoogleDriveConnector()
    }
    return GoogleDriveConnector.instance
  }

  /**
   * Public exposure for structural services
   */
  async createGoogleDriveAdapter(connectionId: string): Promise<IConnectorStorageAdapter> {
    return this.createStorageAdapter(connectionId)
  }

  // ============================================================================
  // Token Helpers (Encryption handled by Prisma Extension)
  // ============================================================================

  /**
   * Get decrypted access token from connector record.
   * Uses Prisma extension's virtual field `accessTokenDecrypted`.
   */
  private getAccessTokenFromConnector(connector: Connector): string {
    // With the new Prisma extension, the field itself is already decrypted
    return connector.accessToken
  }

  /**
   * Get decrypted refresh token from connector record.
   * Uses Prisma extension's virtual field `refreshTokenDecrypted`.
   */
  private getRefreshTokenFromConnector(connector: Connector): string | null {
    // With the new Prisma extension, the field itself is already decrypted
    return connector.refreshToken
  }

  /**
  * Check if connector tokens need re-encryption and update if needed.
  * Implements lazy re-encryption on access (for key rotation).
  * Note: We still need to check raw ciphertext for version, but decrypt happens via extension.
  */
  private async maybeReEncryptTokens(connector: Connector): Promise<void> {
    // We need to fetch the RAW encrypted values to check versioning.
    // The main 'prisma' client has an extension that decrypts in-place.
    // We use a raw query or a non-extended client if available.
    // For now, let's assume we need to know the raw values.

    // FETCH RAW encrypted values to check versioning.
    const rawConnector = await basePrisma.connector.findUnique({ where: { id: connector.id } })
    if (!rawConnector) return

    const accessTokenNeedsReEncrypt = needsReEncryption(rawConnector.accessToken)
    const refreshTokenNeedsReEncrypt = rawConnector.refreshToken && needsReEncryption(rawConnector.refreshToken)

    if (!accessTokenNeedsReEncrypt && !refreshTokenNeedsReEncrypt) {
      return
    }

    logger.info('Re-encrypting tokens with new key version', { connectorId: connector.id })

    const updateData: { accessToken?: string; refreshToken?: string } = {}

    if (accessTokenNeedsReEncrypt) {
      // Decrypt with old key, Prisma extension will encrypt with current key on WRITE
      updateData.accessToken = decrypt(rawConnector.accessToken)
    }

    if (refreshTokenNeedsReEncrypt && rawConnector.refreshToken) {
      updateData.refreshToken = decrypt(rawConnector.refreshToken)
    }

    if (Object.keys(updateData).length > 0) {
      await (prisma as any).connector.update({
        where: { id: connector.id },
        data: updateData
      })
    }
  }

  // ============================================================================
  // Connection Methods
  // ============================================================================

  async initiateConnection(userId?: string): Promise<{ authUrl: string; state: string }> {
    const response = await fetch('/api/connectors/google-drive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'initiate', userId }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to initiate Google Drive connection')
    }

    return response.json()
  }

  async testConnection(connectionId: string): Promise<any> {
    const connector = await (prisma as any).connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')

    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    // 1. Fetch User Info & Quota
    const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!aboutRes.ok) throw new Error('Failed to fetch user info')
    const aboutData = await aboutRes.json()

    // 2. Fetch Recent Files (Validation)
    const filesRes = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=5&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,size)', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!filesRes.ok) throw new Error('Failed to fetch files')
    const filesData = await filesRes.json()

    return {
      userInfo: {
        email: aboutData.user.emailAddress,
        name: aboutData.user.displayName,
        quotaBytesUsed: aboutData.storageQuota?.usage || '0',
        quotaBytesTotal: aboutData.storageQuota?.limit || '0'
      },
      files: filesData.files || [],
      totalFiles: filesData.files?.length || 0 // This is just recent count, real total requires active scanning which is expensive
    }
  }

  async getConnections(organizationId: string): Promise<GoogleDriveConnection[]> {
    const org = await prisma.firm.findUnique({
      where: { id: organizationId },
      select: { connectorId: true }
    })

    if (!org?.connectorId) {
      return []
    }

    const connectors = await (prisma as any).connector.findMany({
      where: {
        id: org.connectorId,
        type: 'GOOGLE_DRIVE'
      },
      select: {
        id: true,
        name: true,
        externalAccountId: true,
        settings: true,
        createdAt: true,
        status: true,
        lastSyncAt: true
      }
    })

    return connectors.map((connector: any) => {
      const settings = (connector.settings || {}) as { accountEmail?: string }
      const storedEmail = settings.accountEmail?.trim()
      const email =
        storedEmail && storedEmail.includes('@')
          ? storedEmail
          : connector.externalAccountId?.includes('@')
            ? connector.externalAccountId
            : ''
      return {
        id: connector.id,
        type: ConnectorType.GOOGLE_DRIVE,
        email,
        name: connector.name ?? '',
        connectedAt: connector.createdAt.toISOString().split('T')[0],
        status: connector.status,
        lastSyncAt: connector.lastSyncAt?.toISOString(),
      }
    })
  }

  async disconnectConnection(connectionId: string): Promise<void> {
    // Get connector to revoke tokens
    const connector = await (prisma as any).connector.findUnique({
      where: { id: connectionId }
    })

    if (connector) {
      // Revoke token with Google (use decrypted token from Prisma extension)
      try {
        const connectorWithDecrypted = connector as ConnectorWithDecrypted
        const decryptedToken = this.getAccessTokenFromConnector(connectorWithDecrypted)
        await fetch(`https://oauth2.googleapis.com/revoke?token=${decryptedToken}`, {
          method: 'POST'
        })
      } catch (error) {
        logger.error('Failed to revoke token:', error as Error)
      }

      // Mark as disconnected instead of deleting
      await (prisma as any).connector.update({
        where: { id: connectionId },
        data: {
          status: 'REVOKED',
          accessToken: '',
          refreshToken: null,
          tokenExpiresAt: null
        }
      })
    }
  }

  async recursivelyImportFiles(connectionId: string, fileIds: string[]): Promise<GoogleDriveFile[]> {
    const connector = await (prisma as any).connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')
    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    const importedFiles: GoogleDriveFile[] = []

    // Recursive function with logging and robust params
    const fetchRecursively = async (ids: string[]) => {
      logger.debug(`[Import] Processing IDs: ${ids.join(', ')}`)

      for (const id of ids) {
        try {
          // 1. Fetch Metadata (Simplified fields + supportsAllDrives)
          const params = new URLSearchParams({
            fields: 'id, name, mimeType, size, modifiedTime, webViewLink, parents',
            supportsAllDrives: 'true'
          })

          const url = `https://www.googleapis.com/drive/v3/files/${id}?${params}`
          logger.debug(`[Import] Fetching: ${url}`)

          const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          })

          if (!res.ok) {
            logger.error(`[Import] Failed to fetch file ${id} - Status: ${res.status} ${res.statusText}`)
            const errBody = await res.text()
            logger.error(`[Import] Error Body: ${errBody}`)
            continue
          }

          const file = await res.json()
          logger.debug(`[Import] Successfully fetched: ${file.name} (${file.mimeType})`)

          // Add to result list
          importedFiles.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            modifiedTime: file.modifiedTime,
            size: file.size,
            webViewLink: file.webViewLink,
            owners: [], // Skip owners to be safe
            parents: file.parents,
            sharedTime: file.modifiedTime
          })

          // 2. If Folder, fetch children
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            logger.debug(`[Import] ${file.name} is a folder. Listing children...`)

            const q = `'${id}' in parents and trashed = false`
            const childParams = new URLSearchParams({
              q: q,
              fields: 'files(id, name)',
              pageSize: '1000',
              supportsAllDrives: 'true',
              includeItemsFromAllDrives: 'true'
            })

            const childUrl = `https://www.googleapis.com/drive/v3/files?${childParams}`
            const childRes = await fetch(childUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            })

            if (childRes.ok) {
              const childData = await childRes.json()
              const childIds = childData.files?.map((f: any) => f.id) || []
              logger.debug(`[Import] Found ${childIds.length} children in ${file.name}`)

              if (childIds.length > 0) {
                await fetchRecursively(childIds)
              }
            } else {
              logger.error(`[Import] Failed to list children of folder ${id}: ${childRes.status}`)
              logger.error(await childRes.text())
            }
          }

        } catch (e) {
          logger.error(`[Import] Exception processing ${id}`, e as Error)
        }
      }
    }

    await fetchRecursively(fileIds)
    logger.debug(`[Import] Completed. Total imported: ${importedFiles.length}`)
    return importedFiles
  }

  async removeConnection(connectionId: string): Promise<void> {
    // Completely remove the connector from the database
    await (prisma as any).connector.delete({
      where: { id: connectionId }
    })
  }

  /**
   * Ensures the App Folder structure exists for a given connection
   * Structure: <root>/.pockett (meta root), <root>/<OrgName>/.pockett (meta organization), then Client/Project with .pockett/meta.json and document folders.
   */
  async ensureAppFolderStructure(
    connectorId: string,
    clientName: string,
    clientSlug: string,
    adapter: IConnectorStorageAdapter,
    organizationId: string,
    projectInfo?: { projectName: string; projectSlug: string }
  ): Promise<pockettStructure.ProjectFolderStructure> {
    return pockettStructure.ensureAppFolderStructure(connectorId, clientName, clientSlug, adapter, organizationId, projectInfo)
  }

  /**
   * Create all sandbox client and project folders on Drive in parallel (Option B).
   * Caller performs one connector.update and bulk Client/Project updates after.
   */
  async createSandboxDriveStructure(
    connectorId: string,
    adapter: IConnectorStorageAdapter,
    orgFolderId: string,
    clients: pockettStructure.SandboxDriveClient[]
  ): Promise<pockettStructure.SandboxDriveStructureResult> {
    return pockettStructure.createSandboxDriveStructure(connectorId, adapter, orgFolderId, clients)
  }

  /**
   * Gets the general, confidential, and staging folder IDs for a project from connector settings (keyed by slug, then name).
   * If not in settings, lists project folder children (and if needed resolves project folder via client folder + project name).
   */
  async getEngagementFolderIds(
    connectionId: string,
    projectSlugOrName: string,
    options?: { projectName?: string; clientSlug?: string; clientName?: string; projectFolderId?: string | null }
  ): Promise<{ generalFolderId: string | null, confidentialFolderId: string | null, stagingFolderId: string | null }> {
    const connector = await (prisma as any).connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')

    const settings = (connector.settings as any) || {}
    const ps = settings.projectFolderSettings?.[projectSlugOrName] || {}
    let generalFolderId = ps.generalFolderId || null
    let confidentialFolderId = ps.confidentialFolderId || null
    let stagingFolderId = ps.stagingFolderId || null

    logger.debug(`[getProjectFolderIds] Resolving for ${projectSlugOrName}`, {
      hasGeneral: !!generalFolderId,
      hasConfidential: !!confidentialFolderId,
      hasStaging: !!stagingFolderId,
      passedProjectFolderId: options?.projectFolderId
    })

    const normalize = (s: string) => (s || '').trim().replace(/\s+/g, ' ')
    const nameMatches = (folderName: string, targetName: string) => {
      const fn = normalize(folderName)
      const tn = normalize(targetName)
      if (!tn) return false
      return fn === tn || fn.toLowerCase() === tn.toLowerCase()
    }

    const hadProjectFolderIdInSettings = !!settings.projectFolderIds?.[projectSlugOrName]
    let projectFolderId = options?.projectFolderId || settings.projectFolderIds?.[projectSlugOrName]

    // If we have none of the subfolders but we have a projectFolderId, we MUST list it to find them
    if ((!generalFolderId || !confidentialFolderId || !stagingFolderId) && !projectFolderId && options?.projectName) {
      let clientFolderId = options?.clientSlug ? settings.clientFolderIds?.[options.clientSlug] : null
      if (!clientFolderId && options?.clientName && settings.orgFolderId) {
        try {
          const orgChildren = await this.listFiles(connectionId, settings.orgFolderId, 100)
          const orgFolders = orgChildren.filter((f: { mimeType?: string }) => f.mimeType === 'application/vnd.google-apps.folder')
          const clientMatch = orgFolders.find((f: { name?: string }) => nameMatches(f.name || '', options.clientName || ''))
          if (clientMatch) clientFolderId = (clientMatch as { id: string }).id
        } catch (e) {
          logger.debug('getProjectFolderIds resolve client from org failed', e as Error)
        }
      }
      if (clientFolderId) {
        try {
          const clientChildren = await this.listFiles(connectionId, clientFolderId, 50)
          const folders = clientChildren.filter((f: { mimeType?: string }) => f.mimeType === 'application/vnd.google-apps.folder')
          const match = folders.find((f: { name?: string }) => nameMatches(f.name || '', options!.projectName!))
          if (match) {
            projectFolderId = (match as { id: string }).id
            logger.debug(`[getProjectFolderIds] Resolved projectFolderId from client: ${projectFolderId}`)
          }
        } catch (e) {
          logger.debug('getProjectFolderIds resolve project folder from client failed', e as Error)
        }
      }
    }

    if ((!generalFolderId || !confidentialFolderId || !stagingFolderId) && projectFolderId) {
      try {
        logger.debug(`[getProjectFolderIds] Listing project folder ${projectFolderId} to find subfolders`)
        const children = await this.listFiles(connectionId, projectFolderId, 50)
        const folders = children.filter((f: { mimeType?: string }) => f.mimeType === 'application/vnd.google-apps.folder')

        for (const f of folders) {
          const name = (f as { name?: string }).name?.toLowerCase() || ''
          if (name.includes('general') && !generalFolderId) generalFolderId = (f as { id: string }).id
          else if (name.includes('confidential') && !confidentialFolderId) confidentialFolderId = (f as { id: string }).id
          else if (name.includes('staging') && !stagingFolderId) stagingFolderId = (f as { id: string }).id
        }

        if (generalFolderId || confidentialFolderId || stagingFolderId) {
          logger.info(`[getProjectFolderIds] Success! Resolved subfolders for ${projectSlugOrName}`, {
            generalFolderId,
            confidentialFolderId,
            stagingFolderId
          })

          const newSettings: Record<string, unknown> = {
            ...settings,
            projectFolderSettings: {
              ...(settings.projectFolderSettings || {}),
              [projectSlugOrName]: {
                ...ps,
                generalFolderId: generalFolderId ?? ps.generalFolderId,
                confidentialFolderId: confidentialFolderId ?? ps.confidentialFolderId,
                stagingFolderId: stagingFolderId ?? ps.stagingFolderId
              }
            }
          }
          if (projectFolderId && !hadProjectFolderIdInSettings) {
            newSettings.projectFolderIds = { ...(settings.projectFolderIds || {}), [projectSlugOrName]: projectFolderId }
          }
          await (prisma as any).connector.update({
            where: { id: connectionId },
            data: { settings: newSettings }
          })
        }
      } catch (e) {
        logger.debug('getProjectFolderIds fallback list failed', e as Error)
      }
    }

    return {
      generalFolderId,
      confidentialFolderId,
      stagingFolderId
    }
  }

  // Backward-compatible alias during Project -> Engagement rename rollout.
  async getProjectFolderIds(
    connectionId: string,
    projectSlugOrName: string,
    options?: { projectName?: string; clientSlug?: string; clientName?: string; projectFolderId?: string | null }
  ): Promise<{ generalFolderId: string | null, confidentialFolderId: string | null, stagingFolderId: string | null }> {
    return this.getEngagementFolderIds(connectionId, projectSlugOrName, options)
  }

  /**
   * Explicitly register project folder settings in the connector settings.
   * Useful for sandbox and onboarding flows.
   */
  public async registerProjectFolderSettings(
    connectionId: string,
    projectSlugOrName: string,
    folderIds: {
      projectFolderId?: string;
      generalFolderId?: string;
      confidentialFolderId?: string;
      stagingFolderId?: string;
    }
  ) {
    const connector = await (prisma as any).connector.findUnique({
      where: { id: connectionId },
      select: { settings: true }
    })
    if (!connector) throw new Error('Connector not found')

    const settings = (connector.settings as Record<string, any>) || {}
    const ps = (settings.projectFolderSettings?.[projectSlugOrName] as any) || {}

    const newSettings: Record<string, any> = {
      ...settings,
      projectFolderSettings: {
        ...(settings.projectFolderSettings || {}),
        [projectSlugOrName]: {
          ...ps,
          ...(folderIds.generalFolderId && { generalFolderId: folderIds.generalFolderId }),
          ...(folderIds.confidentialFolderId && { confidentialFolderId: folderIds.confidentialFolderId }),
          ...(folderIds.stagingFolderId && { stagingFolderId: folderIds.stagingFolderId })
        }
      }
    }

    if (folderIds.projectFolderId) {
      newSettings.projectFolderIds = {
        ...(settings.projectFolderIds || {}),
        [projectSlugOrName]: folderIds.projectFolderId
      }
    }

    await (prisma as any).connector.update({
      where: { id: connectionId },
      data: { settings: newSettings }
    })

    return newSettings
  }

  private createStorageAdapter(connectionId: string) {
    return createGoogleDriveAdapter(async (id) => {
      // Use getInstance() to avoid 'this' binding issues in callbacks
      const instance = GoogleDriveConnector.getInstance()
      const token = await instance.getAccessToken(id)
      if (!token) throw new Error('Could not get access token')
      return token
    })
  }

  /**
   * CLEAN onboarding: create <root>/.pockett (meta root) and <root>/<OrgName>/.pockett (meta organization). Org folder is sibling of .pockett.
   */
  async setupOrgFolder(connectionId: string, parentFolderId: string, organizationId: string, userId?: string): Promise<{ rootId: string, orgId: string }> {
    const adapter = this.createStorageAdapter(connectionId)
    return pockettStructure.setupOrgFolder(connectionId, parentFolderId, adapter, organizationId, { userId })
  }

  /**
   * Detect if the selected folder already contains a Pockett structure.
   * Returns detected=true when:
   * - Selected folder contains .pockett with meta type=root (user selected the root), or
   * - Selected folder contains .pockett with meta type=organization (user selected the org folder); we then use its parent as the root for import.
   */
  async detectExistingStructure(connectionId: string, parentFolderId: string): Promise<{ detected: boolean, importRootFolderId?: string }> {
    const adapter = this.createStorageAdapter(connectionId)
    return pockettStructure.detectExistingStructure(connectionId, parentFolderId, adapter)
  }

  /**
   * IMPORT: Scan folder structure under parentFolderId, create missing orgs/clients/projects in DB, clone connector per imported org, update current connector if step-1 org found.
   */
  async importStructureFromDrive(
    connectionId: string,
    parentFolderId: string,
    userId: string,
    stepOneOrgSlug: string | null
  ): Promise<{ rootId: string, orgId: string, slug: string }> {
    const connector = await (prisma as any).connector.findUnique({
      where: { id: connectionId }
    })
    if (!connector) throw new Error('Connection not found')
    const decrypted = connector as ConnectorWithDecrypted
    const adapter = this.createStorageAdapter(connectionId)
    return pockettStructure.importStructureFromDrive(
      connectionId,
      parentFolderId,
      userId,
      stepOneOrgSlug,
      ConnectorType.GOOGLE_DRIVE,
      adapter,
      async (orgId) => {
        await this.storeConnection(
          orgId,
          userId,                              // Supabase user ID
          connector.externalAccountId,
          connector.name ?? '',
          decrypted.accessTokenDecrypted,
          decrypted.refreshTokenDecrypted ?? '',
          connector.tokenExpiresAt ?? new Date(),
          connector.avatarUrl ?? undefined,
          undefined,
          (connector.settings as { accountEmail?: string } | null)?.accountEmail
        )
      }
    )
  }

  /**
   * Common utility to create a file or folder in Google Drive
   */
  public async createDriveFile(
    accessToken: string,
    params: {
      name: string,
      mimeType: string,
      parents?: string[],
      description?: string,
      appProperties?: any,
      folderColorRgb?: string
    }
  ): Promise<any> {
    const body: any = {
      name: params.name,
      mimeType: params.mimeType,
      description: params.description,
      appProperties: params.appProperties,
      folderColorRgb: params.folderColorRgb
    }

    if (params.parents && params.parents.length > 0) {
      body.parents = params.parents
    }

    const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Failed to create file ${params.name}: ${res.status} - ${err}`)
    }

    return await res.json()
  }

  private async findOrCreateFolder(accessToken: string, name: string, parents?: string[], metadata?: { description?: string, appProperties?: any, folderColorRgb?: string }): Promise<string> {
    // 1. Search
    let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${name.replace(/'/g, "\\'")}' and trashed = false`
    if (parents && parents.length > 0) {
      query += ` and '${parents[0]}' in parents`
    }

    // supportsAllDrives=true & includeItemsFromAllDrives=true are required for Shared Drives
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (searchRes.ok) {
      const data = await searchRes.json()
      if (data.files && data.files.length > 0) {
        return data.files[0].id
      }
    }

    // 2. Create using utility
    const folder = await this.createDriveFile(accessToken, {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents,
      ...metadata
    })
    return folder.id
  }

  /**
   * Find or create the default workspace root folder at the root of My Drive
   * (name: _Pockett_Workspace_ or _Pockett_Workspace_<WORKSPACE_ENV>_ when WORKSPACE_ENV is set).
   * Updates the connector's rootFolderId and parentFolderId, and returns the folder id.
   * Used during onboarding so we can skip the "Configure Workspace Home" / file picker step.
   */
  public async ensureDefaultWorkspaceRoot(connectionId: string, accessToken: string): Promise<string> {
    const folderId = await this.findOrCreateFolder(
      accessToken,
      DEFAULT_WORKSPACE_FOLDER_NAME,
      ['root'],
      { folderColorRgb: DEFAULT_WORKSPACE_FOLDER_COLOR_RGB }
    )
    // Standard structure: root folder contains .pockett/meta.json (type: root)
    const adapter = createGoogleDriveAdapter(() => Promise.resolve(accessToken))
    try {
      await pockettStructure.ensureRootMetaInFolder(adapter, connectionId, folderId)
    } catch (err) {
      logger.error('Failed to create .pockett/meta.json in default workspace root', err as Error)
      // Continue — connector is still valid; structure can be fixed later
    }
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (connector) {
      const current = (connector.settings as any) || {}
      await prisma.connector.update({
        where: { id: connectionId },
        data: {
          settings: {
            ...current,
            rootFolderId: folderId,
            parentFolderId: folderId,
          },
          workspaceRootLocation: WorkspaceRootLocation.MY_DRIVE,
          workspaceRootSharedDriveId: null,
          workspaceRootSharedDriveName: null,
        },
      })
    }
    return folderId
  }

  /**
   * Parent folder for firm/org folders: the branded workspace folder (`_firma_workspace_…`) under My Drive,
   * never the Drive API pseudo-parent `root` (that would create firm folders as siblings of the workspace
   * folder in the top-level My Drive list).
   */
  public async resolveWorkspaceRootFolderId(connectionId: string): Promise<string> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) {
      throw new Error('Connector not found')
    }
    const s = (connector.settings as Record<string, unknown>) || {}
    const raw = s.parentFolderId ?? s.rootFolderId
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    if (trimmed && trimmed !== 'root') {
      return trimmed
    }
    const token = await this.getAccessToken(connectionId)
    if (!token) {
      throw new Error('Cannot resolve workspace root: missing Google Drive access token')
    }
    return this.ensureDefaultWorkspaceRoot(connectionId, token)
  }

  /**
   * Resolve My Drive vs shared drive from Drive API metadata and persist on the connector.
   */
  public async persistWorkspaceRootLocation(connectionId: string, rootFolderId: string): Promise<void> {
    const meta = await this.getFileMetadata(connectionId, rootFolderId)
    if (!meta) return

    const driveId = meta.driveId?.trim()
    if (driveId) {
      const sharedName = await this.fetchSharedDriveDisplayName(connectionId, driveId)
      await prisma.connector.update({
        where: { id: connectionId },
        data: {
          workspaceRootLocation: WorkspaceRootLocation.SHARED_DRIVE,
          workspaceRootSharedDriveId: driveId,
          workspaceRootSharedDriveName: sharedName,
        },
      })
    } else {
      await prisma.connector.update({
        where: { id: connectionId },
        data: {
          workspaceRootLocation: WorkspaceRootLocation.MY_DRIVE,
          workspaceRootSharedDriveId: null,
          workspaceRootSharedDriveName: null,
        },
      })
    }
  }

  private async fetchSharedDriveDisplayName(connectionId: string, sharedDriveId: string): Promise<string | null> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) return null
    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/drives/${encodeURIComponent(sharedDriveId)}?fields=id,name`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) return null
      const j = (await res.json()) as { name?: string }
      return typeof j.name === 'string' ? j.name : null
    } catch (e) {
      logger.error(`Failed to fetch shared drive name for ${sharedDriveId}`, e as Error)
      return null
    }
  }

  /**
   * Find or create a path of folders under a parent. Returns the id of the deepest folder, or null on failure.
   * Example: ensureFolderPath(connectorId, confidentialFolderId, ['Projects', 'Q1']) creates or finds
   * Confidential/Projects/Q1 and returns that folder's id.
   */
  public async ensureFolderPath(connectionId: string, parentId: string, folderNames: string[]): Promise<string | null> {
    if (!folderNames.length) return parentId
    try {
      const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
      if (!connector) return null
      let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
      if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
        accessToken = await this.refreshAccessToken(connectionId)
      }
      if (!accessToken) return null
      let currentParentId = parentId
      for (const name of folderNames) {
        if (!name.trim()) continue
        currentParentId = await this.findOrCreateFolder(accessToken, name.trim(), [currentParentId])
      }
      return currentParentId
    } catch (e) {
      logger.error('ensureFolderPath failed', e as Error)
      return null
    }
  }

  /**
   * Get a Resumable Upload URL for direct-to-Drive uploading
   */
  public async getResumableUploadUrl(
    accessToken: string,
    metadata: { name: string, mimeType: string, parents?: string[] },
    fileId?: string,
    origin?: string
  ): Promise<string> {
    const method = fileId ? 'PATCH' : 'POST'
    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable&supportsAllDrives=true`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true'

    const body: any = {
      name: metadata.name,
      mimeType: metadata.mimeType
    }

    // Only set parents on create (POST), not update (PATCH)
    if (!fileId && metadata.parents && metadata.parents.length > 0) {
      body.parents = metadata.parents
    }

    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(origin ? { 'Origin': origin } : {}),
        // 'X-Upload-Content-Type': metadata.mimeType, // Optional but good practice
        // 'X-Upload-Content-Length': ... // We might not know exact length here if streaming, but usually we do from client. 
        // For simplicity in this initiation phase, we just send metadata.
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Failed to initiate upload: ${res.status} ${txt}`)
    }

    const location = res.headers.get('Location')
    if (!location) {
      throw new Error('No upload location header returned from Google Drive')
    }

    return location
  }


  /**
   * Upload a file to Google Drive using multipart upload
   */
  public async uploadFile(
    accessToken: string,
    file: { name: string, type: string, stream: () => ReadableStream | any, arrayBuffer: () => Promise<ArrayBuffer> },
    metadata: { name: string, parents?: string[] },
    fileId?: string
  ): Promise<any> {

    // Construct multipart body manually because standard FormData in Node fetch can be tricky with boundaries
    const boundary = '-------314159265358979323846'
    const delimiter = `\r\n--${boundary}\r\n`
    const closeDelimiter = `\r\n--${boundary}--`

    const metadataPart = JSON.stringify({
      name: metadata.name,
      parents: !fileId ? metadata.parents : undefined // Parents cannot be updated directly via upload PATCH usually, or ignored.
    })

    const bodyStart = `${delimiter}Content-Type: application/json\r\n\r\n${metadataPart}`
    const bodyContentHeader = `${delimiter}Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`

    const fileBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(fileBuffer)

    const multipartBody = Buffer.concat([
      Buffer.from(bodyStart),
      Buffer.from(bodyContentHeader),
      buffer,
      Buffer.from(closeDelimiter)
    ])

    const method = fileId ? 'PATCH' : 'POST'
    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&supportsAllDrives=true`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true'

    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body: multipartBody as any
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Upload failed: ${res.status} ${txt}`)
    }
    return await res.json()
  }

  // Cache for ignored folder IDs per connection
  private ignoreCache = new Map<string, { ids: string[]; timestamp: number }>()
  private readonly CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours

  /**
   * Helper function to calculate badges for a file based on permissions and content
   */
  private calculateBadges(file: any): { type: 'risk' | 'attention' | 'sensitive' | 'stale', text: string }[] {
    const badges: { type: 'risk' | 'attention' | 'sensitive' | 'stale', text: string }[] = []

    // 🔴 RISK Badges
    const isPublic = file.permissions?.some((p: any) => p.type === 'anyone')
    const isPublicEditor = file.permissions?.some((p: any) => p.type === 'anyone' && (p.role === 'writer' || p.role === 'owner'))

    if (isPublicEditor) {
      badges.push({ type: 'risk', text: 'Anyone with link can edit' })
    } else if (isPublic) {
      badges.push({ type: 'risk', text: 'Publicly Shared' })
    }

    // 🟡 ATTENTION Badges
    // Ideally we check for external domains here. 
    // For now, let's leave ATTENTION for non-public but broadly shared files if we can detect them, 
    // or just ensure SENSITIVE is distinct.

    // 🟣 SENSITIVE Badges (Content-based)
    const lowerName = (file.name || '').toLowerCase()
    if (/(password|credentials|\.env|secret|config|key|token|auth|private|id_rsa|contract|invoice|agreement|nda|tax|visa|insurance|passport|forex|ticket|medical|health|prescription|diagnosis|hospital|bank|account|statement|salary|payroll|w2|1099|ssn|social|credit|loan|mortgage|license|driver|birth|certificate|aadhar|aadhaar|pan|resume|cv|offer|employment|termination|resignation|confidential|personal|sensitive)/i.test(lowerName)) {
      badges.push({ type: 'sensitive', text: 'May contain sensitive content' })
    }

    return badges
  }



  /**
   * Helper function to fetch activity data for specific file IDs
   * Returns activities for the given file IDs within the specified time range
   */
  private async getActivityForFiles(accessToken: string, fileIds: string[], timeRange: '4w' | 'all' = '4w'): Promise<any[]> {
    if (fileIds.length === 0) return []

    try {
      // Determine time filter based on timeRange
      let filter = ''
      if (timeRange === '4w') {
        const fourWeeksAgo = new Date()
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
        const startTimeIso = fourWeeksAgo.toISOString()
        filter = `time > "${startTimeIso}"`
      } else {
        // For 'all', fetch activities from last 90 days (for badge calculation)
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        const startTimeIso = ninetyDaysAgo.toISOString()
        filter = `time > "${startTimeIso}"`
      }

      // Fetch all activities in the timeframe
      // We'll filter by file IDs after fetching
      const res = await fetch('https://driveactivity.googleapis.com/v2/activity:query', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageSize: 500, // Fetch enough activities
          filter: filter
        })
      })

      if (!res.ok) {
        logger.error('Activity API error', new Error(`${res.status} ${res.statusText}`))
        return []
      }

      const data = await res.json()
      const allActivities = data.activities || []

      // Filter activities to only include those for our file IDs
      const fileIdSet = new Set(fileIds)
      return allActivities.filter((activity: any) => {
        const fileId = activity.targets?.[0]?.driveItem?.name?.replace('items/', '')
        return fileId && fileIdSet.has(fileId)
      })
    } catch (error) {
      logger.error('Error fetching activity for files:', error as Error)
      return []
    }
  }



  async getStorageFiles(
    connectionId: string,
    limit: number = 100,
    sizeRange: '0.5-1' | '1-5' | '5-10' | '10+' = '0.5-1',
    timeRange: '4w' | 'all' = '4w'
  ): Promise<GoogleDriveFile[]> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')
    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    const params = new URLSearchParams({
      pageSize: Math.min(limit * 5, 1000).toString(), // Fetch more to filter client-side, max 1000
      q: "trashed = false",
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, viewedByMeTime, size, webViewLink, owners(displayName, emailAddress, photoLink), permissions, shared, parents)",
      orderBy: "quotaBytesUsed desc"
    })

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[Storage API] Google Drive error', new Error(response.statusText), 'GoogleDrive', {
        status: response.status,
        body: errorText,
        query: params.toString()
      })
      throw new Error(`Google Drive API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const files = data.files || []

    // Parse size range to min/max bytes
    let minSize: number, maxSize: number
    switch (sizeRange) {
      case '0.5-1':
        minSize = 524288000 // 0.5GB
        maxSize = 1073741824 // 1GB
        break
      case '1-5':
        minSize = 1073741824 // 1GB
        maxSize = 5368709120 // 5GB
        break
      case '5-10':
        minSize = 5368709120 // 5GB
        maxSize = 10737418240 // 10GB
        break
      case '10+':
        minSize = 10737418240 // 10GB
        maxSize = Infinity
        break
    }

    // Filter files by size range client-side
    let largeFiles = files.filter((f: any) => {
      const fileSize = parseInt(f.size || '0')
      return fileSize >= minSize && (maxSize === Infinity ? true : fileSize < maxSize)
    })

    // Filter by timeframe using Metadata instead of Activity API
    if (timeRange === '4w') {
      const fourWeeksAgo = new Date()
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

      // Filter files that have activity (modified or viewed) in last 4 weeks
      largeFiles = largeFiles.filter((f: any) => {
        const lastActivityStr = f.viewedByMeTime || f.modifiedTime
        if (!lastActivityStr) return false
        const lastActivity = new Date(lastActivityStr)
        return lastActivity > fourWeeksAgo
      })
    }

    // Sort by size descending (largest first)
    largeFiles.sort((a: any, b: any) => {
      const sizeA = parseInt(a.size || '0')
      const sizeB = parseInt(b.size || '0')
      return sizeB - sizeA // Descending order
    })

    // Fetch activity data for last 90 days to determine CLEANUP badges
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const fileIds = largeFiles.slice(0, limit).map((f: any) => f.id)
    const activities90d = await this.getActivityForFiles(accessToken, fileIds, 'all') // Fetch all activities

    // Create a map of fileId -> most recent activity timestamp for badge calculation
    const activityMapForBadges = new Map<string, Date>()
    activities90d.forEach((activity: any) => {
      const fileId = activity.targets?.[0]?.driveItem?.name?.replace('items/', '')
      const timestamp = activity.timestamp ? new Date(activity.timestamp) : null

      if (fileId && timestamp) {
        const existing = activityMapForBadges.get(fileId)
        if (!existing || timestamp > existing) {
          activityMapForBadges.set(fileId, timestamp)
        }
      }
    })

    return largeFiles.slice(0, limit).map((f: any) => {
      const badges = []

      // 🔴 STALE Badge: Large file with no activity in 90+ days
      // Using Activity API data for accurate inactivity detection
      const lastActivity = activityMapForBadges.get(f.id)
      const isInactive = !lastActivity || lastActivity < ninetyDaysAgo

      if (isInactive) {
        badges.push({ type: 'stale', text: 'No activity in 90+ days' })
      }

      return {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size,
        webViewLink: f.webViewLink,
        source: 'Google Drive',
        // Use last activity timestamp from Activity API, fallback to modifiedTime
        activityTimestamp: lastActivity ? lastActivity.toISOString() : f.modifiedTime,
        lastAction: 'Large File',
        lastViewedTime: f.modifiedTime, // Using modifiedTime as fallback
        owners: f.owners,
        permissions: f.permissions,
        shared: f.shared,
        badges: badges,
        sharedTime: f.sharedWithMeTime || f.modifiedTime,
        parents: f.parents
      } as GoogleDriveFile
    })
  }

  async getSharedFiles(connectionId: string, limit: number = 10): Promise<GoogleDriveFile[]> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')
    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    const params = new URLSearchParams({
      pageSize: Math.min(limit * 2, 1000).toString(),
      q: "sharedWithMe = true and trashed = false",
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, sharedWithMeTime, size, webViewLink, owners(displayName, emailAddress, photoLink), permissions, shared, parents)",
      orderBy: "sharedWithMeTime desc"
    })

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    })

    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.status}`)
    }

    const data = await response.json()
    const files = data.files || []

    // Map files with badge computation
    const allFiles = files.map((f: any) => {
      // Compute security badges
      const badges = this.calculateBadges(f)


      return {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.sharedWithMeTime || f.modifiedTime,
        size: f.size,
        webViewLink: f.webViewLink,
        source: 'Google Drive',
        activityTimestamp: f.sharedWithMeTime || f.modifiedTime,
        lastAction: 'Shared With You',
        actorEmail: f.owners?.[0]?.emailAddress,
        owners: f.owners,
        permissions: f.permissions,
        shared: f.shared,
        badges: badges,
        sharedTime: f.sharedWithMeTime || f.modifiedTime,
        parents: f.parents
      } as GoogleDriveFile
    })

    // Filter to show only actionable files:
    // 1. Files with badges (RISK or ATTENTION)
    // 2. Files shared in the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const actionableFiles = allFiles.filter((file: any) => {
      const hasBadge = file.badges && file.badges.length > 0
      const isRecent = file.sharedTime && new Date(file.sharedTime) > thirtyDaysAgo
      return hasBadge || isRecent
    })

    return allFiles.slice(0, limit)  // TEMP: Show all shared files instead of actionableFiles
  }

  async getSharedByMeFiles(connectionId: string, limit: number = 10): Promise<GoogleDriveFile[]> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')
    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    const params = new URLSearchParams({
      pageSize: Math.min(limit * 2, 1000).toString(),
      q: "'me' in owners and trashed = false",
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink, owners(displayName, emailAddress, photoLink), permissions, shared, parents)",
      orderBy: "modifiedTime desc"
    })

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    })

    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.status}`)
    }

    const data = await response.json()
    const files = data.files || []

    // Filter to only include files that are actually shared
    const sharedFiles = files.filter((f: any) => f.shared === true)

    // Map files with badge computation
    const allFiles = sharedFiles.map((f: any) => {
      // Compute security badges
      const badges = this.calculateBadges(f)

      return {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size ? parseInt(f.size) : 0,
        webViewLink: f.webViewLink,
        source: 'Google Drive',
        activityTimestamp: f.modifiedTime,
        lastAction: 'Shared By You',
        owners: f.owners,
        permissions: f.permissions,
        shared: f.shared,
        badges: badges,
        sharedTime: f.modifiedTime,
        parents: f.parents
      } as GoogleDriveFile
    })

    // Filter to show only actionable files:
    // 1. Files with badges (RISK or ATTENTION)
    // 2. Files shared in the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const actionableFiles = allFiles.filter((file: any) => {
      const hasBadge = file.badges && file.badges.length > 0
      const isRecent = file.sharedTime && new Date(file.sharedTime) > thirtyDaysAgo
      return hasBadge || isRecent
    })

    return allFiles.slice(0, limit)  // TEMP: Show all shared files instead of actionableFiles
  }

  // Helper to re-check ignore IDs
  async resolveIgnoreIds(connectionId: string, accessToken: string): Promise<string[]> {
    const now = Date.now()
    const cached = this.ignoreCache.get(connectionId)

    // Return cached IDs if valid
    if (cached && (now - cached.timestamp < this.CACHE_TTL)) {
      return cached.ids
    }

    const patterns = ignoreParser.getPatterns()
    if (patterns.length === 0) return []

    const ignoreIds: string[] = []

    // Parallel lookup for all patterns
    await Promise.all(patterns.map(async (pattern) => {
      try {
        const escapedPattern = pattern.replace(/'/g, "\\'")
        const q = `name = '${escapedPattern}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.files && data.files.length > 0) {
            // Add all matching folder IDs
            data.files.forEach((f: any) => ignoreIds.push(f.id))
          }
        }
      } catch (error) {
        logger.error(`Failed to resolve ignore pattern: ${pattern}`, error as Error)
      }
    }))

    // Update cache
    this.ignoreCache.set(connectionId, { ids: ignoreIds, timestamp: now })
    return ignoreIds
  }

  async getFiles(connectionId: string, pageToken?: string): Promise<{
    files: GoogleDriveFile[]
    nextPageToken?: string
  }> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')

    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    // 1. Resolve Ignore IDs (Cached)
    const ignoreIds = await this.resolveIgnoreIds(connectionId, accessToken)

    // 2. Build Query
    // Exclude the folder itself (by name) AND its contents (by parent ID)
    const nameExclusions = ignoreParser.getPatterns().map(p => `not name = '${p.replace(/'/g, "\\'")}'`).join(' and ')
    const parentExclusions = ignoreIds.map(id => `not '${id.replace(/'/g, "\\'")}' in parents`).join(' and ')

    let query = 'trashed = false'
    if (nameExclusions) query += ` and ${nameExclusions}`
    if (parentExclusions) query += ` and ${parentExclusions}`

    const params = new URLSearchParams({
      pageSize: '10',
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink)',
      orderBy: 'modifiedTime desc',
      q: query
    })

    if (pageToken) params.set('pageToken', pageToken)

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    })

    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.status} ${await response.text()}`)
    }

    const data = await response.json()
    return {
      files: (data.files || []).map((f: any) => ({ ...f, connectorId: connectionId })),
      nextPageToken: data.nextPageToken
    }
  }

  async getMostRecentFiles(connectionId: string, limit: number = 5, timeRange: '24h' | '7d' | '1w' | '2w' | '30d' | '4w' | '1y' = '7d', minSize?: number, userEmail?: string): Promise<GoogleDriveFile[]> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')

    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    const now = new Date()
    let startTime = new Date()
    switch (timeRange) {
      case '24h': startTime.setDate(now.getDate() - 1); break;
      case '7d': startTime.setDate(now.getDate() - 7); break;
      case '1w': startTime.setDate(now.getDate() - 7); break;
      case '2w': startTime.setDate(now.getDate() - 14); break;
      case '4w': startTime.setDate(now.getDate() - 28); break;
      case '30d': startTime.setDate(now.getDate() - 30); break;
      case '1y': startTime.setFullYear(now.getFullYear() - 1); break;
      default: startTime.setDate(now.getDate() - 7);
    }
    const startTimeIso = startTime.toISOString()

    // 1. Fetch "Viewed" Files (Files API)
    const viewedFilesPromise = (async () => {
      try {
        const q = `viewedByMeTime > '${startTimeIso}' and trashed = false`
        const params = new URLSearchParams({
          pageSize: limit.toString(), // Fetch closer to limit
          fields: 'files(id, name, mimeType, modifiedTime, viewedByMeTime, size, webViewLink, parents, owners(displayName, emailAddress, photoLink), permissions, shared)',
          orderBy: 'viewedByMeTime desc',
          q: q
        })
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        if (!res.ok) return []
        const data = await res.json()
        return data.files || []
      } catch (e) {
        logger.error('Files API Error (Viewed)', e as Error)
        return []
      }
    })()

    // 2. Fetch "Modified" Files (Files API)
    const modifiedFilesPromise = (async () => {
      try {
        const q = `modifiedTime > '${startTimeIso}' and trashed = false`
        const params = new URLSearchParams({
          pageSize: limit.toString(),
          fields: 'files(id, name, mimeType, modifiedTime, viewedByMeTime, size, webViewLink, parents, owners(displayName, emailAddress, photoLink), permissions, shared)',
          orderBy: 'modifiedTime desc',
          q: q
        })
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        if (!res.ok) return []
        const data = await res.json()
        return data.files || []
      } catch (e) {
        logger.error('Files API Error (Modified)', e as Error)
        return []
      }
    })()

    const [viewedFiles, modifiedFiles] = await Promise.all([viewedFilesPromise, modifiedFilesPromise])

    // 3. Merge & Deduplicate
    const combined = new Map<string, any>()

    const processFiles = (files: any[], actionType: string) => {
      files.forEach((f: any) => {
        const existing = combined.get(f.id)
        const timestamp = actionType === 'Viewed' ? f.viewedByMeTime : f.modifiedTime

        if (!timestamp) return

        let fileData = {
          ...f,
          activityTimestamp: timestamp,
          lastAction: actionType,
          parents: f.parents,
          owners: f.owners
        }

        if (existing) {
          if (new Date(timestamp) > new Date(existing.activityTimestamp)) {
            fileData = { ...existing, ...f, activityTimestamp: timestamp, lastAction: actionType }
          } else {
            fileData = existing
          }
        }
        combined.set(f.id, fileData)
      })
    }

    processFiles(viewedFiles, 'Viewed')
    processFiles(modifiedFiles, 'Edited')

    // 4. Sort and Return
    let sorted = Array.from(combined.values()).sort((a, b) => {
      return new Date(b.activityTimestamp).getTime() - new Date(a.activityTimestamp).getTime()
    })

    if (minSize) {
      sorted = sorted.filter(f => f.size && parseInt(f.size) > minSize)
    }

    return sorted.slice(0, limit).map((f: any) => ({
      ...f,
      connectorId: connectionId,
      parentName: undefined,
      actorEmail: f.owners?.[0]?.emailAddress
    }))
  }

  async getMostAccessedFiles(connectionId: string, limit: number = 5): Promise<GoogleDriveFile[]> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')

    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    // 1. Resolve Ignore IDs (Cached)
    const ignoreIds = await this.resolveIgnoreIds(connectionId, accessToken)

    // 2. Build Query
    const nameExclusions = ignoreParser.getPatterns().map(p => `not name = '${p.replace(/'/g, "\\'")}'`).join(' and ')
    const parentExclusions = ignoreIds.map(id => `not '${id.replace(/'/g, "\\'")}' in parents`).join(' and ')

    let query = 'trashed = false'
    if (nameExclusions) query += ` and ${nameExclusions}`
    if (parentExclusions) query += ` and ${parentExclusions}`

    const params = new URLSearchParams({
      pageSize: limit.toString(),
      fields: 'files(id, name, mimeType, modifiedTime, viewedByMeTime, createdTime, size, webViewLink, parents, lastModifyingUser(displayName, photoLink), owners(displayName, photoLink))',
      orderBy: 'viewedByMeTime desc',
      q: query
    })

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      },
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Failed to fetch accessed files', new Error(`Status: ${response.status}`), 'GoogleDrive', { errorText })
      return []
    }

    const data = await response.json()
    return (data.files || []).map((f: any) => ({ ...f, connectorId: connectionId }))
  }

  async storeConnection(
    organizationId: string | undefined,
    userId: string,
    externalAccountId: string,
    name: string,
    accessToken: string,
    refreshToken: string, // Might be empty if not returned
    tokenExpiresAt: Date,
    avatarUrl?: string,
    rootFolderId?: string,
    /** Google account email (OAuth userinfo); stored in settings for UI and APIs. */
    accountEmail?: string
  ): Promise<Connector> {

    // Pass plaintext tokens - Prisma extension handles encryption automatically
    const updateData: any = {
      name,
      avatarUrl,
      accessToken, // Plaintext - Prisma extension encrypts
      tokenExpiresAt,
      status: ConnectorStatus.ACTIVE,
      updatedAt: new Date()
    }

    const trimmedEmail = accountEmail?.trim()
    const mergeConnectorSettings = (prev: Record<string, unknown> | undefined) => {
      const next = { ...(prev || {}) }
      let touched = false
      if (rootFolderId) {
        next.rootFolderId = rootFolderId
        if (next.parentFolderId == null || next.parentFolderId === '') {
          next.parentFolderId = rootFolderId
        }
        touched = true
      }
      if (trimmedEmail) {
        next.accountEmail = trimmedEmail
        touched = true
      }
      return touched ? next : undefined
    }

    // Only update refresh_token if we received a new one
    if (refreshToken) {
      updateData.refreshToken = refreshToken // Plaintext - Prisma extension encrypts
    }

    // Find existing connector by type + userId (one connector per Supabase user per integration)
    const existingConnector = await prisma.connector.findFirst({
      where: {
        type: ConnectorType.GOOGLE_DRIVE,
        userId
      }
    })

    if (existingConnector) {
      const mergedSettings = mergeConnectorSettings(
        (existingConnector.settings as Record<string, unknown>) || undefined
      )
      const updatePayload: Record<string, unknown> = { ...updateData }
      if (mergedSettings) {
        updatePayload.settings = mergedSettings
      }
      // Update existing connector tokens
      const updated = await prisma.connector.update({
        where: { id: existingConnector.id },
        data: updatePayload as any,
      })
      // Also ensure the organization is linked to this connector if provided
      if (organizationId) {
        await prisma.firm.update({
          where: { id: organizationId },
          data: { connectorId: existingConnector.id }
        })
      }
      return updated
    }

    const initialSettings = mergeConnectorSettings(undefined) ?? {}

    // Create new connector 
    const newConnector = await prisma.connector.create({
      data: {
        type: ConnectorType.GOOGLE_DRIVE,
        userId,
        externalAccountId,
        name,
        avatarUrl,
        accessToken, // Plaintext - Prisma extension encrypts
        refreshToken: refreshToken || '', // Plaintext - Prisma extension encrypts
        tokenExpiresAt,
        status: ConnectorStatus.ACTIVE,
        settings: initialSettings,
        createdBy: userId,
        updatedBy: userId,
      }
    })

    // Link the connector to the organization if provided
    if (organizationId) {
      await prisma.firm.update({
        where: { id: organizationId },
        data: { connectorId: newConnector.id }
      })
    }

    return newConnector
  }

  async getUserInfo(connectionId: string): Promise<{
    email: string
    name: string
    picture?: string
    quotaBytesTotal: string
    quotaBytesUsed: string
  }> {
    // Get the connector to access the access token
    const connector = await prisma.connector.findUnique({
      where: { id: connectionId }
    })

    if (!connector) {
      throw new Error('Connection not found')
    }

    // Check if token is expired and refresh if needed
    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      logger.debug('Token expired, refreshing...', {
        connectionId,
        expiresAt: connector.tokenExpiresAt,
        now: new Date()
      })
      try {
        accessToken = await this.refreshAccessToken(connectionId)
        logger.debug('Token refreshed successfully')
      } catch (refreshError) {
        logger.error('Token refresh failed', refreshError as Error)
        // If refresh fails, mark connection as expired and suggest reconnection
        await prisma.connector.update({
          where: { id: connectionId },
          data: { status: ConnectorStatus.EXPIRED }
        })
        throw new Error(`Token refresh failed: ${refreshError instanceof Error ? refreshError.message : 'Unknown error'}. Please reconnect your account.`)
      }
    }

    // Make API call to get user info
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`Google Drive user info error: ${response.status} ${errorText}`)

      // Handle specific error cases
      if (response.status === 403) {
        throw new Error('Access denied. Please reconnect your Google Drive account to grant the required permissions.')
      } else if (response.status === 401) {
        throw new Error('Authentication failed. Please reconnect your Google Drive account.')
      }

      throw new Error(`Google Drive user info error: ${response.status}`)
    }

    const data = await response.json()

    return {
      email: data.user?.emailAddress || connector.name || '',
      name: data.user?.displayName || connector.name || '',
      picture: data.user?.photoLink,
      quotaBytesTotal: data.storageQuota?.limit || '0',
      quotaBytesUsed: data.storageQuota?.usage || '0'
    }
  }

  async refreshAccessToken(connectionId: string): Promise<string> {
    const connector = await prisma.connector.findUnique({
      where: { id: connectionId }
    })

    if (!connector || !connector.refreshToken) {
      throw new Error('No refresh token available')
    }

    // Get decrypted refresh token via Prisma extension
    const connectorWithDecrypted = connector as ConnectorWithDecrypted
    const refreshToken = this.getRefreshTokenFromConnector(connectorWithDecrypted)
    if (!refreshToken) {
      throw new Error('Failed to get refresh token')
    }

    let clientId: string
    let clientSecret: string
    try {
      const creds = getGoogleDriveOAuthServerCredentials()
      clientId = creds.clientId
      clientSecret = creds.clientSecret
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('Google Drive OAuth server credentials invalid', new Error(msg))
      throw new GoogleDriveAuthError(msg, { oauthMisconfigured: true })
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`Token refresh failed: ${response.status} ${errorText}`)

      let oauthError: string | undefined
      try {
        oauthError = (JSON.parse(errorText) as { error?: string }).error
      } catch {
        /* ignore */
      }

      const markExpired = async () => {
        await prisma.connector.update({
          where: { id: connectionId },
          data: { status: ConnectorStatus.EXPIRED },
        })
      }

      if (oauthError === 'invalid_grant') {
        await markExpired()
        throw new GoogleDriveAuthError(
          'Refresh token is invalid or expired. Please reconnect your Google Drive account.',
          { reconnectRequired: true }
        )
      }

      if (oauthError === 'unauthorized_client' || oauthError === 'invalid_client') {
        throw new GoogleDriveAuthError(
          'Google rejected OAuth client credentials while refreshing the token. Ensure GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET are the Web client that issued this connection (if GOOGLE_DRIVE_CLIENT_ID matches GOOGLE_CLIENT_ID, set GOOGLE_DRIVE_CLIENT_SECRET to the same value as GOOGLE_CLIENT_SECRET). If the error persists after fixing credentials, reconnect Google Drive.',
          { oauthMisconfigured: true }
        )
      }

      throw new Error(`Failed to refresh token: ${response.status} - ${errorText}`)
    }

    const tokens = await response.json()
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000)

    const data: {
      accessToken: string
      tokenExpiresAt: Date
      status: ConnectorStatus
      refreshToken?: string
    } = {
      accessToken: tokens.access_token,
      tokenExpiresAt: newExpiry,
      status: ConnectorStatus.ACTIVE,
    }
    if (typeof tokens.refresh_token === 'string' && tokens.refresh_token.length > 0) {
      data.refreshToken = tokens.refresh_token
    }

    await prisma.connector.update({
      where: { id: connectionId },
      data,
    })

    return tokens.access_token
  }

  async getRevisions(connectionId: string, fileId: string): Promise<any[]> {
    const connector = await prisma.connector.findUnique({
      where: { id: connectionId }
    })

    if (!connector) throw new Error('Connection not found')

    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/revisions?fields=revisions(id,modifiedTime,keepForever,published,lastModifyingUser(displayName,photoLink),originalFilename,size,mimeType,exportLinks)&pageSize=100`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      // If 403, might be shared drive or permission issue, return empty
      if (response.status === 403) return []
      throw new Error(`Failed to fetch revisions: ${response.status}`)
    }

    const data = await response.json()
    return data.revisions || []
  }

  async downloadFile(connectionId: string, fileId: string, revisionId?: string): Promise<{
    stream: ReadableStream
    mimeType: string
    size: string
    name: string
  }> {
    const connector = await prisma.connector.findUnique({
      where: { id: connectionId }
    })

    if (!connector) throw new Error('Connection not found')

    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    // 1. Get metadata
    let metadata: any
    if (revisionId) {
      // Get revision metadata
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/revisions/${revisionId}?fields=originalFilename,mimeType,size,exportLinks`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (!response.ok) throw new Error(`Failed to fetch revision metadata: ${response.status}`)
      const rev = await response.json()
      // Normalize to match file metadata structure
      metadata = {
        name: rev.originalFilename || `revision-${revisionId}`,
        mimeType: rev.mimeType,
        size: rev.size,
        exportLinks: rev.exportLinks
      }
    } else {
      // Get file metadata
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (!response.ok) throw new Error(`Failed to fetch file metadata: ${response.status}`)
      metadata = await response.json()
    }

    // 2. Download content
    const GOOGLE_MIME_TYPES: Record<string, { exportMime: string; extension: string }> = {
      'application/vnd.google-apps.document': {
        exportMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx'
      },
      'application/vnd.google-apps.spreadsheet': {
        exportMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: 'xlsx'
      },
      'application/vnd.google-apps.presentation': {
        exportMime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extension: 'pptx'
      }
    }

    const exportConfig = GOOGLE_MIME_TYPES[metadata.mimeType]

    let downloadUrl: string
    let finalMimeType = metadata.mimeType
    let finalName = metadata.name

    if (exportConfig) {
      // Google Doc/Sheet/Slide - use export
      finalMimeType = exportConfig.exportMime

      // Construct export URL
      if (revisionId) {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/revisions/${revisionId}/export?mimeType=${encodeURIComponent(exportConfig.exportMime)}`
      } else {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportConfig.exportMime)}`
      }

      // Append extension
      if (!finalName.toLowerCase().endsWith(`.${exportConfig.extension}`)) {
        finalName = `${finalName}.${exportConfig.extension}`
      }
    } else {
      // Binary file - use direct download
      // For revisions: files/fileId/revisions/revisionId?alt=media
      // For head: files/fileId?alt=media
      const baseUrl = revisionId
        ? `https://www.googleapis.com/drive/v3/files/${fileId}/revisions/${revisionId}`
        : `https://www.googleapis.com/drive/v3/files/${fileId}`

      downloadUrl = `${baseUrl}?alt=media`
    }

    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Google Drive Download Error', new Error(errorText))
      throw new Error(`Failed to download/export file stream: ${response.status} ${response.statusText} - ${errorText}`)
    }

    if (!response.body) {
      throw new Error('No response body received from Google Drive')
    }

    // For exports, we CANNOT trust metadata.size because the export size is different.
    const finalSize = exportConfig ? undefined : (metadata.size || response.headers.get('Content-Length') || '0')

    return {
      stream: response.body as unknown as ReadableStream,
      mimeType: finalMimeType,
      size: finalSize || '0',
      name: finalName
    }
  }

  async getFileText(connectionId: string, fileId: string): Promise<string | null> {
    try {
      const connector = await prisma.connector.findUnique({
        where: { id: connectionId }
      })

      if (!connector) return null

      let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
      if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
        accessToken = await this.refreshAccessToken(connectionId)
      }

      // 1. Get metadata to determine if it's indexable
      const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (!metaRes.ok) return null
      const metadata = await metaRes.json()

      let downloadUrl: string
      if (metadata.mimeType === 'application/vnd.google-apps.document') {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
      } else if (metadata.mimeType === 'text/plain' || metadata.mimeType === 'application/json' || metadata.mimeType === 'text/markdown') {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      } else {
        return null // Not a text-based file we can easily summarize
      }

      const res = await fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!res.ok) return null
      return await res.text()

    } catch (e) {
      logger.error('getFileText failed', e as Error)
      return null
    }
  }

  async getActivity(connectionId: string, fileId: string): Promise<any[]> {
    const connector = await prisma.connector.findUnique({
      where: { id: connectionId }
    })

    if (!connector) throw new Error('Connection not found')

    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    // Google Drive Activity API V2
    const response = await fetch('https://driveactivity.googleapis.com/v2/activity:query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        itemName: `items/${fileId}`,
        pageSize: 20 // Reasonable limit for a sidebar
      })
    })

    if (!response.ok) {
      // Handle common errors like scope missing gracefully
      const errorText = await response.text()
      logger.error(`Failed to fetch activity: ${response.status} ${errorText}`)
      if (response.status === 403) {
        throw new Error("Missing 'drive.activity.readonly' scope. Please reconnect your account.")
      }
      throw new Error(`Failed to fetch activity: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    const activities = data.activities || []

    // 2. Resolve Actor Names via People API
    // The Activity API often returns 'people/ACCOUNT_ID' as the personName without a display name.
    // We need to fetch the profiles to show real names.
    const uniquePeopleIds = new Set<string>()
    activities.forEach((act: any) => {
      act.actors?.forEach((actor: any) => {
        const personName = actor.user?.knownUser?.personName
        if (personName && personName.startsWith('people/')) {
          uniquePeopleIds.add(personName)
        }
      })
    })

    if (uniquePeopleIds.size > 0) {
      try {
        const peopleIds = Array.from(uniquePeopleIds)
        logger.debug('[People API] Attempting to resolve names for:', peopleIds)

        // Batch get people profiles
        // We can request up to 50 people in a single batch
        const batchParams = new URLSearchParams()
        batchParams.append('personFields', 'names')
        peopleIds.slice(0, 50).forEach(id => batchParams.append('resourceNames', id))

        const peopleResponse = await fetch(`https://people.googleapis.com/v1/people:batchGet?${batchParams.toString()}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        logger.debug('[People API] Response status', { status: peopleResponse.status })

        if (peopleResponse.ok) {
          const peopleData = await peopleResponse.json()


          const peopleMap = new Map<string, string>()

          if (peopleData.responses) {
            peopleData.responses.forEach((r: any) => {
              const personId = r.requestedResourceName
              const displayName = r.person?.names?.[0]?.displayName

              if (personId && displayName) {
                peopleMap.set(personId, displayName)
              }
            })
          }

          // Hydrate activities with resolved names
          activities.forEach((act: any) => {
            act.actors?.forEach((actor: any) => {
              const personName = actor.user?.knownUser?.personName
              if (personName && peopleMap.has(personName)) {
                actor.user.knownUser.personName = peopleMap.get(personName)
              }
            })
          })
        } else {
          logger.error(`[People API] Failed to resolve names, status: ${peopleResponse.status}`)
        }
      } catch (error) {
        logger.error('[People API] Error resolving names', error as Error)
      }
    }

    return activities
  }

  async getMostActiveFiles(connectionId: string, limit: number = 5, timeRange: '24h' | '7d' | '30d' | '1y' = '7d'): Promise<GoogleDriveFile[]> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')

    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    // Calculate time filter
    const now = new Date()
    let startTime = new Date()
    switch (timeRange) {
      case '24h': startTime.setDate(now.getDate() - 1); break;
      case '7d': startTime.setDate(now.getDate() - 7); break;
      case '30d': startTime.setDate(now.getDate() - 30); break;
      case '1y': startTime.setFullYear(now.getFullYear() - 1); break;
      default: startTime.setDate(now.getDate() - 7);
    }
    const timeFilter = `time > "${startTime.toISOString()}"`
    const actionFilter = "detail.action_detail_case:(Edit OR Comment OR Rename OR Create OR Move)"

    // 1. Fetch Global Activity Stream (for counts)
    const activityPromise = (async () => {
      try {
        const res = await fetch('https://driveactivity.googleapis.com/v2/activity:query', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pageSize: 50,
            filter: `${timeFilter}` // Removed action filter to be broader
          })
        })
        if (!res.ok) return []
        const d = await res.json()
        return d.activities || []
      } catch (e) {
        logger.error('Activity API fetch failed', e as Error)
        return []
      }
    })()

    // 2. Fetch Files by ViewedByMeTime (for "Accessed" coverage)
    // This ensures we show files even if they were just viewed and not edited
    const viewedFilesPromise = (async () => {
      try {
        const q = `viewedByMeTime > '${startTime.toISOString()}' and trashed = false`
        // Ensure we fetch enough files to cover the requested limit, plus a buffer for overlap
        const fetchSize = Math.max(limit * 2, 50).toString()
        const params = new URLSearchParams({
          pageSize: fetchSize,
          fields: 'files(id, name, mimeType, modifiedTime, viewedByMeTime, size, webViewLink, iconLink)',
          orderBy: 'viewedByMeTime desc',
          q: q
        })
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        if (!res.ok) return []
        const d = await res.json()
        return d.files || []
      } catch (e) {
        logger.error('Viewed files fetch failed', e as Error)
        return []
      }
    })()

    const [activities, viewedFiles] = await Promise.all([activityPromise, viewedFilesPromise])

    // 3. Aggregate Activity Counts
    const fileStats = new Map<string, { count: number, lastActivity: string }>()

    // Process activities
    activities.forEach((act: any) => {
      if (!act.targets) return
      const target = act.targets[0]
      if (!target.driveItem || !target.driveItem.name) return

      const fileId = target.driveItem.name.replace('items/', '')
      const timestamp = act.timestamp

      if (!fileStats.has(fileId)) {
        fileStats.set(fileId, { count: 0, lastActivity: timestamp })
      }
      const entry = fileStats.get(fileId)!
      entry.count += 1
      if (new Date(timestamp) > new Date(entry.lastActivity)) {
        entry.lastActivity = timestamp
      }
    })

    // 4. Merge Viewed Files with Activity Stats
    const allFileIds = new Set<string>()
    fileStats.forEach((_, key) => allFileIds.add(key))
    viewedFiles.forEach((f: any) => allFileIds.add(f.id))

    const mergedFiles: GoogleDriveFile[] = []

    // We need metadata for activity-only files. Viewed files already have metadata.
    // Identify IDs that are in fileStats but NOT in viewedFiles
    const neededMetadataIds: string[] = []
    fileStats.forEach((_, id) => {
      if (!viewedFiles.find((f: any) => f.id === id)) {
        neededMetadataIds.push(id)
      }
    })

    // Batch fetch missing metadata (if any)
    const extraFilesMap = new Map<string, any>()
    if (neededMetadataIds.length > 0) {
      // Simple sequential fetch for missing items (or could optimize with batch, but slicing to limit for now)
      for (let i = 0; i < Math.min(neededMetadataIds.length, 5); i++) {
        const id = neededMetadataIds[i]
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,modifiedTime,viewedByMeTime,size,webViewLink,iconLink`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          })
          if (res.ok) {
            const d = await res.json()
            extraFilesMap.set(id, d)
          }
        } catch { }
      }
    }

    // Construct final list
    allFileIds.forEach((id) => {
      const viewedFile = viewedFiles.find((f: any) => f.id === id)
      const extraFile = extraFilesMap.get(id)
      const fileData = viewedFile || extraFile

      if (fileData) {
        const stats = fileStats.get(id)
        mergedFiles.push({
          ...fileData,
          // Prefer activity time if newer, else view time, else modified
          viewedByMeTime: stats?.lastActivity || fileData.viewedByMeTime || fileData.modifiedTime,
          activityCount: stats?.count || 0
        })
      }
    })

    // 5. Custom Sort: Weighted Score? Or just simple sort?
    // User wants "Most Accessed".
    // Let's sort by: Activity Count DESC, then Viewed Time DESC
    return mergedFiles
      .sort((a, b) => {
        const countA = a.activityCount || 0
        const countB = b.activityCount || 0
        if (countA !== countB) return countB - countA // Higher activity first

        const timeA = a.viewedByMeTime ? new Date(a.viewedByMeTime).getTime() : 0
        const timeB = b.viewedByMeTime ? new Date(b.viewedByMeTime).getTime() : 0
        return timeB - timeA // More recent view/activity second
      })
      .slice(0, limit)
      .map((f: any) => ({ ...f, connectorId: connectionId }))
  }


  async getStorageQuota(connectionId: string): Promise<{ limit: string, usage: string, usageInDrive: string, usageInTrash: string } | null> {
    try {
      const connector = await prisma.connector.findUnique({
        where: { id: connectionId }
      })

      if (!connector) return null

      // Refresh token if needed
      let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
      if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
        try {
          accessToken = await this.refreshAccessToken(connectionId)
        } catch (e) {
          logger.error('Failed to refresh token for quota', e as Error)
          return null
        }
      }

      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!response.ok) return null

      const data = await response.json()
      return data.storageQuota || null
    } catch (error) {
      logger.error('Failed to fetch storage quota', error as Error)
      return null
    }
  }

  /**
   * Helper to get or refresh access token
   * Returns decrypted plaintext token for API calls
   */
  public async getAccessToken(connectionId: string): Promise<string | null> {
    try {
      const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
      if (!connector) return null

      if (
        connector.status === ConnectorStatus.REVOKED ||
        connector.status === ConnectorStatus.ERROR
      ) {
        return null
      }

      // Check for lazy re-encryption (key rotation)
      await this.maybeReEncryptTokens(connector)

      const decrypted = connector as ConnectorWithDecrypted
      const refresh = this.getRefreshTokenFromConnector(decrypted)?.trim()
      let access = this.getAccessTokenFromConnector(decrypted)?.trim()
      const expired =
        !connector.tokenExpiresAt || connector.tokenExpiresAt < new Date()

      if ((expired || !access) && refresh) {
        try {
          access = await this.refreshAccessToken(connectionId)
        } catch {
          return null
        }
      }

      if (!access?.trim()) return null
      return access
    } catch (error) {
      logger.error('Failed to get access token', error as Error)
      return null
    }
  }

  /**
   * Moves a file to trash
   */
  async trashFile(connectorId: string, fileId: string): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trashed: true })
      })

      return res.ok
    } catch (error) {
      logger.error('Failed to trash file', error as Error)
      return false
    }
  }

  /**
   * Move a file or folder to a new parent (Drive API: addParents + removeParents).
   */
  async moveFile(connectorId: string, fileId: string, newParentId: string): Promise<{ id: string } | null> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      const getRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!getRes.ok) return null
      const file = await getRes.json()
      const parents = file.parents as string[] | undefined
      if (!parents?.length) return null

      const params = new URLSearchParams({
        addParents: newParentId,
        removeParents: parents.join(','),
        supportsAllDrives: 'true'
      })
      const updateRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?${params}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        }
      )
      if (!updateRes.ok) return null
      const updated = await updateRes.json()
      return { id: updated.id }
    } catch (error) {
      logger.error('Failed to move file', error as Error)
      return null
    }
  }

  /**
   * List direct (non-trashed) children of a folder. Paginated.
   */
  private async listDirectChildFileIds(accessToken: string, parentId: string): Promise<string[]> {
    const ids: string[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q: `'${parentId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id)',
        pageSize: '100',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) break
      const data = await res.json()
      for (const f of data.files || []) {
        if (f.id) ids.push(f.id)
      }
      pageToken = data.nextPageToken
    } while (pageToken)
    return ids
  }

  /**
   * Move every direct child of {@param fromParentId} into {@param toParentId} (workspace root migration).
   * Uses addParents/removeParents so file IDs are preserved for DB references.
   */
  async moveTopLevelChildrenBetweenParents(
    connectionId: string,
    fromParentId: string,
    toParentId: string
  ): Promise<{ moved: number; failures: { id: string; error: string }[] }> {
    const accessToken = await this.getAccessToken(connectionId)
    if (!accessToken) {
      throw new Error('Could not get access token')
    }
    if (fromParentId === toParentId) {
      return { moved: 0, failures: [] }
    }

    const childIds = await this.listDirectChildFileIds(accessToken, fromParentId)
    const failures: { id: string; error: string }[] = []
    let moved = 0

    logger.warn('[drive-migrate] moveTopLevelChildren start', 'GoogleDrive', {
      event: 'drive_migrate_children_start',
      connectionId,
      fromParentId,
      toParentId,
      childCount: childIds.length,
      childIdsPreview: childIds.slice(0, DRIVE_MIGRATE_CHILD_IDS_LOG_MAX),
      childIdsOmitted:
        childIds.length > DRIVE_MIGRATE_CHILD_IDS_LOG_MAX
          ? childIds.length - DRIVE_MIGRATE_CHILD_IDS_LOG_MAX
          : 0,
    })

    for (const fileId of childIds) {
      const params = new URLSearchParams({
        addParents: toParentId,
        removeParents: fromParentId,
        supportsAllDrives: 'true',
      })
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?${params}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      )
      if (!res.ok) {
        const txt = await res.text()
        const parsed = parseDriveApiErrorBodyForLog(txt)
        const fileMeta = await fetchDriveFileMetadataForMigrateLog(accessToken, fileId)
        logger.warn('[drive-migrate] move child PATCH failed', 'GoogleDrive', {
          event: 'drive_migrate_child_patch_failed',
          connectionId,
          fromParentId,
          toParentId,
          fileId,
          httpStatus: res.status,
          googleMessage: parsed.googleMessage,
          googleReasons: parsed.googleReasons,
          responseBodyChars: txt.length,
          responseBody: txt.slice(0, DRIVE_MIGRATE_LOG_BODY_MAX_CHARS),
          fileMetadata: fileMeta,
        })
        failures.push({ id: fileId, error: `${res.status}: ${txt.slice(0, 240)}` })
        continue
      }
      moved++
    }

    if (failures.length > 0) {
      logger.warn('[drive-migrate] moveTopLevelChildren finished with failures', 'GoogleDrive', {
        event: 'drive_migrate_children_partial_failure',
        connectionId,
        fromParentId,
        toParentId,
        moved,
        failureCount: failures.length,
        failedFileIds: failures.map((f) => f.id),
        failureSummaries: failures.map((f) => {
          const colon = f.error.indexOf(':')
          const body = colon >= 0 ? f.error.slice(colon + 1).trim() : f.error
          return { fileId: f.id, ...parseDriveApiErrorBodyForLog(body), httpStatusPrefix: f.error.split(':')[0] }
        }),
      })
    } else if (childIds.length > 0) {
      logger.debug('[drive-migrate] moveTopLevelChildren completed', {
        event: 'drive_migrate_children_success',
        connectionId,
        fromParentId,
        toParentId,
        moved,
        childCount: childIds.length,
      })
    }

    return { moved, failures }
  }

  /**
   * Rename a file or folder in Google Drive (Drive API PATCH with name).
   */
  async renameFile(connectorId: string, fileId: string, newName: string): Promise<{ id: string; name: string } | null> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')
      const trimmed = newName.trim()
      if (!trimmed) return null
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: trimmed })
        }
      )
      if (!res.ok) return null
      const updated = await res.json()
      return { id: updated.id, name: updated.name ?? trimmed }
    } catch (error) {
      logger.error('Failed to rename file', error as Error)
      return null
    }
  }

  /**
   * Update appProperties for a file in Google Drive.
   * These properties are only visible/modifiable by this specific application.
   */
  async updateAppProperties(connectorId: string, fileId: string, properties: Record<string, string>): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            appProperties: properties
          })
        }
      )

      if (!res.ok) {
        const txt = await res.text()
        logger.error(`Failed to update appProperties: ${res.status} ${txt}`)
        return false
      }

      return true
    } catch (error) {
      logger.error('Failed to update appProperties for file:', error as Error)
      return false
    }
  }

  /**
   * Copy a file or folder to a new parent. Returns the new file id or null.
   */
  async copyFile(connectorId: string, fileId: string, parentId: string, name?: string): Promise<{ id: string } | null> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      return this.copyFileWithToken(accessToken, fileId, parentId, name)
    } catch (error) {
      logger.error('Failed to copy file', error as Error)
      return null
    }
  }

  /**
   * Copy a file using a raw access token.
   */
  public async copyFileWithToken(accessToken: string, fileId: string, parentId: string, name?: string): Promise<{ id: string } | null> {
    const body: { parents: string[]; name?: string } = { parents: [parentId] }
    if (name) body.name = name

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    )
    if (!res.ok) {
      const txt = await res.text()
      logger.error(`copyFileWithToken failed: ${res.status} ${txt}`)
      return null
    }
    const created = await res.json()
    return { id: created.id }
  }

  /**
   * Recursively copy a file or folder and all its contents using a raw access token.
   */
  public async recursiveCopy(fileId: string, targetParentId: string, accessToken: string): Promise<any[]> {
    const results: any[] = []

    const process = async (id: string, parentId: string) => {
      // 1. Get Metadata
      const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (!metaRes.ok) return

      const meta = await metaRes.json()

      if (meta.mimeType === 'application/vnd.google-apps.folder') {
        try {
          // 2. If Folder, create it at destination and recurse
          const newFolder = await this.createDriveFile(accessToken, {
            name: meta.name,
            mimeType: meta.mimeType,
            parents: [parentId]
          })
          results.push({ id: newFolder.id, name: newFolder.name, originalId: id, isFolder: true })

          // List children
          const q = `'${id}' in parents and trashed = false`
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          })

          if (listRes.ok) {
            const data = await listRes.json()
            for (const child of (data.files || [])) {
              await process(child.id, newFolder.id)
            }
          }
        } catch (e) {
          logger.error(`Failed to process folder ${id} in recursive copy`, e as Error)
        }
      } else {
        // 3. If File, just copy it
        try {
          const copied = await this.copyFileWithToken(accessToken, id, parentId, meta.name)
          if (copied) {
            results.push({ id: copied.id, name: meta.name, originalId: id, isFolder: false })
          }
        } catch (e) {
          logger.error(`Failed to copy file ${id} in recursive copy`, e as Error)
        }
      }
    }

    await process(fileId, targetParentId)
    return results
  }

  /**
   * Identifies potential duplicate files based on name and size
   */
  async getDuplicateFiles(connectorId: string, limit: number = 20): Promise<any[]> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) return []

      // 1. Fetch recent files (fetch a large batch to increase chance of finding duplicates)
      // fields: need md5Checksum, size, name
      const fields = 'files(id, name, size, md5Checksum, mimeType, modifiedTime, webViewLink, iconLink, parents, permissions, shared)'
      const params = new URLSearchParams({
        pageSize: '500',
        fields: fields,
        orderBy: 'modifiedTime desc', // Check recent files first
        q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'"
      })

      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!res.ok) return []
      const data = await res.json()
      const files = data.files || []

      // 2. Group by Signature (MD5 or Name+Size)
      const groups = new Map<string, any[]>()

      files.forEach((f: any) => {
        // Create a signature
        // specific preference for md5Checksum if available, otherwise name+size
        let signature = ''
        if (f.md5Checksum) {
          signature = f.md5Checksum
        } else if (f.size && f.name) {
          signature = `${f.name}_${f.size}`
        } else {
          return // Skip if no robust way to identify
        }

        if (!groups.has(signature)) {
          groups.set(signature, [])
        }
        groups.get(signature)?.push({
          id: f.id,
          name: f.name,
          size: f.size ? parseInt(f.size) : 0,
          mimeType: f.mimeType,
          modifiedTime: f.modifiedTime,
          webViewLink: f.webViewLink,
          iconLink: f.iconLink,
          badges: this.calculateBadges(f)
        })
      })

      // 3. Filter for groups with > 1 file
      const result: any[] = []
      groups.forEach((groupFiles, signature) => {
        if (groupFiles.length > 1) {
          result.push({
            signature,
            files: groupFiles,
            count: groupFiles.length,
            representativeFile: groupFiles[0], // For UI display
            totalSize: groupFiles.reduce((acc, f) => acc + f.size, 0)
          })
        }
      })

      // Return top duplicate groups by potential savings (total size)
      return result.sort((a, b) => b.totalSize - a.totalSize).slice(0, limit)

    } catch (error) {
      logger.error('Failed to get duplicate files', error as Error)
      return []
    }
  }

  /**
   * Revokes a permission on a file
   */
  async revokePermission(connectorId: string, fileId: string, permissionId: string): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      return res.ok || res.status === 204
    } catch (error) {
      logger.error('Failed to revoke permission', error as Error)
      return false
    }
  }

  /**
   * Updates permission expiration time
   */
  async updatePermissionExpiry(connectorId: string, fileId: string, permissionId: string, expirationTime: string): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      // Must be a date string ISO
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expirationTime })
      })

      return res.ok
    } catch (error) {
      logger.error('Failed to update permission', error as Error)
      return false
    }
  }

  /**
   * Lists permissions on a file (shared drive safe). Used for version lock / unlock.
   */
  async listFilePermissions(
    connectorId: string,
    fileId: string
  ): Promise<Array<{ id: string; role: string; type: string; emailAddress?: string | null; deleted?: boolean }>> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`)
      url.searchParams.set('supportsAllDrives', 'true')
      url.searchParams.set('fields', 'permissions(id,role,type,emailAddress,deleted)')

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data.permissions) ? data.permissions : []
    } catch (error) {
      logger.error('Failed to list file permissions', error as Error, 'GoogleDrive', { fileId })
      return []
    }
  }

  /**
   * PATCH a permission role on a file (e.g. writer → reader for version lock).
   */
  async patchFilePermissionRole(
    connectorId: string,
    fileId: string,
    permissionId: string,
    role: 'reader' | 'writer' | 'commenter' | 'fileOrganizer' | 'organizer'
  ): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`)
      url.searchParams.set('supportsAllDrives', 'true')

      const res = await fetch(url.toString(), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role }),
      })
      return res.ok
    } catch (error) {
      logger.error('Failed to patch file permission role', error as Error, 'GoogleDrive', { fileId, permissionId })
      return false
    }
  }

  /**
   * Sets Drive content restriction read-only on a file (binary / Office; ignored if unsupported).
   */
  async setFileContentReadOnly(connectorId: string, fileId: string, readOnly: boolean): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contentRestrictions: readOnly ? [{ readOnly: true }] : [],
          }),
        }
      )
      return res.ok
    } catch (error) {
      logger.warn('setFileContentReadOnly failed (may be unsupported for this mime type)', {
        fileId,
        message: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Downgrades a user's folder permission from writer-like roles to reader (engagement closure).
   */
  async downgradeFolderUserPermissionToReader(
    connectorId: string,
    folderId: string,
    email: string
  ): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true&fields=permissions(id,emailAddress,role)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!listRes.ok) return false
      const listData = await listRes.json()
      const permissions = listData.permissions || []
      const permission = permissions.find(
        (p: { emailAddress?: string; role?: string }) =>
          p.emailAddress?.toLowerCase() === email.toLowerCase() &&
          ['writer', 'fileOrganizer', 'organizer', 'commenter'].includes(p.role || '')
      )
      if (!permission?.id) return true

      const patchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}/permissions/${permission.id}?supportsAllDrives=true`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role: 'reader' }),
        }
      )
      return patchRes.ok
    } catch (error) {
      logger.error('Failed to downgrade folder user permission', error as Error, 'GoogleDrive', { folderId, email })
      return false
    }
  }

  /**
   * Grants folder permission to a user by email
   * Note: Google Drive automatically inherits permissions - all files/folders under this folder
   * will automatically get the same permissions (both existing and newly created content).
   * No need to manually propagate permissions to children.
   * @param connectorId - The Google Drive connector ID
   * @param folderId - The Google Drive folder ID
   * @param email - The user's email address
   * @param role - The permission role: 'writer' (can_edit), 'reader' (can_view), 'commenter'
   * @returns The permission ID if successful, null otherwise
   */
  async grantFolderPermission(connectorId: string, folderId: string, email: string, role: 'writer' | 'reader' | 'commenter' = 'writer'): Promise<string | null> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'user',
          role: role,
          emailAddress: email
        })
      })

      if (!res.ok) {
        const errorText = await res.text()
        logger.error('Failed to grant folder permission', new Error(`Status: ${res.status} - ${errorText}`), 'GoogleDrive', { folderId, email, role })
        return null
      }

      const data = await res.json()
      // Google Drive automatically applies this permission to all existing and future files/folders under this folder
      return data.id || null
    } catch (error) {
      logger.error('Failed to grant folder permission', error as Error, 'GoogleDrive', { folderId, email, role })
      return null
    }
  }

  /**
   * Grants file permission to a user by email
   * @param connectorId - The Google Drive connector ID
   * @param fileId - The Google Drive file ID
   * @param email - The user's email address
   * @param role - The permission role: 'writer' (can_edit), 'reader' (can_view), 'commenter'
   * @returns The permission ID if successful, null otherwise
   */
  async grantFilePermission(
    connectorId: string,
    fileId: string,
    email: string,
    role: 'writer' | 'reader' | 'commenter' = 'writer',
    emailMessage?: string,
    options: Record<string, string> = {}
  ): Promise<string | null> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      const queryParams = new URLSearchParams({
        supportsAllDrives: 'true',
        ...options
      })

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?${queryParams}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'user',
          role: role,
          emailAddress: email,
          emailMessage: emailMessage
        })
      })

      if (!res.ok) {
        const errorText = await res.text()
        logger.error('Failed to grant file permission', new Error(`Status: ${res.status} - ${errorText}`), 'GoogleDrive', { fileId, email, role, options })
        return null
      }

      const data = await res.json()
      return data.id || null
    } catch (error) {
      logger.error('Failed to grant file permission', error as Error, 'GoogleDrive', { fileId, email, role, options })
      return null
    }
  }


  /**
   * Restricts folder or file permissions to owner only and disables inheritance from parent
   * Removes all permissions except the owner, ensuring strict access control
   * Works for both folders and files
   * @param connectorId - The Google Drive connector ID
   * @param folderId - The Google Drive folder or file ID
   * @returns true if successful, false otherwise
   */
  async restrictFolderToOwnerOnly(connectorId: string, folderId: string): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      // 1. List all permissions to find non-owner permissions
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true&fields=permissions(id,role,type,emailAddress)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!listRes.ok) {
        logger.error('Failed to list folder permissions', new Error(`Status: ${listRes.status}`), 'GoogleDrive', { folderId })
        return false
      }

      const listData = await listRes.json()
      const permissions = listData.permissions || []

      // 2. Remove all permissions except owner
      const removePromises = permissions
        .filter((p: any) => p.role !== 'owner') // Keep owner, remove everything else
        .map((p: any) =>
          fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions/${p.id}?supportsAllDrives=true`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
          })
        )

      await Promise.all(removePromises)

      // Note: Google Drive API doesn't have a direct "inheritFromParent" field
      // By removing all non-owner permissions, we effectively prevent inheritance from parent
      // The folder will only have owner permission, ensuring strict access control

      logger.info('Restricted folder to owner-only access (no inheritance)', 'GoogleDrive', { folderId })
      return true
    } catch (error) {
      logger.error('Failed to restrict folder to owner-only', error as Error, 'GoogleDrive', { folderId })
      return false
    }
  }

  /**
   * Revokes folder permission for a user by email
   * First finds the permission ID by listing permissions, then deletes it
   * @param connectorId - The Google Drive connector ID
   * @param folderId - The Google Drive folder ID
   * @param email - The user's email address
   * @returns true if successful, false otherwise
   */
  async revokeFolderPermissionByEmail(connectorId: string, folderId: string, email: string): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(connectorId)
      if (!accessToken) throw new Error('Could not get access token')

      // First, list permissions to find the one for this email
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true&fields=permissions(id,emailAddress,role)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!listRes.ok) {
        logger.error('Failed to list folder permissions', new Error(`Status: ${listRes.status}`), 'GoogleDrive', { folderId })
        return false
      }

      const listData = await listRes.json()
      const permissions = listData.permissions || []

      // Find permission for this email
      const permission = permissions.find((p: any) => p.emailAddress?.toLowerCase() === email.toLowerCase())

      if (!permission) {
        // Permission doesn't exist, consider it already revoked
        logger.debug('Permission not found for email', 'GoogleDrive', { folderId, emailHash: email ? `${email.substring(0, 3)}***` : 'none' })
        return true
      }

      // Delete the permission
      const deleteRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions/${permission.id}?supportsAllDrives=true`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      return deleteRes.ok || deleteRes.status === 204
    } catch (error) {
      logger.error('Failed to revoke folder permission by email', error as Error, 'GoogleDrive', { folderId, email })
      return false
    }
  }

  /**
   * Fetches stale files (not accessed in > 90 days)
   * Matches the logic used in the Summary card:
   * 1. Fetches samples from Recent, Shared, and Storage
   * 2. Filters in-memory using viewedByMeTime || modifiedTime
   */
  async getStaleFiles(connectionId: string, limit: number = 50): Promise<GoogleDriveFile[]> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')
    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180)
    const sixMonthsAgoIso = sixMonthsAgo.toISOString()

    // Direct Query: "modifiedTime < 90 days ago" (Candidate set)
    // We query modifiedTime because it is always present. viewedByMeTime is optional.
    // if a file was modified > 180 days ago, it *might* be stale.
    // We will THEN filter out any files that were VIEWED recently.
    // ROBUST APPROACH:
    // To match Summary metrics exactly, we fetch a broad set of files (up to 1000)
    // and apply the EXACT same in-memory filter logic as the Summary endpoint.
    logger.debug('[StaleFiles Debug] Fetching sampled files (matching Summary strategy)...')

    // Reuse existing methods to aggregate files (Recent, Shared, Storage)
    // This ensures consistency with the Summary endpoint which uses the same sampling.
    const [recent, shared, sharedByMe, storage] = await Promise.all([
      this.getMostRecentFiles(connectionId, 200, '1y'),
      this.getSharedFiles(connectionId, 200),
      this.getSharedByMeFiles(connectionId, 200),
      this.getStorageFiles(connectionId, 200)
    ])

    // Combine and Deduplicate by ID
    const allFiles = [...recent, ...shared, ...sharedByMe, ...storage]
    const uniqueFilesMap = new Map<string, GoogleDriveFile>()

    // Process candidates
    allFiles.forEach(f => {
      if (!uniqueFilesMap.has(f.id)) {
        uniqueFilesMap.set(f.id, f)
      }
    })
    const candidates = Array.from(uniqueFilesMap.values())
    logger.debug(`[StaleFiles Debug] Aggregated Candidates: ${candidates.length}`)
    logger.debug(`[StaleFiles Debug] Candidates: ${candidates.length}`)

    // Client-side Filter matching Summary Logic:
    // Stale = (viewed || modified) < 180 days ago

    // Explicitly filter candidates to find STALE items
    const files = candidates.filter((f: any) => {
      // Exclude folders from Stale Documents view/counts
      if (f.mimeType === 'application/vnd.google-apps.folder') return false

      const lastAccessedStr = f.viewedByMeTime || f.modifiedTime
      if (!lastAccessedStr) return false

      const lastAccessed = new Date(lastAccessedStr).getTime()
      return lastAccessed < sixMonthsAgo.getTime()
    })
    logger.debug(`[StaleFiles Debug] Final Stale Files: ${files.length}`)

    // Map and resolve Parent Names (batch fetch)
    // 1. Collect Parent IDs
    const parentIds = new Set<string>()
    files.forEach((f: any) => {
      if (f.parents?.[0]) parentIds.add(f.parents[0])
    })

    // 2. Fetch Parent Names
    const parentNameMap = new Map<string, string>()
    if (parentIds.size > 0) {
      try {
        const ids = Array.from(parentIds).slice(0, 200)
        // We only fetch names for up to 200 parents to keep it fast
        const q = ids.map(id => `id = '${id}'`).join(' or ')
        const pParams = new URLSearchParams({
          pageSize: '50',
          fields: 'files(id, name)',
          q: q
        })
        const pRes = await fetch(`https://www.googleapis.com/drive/v3/files?${pParams}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        if (pRes.ok) {
          const pData = await pRes.json()
          pData.files?.forEach((f: any) => parentNameMap.set(f.id, f.name))
        }
      } catch (e) {
        logger.error('Parent Name Fetch Error', e as Error)
      }
    }

    return files.map((f: any) => {
      // Calculate badges - mainly STALE
      const badges = this.calculateBadges(f)

      return {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size,
        webViewLink: f.webViewLink,
        source: 'Google Drive',
        activityTimestamp: f.viewedByMeTime || f.modifiedTime,
        lastAction: 'Stale',
        lastViewedTime: f.viewedByMeTime,
        actorEmail: f.owners?.[0]?.emailAddress,
        owners: f.owners,
        permissions: f.permissions,
        shared: f.shared,
        badges: badges,
        parentName: f.parents?.[0] ? parentNameMap.get(f.parents[0]) : undefined,
        connectorId: connectionId
      } as GoogleDriveFile
    })
  }
  /**
   * Checks if a file/folder is a descendant of a given parent folder ID
   * Uses iterative approach with caching to avoid deep recursion
   * @param connectionId - The Google Drive connector ID
   * @param fileId - The file/folder ID to check
   * @param parentFolderId - The parent folder ID to check against
   * @param visited - Set of visited file IDs to prevent cycles
   * @returns true if file is a descendant of parentFolderId
   */
  private async isFileUnderFolder(
    connectionId: string,
    fileId: string,
    parentFolderId: string,
    visited: Set<string> = new Set()
  ): Promise<boolean> {
    if (fileId === parentFolderId) return true
    if (visited.has(fileId)) return false // Prevent cycles
    visited.add(fileId)

    const fileMetadata = await this.getFileMetadata(connectionId, fileId)
    if (!fileMetadata || !fileMetadata.parents || fileMetadata.parents.length === 0) {
      return false
    }

    // Check if any parent matches
    for (const parentId of fileMetadata.parents) {
      if (parentId === parentFolderId) {
        return true
      }
      // Recursively check parent's parents (with visited set to prevent cycles)
      if (await this.isFileUnderFolder(connectionId, parentId, parentFolderId, visited)) {
        return true
      }
    }

    return false
  }

  /**
   * Batch checks if files are under a parent folder
   * More efficient than checking individually
   */
  private async getFilesUnderFolder(
    connectionId: string,
    files: GoogleDriveFile[],
    parentFolderId: string
  ): Promise<Set<string>> {
    const accessibleFileIds = new Set<string>()
    const visited = new Set<string>()

    // Process files in parallel batches
    const batchSize = 10
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(file => this.isFileUnderFolder(connectionId, file.id, parentFolderId, new Set(visited)))
      )

      results.forEach((hasAccess, index) => {
        if (hasAccess) {
          accessibleFileIds.add(batch[index].id)
        }
      })
    }

    return accessibleFileIds
  }

  async listFiles(
    connectionId: string,
    folderId: string,
    limit: number = 100,
    userEmail?: string,
    projectContext?: {
      projectId: string
      generalFolderId: string | null
      confidentialFolderId: string | null
      personaName: string | null
      personaSlug?: string | null
    } | null
  ): Promise<GoogleDriveFile[]> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')

    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    // Project Lead sees all files — skip permissions and per-file hierarchy filter to reduce Drive response size and getFileMetadata calls
    const isProjectLead = projectContext && (projectContext.personaSlug === 'eng_admin' || (projectContext.personaName?.toLowerCase() === 'engagement lead' || projectContext.personaName?.toLowerCase() === 'project lead'))
    const effectiveUserEmail = isProjectLead ? undefined : userEmail

    // Query: is child of folderId AND not trashed AND respect .appignore (name + nested-under-ignored-folder exclusions)
    const ignoreIds = await this.resolveIgnoreIds(connectionId, accessToken)
    const nameExclusionsList = ignoreParser.getPatterns().map(p => `not name = '${p.replace(/'/g, "\\'")}'`).join(' and ')
    const parentExclusionsList = ignoreIds.map(id => `not '${id.replace(/'/g, "\\'")}' in parents`).join(' and ')
    let q = `'${folderId}' in parents and trashed = false`
    if (nameExclusionsList) q += ` and ${nameExclusionsList}`
    if (parentExclusionsList) q += ` and ${parentExclusionsList}`

    // Fields to retrieve - include parents for folder checks, permissions for user filtering, appProperties for staging folder detection
    const fields = effectiveUserEmail
      ? 'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink, owners, lastModifyingUser, permissions, parents, appProperties)'
      : 'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink, owners, lastModifyingUser, appProperties)'

    const params = new URLSearchParams({
      q,
      fields,
      pageSize: limit.toString(),
      orderBy: 'folder,name', // Folders first, then name
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    })

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!response.ok) {
      // Handle 404 (folder not found) gracefully?
      if (response.status === 404) {
        logger.debug(`[GoogleDrive] Folder not found: ${folderId}`)
        return []
      }
      const errorText = await response.text()
      logger.error(`[GoogleDrive] listFiles failed: ${response.status} - ${errorText}`)
      throw new Error(`Google Drive API error: ${response.status}`)
    }

    const data = await response.json()
    let files = data.files || []

    // Filter out staging folders (hidden from file listings)
    // Check connector settings for staging folder IDs
    const settings = (connector.settings as any) || {}
    const stagingFolderIds = new Set<string>()

    // Collect all staging folder IDs from project settings
    if (settings.projectFolderSettings) {
      Object.values(settings.projectFolderSettings).forEach((projectSettings: any) => {
        if (projectSettings.stagingFolderId) {
          stagingFolderIds.add(projectSettings.stagingFolderId)
        }
      })
    }

    // Filter out staging folders from file browser (.meta and other names come from .appignore via query above)
    files = files.filter((file: GoogleDriveFile) => {
      // Exclude staging folders by ID (primary method)
      if (stagingFolderIds.has(file.id)) {
        logger.debug(`[GoogleDrive] Filtered out staging folder by ID: ${file.name} (${file.id})`)
        return false
      }
      // Also exclude by appProperties if present (for safety)
      if (file.appProperties && file.appProperties.hidden === 'true') {
        logger.debug(`[GoogleDrive] Filtered out hidden folder by appProperties: ${file.name} (${file.id})`)
        return false
      }
      // Fallback: exclude folders named "staging" with the correct appProperties type
      if (file.mimeType === 'application/vnd.google-apps.folder' &&
        file.name.toLowerCase() === 'staging' &&
        file.appProperties?.type === 'project_folder' &&
        file.appProperties?.folderType === 'staging') {
        logger.debug(`[GoogleDrive] Filtered out staging folder by name/appProperties: ${file.name} (${file.id})`)
        return false
      }
      return true
    })

    // Filter files by user permissions if effectiveUserEmail is provided (not Project Lead)
    if (effectiveUserEmail && files.length > 0) {
      const filteredFiles: GoogleDriveFile[] = []

      // Metadata cache: store file metadata to avoid duplicate API calls
      const metadataCache = new Map<string, GoogleDriveFile | null>()

      // Helper to get metadata with caching
      const getCachedMetadata = async (fileId: string): Promise<GoogleDriveFile | null> => {
        if (!metadataCache.has(fileId)) {
          metadataCache.set(fileId, await this.getFileMetadata(connectionId, fileId))
        }
        return metadataCache.get(fileId) || null
      }

      // Optimized hierarchy check with caching
      const isFileUnderFolderCached = async (
        fileId: string,
        parentFolderId: string,
        visited: Set<string> = new Set()
      ): Promise<boolean> => {
        if (fileId === parentFolderId) return true
        if (visited.has(fileId)) return false
        visited.add(fileId)

        const fileMetadata = await getCachedMetadata(fileId)
        if (!fileMetadata || !fileMetadata.parents || fileMetadata.parents.length === 0) {
          return false
        }

        for (const parentId of fileMetadata.parents) {
          if (parentId === parentFolderId) {
            return true
          }
          if (await isFileUnderFolderCached(parentId, parentFolderId, visited)) {
            return true
          }
        }
        return false
      }

      // For eng_admin/eng_member: is the folder we're listing inside general or confidential? (computed once)
      const personaName = projectContext?.personaName
      const personaSlug = projectContext?.personaSlug
      const isProjectLeadPersona = personaName === 'project lead' || personaName === 'engagement lead' || personaSlug === 'eng_admin'
      const isTeamMemberPersona = personaName === 'team member' || personaSlug === 'eng_member'
      let isListingUnderGeneral = false
      let isListingUnderConfidential = false
      if (projectContext && (isProjectLeadPersona || isTeamMemberPersona)) {
        isListingUnderGeneral = folderId === projectContext.generalFolderId ||
          (projectContext.generalFolderId ? await isFileUnderFolderCached(folderId, projectContext.generalFolderId) : false)
        isListingUnderConfidential = folderId === projectContext.confidentialFolderId ||
          (projectContext.confidentialFolderId ? await isFileUnderFolderCached(folderId, projectContext.confidentialFolderId) : false)
      }

      for (const file of files) {
        let hasAccess = false

        // 1. Check if user is the owner
        if (file.owners && Array.isArray(file.owners)) {
          const isOwner = file.owners.some((owner: any) => owner.emailAddress?.toLowerCase() === effectiveUserEmail.toLowerCase())
          if (isOwner) {
            hasAccess = true
            filteredFiles.push(file)
            continue
          }
        }

        // 2. Check explicit permissions on the file
        if (file.permissions && Array.isArray(file.permissions)) {
          const hasExplicitPermission = file.permissions.some((p: any) => {
            if (p.emailAddress && p.emailAddress.toLowerCase() === effectiveUserEmail.toLowerCase()) {
              return true
            }
            if (p.type === 'anyone') {
              return true
            }
            return false
          })

          if (hasExplicitPermission) {
            hasAccess = true
            filteredFiles.push(file)
            continue
          }
        }

        // 3. Check inherited permissions based on persona and folder access
        // eng_admin (Engagement Lead) and eng_member (Team Member) see files in project folders
        if (projectContext && (isProjectLeadPersona || isTeamMemberPersona)) {
          // All files returned are direct children of folderId. Grant access if we're listing
          // the general/confidential folder OR any subfolder under it (e.g. general > Website_Design).
          if (isProjectLeadPersona && (isListingUnderGeneral || isListingUnderConfidential)) {
            hasAccess = true
            filteredFiles.push(file)
            continue
          }
          if (isTeamMemberPersona && isListingUnderGeneral) {
            hasAccess = true
            filteredFiles.push(file)
            continue
          }

          // Nested files (not direct children of folderId) - check if file is under general/confidential
          const isInCurrentFolder = !file.parents || file.parents.length === 0 || file.parents.some((parentId: string) => parentId === folderId)
          if (!isInCurrentFolder) {
            if (isProjectLeadPersona) {
              if (projectContext.generalFolderId && await isFileUnderFolderCached(file.id, projectContext.generalFolderId)) {
                hasAccess = true
                filteredFiles.push(file)
                continue
              }
              if (projectContext.confidentialFolderId && await isFileUnderFolderCached(file.id, projectContext.confidentialFolderId)) {
                hasAccess = true
                filteredFiles.push(file)
                continue
              }
            } else if (isTeamMemberPersona && projectContext.generalFolderId && await isFileUnderFolderCached(file.id, projectContext.generalFolderId)) {
              hasAccess = true
              filteredFiles.push(file)
              continue
            }
          }
        }
        // External Collaborator and Client Contact rely on explicit permissions only

        // 4. If no access found, exclude the file
        if (!hasAccess) {
          logger.debug(`[GoogleDrive] Filtered out file ${file.id} (${file.name}) - no access for user`)
        }
      }

      files = filteredFiles
      logger.debug(`[GoogleDrive] Filtered ${data.files?.length || 0} files to ${files.length} files accessible (persona: ${projectContext?.personaName || 'unknown'}, metadata cache size: ${metadataCache.size})`)
    } else {
      logger.debug(`[GoogleDrive] Listed ${files.length} files for folder ${folderId} using query: ${q}`)
    }

    return files.map((f: any) => ({ ...f, connectorId: connectionId }))
  }


  async getFileMetadata(connectionId: string, fileId: string): Promise<GoogleDriveFile | null> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')
    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,iconLink,parents,permissions,driveId&supportsAllDrives=true`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )
      if (res.ok) {
        const f = await res.json()
        return {
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          modifiedTime: f.modifiedTime,
          webViewLink: f.webViewLink,
          thumbnailLink: f.thumbnailLink,
          iconLink: f.iconLink,
          parents: f.parents,
          permissions: f.permissions,
          driveId: f.driveId ?? null,
          connectorId: connectionId,
        } as GoogleDriveFile
      }
      return null
    } catch (e) {
      logger.error(`Failed to fetch metadata for ${fileId}`, e as Error)
      return null
    }
  }

  async getFilesMetadata(connectionId: string, fileIds: string[]): Promise<GoogleDriveFile[]> {
    if (fileIds.length === 0) return []

    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')
    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    const results = await Promise.all(fileIds.map(async (id) => {
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,size,modifiedTime,webViewLink,parents&supportsAllDrives=true`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        if (res.ok) {
          const f = await res.json()
          return {
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size,
            modifiedTime: f.modifiedTime,
            webViewLink: f.webViewLink,
            parents: f.parents,
            connectorId: connectionId
          } as GoogleDriveFile
        }
        return null
      } catch (e) {
        logger.error(`Failed to fetch metadata for ${id}`, e as Error)
        return null
      }
    }))

    return results.filter((f): f is GoogleDriveFile => f !== null)
  }

  async searchFiles(
    connectionId: string,
    query: string,
    options?: {
      parentFolderIds?: string[],
      limit?: number
    }
  ): Promise<GoogleDriveFile[]> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector) throw new Error('Connection not found')

    let accessToken = this.getAccessTokenFromConnector(connector as ConnectorWithDecrypted)
    if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
      accessToken = await this.refreshAccessToken(connectionId)
    }

    const escapedQuery = query.replace(/'/g, "\\'")
    let q = `(name contains '${escapedQuery}' or fullText contains '${escapedQuery}') and trashed = false`

    // Note: 'in parents' only searches direct children. 
    // For a truly recursive search across a whole project, we might need a different strategy,
    // but for now we look in the primary project folders.
    if (options?.parentFolderIds && options.parentFolderIds.length > 0) {
      const parentQ = options.parentFolderIds.map(id => `'${id}' in parents`).join(' or ')
      q += ` and (${parentQ})`
    }

    const params = new URLSearchParams({
      q,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink, owners, lastModifyingUser, permissions, parents, appProperties)',
      pageSize: (options?.limit || 100).toString(),
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    })

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`[GoogleDrive] searchFiles failed: ${response.status} - ${errorText}`)
      throw new Error(`Google Drive API error: ${response.status}`)
    }

    const data = await response.json()
    return data.files || []
  }
}

export const googleDriveConnector = GoogleDriveConnector.getInstance()
