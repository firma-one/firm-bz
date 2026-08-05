import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { config, isMicrosoftConnectorEnabledForFirm } from '@/lib/config'
import { OneDriveConnector } from '@/lib/connectors/onedrive-connector'
import { createOneDriveAdapter } from '@/lib/connectors/adapters/onedrive-adapter'
import { ensureAppFolderStructure, setupFirmFolder } from '@/lib/connectors/pockett-structure.service'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

const oneDriveConnector = OneDriveConnector.getInstance()

/**
 * Scopes requested at connect time. Always includes Sites.Selected — Microsoft doesn't have a
 * separate "personal vs shared account" concept the way Google Workspace does (there's one
 * signed-in Microsoft account either way); SharePoint site access is a later, separate choice
 * made via the "Choose folder" wizard (mirrors GoogleDriveWorkspaceRoot's My Drive vs Shared
 * Drive picker, which likewise only appears after the initial OAuth connects), not an upfront
 * fork in the OAuth scope. See Phase 3 scope decision in the plan for why Sites.Selected
 * (not Sites.ReadWrite.All) was chosen.
 *
 * MUST include User.Read explicitly — Microsoft Graph authorizes each call against the scopes
 * actually present in the issued token (`scp` claim), not against what's merely consented on
 * the app registration. GET /me requires User.Read in that token regardless of admin-consent
 * status in the portal; omitting it here caused Authorization_RequestDenied on the callback's
 * /me call even with Sites.Selected fully consented (confirmed via live testing 2026-08-05).
 *
 * Files.ReadWrite (not .All): the workspace root folder is created directly under the user's
 * Personal OneDrive root (`/me/drive/root`), not nested under the special AppFolder — so
 * Files.ReadWrite.AppFolder isn't viable without restructuring folder creation, but
 * Files.ReadWrite.All is over-broad (grants every OneDrive/SharePoint site the user can access,
 * not just their own Personal drive) and actively undermines Sites.Selected's per-site
 * restriction for the Shared path, since Graph honors the broadest scope present in the token
 * regardless of Sites.Selected also being present (confirmed 2026-08-06, matches Google's own
 * least-privilege `drive.file` scope choice — see app/api/connectors/google-drive/route.ts).
 * Files.ReadWrite covers the signed-in user's own Personal OneDrive only; Sites.Selected
 * continues to gate the Shared/SharePoint path via explicit per-site grants.
 */
const CONNECT_SCOPES = ['openid', 'profile', 'email', 'User.Read', 'Files.ReadWrite', 'Sites.Selected', 'offline_access']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, userId, email, connectionId } = body

    if (action === 'initiate') {
      if (!(await isMicrosoftConnectorEnabledForFirm(body.organizationId))) {
        return NextResponse.json({ error: 'not_enabled' }, { status: 404 })
      }
      const clientId = config.onedrive.clientId
      if (!clientId) {
        return NextResponse.json({ error: 'Microsoft client ID not configured' }, { status: 500 })
      }
      if (!userId) {
        return NextResponse.json({ error: 'userId is required to initiate OAuth' }, { status: 400 })
      }

      const flow = body.flow === 'popup' ? 'popup' : 'redirect'
      const nonce = flow === 'popup' ? randomBytes(16).toString('hex') : undefined
      const stateObj = {
        userId,
        organizationId: body.organizationId,
        ...(body.clientId && { clientId: body.clientId }),
        next: body.next || null,
        flow,
        skipAutoFolder: body.skipAutoFolder === true,
        ...(body.replaceConnectorId && { replaceConnectorId: body.replaceConnectorId }),
        ...(body.friendlyName && { friendlyName: body.friendlyName }),
        ...(nonce && { nonce }),
        ...(flow === 'popup' && body.openerOrigin && { openerOrigin: body.openerOrigin }),
      }
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64')

      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', config.onedrive.redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('response_mode', 'query')
      authUrl.searchParams.set('scope', CONNECT_SCOPES.join(' '))
      // Always force consent to ensure we get a refresh token and the correct scope set.
      authUrl.searchParams.set('prompt', 'consent')
      authUrl.searchParams.set('state', state)
      if (email) authUrl.searchParams.set('login_hint', email)

      const response: { authUrl: string; state: string; nonce?: string } = { authUrl: authUrl.toString(), state }
      if (nonce) response.nonce = nonce
      return NextResponse.json(response)
    }

    // Find-or-create a folder by name inside a parent (default: OneDrive root).
    // Idempotent, mirrors google-drive's 'ensure-folder' action.
    if (action === 'ensure-folder') {
      // No feature-flag gate — this operates on an already-connected connector; the flag only
      // gates creating NEW connections and UI visibility, not already-linked connectors (see
      // 2026-08-05 note in the plan doc).
      const { connectionId: ensureConnId, name, parentId } = body
      if (!ensureConnId || !name) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
      }
      const accessToken = await oneDriveConnector.getAccessToken(ensureConnId)
      if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized/Expired' }, { status: 401 })
      }
      const adapter = createOneDriveAdapter(async () => accessToken)
      const connector = await prisma.connector.findUnique({ where: { id: ensureConnId } })
      const rootParentId = parentId || (connector?.workspaceRootLocation === 'SHARED' ? undefined : 'root')
      if (!rootParentId) {
        return NextResponse.json({ error: 'A parent folder is required for shared (SharePoint) connections' }, { status: 400 })
      }
      const folderId = await adapter.findOrCreateFolder(ensureConnId, rootParentId, name)
      return NextResponse.json({ folderId })
    }

    if (action === 'update-root-folder') {
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const supabaseAuth = createSupabaseAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      )
      const { data: { user: rootUser }, error: rootAuthErr } = await supabaseAuth.auth.getUser(authHeader.replace('Bearer ', ''))
      if (rootAuthErr || !rootUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { connectionId: rootConnId, rootFolderId: rawRootId, firmId: hintFirmId } = body
      const newRootId: string | undefined =
        rawRootId && typeof rawRootId === 'object' && 'id' in rawRootId
          ? (rawRootId as { id: string }).id
          : typeof rawRootId === 'string' ? rawRootId : undefined
      if (!rootConnId || !newRootId) {
        return NextResponse.json({ error: 'Missing connectionId or rootFolderId' }, { status: 400 })
      }

      const existing = await prisma.connector.findUnique({ where: { id: rootConnId } })
      if (!existing || existing.userId !== rootUser.id || existing.type !== 'ONEDRIVE') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      // No feature-flag gate — operates on an already-connected connector (see ensure-folder above).

      const prevSettings = (existing.settings as Record<string, unknown>) || {}
      const prevRootId = prevSettings.rootFolderId as string | undefined
      const workspaceChanged = !!prevRootId && prevRootId !== newRootId

      // When the workspace root changes, all derived folder IDs are stale — clear them
      // so ensureAppFolderStructure resolves fresh folders under the new workspace.
      const newSettings: Record<string, unknown> = {
        ...prevSettings,
        rootFolderId: newRootId,
        parentFolderId: newRootId,
      }
      if (workspaceChanged) {
        delete newSettings.orgFolderId
        delete newSettings.clientFolderIds
        delete newSettings.projectFolderIds
        delete newSettings.projectFolderSettings
        delete newSettings.organizations
      }

      await prisma.connector.update({
        where: { id: rootConnId },
        data: { settings: newSettings },
      })

      // Provision firm/client/engagement folder hierarchy after workspace root is set —
      // mirrors google-drive's update-root-folder action exactly (pockett-structure.service
      // is already provider-agnostic, built against IConnectorStorageAdapter).
      try {
        const accessToken = await oneDriveConnector.getAccessToken(rootConnId)
        if (accessToken) {
          const adapter = createOneDriveAdapter(async () => accessToken)
          let org = await prisma.firm.findFirst({ where: { connectorId: rootConnId } })
          if (!org) {
            const linkedClient = await prisma.client.findFirst({
              where: { connectorId: rootConnId },
              select: { firmId: true },
            })
            if (linkedClient) org = await prisma.firm.findUnique({ where: { id: linkedClient.firmId } })
          }
          if (!org && hintFirmId) {
            org = await prisma.firm.findUnique({ where: { id: hintFirmId } })
          }
          if (org) {
            const firm = await prisma.firm.findUnique({ where: { id: org.id }, select: { firmFolderId: true } })
            if (!firm?.firmFolderId || workspaceChanged) {
              await setupFirmFolder(rootConnId, newRootId, adapter, org.id)
            }
            const linkedClient = await prisma.client.findFirst({
              where: { connectorId: rootConnId },
              select: { id: true, name: true, slug: true },
            })
            if (linkedClient) {
              await ensureAppFolderStructure(rootConnId, linkedClient.name, linkedClient.slug, adapter, org.id)
              const engagements = await prisma.engagement.findMany({
                where: { clientId: linkedClient.id, isDeleted: false, connectorRootFolderId: null },
                select: { id: true, name: true, slug: true },
              })
              for (const eng of engagements) {
                try {
                  const engResult = await ensureAppFolderStructure(
                    rootConnId, linkedClient.name, linkedClient.slug, adapter, org.id,
                    { projectName: eng.name, projectSlug: eng.slug }
                  )
                  if (engResult.projectId) {
                    await prisma.engagement.update({
                      where: { id: eng.id },
                      data: { connectorRootFolderId: engResult.projectId },
                    })
                  }
                } catch (engErr) {
                  logger.error('onedrive update-root-folder: failed to provision engagement', engErr instanceof Error ? engErr : new Error(String(engErr)), `engagementId:${eng.id}`)
                }
              }
              logger.info('onedrive update-root-folder: provisioned hierarchy', { connectionId: rootConnId, orgId: org.id, clientId: linkedClient.id })
            }
          }
        }
      } catch (provErr) {
        logger.error('onedrive update-root-folder: provisioning failed', provErr instanceof Error ? provErr : new Error(String(provErr)))
        // Non-fatal — folder structure can be retried
      }

      return NextResponse.json({ success: true })
    }

    if (action === 'folder-breadcrumb') {
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const bcSupabase = createSupabaseAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      )
      const bcUser = await bcSupabase.auth.getUser(authHeader.slice(7))
      if (!bcUser?.data?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const { connectionId: bcConnId, folderId: bcFolderId } = body
      if (!bcConnId || !bcFolderId) {
        return NextResponse.json({ error: 'Missing connectionId or folderId' }, { status: 400 })
      }
      const bcConnector = await prisma.connector.findUnique({ where: { id: bcConnId } })
      if (!bcConnector || bcConnector.userId !== bcUser.data.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      // No feature-flag gate — operates on an already-connected connector (see ensure-folder above).
      try {
        const { getMigrationAdapter } = await import('@/lib/connectors/registry')
        const migAdapter = await getMigrationAdapter(bcConnId)
        const path = await migAdapter.getFolderBreadcrumb(bcConnId, bcFolderId)
        return NextResponse.json({ path })
      } catch {
        return NextResponse.json({ path: [] })
      }
    }

    if (action === 'test') {
      // No feature-flag gate — operates on an already-connected connector (see ensure-folder above).
      if (!connectionId) {
        return NextResponse.json({ error: 'Connection ID required' }, { status: 400 })
      }
      const token = await oneDriveConnector.getAccessToken(connectionId)
      if (!token) return NextResponse.json({ success: false, error: 'Could not obtain access token' })
      const res = await fetch('https://graph.microsoft.com/v1.0/me/drive?$select=id', {
        headers: { Authorization: `Bearer ${token}` },
      })
      return NextResponse.json({ success: res.ok, status: res.status })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('OneDrive connector error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const supabase = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (action === 'status') {
      const connectionIdFilter = searchParams.get('connectionId')
      const connector = connectionIdFilter
        ? await prisma.connector.findFirst({ where: { userId: user.id, type: 'ONEDRIVE', id: connectionIdFilter } })
        : await prisma.connector.findFirst({ where: { userId: user.id, type: 'ONEDRIVE', status: 'ACTIVE' } })

      const rootFolderId = connector ? (connector.settings as Record<string, unknown> | null)?.rootFolderId as string | undefined : undefined
      let rootFolderName: string | null = null
      if (connector && rootFolderId) {
        try {
          const adapter = createOneDriveAdapter(async (id) => {
            const t = await oneDriveConnector.getAccessToken(id)
            if (!t) throw new Error('Could not get access token')
            return t
          })
          rootFolderName = await adapter.getFolderName(connector.id, rootFolderId)
        } catch {
          rootFolderName = null
        }
      }

      return NextResponse.json({
        isConnected: !!connector && connector.status === 'ACTIVE',
        connector: connector
          ? {
              id: connector.id,
              name: connector.name,
              email: (connector.settings as Record<string, unknown> | null)?.accountEmail ?? null,
              externalAccountId: connector.externalAccountId,
              rootFolderId,
              rootFolderName,
              workspaceRootLocation: connector.workspaceRootLocation,
              workspaceRootSharedStorageName: connector.workspaceRootSharedStorageName,
            }
          : null,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('OneDrive connector status check failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
