import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { OneDriveConnector } from '@/lib/connectors/onedrive-connector'
import { createOneDriveAdapter } from '@/lib/connectors/adapters/onedrive-adapter'
import { ensureAppFolderStructure, setupFirmFolder } from '@/lib/connectors/pockett-structure.service'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const oneDriveConnector = OneDriveConnector.getInstance()

async function requireUser(request: NextRequest): Promise<{ id: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  return user
}

/**
 * GET ?connectionId=&q= — list SharePoint sites for the site picker, analogous to Google's
 * `action: 'drives'` listing that feeds google-drive-workspace-root.tsx.
 */
export async function GET(request: NextRequest) {
  const user = await requireUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const connectionId = searchParams.get('connectionId')
  const q = searchParams.get('q')?.trim() || '*'
  if (!connectionId) return NextResponse.json({ error: 'connectionId is required' }, { status: 400 })

  // No feature-flag gate — this reads/writes an already-connected connector; the flag only
  // gates creating NEW connections and UI visibility (see 2026-08-05 note in the plan doc).
  const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
  if (!connector || connector.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const token = await oneDriveConnector.getAccessToken(connectionId)
  if (!token) return NextResponse.json({ error: 'Could not obtain access token' }, { status: 500 })

  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Graph sites search returned ${res.status}`)
    const data = await res.json()
    const sites = (data.value || []).map((s: { id: string; name?: string; displayName?: string; webUrl?: string }) => ({
      id: s.id,
      name: s.displayName || s.name || s.webUrl || s.id,
      webUrl: s.webUrl,
    }))
    return NextResponse.json({ sites })
  } catch (e) {
    logger.error('Failed to list SharePoint sites', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ sites: [] })
  }
}

/**
 * POST { connectionId, siteId, siteName } — select a SharePoint site: grants the app
 * Sites.Selected access to that specific site (required before any drive call succeeds,
 * since the app only has Sites.Selected, not Sites.ReadWrite.All — see Phase 3 in the plan),
 * then persists the site's drive as the connector's shared workspace root.
 */
export async function POST(request: NextRequest) {
  // No feature-flag gate — this reads/writes an already-connected connector; the flag only
  // gates creating NEW connections and UI visibility (see 2026-08-05 note in the plan doc).
  const user = await requireUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { connectionId, siteId, siteName, firmId: hintFirmId } = body
  if (!connectionId || !siteId) {
    return NextResponse.json({ error: 'connectionId and siteId are required' }, { status: 400 })
  }

  const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
  if (!connector || connector.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const token = await oneDriveConnector.getAccessToken(connectionId)
  if (!token) return NextResponse.json({ error: 'Could not obtain access token' }, { status: 500 })

  try {
    // Grant this app Sites.Selected access to the chosen site before any drive call.
    const grantRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roles: ['write'],
        grantedToIdentities: [
          {
            application: {
              id: process.env.MICROSOFT_CLIENT_ID,
              displayName: 'Firma Connect',
            },
          },
        ],
      }),
    })
    if (!grantRes.ok) {
      const err = await grantRes.text()
      logger.error(`Failed to grant Sites.Selected permission for site ${siteId}: ${grantRes.status} - ${err}`, new Error(`HTTP ${grantRes.status}`))
      return NextResponse.json({ error: 'Failed to grant site permission' }, { status: 502 })
    }
    const grantData = await grantRes.json()
    const sitePermissionId: string | undefined = grantData.id

    // Resolve the site's default drive id — that's what workspaceRootSharedStorageId stores
    // (mirrors Google Drive's shared-drive-id semantics).
    const driveRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drive?$select=id`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!driveRes.ok) {
      const err = await driveRes.text()
      logger.error(`Failed to resolve drive for site ${siteId}: ${driveRes.status} - ${err}`, new Error(`HTTP ${driveRes.status}`))
      return NextResponse.json({ error: 'Failed to resolve site drive' }, { status: 502 })
    }
    const driveData = await driveRes.json()

    // Resolve the drive's root item id — that's the actual folder id findOrCreateFolder etc.
    // operate against (siteId/driveData.id identify the *drive*, not a folder within it).
    const driveRootRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drive/root?$select=id`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!driveRootRes.ok) {
      const err = await driveRootRes.text()
      logger.error(`Failed to resolve drive root for site ${siteId}: ${driveRootRes.status} - ${err}`, new Error(`HTTP ${driveRootRes.status}`))
      return NextResponse.json({ error: 'Failed to resolve site drive root' }, { status: 502 })
    }
    const driveRootData = await driveRootRes.json()
    const rootFolderId: string = driveRootData.id

    const prevSettings = (connector.settings as Record<string, unknown>) || {}
    const newSettings: Record<string, unknown> = {
      ...prevSettings,
      sitePermissionId,
      rootFolderId,
      parentFolderId: rootFolderId,
    }
    // A new site is a new workspace root — clear derived folder ids so
    // ensureAppFolderStructure resolves fresh folders under it.
    delete newSettings.orgFolderId
    delete newSettings.clientFolderIds
    delete newSettings.projectFolderIds
    delete newSettings.projectFolderSettings
    delete newSettings.organizations

    await prisma.connector.update({
      where: { id: connectionId },
      data: {
        workspaceRootLocation: 'SHARED',
        workspaceRootSharedStorageId: siteId,
        workspaceRootSharedStorageName: siteName ?? null,
        settings: newSettings,
      },
    })

    // Provision firm/client/engagement folder hierarchy in the newly selected site — same
    // logic as the Personal (update-root-folder) path, see that route for the pattern this
    // mirrors.
    try {
      const adapter = createOneDriveAdapter(async () => token)
      let org = await prisma.firm.findFirst({ where: { connectorId: connectionId } })
      if (!org) {
        const linkedClient = await prisma.client.findFirst({ where: { connectorId: connectionId }, select: { firmId: true } })
        if (linkedClient) org = await prisma.firm.findUnique({ where: { id: linkedClient.firmId } })
      }
      if (!org && hintFirmId) {
        org = await prisma.firm.findUnique({ where: { id: hintFirmId } })
      }
      if (org) {
        await setupFirmFolder(connectionId, rootFolderId, adapter, org.id)
        const linkedClient = await prisma.client.findFirst({
          where: { connectorId: connectionId },
          select: { id: true, name: true, slug: true },
        })
        if (linkedClient) {
          await ensureAppFolderStructure(connectionId, linkedClient.name, linkedClient.slug, adapter, org.id)
          const engagements = await prisma.engagement.findMany({
            where: { clientId: linkedClient.id, isDeleted: false, connectorRootFolderId: null },
            select: { id: true, name: true, slug: true },
          })
          for (const eng of engagements) {
            try {
              const engResult = await ensureAppFolderStructure(
                connectionId, linkedClient.name, linkedClient.slug, adapter, org.id,
                { projectName: eng.name, projectSlug: eng.slug }
              )
              if (engResult.projectId) {
                await prisma.engagement.update({
                  where: { id: eng.id },
                  data: { connectorRootFolderId: engResult.projectId },
                })
              }
            } catch (engErr) {
              logger.error('onedrive site select: failed to provision engagement', engErr instanceof Error ? engErr : new Error(String(engErr)), `engagementId:${eng.id}`)
            }
          }
        }
      }
    } catch (provErr) {
      logger.error('onedrive site select: provisioning failed', provErr instanceof Error ? provErr : new Error(String(provErr)))
      // Non-fatal — folder structure can be retried via Migrate
    }

    return NextResponse.json({ success: true, driveId: driveData.id })
  } catch (e) {
    logger.error('SharePoint site selection failed', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'Site selection failed' }, { status: 500 })
  }
}
