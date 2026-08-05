/**
 * Microsoft OneDrive/SharePoint connector.
 * Implements IConnectorInstance so the registry can resolve ONEDRIVE without hardcoding.
 * Mirrors GoogleDriveConnector's storeConnection/refreshAccessToken/getAccessToken shape —
 * see .claude/plans/connector-microsoft-impl.md Phase 2 for the design this was built from.
 *
 * SharePoint is modeled as a sub-mode of ConnectorType.ONEDRIVE (mode: 'personal' | 'shared'),
 * not a separate connector type — WorkspaceRootLocation.PERSONAL/SHARED plus
 * workspaceRootSharedStorageId/Name (the SharePoint site's Graph drive id/name) carry the
 * distinction, exactly parallel to how Google Drive already uses these fields for My
 * Drive vs Shared Drive.
 */

import { prisma } from '@/lib/prisma'
import { Connector, ConnectorStatus, ConnectorType, WorkspaceRootLocation } from '@prisma/client'
import { getMicrosoftOAuthServerCredentials } from '@/lib/config'
import { logger } from '@/lib/logger'
import type { IConnectorInstance } from './registry'
import type { ConnectorConnection } from './registry'

const GRAPH_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'

/** Thrown when OneDrive token refresh fails; API routes map this to 401/503. */
export class OneDriveAuthError extends Error {
  readonly reconnectRequired: boolean
  constructor(message: string, opts?: { reconnectRequired?: boolean }) {
    super(message)
    this.name = 'OneDriveAuthError'
    this.reconnectRequired = !!opts?.reconnectRequired
  }
}

// Type for connector with decrypted virtual fields from the Prisma extension.
type ConnectorWithDecrypted = Connector & {
  accessTokenDecrypted: string
  refreshTokenDecrypted: string | null
}

export class OneDriveConnector implements IConnectorInstance {
  private static _instance: OneDriveConnector | null = null

  static getInstance(): OneDriveConnector {
    if (!OneDriveConnector._instance) {
      OneDriveConnector._instance = new OneDriveConnector()
    }
    return OneDriveConnector._instance
  }

  private getAccessTokenFromConnector(c: ConnectorWithDecrypted): string {
    return c.accessTokenDecrypted
  }

  private getRefreshTokenFromConnector(c: ConnectorWithDecrypted): string | null {
    return c.refreshTokenDecrypted
  }

  /**
   * Upsert a Connector row for a OneDrive/SharePoint connection. Dedupes on
   * (type, userId, externalAccountId) — mirrors GoogleDriveConnector.storeConnection.
   */
  async storeConnection(
    organizationId: string | undefined,
    userId: string,
    externalAccountId: string,
    name: string,
    accessToken: string,
    refreshToken: string,
    tokenExpiresAt: Date,
    accountEmail?: string,
    clientId?: string,
    mode: 'personal' | 'shared' = 'personal',
    sharedStorageId?: string,
    sharedStorageName?: string,
  ): Promise<Connector> {
    const trimmedEmail = accountEmail?.trim()
    const workspaceRootLocation = mode === 'shared' ? WorkspaceRootLocation.SHARED : WorkspaceRootLocation.PERSONAL

    // Pass plaintext tokens — Prisma extension handles encryption automatically.
    const updateData: Record<string, unknown> = {
      name,
      accessToken,
      tokenExpiresAt,
      status: ConnectorStatus.ACTIVE,
      workspaceRootLocation,
      workspaceRootSharedStorageId: mode === 'shared' ? (sharedStorageId ?? null) : null,
      workspaceRootSharedStorageName: mode === 'shared' ? (sharedStorageName ?? null) : null,
      updatedAt: new Date(),
    }
    if (refreshToken) {
      updateData.refreshToken = refreshToken
    }

    const mergeSettings = (prev: Record<string, unknown> | undefined) => {
      const next = { ...(prev || {}) }
      let touched = false
      if (trimmedEmail) {
        next.accountEmail = trimmedEmail
        touched = true
      }
      return touched ? next : undefined
    }

    const existingConnector = await prisma.connector.findFirst({
      where: { type: ConnectorType.ONEDRIVE, userId, externalAccountId },
    })

    if (existingConnector) {
      const mergedSettings = mergeSettings((existingConnector.settings as Record<string, unknown>) || undefined)
      const updatePayload: Record<string, unknown> = { ...updateData }
      if (mergedSettings) updatePayload.settings = mergedSettings
      if (organizationId) updatePayload.firmId = organizationId
      const updated = await prisma.connector.update({
        where: { id: existingConnector.id },
        data: updatePayload,
      })
      if (clientId) {
        await prisma.client.update({ where: { id: clientId }, data: { connectorId: existingConnector.id } })
      }
      return updated
    }

    const initialSettings = mergeSettings(undefined) ?? {}
    const newConnector = await prisma.connector.create({
      data: {
        type: ConnectorType.ONEDRIVE,
        userId,
        externalAccountId,
        name,
        accessToken,
        refreshToken: refreshToken || '',
        tokenExpiresAt,
        status: ConnectorStatus.ACTIVE,
        workspaceRootLocation,
        workspaceRootSharedStorageId: mode === 'shared' ? (sharedStorageId ?? null) : null,
        workspaceRootSharedStorageName: mode === 'shared' ? (sharedStorageName ?? null) : null,
        settings: initialSettings,
        ...(organizationId && { firmId: organizationId }),
        createdBy: userId,
        updatedBy: userId,
      },
    })
    if (clientId) {
      await prisma.client.update({ where: { id: clientId }, data: { connectorId: newConnector.id } })
    }
    return newConnector
  }

  /**
   * Refresh the access token via Microsoft's v2.0 token endpoint. Refresh tokens have a
   * 90-day sliding lifetime (each use rotates in a new one) — see Phase 1a step 11.
   * On invalid_grant/interaction_required, marks the connector EXPIRED so the UI prompts
   * reconnection, same pattern as GoogleDriveConnector.refreshAccessToken.
   */
  async refreshAccessToken(connectionId: string): Promise<string> {
    const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
    if (!connector || !connector.refreshToken) {
      throw new Error('No refresh token available')
    }

    const refreshToken = this.getRefreshTokenFromConnector(connector as ConnectorWithDecrypted)
    if (!refreshToken) {
      throw new Error('Failed to get refresh token')
    }

    const { clientId, clientSecret } = getMicrosoftOAuthServerCredentials()

    const response = await fetch(GRAPH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`OneDrive token refresh failed: ${response.status} ${errorText}`)

      let oauthError: string | undefined
      try {
        oauthError = (JSON.parse(errorText) as { error?: string }).error
      } catch {
        /* ignore */
      }

      if (oauthError === 'invalid_grant' || oauthError === 'interaction_required') {
        await prisma.connector.update({ where: { id: connectionId }, data: { status: ConnectorStatus.EXPIRED } })
        throw new OneDriveAuthError(
          'Refresh token is invalid or expired. Please reconnect your OneDrive/SharePoint account.',
          { reconnectRequired: true }
        )
      }

      throw new Error(`Failed to refresh OneDrive token: ${response.status} - ${errorText}`)
    }

    const tokens = await response.json()
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000)

    const data: { accessToken: string; tokenExpiresAt: Date; status: ConnectorStatus; refreshToken?: string } = {
      accessToken: tokens.access_token,
      tokenExpiresAt: newExpiry,
      status: ConnectorStatus.ACTIVE,
    }
    // Microsoft rotates refresh tokens on each use — persist the new one when returned.
    if (tokens.refresh_token) data.refreshToken = tokens.refresh_token

    await prisma.connector.update({ where: { id: connectionId }, data })
    return tokens.access_token
  }

  async getAccessToken(connectionId: string): Promise<string | null> {
    try {
      const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
      if (!connector) return null

      if (connector.status === ConnectorStatus.REVOKED || connector.status === ConnectorStatus.ERROR) {
        return null
      }

      const decrypted = connector as ConnectorWithDecrypted
      const refresh = this.getRefreshTokenFromConnector(decrypted)?.trim()
      let access = this.getAccessTokenFromConnector(decrypted)?.trim()
      const expired = !connector.tokenExpiresAt || connector.tokenExpiresAt < new Date()

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
      logger.error('Failed to get OneDrive access token', error as Error)
      return null
    }
  }

  async getConnections(firmId: string): Promise<ConnectorConnection[]> {
    const connectors = await prisma.connector.findMany({
      where: { firmId, type: ConnectorType.ONEDRIVE },
      orderBy: { createdAt: 'asc' },
    })
    return connectors.map((c) => {
      const settings = (c.settings || {}) as { accountEmail?: string }
      const email = settings.accountEmail?.trim() || c.externalAccountId
      return {
        id: c.id,
        type: c.type,
        email,
        name: c.name ?? '',
        connectedAt: c.createdAt.toISOString().split('T')[0],
        status: c.status,
        lastSyncAt: c.lastSyncAt?.toISOString(),
      }
    })
  }

  async disconnectConnection(connectionId: string): Promise<void> {
    await prisma.connector.update({
      where: { id: connectionId },
      data: { status: ConnectorStatus.REVOKED, accessToken: '', refreshToken: null, tokenExpiresAt: null },
    })
  }

  /**
   * @deprecated Bypasses FK cleanup — use removeConnector() from lib/actions/connectors,
   * same convention as GoogleDriveConnector.
   */
  async removeConnection(_connectionId: string): Promise<void> {
    throw new Error('[OneDriveConnector.removeConnection] Bypassed — use removeConnector() from lib/actions/connectors.')
  }

  async getFileMetadata(connectionId: string, itemId: string): Promise<{ id: string; name: string; parents?: string[] } | null> {
    const token = await this.getAccessToken(connectionId)
    if (!token) return null
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}?select=id,name,parentReference`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return { id: data.id, name: data.name, parents: data.parentReference?.id ? [data.parentReference.id] : undefined }
  }
}

export function getOneDriveConnectorInstance(): IConnectorInstance {
  return OneDriveConnector.getInstance()
}
