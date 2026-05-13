import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import type { GoogleDriveFile } from '@/lib/google-drive-connector'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SENSITIVE_PATTERN =
  /password|credential|\.env|contract|invoice|medical|ssn|passport|visa|tax|confidential|secret|private/i

const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024 // 100 MB

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

export interface EngagementDriveAlert {
  engagementId: string
  engagementName: string
  clientName: string
  engagementSlug: string
  clientSlug: string
  count: number
}

export interface DriveAlertsResponse {
  sharing: EngagementDriveAlert[]
  sensitive: EngagementDriveAlert[]
  storage: EngagementDriveAlert[]
  scannedCount: number
  totalCount: number
  lastScannedAt?: string
  isCached?: boolean
}

interface DriveAlertCache {
  results: {
    sharing: EngagementDriveAlert[]
    sensitive: EngagementDriveAlert[]
    storage: EngagementDriveAlert[]
  }
  scannedAt: string
  totalScanned: number
}

const EMPTY_RESPONSE: DriveAlertsResponse = {
  sharing: [],
  sensitive: [],
  storage: [],
  scannedCount: 0,
  totalCount: 0,
  lastScannedAt: undefined,
  isCached: false,
}

function isRiskyShare(file: GoogleDriveFile): boolean {
  return (
    file.permissions?.some(
      (p) => p.type === 'anyone' && (p.role === 'writer' || p.role === 'owner')
    ) ?? false
  )
}

function isSensitive(file: GoogleDriveFile): boolean {
  return SENSITIVE_PATTERN.test(file.name)
}

function isLarge(file: GoogleDriveFile): boolean {
  if (!file.size) return false
  const sizeNum = typeof file.size === 'string' ? parseInt(file.size, 10) : file.size
  return !isNaN(sizeNum) && sizeNum > LARGE_FILE_THRESHOLD
}

/**
 * Process engagements in batches of 5 to avoid Drive rate limits.
 */
async function fetchFilesInBatches(
  connectorId: string,
  engagements: Array<{
    id: string
    name: string
    slug: string
    connectorRootFolderId: string | null
    client: { name: string; slug: string }
  }>,
  batchSize = 5
): Promise<Array<{ engagementId: string; files: GoogleDriveFile[] }>> {
  const results: Array<{ engagementId: string; files: GoogleDriveFile[] }> = []

  for (let i = 0; i < engagements.length; i += batchSize) {
    const batch = engagements.slice(i, i + batchSize)
    const settled = await Promise.allSettled(
      batch.map((eng) =>
        googleDriveConnector
          .listFiles(connectorId, eng.connectorRootFolderId!, 200, undefined, null)
          .then((files) => ({ engagementId: eng.id, files }))
      )
    )
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      }
      // Rejected results (inaccessible folders etc.) are silently skipped
    }
  }

  return results
}

/**
 * Authenticate the request and resolve firmId. Returns user and firmId on
 * success, or a NextResponse error to return immediately.
 */
async function authenticate(
  request: NextRequest,
  params: Promise<{ firmId: string }>
): Promise<{ user: { id: string }; firmId: string } | NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const { firmId } = await params

  const membership = await prisma.firmMember.findFirst({
    where: { userId: user.id, firmId },
  })

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { user, firmId }
}

/**
 * Build alert arrays from per-engagement file results.
 */
function buildAlertResponse(
  engagements: Array<{
    id: string
    name: string
    slug: string
    connectorRootFolderId: string | null
    client: { name: string; slug: string }
  }>,
  filesByEngagement: Array<{ engagementId: string; files: GoogleDriveFile[] }>
): Pick<DriveAlertsResponse, 'sharing' | 'sensitive' | 'storage'> {
  const engagementMap = new Map(engagements.map((e) => [e.id, e]))

  const sharingMap = new Map<string, number>()
  const sensitiveMap = new Map<string, number>()
  const storageMap = new Map<string, number>()

  for (const { engagementId, files } of filesByEngagement) {
    let sharingCount = 0
    let sensitiveCount = 0
    let storageCount = 0

    for (const file of files) {
      if (isRiskyShare(file)) sharingCount++
      if (isSensitive(file)) sensitiveCount++
      if (isLarge(file)) storageCount++
    }

    if (sharingCount > 0) sharingMap.set(engagementId, sharingCount)
    if (sensitiveCount > 0) sensitiveMap.set(engagementId, sensitiveCount)
    if (storageCount > 0) storageMap.set(engagementId, storageCount)
  }

  const buildAlerts = (countMap: Map<string, number>): EngagementDriveAlert[] =>
    Array.from(countMap.entries())
      .map(([engagementId, count]) => {
        const eng = engagementMap.get(engagementId)!
        return {
          engagementId,
          engagementName: eng.name,
          clientName: eng.client.name,
          engagementSlug: eng.slug,
          clientSlug: eng.client.slug,
          count,
        }
      })
      .sort((a, b) => b.count - a.count)

  return {
    sharing: buildAlerts(sharingMap),
    sensitive: buildAlerts(sensitiveMap),
    storage: buildAlerts(storageMap),
  }
}

/**
 * GET /api/firms/[firmId]/drive-alerts
 *
 * Returns flagged Drive files (risky shares, sensitive content, large storage)
 * grouped by engagement for the given firm. If a cached full scan exists that
 * is less than 6 hours old, returns the cached results immediately.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  try {
    // 1. Auth: verify bearer token and firm membership
    const authResult = await authenticate(request, params)
    if (authResult instanceof NextResponse) return authResult
    const { firmId } = authResult

    // 2. Get active Google Drive connector for this firm
    const connector = await prisma.connector.findFirst({
      where: { firmId, type: 'GOOGLE_DRIVE', status: 'ACTIVE' },
    })

    if (!connector) {
      return NextResponse.json(EMPTY_RESPONSE)
    }

    // 3. Count total engagements with a connector root folder
    const totalEngagementCount = await prisma.engagement.count({
      where: { firmId, isDeleted: false, connectorRootFolderId: { not: null } },
    })

    // 4. Check for a valid cache in firm settings
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true },
    })

    const settings = (firm?.settings ?? {}) as Record<string, unknown>
    const cache = settings.driveAlertCache as DriveAlertCache | undefined

    if (cache && cache.scannedAt) {
      const age = Date.now() - new Date(cache.scannedAt).getTime()
      if (age < CACHE_TTL_MS) {
        const response: DriveAlertsResponse = {
          sharing: cache.results.sharing,
          sensitive: cache.results.sensitive,
          storage: cache.results.storage,
          scannedCount: cache.totalScanned,
          totalCount: totalEngagementCount,
          lastScannedAt: cache.scannedAt,
          isCached: true,
        }
        return NextResponse.json(response)
      }
    }

    // 5. Load active engagements (up to 20) that have a connector root folder
    const engagements = await prisma.engagement.findMany({
      where: {
        firmId,
        isDeleted: false,
        connectorRootFolderId: { not: null },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        connectorRootFolderId: true,
        client: { select: { name: true, slug: true } },
      },
      take: 20,
    })

    if (engagements.length === 0) {
      return NextResponse.json(EMPTY_RESPONSE)
    }

    // 6. Fetch files for each engagement in parallel batches of 5
    const filesByEngagement = await fetchFilesInBatches(connector.id, engagements)

    // 7. Detect badges per engagement and accumulate counts
    const alerts = buildAlertResponse(engagements, filesByEngagement)

    const response: DriveAlertsResponse = {
      ...alerts,
      scannedCount: engagements.length,
      totalCount: totalEngagementCount,
      isCached: false,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[drive-alerts] GET Error:', error)
    return NextResponse.json({ error: 'Failed to fetch drive alerts' }, { status: 500 })
  }
}

/**
 * POST /api/firms/[firmId]/drive-alerts
 *
 * Triggers a full scan of all engagements (no limit), stores results in
 * firm.settings.driveAlertCache, and returns the full results.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  try {
    // 1. Auth: verify bearer token and firm membership
    const authResult = await authenticate(request, params)
    if (authResult instanceof NextResponse) return authResult
    const { firmId } = authResult

    // 2. Get active Google Drive connector for this firm
    const connector = await prisma.connector.findFirst({
      where: { firmId, type: 'GOOGLE_DRIVE', status: 'ACTIVE' },
    })

    if (!connector) {
      return NextResponse.json(EMPTY_RESPONSE)
    }

    // 3. Load ALL active engagements that have a connector root folder (no limit)
    const [engagements, totalEngagementCount] = await Promise.all([
      prisma.engagement.findMany({
        where: {
          firmId,
          isDeleted: false,
          connectorRootFolderId: { not: null },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          connectorRootFolderId: true,
          client: { select: { name: true, slug: true } },
        },
      }),
      prisma.engagement.count({
        where: { firmId, isDeleted: false, connectorRootFolderId: { not: null } },
      }),
    ])

    if (engagements.length === 0) {
      return NextResponse.json(EMPTY_RESPONSE)
    }

    // 4. Fetch files for every engagement in parallel batches of 5
    const filesByEngagement = await fetchFilesInBatches(connector.id, engagements)

    // 5. Build alert results
    const alerts = buildAlertResponse(engagements, filesByEngagement)

    const scannedAt = new Date().toISOString()

    // 6. Persist results to firm settings cache
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true },
    })

    const existingSettings = (firm?.settings ?? {}) as Record<string, unknown>
    const updatedSettings = {
      ...existingSettings,
      driveAlertCache: {
        results: {
          sharing: alerts.sharing,
          sensitive: alerts.sensitive,
          storage: alerts.storage,
        },
        scannedAt,
        totalScanned: engagements.length,
      } satisfies DriveAlertCache,
    }

    await prisma.firm.update({
      where: { id: firmId },
      data: { settings: updatedSettings },
    })

    // 7. Return full results
    const response: DriveAlertsResponse = {
      ...alerts,
      scannedCount: engagements.length,
      totalCount: totalEngagementCount,
      lastScannedAt: scannedAt,
      isCached: false,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[drive-alerts] POST Error:', error)
    return NextResponse.json({ error: 'Failed to scan drive alerts' }, { status: 500 })
  }
}
