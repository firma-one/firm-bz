import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { OneDriveConnector } from '@/lib/connectors/onedrive-connector'
import { createOneDriveAdapter } from '@/lib/connectors/adapters/onedrive-adapter'
import { ensureAppFolderStructure, setupFirmFolder } from '@/lib/connectors/pockett-structure.service'
import { generateWorkspaceFolderName } from '@/lib/generate-unique-workspace-folder-name'
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
  const q = searchParams.get('q')?.trim() || ''
  if (!connectionId) return NextResponse.json({ error: 'connectionId is required' }, { status: 400 })

  // No feature-flag gate — this reads/writes an already-connected connector; the flag only
  // gates creating NEW connections and UI visibility (see 2026-08-05 note in the plan doc).
  const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
  if (!connector || connector.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const token = await oneDriveConnector.getAccessToken(connectionId)
  if (!token) return NextResponse.json({ error: 'Could not obtain access token' }, { status: 500 })

  // Graph's /sites?search= endpoint is a keyword-search index, but empirically (confirmed
  // 2026-08-06 against a real tenant) a literal `*` query does return the tenant's full site
  // list rather than zero results — despite this not being documented "list all sites"
  // behavior. Use `*` as the default when the user hasn't typed a query yet.
  //
  // No $select here: `webTemplate` is not a selectable property on microsoft.graph.site via
  // this endpoint (confirmed 2026-08-06 — Graph returns 400 BadRequest "Could not find a
  // property named 'webTemplate' on type 'microsoft.graph.site'"), so system-site filtering
  // below is name-pattern-only, not webTemplate-based.
  const graphUrl = `https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(q || '*')}`

  // Microsoft 365 auto-provisions several system/default sites per tenant (the root
  // Communication Site, a generic "Pages"/"Designer" site, Viva Engage community sites, the
  // tenant's "All Company" hub, etc.) that clutter a "pick your SharePoint site" picker meant
  // for sites the org actually created for work. There's no reliable API flag for this, so we
  // filter heuristically on known name patterns — best-effort, not guaranteed to catch every
  // tenant's defaults, but removes the common ones seen in testing (2026-08-06).
  const SYSTEM_NAME_PATTERNS = [
    /^communication site$/i,
    /^pages$/i,
    /^designer$/i,
    /^all company$/i,
    /^viva engage/i,
    /^group for /i,
    /do not delete/i,
  ]
  const isSystemSite = (name: string) => SYSTEM_NAME_PATTERNS.some(re => re.test(name))

  try {
    const res = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await res.text()
      logger.error(`Graph sites request failed: ${res.status} - ${err}`, new Error(`HTTP ${res.status}`))
      return NextResponse.json({ error: 'Failed to list SharePoint sites', detail: err }, { status: 502 })
    }
    const data = await res.json()
    const sites = (data.value || [])
      .map((s: { id: string; name?: string; displayName?: string; webUrl?: string }) => ({
        id: s.id,
        name: s.displayName || s.name || s.webUrl || s.id,
        webUrl: s.webUrl,
      }))
      .filter((s: { name: string }) => !isSystemSite(s.name))
    return NextResponse.json({ sites })
  } catch (e) {
    logger.error('Failed to list SharePoint sites', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'Failed to list SharePoint sites' }, { status: 502 })
  }
}

/**
 * POST { connectionId, siteId, siteName } — select a SharePoint site: resolves the site's
 * drive directly using Sites.Read.All + Files.ReadWrite.All (both already granted for
 * ongoing OneDrive access) and persists it as the connector's shared workspace root. No
 * Sites.Selected/permissions-grant step — confirmed 2026-08-06 that Files.ReadWrite.All
 * already authorizes read/write against /sites/{id}/drive directly, so the old
 * POST /sites/{id}/permissions bootstrap (which itself required Sites.FullControl.All,
 * unreachable for non-admin end users) is unnecessary. See connector-microsoft-impl.md.
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

    // Resolve the drive's root item id — driveRootId is the actual folder id findOrCreateFolder
    // etc. operate against (siteId/driveData.id identify the *drive*, not a folder within it).
    const driveRootRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drive/root?$select=id`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!driveRootRes.ok) {
      const err = await driveRootRes.text()
      logger.error(`Failed to resolve drive root for site ${siteId}: ${driveRootRes.status} - ${err}`, new Error(`HTTP ${driveRootRes.status}`))
      return NextResponse.json({ error: 'Failed to resolve site drive root' }, { status: 502 })
    }
    const driveRootData = await driveRootRes.json()
    const driveRootId: string = driveRootData.id

    // Persist the site as this connector's shared location FIRST — resolveDriveBase (used by
    // createOneDriveAdapter below) reads workspaceRootLocation/workspaceRootSharedStorageId
    // from the DB, so the adapter needs this write to have already landed before it can target
    // the newly-chosen site's drive rather than wherever the connector pointed before.
    // workspaceRootSharedStorageWebUrl is filled in below, once the exact workspace folder
    // (rootFolderId) exists and its own webUrl can be resolved.
    await prisma.connector.update({
      where: { id: connectionId },
      data: {
        workspaceRootLocation: 'SHARED',
        workspaceRootSharedStorageId: siteId,
        workspaceRootSharedStorageName: siteName ?? null,
      },
    })

    // Auto-create _firma/<workspace folder> inside the site's drive root — same two-level
    // nesting as Personal OneDrive's createPersonalFolder (idempotent _firma parent, then a
    // uniquely-named workspace folder inside it), except fully automatic here: no user-facing
    // copy/paste/guide step, since Files.ReadWrite.All already authorizes this write directly
    // (confirmed 2026-08-06 spike). Keeps the app's content isolated under _firma rather than
    // using the whole site drive as the root.
    const adapter = createOneDriveAdapter(async () => token)
    const firmaFolderId = await adapter.findOrCreateFolder(connectionId, driveRootId, '_firma')
    const workspaceFolderName = generateWorkspaceFolderName()
    const rootFolderId = await adapter.findOrCreateFolder(connectionId, firmaFolderId, workspaceFolderName)

    // Resolve the exact workspace folder's own webUrl — the Open button should land here, not on
    // the document library home. Graph computes this server-side (correct encoding/locale/library
    // name), so it's fetched rather than path-constructed. Best-effort: a failure just leaves Open
    // unavailable for this connector, doesn't block setup.
    let workspaceFolderWebUrl: string | null = null
    try {
      const folderRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drive/items/${encodeURIComponent(rootFolderId)}?$select=webUrl`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (folderRes.ok) {
        const folderData = await folderRes.json()
        workspaceFolderWebUrl = folderData.webUrl ?? null
      } else {
        logger.warn(`Failed to resolve webUrl for workspace folder ${rootFolderId}: ${folderRes.status}`)
      }
    } catch (e) {
      logger.warn(`Error resolving webUrl for workspace folder ${rootFolderId}: ${e instanceof Error ? e.message : String(e)}`)
    }
    await prisma.connector.update({
      where: { id: connectionId },
      data: { workspaceRootSharedStorageWebUrl: workspaceFolderWebUrl },
    })

    const prevSettings = (connector.settings as Record<string, unknown>) || {}
    const newSettings: Record<string, unknown> = {
      ...prevSettings,
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
    // sitePermissionId was written by the old Sites.Selected grant flow — no longer produced,
    // but harmless to leave on already-migrated connectors; not deleted here retroactively.

    await prisma.connector.update({
      where: { id: connectionId },
      data: { settings: newSettings },
    })

    // Provision firm/client/engagement folder hierarchy in the newly selected site — same
    // logic as the Personal (update-root-folder) path, see that route for the pattern this
    // mirrors.
    try {
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
