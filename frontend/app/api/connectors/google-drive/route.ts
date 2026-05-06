import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { config, getGoogleDriveOAuthServerCredentials } from '@/lib/config'
import { METADATA_FOLDER_NAME } from '@/lib/connectors/types'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { userSettingsPlus } from '@/lib/user-settings-plus'
import { safeInngestSend } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'

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

      // Google Drive OAuth scopes
      const scopes = [
        // `drive.file` is sufficient for creating/picking folders in both My Drive and Shared Drives.
        // Limitation: migrating files the user added outside this app (not created via the app) will 403.
        // The migration wizard's error handling already explains this to the user when it occurs.
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.appdata', // Application data folder
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ].join(' ')

      if (!userId) {
        console.error('[google-drive/route] initiate called without userId — aborting OAuth')
        return NextResponse.json({ error: 'userId is required to initiate OAuth' }, { status: 400 })
      }

      // Use state parameter to pass userId, organizationId, next redirect path, and popup flow metadata
      const flow = body.flow === 'popup' ? 'popup' : 'redirect'
      const nonce = flow === 'popup' ? randomBytes(16).toString('hex') : undefined
      const stateObj = {
        userId,
        organizationId: body.organizationId,
        rootFolderId: rootFolderId || null,
        next: body.next || null,
        flow,
        skipAutoFolder: body.skipAutoFolder === true,
        ...(nonce && { nonce }),
        ...(flow === 'popup' && body.openerOrigin && { openerOrigin: body.openerOrigin })
      }
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64')

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
      const { prisma } = require('@/lib/prisma')
      const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
      if (!connector) return NextResponse.json({ error: 'Connector not found' }, { status: 404 })
      const token = await googleDriveConnector.getAccessToken(connectionId)
      if (!token) return NextResponse.json({ error: 'Could not obtain access token' }, { status: 500 })
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
        const { createClient } = require('@supabase/supabase-js')
        const supabase = createClient(
          (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
        userId = user?.id
      }

      const { prisma } = require('@/lib/prisma')
      const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
      let stepOneOrgSlug: string | null = null
      let org = null

      if (connector) {
        org = await prisma.firm.findFirst({ where: { connectorId: connector.id } })
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
        const finalizeOrg = await prisma.firm.findFirst({ where: { connectorId: finalizeConnector.id } })
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
      return NextResponse.json({ ...result, slug: orgSlug })
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
        const { createClient } = require('@supabase/supabase-js')
        const supabase = createClient(
          (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'),
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
        userId = user?.id
      }
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { prisma } = require('@/lib/prisma')
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
      const { createClient } = require('@supabase/supabase-js')
      const supabaseAuth = createClient(
        (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'),
        (process.env.SUPABASE_SERVICE_ROLE_KEY || '')
      )
      const authToken = authHeader.replace('Bearer ', '')
      const { data: { user: rootUser }, error: rootAuthErr } = await supabaseAuth.auth.getUser(authToken)
      if (rootAuthErr || !rootUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { connectionId, rootFolderId: newRootId } = body
      if (!connectionId || !newRootId) {
        return NextResponse.json({ error: 'Missing connectionId or rootFolderId' }, { status: 400 })
      }

      const { prisma } = require('@/lib/prisma')
      const existing = await (prisma as any).connector.findUnique({ where: { id: connectionId } })
      if (!existing || existing.userId !== rootUser.id || existing.type !== 'GOOGLE_DRIVE') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const prevSettings = (existing.settings as any) || {}
      await (prisma as any).connector.update({
        where: { id: connectionId },
        data: {
          settings: {
            ...prevSettings,
            rootFolderId: newRootId,
            parentFolderId: newRootId,
          },
        },
      })

      try {
        await googleDriveConnector.persistWorkspaceRootLocation(connectionId, newRootId)
      } catch {
        // Location can be backfilled on next status fetch
      }

      return NextResponse.json({ success: true })
    }

    if (action === 'create-folder') {
      const { connectionId, name, parentId } = body
      if (!connectionId || !name) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
      }

      const accessToken = await googleDriveConnector.getAccessToken(connectionId)
      if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized/Expired' }, { status: 401 })
      }

      // Create the folder
      const folder = await googleDriveConnector.createDriveFile(accessToken, {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : ['root']
      })

      const { prisma } = require('@/lib/prisma')
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

    if (action === 'migrate-and-update-root') {
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const { createClient } = require('@supabase/supabase-js')
      const supabaseAuth = createClient(
        (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'),
        (process.env.SUPABASE_SERVICE_ROLE_KEY || '')
      )
      const authToken = authHeader.replace('Bearer ', '')
      const { data: { user: migUser }, error: migAuthErr } = await supabaseAuth.auth.getUser(authToken)
      if (migAuthErr || !migUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { connectionId: migConnId, newRootFolderId: migNewRoot, migrateFromRootFolderId } = body
      if (!migConnId || !migNewRoot) {
        return NextResponse.json({ error: 'Missing connectionId or newRootFolderId' }, { status: 400 })
      }

      const { prisma } = require('@/lib/prisma')
      const migExisting = await (prisma as any).connector.findUnique({ where: { id: migConnId } })
      if (!migExisting || migExisting.userId !== migUser.id || migExisting.type !== 'GOOGLE_DRIVE') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const prev = (migExisting.settings as Record<string, unknown>) || {}
      const oldRoot =
        (typeof migrateFromRootFolderId === 'string' && migrateFromRootFolderId) ||
        (typeof prev.rootFolderId === 'string' ? prev.rootFolderId : '')

      let moved = 0
      const failures: { id: string; error: string }[] = []

      if (oldRoot && oldRoot !== migNewRoot) {
        try {
          const result = await googleDriveConnector.moveTopLevelChildrenBetweenParents(
            migConnId,
            oldRoot,
            migNewRoot
          )
          moved = result.moved
          failures.push(...result.failures)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          logger.error(
            '[drive-migrate] migrate-and-update-root: move threw',
            e instanceof Error ? e : new Error(msg),
            'GoogleDrive',
            {
              event: 'drive_migrate_route_exception',
              connectionId: migConnId,
              userId: migUser.id,
              oldRoot,
              newRoot: migNewRoot,
            },
          )
          return NextResponse.json({ error: msg, moved: 0, failures: [] }, { status: 500 })
        }
        if (failures.length > 0) {
          logger.warn('[drive-migrate] migrate-and-update-root: returning 422', 'GoogleDrive', {
            event: 'drive_migrate_route_422',
            connectionId: migConnId,
            userId: migUser.id,
            oldRoot,
            newRoot: migNewRoot,
            moved,
            failureCount: failures.length,
            failedFileIds: failures.map((f) => f.id),
            firstFailureSnippet: failures[0]?.error?.slice(0, 500),
          })
          const errorDetail = driveMoveFailureHint(failures)
          return NextResponse.json(
            {
              error: 'Could not move all items into the new folder. Nothing was changed in the app.',
              errorDetail,
              moved,
              failures,
            },
            { status: 422 }
          )
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
        await googleDriveConnector.persistWorkspaceRootLocation(migConnId, migNewRoot)
      } catch {
        // Backfilled on status if needed
      }

      return NextResponse.json({ success: true, moved })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Google Drive connector error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
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
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    if (action === 'status') {
      const { prisma } = require('@/lib/prisma')
      const connectionIdFilter = searchParams.get('connectionId')

      const baseWhere = { userId: user.id, type: 'GOOGLE_DRIVE', status: 'ACTIVE' as const }
      const connector = connectionIdFilter
        ? await (prisma as any).connector.findFirst({
            where: { ...baseWhere, id: connectionIdFilter },
          })
        : await (prisma as any).connector.findFirst({
            where: baseWhere,
          })

      let rootFolderId = connector ? (connector.settings as any)?.rootFolderId as string | undefined : undefined
      let rootFolderName: string | null = null
      let workspaceRootLocation = connector?.workspaceRootLocation ?? null
      let workspaceRootSharedDriveName = connector?.workspaceRootSharedDriveName ?? null

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
                workspaceRootSharedDriveName = refreshed.workspaceRootSharedDriveName ?? null
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
              workspaceRootSharedDriveName = refreshed.workspaceRootSharedDriveName ?? null
            }
          } catch {
            // Leave null if Drive or token fails
          }
        }
      }

      return NextResponse.json({
        isConnected: !!connector,
        connector: connector
          ? {
              id: connector.id,
              name: connector.name,
              email: (connector.settings as any)?.accountEmail || null,
              externalAccountId: connector.externalAccountId,
              rootFolderId,
              rootFolderName,
              workspaceRootLocation,
              workspaceRootSharedDriveName,
              onboarding: (connector.settings as any)?.onboarding,
            }
          : null,
      })
    }

    if (action === 'token') {
      const { prisma } = require('@/lib/prisma')

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

      if (!accessToken) {
        return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 })
      }

      return NextResponse.json({
        accessToken: accessToken, // Decrypted plaintext token
        connectionId: connector.id,
        clientId: config.googleDrive.clientId
      })
    }

    if (action === 'drives') {
      const { prisma } = require('@/lib/prisma')

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
        if (!accessToken) {
          return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 })
        }

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


