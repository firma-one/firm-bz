import { NextRequest, NextResponse } from 'next/server'
import { checkConnectTargetRights, getManageableConnector, getRequestUser, isFirmAdmin } from '@/lib/connectors/connector-access'
import { signOAuthState } from '@/lib/connectors/oauth-state'
import { randomBytes } from 'crypto'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { config, getGoogleDriveOAuthServerCredentials } from '@/lib/config'
import { METADATA_FOLDER_NAME } from '@/lib/connectors/types'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { ensureAppFolderStructure, setupFirmFolder } from '@/lib/connectors/pockett-structure.service'
import { createGoogleDriveAdapter } from '@/lib/connectors/adapters/google-drive-adapter'
import { getMigrationAdapter } from '@/lib/connectors/registry'
import { userSettingsPlus } from '@/lib/user-settings-plus'
import { safeInngestSend } from '@/lib/inngest/client'
import { setMigrationPending } from '@/lib/firm-maintenance'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { findFirmForConnector } from '@/lib/connectors/connector-firm'
import { asStorageFailure, folderStepFailure, reconnectFailure, storageFailureResponse } from '@/lib/connectors/folder-step-failure'
import { getActiveMigration } from '@/lib/firm-maintenance'

/** "Folder set, but…": the workspace folder was saved, a folder step inside it wasn't. */
function folderSetupWarning(reason: string): string {
  return `Folder set, but the firm's folders couldn't be created inside it · ${reason}`
}

/** Migrate refusals: nothing was changed, and why. */
function migrationRefused(reason: string, status: number, code?: string) {
  return NextResponse.json(
    { error: `Migration couldn't start. Your files and folder are unchanged · ${reason}`, ...(code ? { code } : {}) },
    { status }
  )
}

/** Parse first Drive API error body from `moveTopLevelChildrenBetweenParents` failure entries. */
function driveMoveFailureHint(failures: { id: string; error: string }[]): string | undefined {
  const raw = failures[0]?.error
  if (!raw) return undefined
  const colon = raw.indexOf(':')
  const body = colon >= 0 ? raw.slice(colon + 1).trim() : raw
  try {
    const j = JSON.parse(body) as {
      error?: { message?: string; errors?: { message?: string }[] }
    }
    const m = j.error?.message || j.error?.errors?.[0]?.message
    return m || raw.slice(0, 280)
  } catch {
    return raw.slice(0, 280)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, userId, email, connectionId, rootFolderId } = body

    // Every action except `initiate` works on an existing connector named by `connectionId`. A
    // connector id is not a secret, so check the caller may manage that connector — its owner, a
    // firm admin of its firm, or a manager of a client using it — before any action runs. Unknown
    // actions fall through this gate too. (.claude/plans/access-gates.md, P0 #3)
    if (action !== 'initiate') {
      const caller = await getRequestUser(request)
      if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (!(await getManageableConnector(caller.id, body.connectionId))) {
        return NextResponse.json({ error: 'Connector not found' }, { status: 404 })
      }
      if (action === 'repair-org-folder' && !(await isFirmAdmin(caller.id, body.organizationId))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (action === 'initiate') {
      // Generate OAuth URL for Google Drive
      const clientId = config.googleDrive.clientId
      const redirectUri = config.googleDrive.redirectUri

      if (!clientId) {
        return NextResponse.json(
          { error: 'Google Drive client ID not configured' },
          { status: 500 }
        )
      }

      try {
        getGoogleDriveOAuthServerCredentials()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: msg }, { status: 500 })
      }

      // Google Drive OAuth scopes. `openid` added 2026-08-06 solely to get an id_token back
      // with the `hd` (hosted domain) claim — lets us detect personal Gmail vs. Google
      // Workspace accounts to skip the My Drive/Shared Drive choice for personal accounts
      // (mirrors the OneDrive `tid`-claim fix, see .claude/plans/connector-microsoft-impl.md
      // item 9/10, 2026-08-06). Does not change Drive access scope — drive.file/drive.appdata
      // are unaffected.
      const scopes = [
        'openid',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.appdata',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ].join(' ')

      // The connection belongs to whoever is signed in — never to a userId in the body — and the
      // state is signed so the callback can trust it. Rights on what it will be attached to are
      // checked here and again at the callback. (.claude/plans/access-gates.md, P0 #4)
      const initiator = await getRequestUser(request)
      if (!initiator) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const rightsError = await checkConnectTargetRights(initiator.id, body)
      if (rightsError) return NextResponse.json({ error: rightsError }, { status: 403 })

      // Use state parameter to pass userId, organizationId, next redirect path, and popup flow metadata
      const flow = body.flow === 'popup' ? 'popup' : 'redirect'
      const nonce = flow === 'popup' ? randomBytes(16).toString('hex') : undefined
      // declaredAccountType (2026-08-19) — upfront Personal/Work-School answer from the new
      // AccountTypeDialog, carried through state. Does NOT currently branch `scopes` above — no
      // Google scope requires Workspace admin consent today, confirmed via research — unlike
      // OneDrive, this field has no scope-selection effect here. It DOES still override
      // isPersonalAccount at callback time (callback/route.ts) the same way OneDrive's does — the
      // declared answer is authoritative there, not merely a fallback input to detection — which
      // in turn drives GoogleDriveWorkspaceRoot's existing auto-skip of the My Drive/Shared Drive
      // picker. See .claude/plans/connector-microsoft-impl.md, item 20.
      const declaredAccountType = body.declaredAccountType === 'personal' ? 'personal' : 'work_school'
      const stateObj = {
        userId: initiator.id,
        organizationId: body.organizationId,
        ...(body.clientId && { clientId: body.clientId }),
        rootFolderId: rootFolderId || null,
        next: body.next || null,
        flow,
        skipAutoFolder: body.skipAutoFolder === true,
        ...(body.replaceConnectorId && { replaceConnectorId: body.replaceConnectorId }),
        ...(body.friendlyName && { friendlyName: body.friendlyName }),
        ...(nonce && { nonce }),
        ...(flow === 'popup' && body.openerOrigin && { openerOrigin: body.openerOrigin }),
        declaredAccountType,
      }
      const state = signOAuthState(stateObj)

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', scopes)
      authUrl.searchParams.set('access_type', 'offline')
      // Always force consent to ensure we get a Refresh Token and new scopes
      authUrl.searchParams.set('prompt', 'consent')
      authUrl.searchParams.set('state', state)

      // If email is provided, add login_hint for quick account selection
      if (email) {
        authUrl.searchParams.set('login_hint', email)
      }

      const response: { authUrl: string; state: string; nonce?: string } = {
        authUrl: authUrl.toString(),
        state
      }
      if (nonce) response.nonce = nonce
      return NextResponse.json(response)
    }

    if (action === 'ensure-my-drive-workspace') {
      if (!connectionId) {
        return NextResponse.json({ error: 'Connection ID required' }, { status: 400 })
      }
      const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
      if (!connector) return NextResponse.json({ error: 'Connector not found' }, { status: 404 })
      const token = await googleDriveConnector.getAccessToken(connectionId)
      if (!token) return storageFailureResponse(reconnectFailure('Google Drive'))
      await googleDriveConnector.ensureDefaultWorkspaceRoot(connectionId, token)
      return NextResponse.json({ ok: true })
    }

    if (action === 'test') {
      if (!connectionId) {
        return NextResponse.json({ error: 'Connection ID required' }, { status: 400 })
      }
      const result = await googleDriveConnector.testConnection(connectionId)
      return NextResponse.json(result)
    }

    if (action === 'finalize') {
      const { connectionId, parentFolderId } = body
      if (!connectionId || !parentFolderId) {
        return NextResponse.json({ error: 'Missing required params' }, { status: 400 })
      }

      let userId: string | undefined
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const supabase = createSupabaseAdmin(
          (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
        userId = user?.id
      }

      const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
      let stepOneOrgSlug: string | null = null
      let org = null

      if (connector) {
        // The connector's own firm, then the firm of a client using it (not legacy Firm.connectorId).
        org = await findFirmForConnector(connector.id)
        stepOneOrgSlug = org?.slug ?? null
      }

      const detected = await googleDriveConnector.detectExistingStructure(connectionId, parentFolderId)
      const importRootId = detected.importRootFolderId ?? parentFolderId
      let result: { rootId: string, orgId: string, slug?: string }
      if (detected.detected && userId) {
        result = await googleDriveConnector.importStructureFromDrive(connectionId, importRootId, userId, stepOneOrgSlug)
      } else if (org && userId) {
        result = await googleDriveConnector.setupOrgFolder(connectionId, parentFolderId, org.id, userId)
      } else {
        return NextResponse.json({ error: 'Organization or User session not found for setup' }, { status: 400 })
      }

      let orgSlug: string | null = result.slug ?? null
      if (!orgSlug && org) {
        orgSlug = org.slug
      }

      // Provision client folder + all existing engagement folders for the linked client
      let finalizeWarning: string | undefined
      if (org && connector) {
        try {
          const linkedClient = await prisma.client.findFirst({
            where: { connectorId: connector.id },
            select: { id: true, name: true, slug: true }
          })
          if (linkedClient) {
            const accessToken = await googleDriveConnector.getAccessToken(connector.id)
            if (!accessToken) throw reconnectFailure('Google Drive')
            const driveAdapter = createGoogleDriveAdapter(async () => accessToken)
            await ensureAppFolderStructure(connector.id, linkedClient.name, linkedClient.slug, driveAdapter, org.id)
            logger.info('finalize: provisioned client folder', { clientId: linkedClient.id, connectorId: connector.id })

            const engagements = await prisma.engagement.findMany({
              where: { clientId: linkedClient.id, isDeleted: false, connectorRootFolderId: null },
              select: { id: true, name: true, slug: true }
            })
            const engagementFailures: string[] = []
            for (const eng of engagements) {
              try {
                const engResult = await ensureAppFolderStructure(
                  connector.id, linkedClient.name, linkedClient.slug, driveAdapter, org.id,
                  { projectName: eng.name, projectSlug: eng.slug }
                )
                if (engResult.projectId) {
                  await prisma.engagement.update({
                    where: { id: eng.id },
                    data: { connectorRootFolderId: engResult.projectId }
                  })
                  logger.info('finalize: provisioned engagement folder', { engagementId: eng.id })
                }
              } catch (engErr) {
                logger.error('finalize: failed to provision engagement folder', engErr instanceof Error ? engErr : new Error(String(engErr)), `engagementId:${eng.id}`)
                engagementFailures.push(`${eng.name} (${folderStepFailure(engErr, 'Google Drive').message})`)
              }
            }
            if (engagementFailures.length > 0) {
              finalizeWarning = `Folder set, but ${engagementFailures.length} of ${engagements.length} engagement folders couldn't be created · ${engagementFailures.join('; ')}`
            }
          }
        } catch (provErr) {
          logger.error('finalize: failed to provision client/engagement folders', provErr instanceof Error ? provErr : new Error(String(provErr)))
          // The folder is set; say the client's folders weren't made, rather than a silent success.
          finalizeWarning = folderSetupWarning(folderStepFailure(provErr, 'Google Drive').message)
        }
      }

      if (org) {
        orgSlug = org.slug
        if (connectionId) {
          const finalizeConnector = await (prisma as any).connector.findUnique({ where: { id: connectionId } })
          if (finalizeConnector) {
            const currentSettings = (finalizeConnector.settings as any) || {}
            await (prisma as any).connector.update({
              where: { id: connectionId },
              data: {
                settings: {
                  ...currentSettings,
                  onboarding: {
                    ...currentSettings.onboarding,
                    currentStep: 2,
                    isComplete: false,
                    driveConnected: true,
                    lastUpdated: new Date().toISOString()
                  }
                }
              }
            })
          }
        }
      }

      if (userId) {
        userSettingsPlus.invalidateUser(userId)
      }

      // Trigger Project Index Scan after successful setup
      // We prioritize the orgFolderId and any doc folders found in settings
      const finalizeConnector = await (prisma as any).connector.findUnique({ where: { id: connectionId } })
      if (finalizeConnector) {
        const finalizeOrg = await findFirmForConnector(finalizeConnector.id)
        if (finalizeOrg) {
          const settings = (finalizeConnector.settings as any) || {}
          const rootFolderIds: string[] = []
          if (settings.orgFolderId) rootFolderIds.push(settings.orgFolderId)

          // Also include project-specific folders if they were imported/detected
          if (settings.projectFolderSettings) {
            Object.values(settings.projectFolderSettings).forEach((ps: any) => {
              if (ps.generalFolderId) rootFolderIds.push(ps.generalFolderId)
              if (ps.confidentialFolderId) rootFolderIds.push(ps.confidentialFolderId)
              if (ps.stagingFolderId) rootFolderIds.push(ps.stagingFolderId)
            })
          }

          if (rootFolderIds.length > 0) {
            await safeInngestSend('project.index.scan.requested', {
              organizationId: finalizeOrg.id,
              connectorId: finalizeConnector.id,
              rootFolderIds: Array.from(new Set(rootFolderIds)) // deduplicate
            })
          }
        }
      }

      if (userId) {
        userSettingsPlus.invalidateUser(userId)
      }
      return NextResponse.json({ ...result, slug: orgSlug, ...(finalizeWarning ? { warning: finalizeWarning } : {}) })
    }

    if (action === 'repair-org-folder') {
      // Retroactively create the Drive folder for an org whose folder was created in the wrong location
      // (e.g. inside .pockett instead of beside it). Reads parentFolderId from connector.settings.
      const { connectionId, organizationId } = body
      if (!connectionId || !organizationId) {
        return NextResponse.json({ error: 'Missing connectionId or organizationId' }, { status: 400 })
      }

      let userId: string | undefined
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const supabase = createSupabaseAdmin(
          (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'),
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
        userId = user?.id
      }
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
      if (!connector) {
        return NextResponse.json({ error: 'Connector not found' }, { status: 404 })
      }

      const parentFolderId = await googleDriveConnector.resolveWorkspaceRootFolderId(connectionId)

      const result = await googleDriveConnector.setupOrgFolder(connectionId, parentFolderId, organizationId, userId)
      return NextResponse.json({ success: true, orgFolderId: result.orgId })
    }

    if (action === 'update-root-folder') {
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const supabaseAuth = createSupabaseAdmin(
        (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'),
        (process.env.SUPABASE_SERVICE_ROLE_KEY || '')
      )
      const authToken = authHeader.replace('Bearer ', '')
      const { data: { user: rootUser }, error: rootAuthErr } = await supabaseAuth.auth.getUser(authToken)
      if (rootAuthErr || !rootUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { connectionId, rootFolderId: rawRootId, firmId: hintFirmId } = body
      // Guard against accidentally receiving a picker result object instead of a plain ID string
      const newRootId: string | undefined =
        rawRootId && typeof rawRootId === 'object' && 'id' in rawRootId
          ? (rawRootId as { id: string }).id
          : typeof rawRootId === 'string' ? rawRootId : undefined
      if (!connectionId || !newRootId) {
        return NextResponse.json({ error: 'Missing connectionId or rootFolderId' }, { status: 400 })
      }

      const existing = await (prisma as any).connector.findUnique({ where: { id: connectionId } })
      if (!existing || existing.userId !== rootUser.id || existing.type !== 'GOOGLE_DRIVE') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const prevSettings = (existing.settings as any) || {}
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

      await (prisma as any).connector.update({
        where: { id: connectionId },
        data: { settings: newSettings },
      })

      try {
        await googleDriveConnector.persistWorkspaceRootLocation(connectionId, newRootId)
      } catch {
        // Location can be backfilled on next status fetch
      }

      // Provision firm/client/engagement folder hierarchy after workspace root is set. The root is
      // saved either way; a failure here answers success with a `warning` the dialog shows, since
      // nothing retries it and engagements would later fail on "Organization folder not configured".
      let rootWarning: string | undefined
      try {
        const accessToken = await googleDriveConnector.getAccessToken(connectionId)
        if (!accessToken) {
          rootWarning = folderSetupWarning(reconnectFailure('Google Drive').message)
        } else {
          const driveAdapter = createGoogleDriveAdapter(async () => accessToken)
          // Find firm: the connector's own firm, then a client's, then the explicit firmId hint
          let org = await findFirmForConnector(connectionId)
          // The hint is caller-supplied: only follow it into a firm the caller administers, or
          // they could set up folders (and firm.firmFolderId) in any firm.
          if (!org && hintFirmId && (await isFirmAdmin(rootUser.id, hintFirmId))) {
            org = await prisma.firm.findUnique({ where: { id: hintFirmId } })
          }
          if (org) {
            // Always run setupFirmFolder when workspace root changes, or when THIS connector's
            // own orgFolderId was never set — checking firm.firmFolderId here was wrong: it's a
            // single column shared across every connector a firm has (a firm can have both a
            // Google and a OneDrive connector), so it could be non-null from a *different*
            // connector's setup and cause this connector's own setupFirmFolder to be skipped.
            if (!prevSettings.orgFolderId || workspaceChanged) {
              await setupFirmFolder(connectionId, newRootId, driveAdapter, org.id)
            }
            // Provision client folder + engagements
            const linkedClient = await prisma.client.findFirst({
              where: { connectorId: connectionId },
              select: { id: true, name: true, slug: true }
            })
            if (linkedClient) {
              await ensureAppFolderStructure(connectionId, linkedClient.name, linkedClient.slug, driveAdapter, org.id)
              const engagements = await prisma.engagement.findMany({
                where: { clientId: linkedClient.id, isDeleted: false, connectorRootFolderId: null },
                select: { id: true, name: true, slug: true }
              })
              const engagementFailures: string[] = []
              for (const eng of engagements) {
                try {
                  const engResult = await ensureAppFolderStructure(
                    connectionId, linkedClient.name, linkedClient.slug, driveAdapter, org.id,
                    { projectName: eng.name, projectSlug: eng.slug }
                  )
                  if (engResult.projectId) {
                    await prisma.engagement.update({
                      where: { id: eng.id },
                      data: { connectorRootFolderId: engResult.projectId }
                    })
                  }
                } catch (engErr) {
                  logger.error('update-root-folder: failed to provision engagement', engErr instanceof Error ? engErr : new Error(String(engErr)), `engagementId:${eng.id}`)
                  engagementFailures.push(`${eng.name} (${folderStepFailure(engErr, 'Google Drive').message})`)
                }
              }
              if (engagementFailures.length > 0) {
                rootWarning = `Folder set, but ${engagementFailures.length} of ${engagements.length} engagement folders couldn't be created · ${engagementFailures.join('; ')}`
              }
              logger.info('update-root-folder: provisioned hierarchy', { connectionId, orgId: org.id, clientId: linkedClient.id })
            }
          }
        }
      } catch (provErr) {
        logger.error('update-root-folder: provisioning failed', provErr instanceof Error ? provErr : new Error(String(provErr)))
        rootWarning = folderSetupWarning(folderStepFailure(provErr, 'Google Drive').message)
      }

      return NextResponse.json({ success: true, ...(rootWarning ? { warning: rootWarning } : {}) })
    }

    if (action === 'create-folder') {
      const { connectionId, name, parentId } = body
      if (!connectionId || !name) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
      }

      const accessToken = await googleDriveConnector.getAccessToken(connectionId)
      if (!accessToken) return storageFailureResponse(reconnectFailure('Google Drive'))

      // Create the folder
      const folder = await googleDriveConnector.createDriveFile(accessToken, {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : ['root']
      })

      const existing = await prisma.connector.findUnique({ where: { id: connectionId } })
      const prevSettings = (existing?.settings as Record<string, unknown>) || {}
      await prisma.connector.update({
        where: { id: connectionId },
        data: {
          settings: {
            ...prevSettings,
            rootFolderId: folder.id,
            parentFolderId: folder.id,
          },
        },
      })

      try {
        await googleDriveConnector.persistWorkspaceRootLocation(connectionId, folder.id)
      } catch {
        // Backfilled on status if needed
      }

      return NextResponse.json({ success: true, folderId: folder.id })
    }

    // Find-or-create a folder by name inside a parent (default: My Drive root).
    // Idempotent — reuses existing folder if one already exists with that name.
    // Does NOT update connector settings — caller handles the returned folderId.
    if (action === 'ensure-folder') {
      const { connectionId, name, parentId } = body
      if (!connectionId || !name) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
      }
      const accessToken = await googleDriveConnector.getAccessToken(connectionId)
      if (!accessToken) return storageFailureResponse(reconnectFailure('Google Drive'))
      const folderId = await (googleDriveConnector as any).findOrCreateFolder(
        accessToken,
        name,
        parentId ? [parentId] : ['root'],
      )
      return NextResponse.json({ folderId })
    }

    // Lists _firma folders already known for this connector's Google account (from prior Shared
    // Drive setups on other connectors), verified still live — powers one-click reuse instead of
    // the picker on repeat setups (Phase 2 of the Shared Drive redesign).
    if (action === 'list-known-firma-folders') {
      const { connectionId } = body
      if (!connectionId) {
        return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 })
      }
      const knownFolders = await googleDriveConnector.listKnownFirmaFolders(connectionId)
      return NextResponse.json({ knownFolders })
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
      try {
        const path = await googleDriveConnector.getFolderBreadcrumb(bcConnId, bcFolderId)
        return NextResponse.json({ path })
      } catch (e) {
        return NextResponse.json({ path: [] })
      }
    }

    if (action === 'estimate-migration') {
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const { connectionId: estConnId } = body
      if (!estConnId) {
        return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 })
      }
      const estConnector = await (prisma as any).connector.findUnique({ where: { id: estConnId } })
      if (estConnector && estConnector.type !== 'GOOGLE_DRIVE') {
        return NextResponse.json({ error: 'estimate-migration is only supported for Google Drive connectors' }, { status: 400 })
      }
      if (!estConnector) return NextResponse.json({ error: 'Connector not found' }, { status: 404 })
      const estSettings = (estConnector.settings as any) || {}
      const estRootId: string = estSettings.rootFolderId || ''
      if (!estRootId) return NextResponse.json({ itemCount: 0, estimatedMinutes: 1 })
      const estToken = await googleDriveConnector.getAccessToken(estConnId)
      if (!estToken) return storageFailureResponse(reconnectFailure('Google Drive'))
      const params = new URLSearchParams({
        q: `'${estRootId}' in parents and trashed = false`,
        fields: 'files(id,mimeType)',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      })
      // Only the top level is counted. Folders inside hold more, so the estimate is then a minimum,
      // and a count that couldn't be taken is no estimate at all (it used to read "about 1 minute").
      let itemCount: number | null = null
      let folderCount = 0
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
          headers: { Authorization: `Bearer ${estToken}` },
        })
        if (res.ok) {
          const data = await res.json()
          const files: { mimeType?: string }[] = data.files || []
          itemCount = files.length
          folderCount = files.filter((f) => f.mimeType === 'application/vnd.google-apps.folder').length
        } else {
          logger.warn('estimate-migration: listing the workspace folder failed', { status: res.status })
        }
      } catch (e) {
        logger.warn('estimate-migration: listing the workspace folder failed', { message: e instanceof Error ? e.message : String(e) })
      }
      if (itemCount == null) {
        return NextResponse.json({ itemCount: null, estimatedMinutes: null, atLeast: false })
      }
      const estimatedMinutes = itemCount <= 50 ? 1 : itemCount <= 200 ? 3 : itemCount <= 500 ? 8 : 15
      return NextResponse.json({ itemCount, estimatedMinutes, atLeast: folderCount > 0 || itemCount >= 1000 })
    }

    if (action === 'migrate-and-update-root') {
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const supabaseAuth = createSupabaseAdmin(
        (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'),
        (process.env.SUPABASE_SERVICE_ROLE_KEY || '')
      )
      const authToken = authHeader.replace('Bearer ', '')
      const { data: { user: migUser }, error: migAuthErr } = await supabaseAuth.auth.getUser(authToken)
      if (migAuthErr || !migUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { connectionId: migConnId, newRootFolderId: migNewRoot, migrateFromRootFolderId, estimatedMinutes: bodyEstMinutes, graceMinutes: bodyGraceMinutes } = body
      if (!migConnId || !migNewRoot) {
        return NextResponse.json({ error: 'Missing connectionId or newRootFolderId' }, { status: 400 })
      }
      // "Start now" vs "Notify members and start in 15 minutes" — clamped again here (the Inngest
      // job also clamps) since this value is only ever used for the setMigrationPending banner
      // signal at this layer, not the actual sleep duration.
      const graceMinutes = Math.min(Math.max(Number(bodyGraceMinutes) || 2, 2), 60)

      const migExisting = await (prisma as any).connector.findUnique({ where: { id: migConnId } })
      if (!migExisting || migExisting.userId !== migUser.id || migExisting.type !== 'GOOGLE_DRIVE') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const prev = (migExisting.settings as Record<string, unknown>) || {}
      const oldRoot =
        (typeof migrateFromRootFolderId === 'string' && migrateFromRootFolderId) ||
        (typeof prev.rootFolderId === 'string' ? prev.rootFolderId : '')
      const willMigrate = Boolean(oldRoot && oldRoot !== migNewRoot)

      // Check everything before the root is repointed: once it is, Location names the new folder,
      // and a migration that never runs leaves every file behind in the old one (CN-1).
      let firm: Awaited<ReturnType<typeof findFirmForConnector>> = null
      if (willMigrate) {
        firm = await findFirmForConnector(migConnId)
        if (!firm) {
          return migrationRefused("This connection isn't linked to a firm yet.", 409, 'no_firm')
        }
        if (await getActiveMigration(firm.id)) {
          return migrationRefused('A migration is already under way for this firm. Wait for it to finish.', 409, 'already_running')
        }
        if (!(await googleDriveConnector.getAccessToken(migConnId))) {
          const f = reconnectFailure('Google Drive')
          return migrationRefused(f.message, f.status, f.reason)
        }
      }

      const restoreRoot = async () => {
        await (prisma as any).connector.update({ where: { id: migConnId }, data: { settings: prev } })
        if (typeof prev.rootFolderId === 'string' && prev.rootFolderId) {
          try {
            const migAdapter = await getMigrationAdapter(migConnId)
            await migAdapter.persistWorkspaceRootLocation(migConnId, prev.rootFolderId)
          } catch {
            // Backfilled on status if needed
          }
        }
      }

      await (prisma as any).connector.update({
        where: { id: migConnId },
        data: {
          settings: {
            ...prev,
            rootFolderId: migNewRoot,
            parentFolderId: migNewRoot,
          },
        },
      })

      try {
        const migAdapter = await getMigrationAdapter(migConnId)
        await migAdapter.persistWorkspaceRootLocation(migConnId, migNewRoot)
      } catch {
        // Backfilled on status if needed
      }

      if (willMigrate && firm) {
        const estimatedMinutes = typeof bodyEstMinutes === 'number' ? bodyEstMinutes : 5
        try {
          await setMigrationPending(firm.id, {
            initiatedAt: new Date().toISOString(),
            estimatedStartMinutes: graceMinutes,
            initiatedBy: migUser.id,
          })
        } catch (e) {
          logger.error('migrate-and-update-root: could not mark the migration pending', e instanceof Error ? e : new Error(String(e)), `firmId:${firm.id}`)
          await restoreRoot()
          return migrationRefused("Couldn't record the migration. Try again in a minute.", 500)
        }
        const sent = await safeInngestSend('workspace.migrate.requested', {
          connectionId: migConnId,
          newRootFolderId: migNewRoot,
          oldRootFolderId: oldRoot,
          firmId: firm.id,
          organizationId: firm.id,
          initiatingUserId: migUser.id,
          estimatedMinutes,
          startedAt: new Date().toISOString(),
          graceMinutes,
        })
        // `false` when the job couldn't be queued (logged by safeInngestSend). Read loosely so this
        // also holds while an older safeInngestSend still answers void.
        if ((sent as unknown) === false) {
          await restoreRoot()
          await setMigrationPending(firm.id, null).catch(() => undefined)
          return migrationRefused("The background job that moves your files couldn't be queued. Try again in a minute.", 503, 'not_queued')
        }
      }

      return NextResponse.json({ ok: true, async: willMigrate, estimatedMinutes: bodyEstMinutes ?? 5 })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    // A folder step Drive refused says why ("…doesn't have permission…", "…out of storage space…").
    const storage = asStorageFailure(error, 'Google Drive')
    if (storage) {
      logger.warn('Google Drive connector action refused by Drive', { message: error instanceof Error ? error.message : String(error), reason: storage.reason })
      return storageFailureResponse(storage)
    }
    logger.error('Google Drive connector error', error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json(
      { error: 'Something went wrong on our side. Try again.' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // Get user from authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // We need the user ID to check the default org
    const supabase = createSupabaseAdmin(
      (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    if (action === 'status') {
      const connectionIdFilter = searchParams.get('connectionId')

      const baseWhere = { userId: user.id, type: 'GOOGLE_DRIVE', status: 'ACTIVE' as const }
      // When a specific connectionId is requested, fetch regardless of status so name/email
      // are available for REVOKED connectors (token invalid but metadata still present).
      const connector = connectionIdFilter
        ? await (prisma as any).connector.findFirst({
            where: { userId: user.id, type: 'GOOGLE_DRIVE', id: connectionIdFilter },
          })
        : await (prisma as any).connector.findFirst({
            where: baseWhere,
          })

      if (!connector && connectionIdFilter) {
        // userId mismatch — fetch without userId to diagnose
        const connectorRaw = await (prisma as any).connector.findUnique({ where: { id: connectionIdFilter }, select: { userId: true, status: true } })
        logger.warn('[status] connector not found by userId+id', { sessionUserId: user.id, connectorUserId: connectorRaw?.userId, status: connectorRaw?.status, connectionIdFilter })
      }

      let rootFolderId = connector ? (connector.settings as any)?.rootFolderId as string | undefined : undefined
      let rootFolderName: string | null = null
      let workspaceRootLocation = connector?.workspaceRootLocation ?? null
      let workspaceRootSharedStorageName = connector?.workspaceRootSharedStorageName ?? null

      if (connector && rootFolderId) {
        try {
          const meta = await googleDriveConnector.getFileMetadata(connector.id, rootFolderId)
          rootFolderName = meta?.name ?? null

          // Heal legacy bug: setupFirmFolder stored `.meta` folder id as rootFolderId instead of workspace folder.
          if (meta?.name === METADATA_FOLDER_NAME && meta.parents?.[0]) {
            const workspaceFolderId = meta.parents[0]
            const prevSettings = (connector.settings as Record<string, unknown>) || {}
            await (prisma as any).connector.update({
              where: { id: connector.id },
              data: {
                settings: {
                  ...prevSettings,
                  rootFolderId: workspaceFolderId,
                  parentFolderId: workspaceFolderId,
                },
              },
            })
            rootFolderId = workspaceFolderId
            const parentMeta = await googleDriveConnector.getFileMetadata(connector.id, workspaceFolderId)
            rootFolderName = parentMeta?.name ?? null
            try {
              await googleDriveConnector.persistWorkspaceRootLocation(connector.id, workspaceFolderId)
              const refreshed = await (prisma as any).connector.findUnique({
                where: { id: connector.id },
              })
              if (refreshed) {
                workspaceRootLocation = refreshed.workspaceRootLocation ?? null
                workspaceRootSharedStorageName = refreshed.workspaceRootSharedStorageName ?? null
              }
            } catch {
              // optional
            }
          }
        } catch {
          rootFolderName = null
        }

        if (workspaceRootLocation == null && rootFolderId) {
          try {
            await googleDriveConnector.persistWorkspaceRootLocation(connector.id, rootFolderId)
            const refreshed = await (prisma as any).connector.findUnique({
              where: { id: connector.id },
            })
            if (refreshed) {
              workspaceRootLocation = refreshed.workspaceRootLocation ?? null
              workspaceRootSharedStorageName = refreshed.workspaceRootSharedStorageName ?? null
            }
          } catch {
            // Leave null if Drive or token fails
          }
        }
      }

      return NextResponse.json({
        isConnected: !!connector && connector.status === 'ACTIVE',
        connector: connector
          ? {
              id: connector.id,
              name: connector.name,
              email: (connector.settings as any)?.accountEmail || null,
              isPersonalAccount: (connector.settings as any)?.isPersonalAccount ?? null,
              accountTypeMismatch: (connector.settings as any)?.accountTypeMismatch ?? false,
              detectedIsPersonalAccount: (connector.settings as any)?.detectedIsPersonalAccount ?? null,
              externalAccountId: connector.externalAccountId,
              rootFolderId,
              rootFolderName,
              workspaceRootLocation,
              workspaceRootSharedStorageName,
              onboarding: (connector.settings as any)?.onboarding,
            }
          : null,
      })
    }

    if (action === 'token') {

      // Query connector directly by userId
      const connector = await (prisma as any).connector.findFirst({
        where: { userId: user.id, type: 'GOOGLE_DRIVE', status: 'ACTIVE' }
      })

      if (!connector) {
        return NextResponse.json({ error: 'No active connection' }, { status: 404 })
      }

      // Return token (refresh if needed is handled by connector normally, but here we just need raw token. 
      // Ideally we use a helper to ensure validity.
      // Let's use a quick inline check or call a helper if accessible.
      // Since we can't easily call instance method from here without initializing, let's just return what we have.
      // The Picker handles auth errors usually by re-prompting? No, we need a valid token.
      // Let's rely on the client refreshing OR duplicate refresh logic here? 
      // Better: Use the Connector class instance.

      // Use getAccessToken which handles refresh and decryption
      const accessToken = await googleDriveConnector.getAccessToken(connector.id)

      if (!accessToken) return storageFailureResponse(reconnectFailure('Google Drive'))

      return NextResponse.json({
        accessToken: accessToken, // Decrypted plaintext token
        connectionId: connector.id,
        clientId: config.googleDrive.clientId,
        email: (connector.settings as any)?.accountEmail || null,
      })
    }

    if (action === 'drives') {

      // Query connector directly by userId
      const connector = await (prisma as any).connector.findFirst({
        where: { userId: user.id, type: 'GOOGLE_DRIVE', status: 'ACTIVE' }
      })

      if (!connector || !connector.accessToken) {
        return NextResponse.json({ error: 'No active connection' }, { status: 404 })
      }

      // Fetch Drives from Google - decrypt token first
      try {
        const accessToken = await googleDriveConnector.getAccessToken(connector.id)
        if (!accessToken) return storageFailureResponse(reconnectFailure('Google Drive'))

        const driveRes = await fetch('https://www.googleapis.com/drive/v3/drives?pageSize=10', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        })

        if (!driveRes.ok) {
          // If 401, we might need refresh but assuming fresh based on flow
          throw new Error(`Google API returned ${driveRes.status}`)
        }

        const data = await driveRes.json()
        return NextResponse.json({ drives: data.drives || [] })

      } catch (e: any) {
        console.error("Failed to list drives", e)
        return NextResponse.json({ drives: [] }) // Return empty on fail rather than 500 to keep UI usable
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Connector status check failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


