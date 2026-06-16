import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject, canViewProjectInternalTabs } from '@/lib/permission-helpers'
import { googleDriveConnector } from '@/lib/google-drive-connector'

export interface UnansweredThreadItem {
  documentId: string
  documentName: string
  lastMessageAt: string
  lastMessageAuthorUserId: string
  lastMessagePreview: string
  messageCount: number
}

export interface DocumentDueDateItem {
  documentId: string
  documentName: string
  dueDate: string
  daysUntil: number
  isOverdue: boolean
}

export interface FolderHealthIssue {
  type: 'too_deep' | 'orphaned_files' | 'empty_folder' | 'too_many_root_files'
  severity: 'warning' | 'info'
  label: string
  count: number
}

export interface FolderHealthReport {
  score: number
  totalFolders: number
  totalFiles: number
  maxDepth: number
  orphanedFiles: number
  deeplyNestedFolders: number
  emptyFolders: number
  issues: FolderHealthIssue[]
}

export interface StaleFileItem {
  documentId: string
  fileName: string
  fileSize: number
  lastUpdated: string
  monthsStale: number
}

export interface LargeFileItem {
  documentId: string
  fileName: string
  fileSize: number
  lastUpdated: string
}

export interface DuplicateFile {
  documentId: string
  fileName: string
  folderPath: string | null
}

export interface DuplicateGroup {
  type: 'exact' | 'name'
  baseKey: string
  files: DuplicateFile[]
}

export interface SharesProgress {
  total: number
  toDo: number
  inProgress: number
  done: number
  finalized: number
  externalCollaborators: number
  externalViewers: number
}

export interface HealthPenalty {
  label: string
  points: number
}

export interface EngagementHealthScore {
  score: number   // 0-100
  level: 'good' | 'warning' | 'critical'
  penalties: HealthPenalty[]
}

export interface StorageHealthReport {
  totalFiles: number
  totalSizeBytes: number
  staleFiles: StaleFileItem[]
  largeFiles: LargeFileItem[]
  staleCount: number
  largeCount: number
  staleTotalBytes: number
  duplicateGroups: DuplicateGroup[]
  duplicateCount: number
}

export interface RecentDocumentItem {
  id: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  updatedAt: string
  folderPath: string | null
  updatedByEmail: string | null
}

export interface SensitiveFileItem {
  documentId: string
  fileName: string
  driveWebViewLink?: string
}

export interface EngagementInsightsResponse {
  unansweredThreads: UnansweredThreadItem[]
  documentsDueSoon: DocumentDueDateItem[]
  engagementDueDate: string | null
  engagementDaysUntilDue: number | null
  kickoffDate: string | null
  engagementCreatedAt: string | null
  folderHealth: FolderHealthReport
  storageHealth: StorageHealthReport
  pendingInvitations: { email: string; expireAt: string; daysUntilExpiry: number }[]
  memberCount: number
  membersByRole: Record<string, number>
  recentDocuments: RecentDocumentItem[]
  sensitiveFiles: SensitiveFileItem[]
  sharesProgress: SharesProgress
  sharedDocsCount: number
  pendingApprovalSharesCount: number
  healthScore: EngagementHealthScore
}

const SENSITIVE_PATTERN =
  /password|credential|\.env|contract|invoice|medical|ssn|passport|visa|tax|confidential|secret|private/i

// Build tree from documents and compute folder depth
function buildFolderHealthReport(docs: { id: string; externalId: string; isFolder: boolean; parentId: string | null; fileSize: number | null }[]): FolderHealthReport {
  // Drive-synced docs store parentId as the Drive externalId of the parent folder,
  // not the platform UUID. Build a reverse map so both forms resolve to the platform id.
  const toPlatformId = new Map<string, string>()
  for (const d of docs) {
    toPlatformId.set(d.id, d.id)
    toPlatformId.set(d.externalId, d.id)
  }

  const childrenMap = new Map<string | null, string[]>()
  for (const d of docs) {
    const parent = d.parentId ? (toPlatformId.get(d.parentId) ?? null) : null
    if (!childrenMap.has(parent)) childrenMap.set(parent, [])
    childrenMap.get(parent)!.push(d.id)
  }

  const docMap = new Map(docs.map((d) => [d.id, d]))
  const folderIds = new Set(docs.filter((d) => d.isFolder).map((d) => d.id))

  // Compute depth for each node (BFS from root)
  const depthMap = new Map<string, number>()
  const queue: { id: string; depth: number }[] = []
  for (const id of (childrenMap.get(null) ?? [])) queue.push({ id, depth: 0 })
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    depthMap.set(id, depth)
    for (const childId of (childrenMap.get(id) ?? [])) {
      queue.push({ id: childId, depth: depth + 1 })
    }
  }

  let maxDepth = 0
  let deeplyNestedFolders = 0
  let emptyFolders = 0

  for (const [id, depth] of Array.from(depthMap.entries())) {
    if (depth > maxDepth) maxDepth = depth
    if (folderIds.has(id)) {
      // Count files directly under this folder (not subfolders)
      const directChildren = childrenMap.get(id) ?? []
      const hasAnyChildren = directChildren.length > 0
      if (!hasAnyChildren) emptyFolders++
      if (depth >= 3) deeplyNestedFolders++
    }
  }

  // Orphaned files: non-folder docs with no resolvable parent (at project root)
  const orphanedFiles = docs.filter((d) => !d.isFolder && (d.parentId === null || !toPlatformId.has(d.parentId))).length
  const totalFolders = docs.filter((d) => d.isFolder).length
  const totalFiles = docs.filter((d) => !d.isFolder).length

  // Score calculation
  let score = 100
  score -= Math.min(25, deeplyNestedFolders * 5)
  if (orphanedFiles > 5) score -= 10
  if (orphanedFiles > 15) score -= 10
  if (emptyFolders > 3) score -= 5
  if (maxDepth >= 6) score -= 15
  score = Math.max(0, Math.min(100, score))

  const issues: FolderHealthIssue[] = []
  if (deeplyNestedFolders > 0) {
    issues.push({ type: 'too_deep', severity: 'warning', label: `${deeplyNestedFolders} deeply nested folder${deeplyNestedFolders > 1 ? 's' : ''} (3+ levels)`, count: deeplyNestedFolders })
  }
  if (orphanedFiles > 0) {
    issues.push({ type: 'orphaned_files', severity: orphanedFiles > 5 ? 'warning' : 'info', label: `${orphanedFiles} file${orphanedFiles > 1 ? 's' : ''} at root without a folder`, count: orphanedFiles })
  }
  if (emptyFolders > 0) {
    issues.push({ type: 'empty_folder', severity: 'info', label: `${emptyFolders} empty folder${emptyFolders > 1 ? 's' : ''}`, count: emptyFolders })
  }

  return { score, totalFolders, totalFiles, maxDepth, orphanedFiles, deeplyNestedFolders, emptyFolders, issues }
}

function normalizeBaseName(fileName: string): string {
  const noExt = fileName.replace(/\.[^.]+$/, '')
  return noExt
    .replace(/[-_\s]+(v\d+|small|large|med|medium|lg|sm|xl|xxl|\d+px|\d+x\d+|copy|backup|draft|final|old|new|\d+)$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .toLowerCase()
    .trim()
}

function buildDuplicateGroups(
  files: { id: string; fileName: string; fileSizeNum: number; mimeType: string | null; folderPath: string | null }[]
): { groups: DuplicateGroup[]; count: number } {
  const groups: DuplicateGroup[] = []
  const seenIds = new Set<string>()

  // Exact size duplicates (same non-zero size, not Google-native formats)
  const sizeMap = new Map<number, typeof files>()
  for (const f of files) {
    if (f.fileSizeNum <= 0 || f.mimeType?.startsWith('application/vnd.google-apps')) continue
    const g = sizeMap.get(f.fileSizeNum) ?? []
    g.push(f)
    sizeMap.set(f.fileSizeNum, g)
  }
  for (const [size, group] of Array.from(sizeMap.entries())) {
    if (group.length < 2) continue
    groups.push({
      type: 'exact',
      baseKey: `size:${size}`,
      files: group.map(f => { seenIds.add(f.id); return { documentId: f.id, fileName: f.fileName, folderPath: f.folderPath } }),
    })
  }

  // Name-based near-duplicates (same extension + same normalized base name).
  // Including the extension in the key prevents cross-format false positives
  // (e.g. report.pdf ≠ report.docx — different formats, not duplicates).
  const nameMap = new Map<string, typeof files>()
  for (const f of files) {
    const ext = (f.fileName.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase()
    const base = normalizeBaseName(f.fileName)
    if (!base || base.length < 6) continue
    const key = `${ext}:${base}`
    const g = nameMap.get(key) ?? []
    g.push(f)
    nameMap.set(key, g)
  }
  for (const [key, group] of Array.from(nameMap.entries())) {
    if (group.length < 2) continue
    // Skip groups already fully covered by exact-size groups
    const newFiles = group.filter(f => !seenIds.has(f.id))
    if (newFiles.length < 2) continue
    newFiles.forEach(f => seenIds.add(f.id))
    groups.push({
      type: 'name',
      baseKey: key,
      files: group.map(f => ({ documentId: f.id, fileName: f.fileName, folderPath: f.folderPath })),
    })
  }

  const count = new Set(groups.flatMap(g => g.files.map(f => f.documentId))).size
  return { groups, count }
}

/**
 * GET /api/projects/[projectId]/insights
 * Engagement-level insights. Requires internal tab access (internal members only).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { createClient: createSupabaseClient } = await import('@/utils/supabase/server')
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const [canView, canViewInternal] = await Promise.all([
      canViewProject(ctx.firmId, ctx.clientId, ctx.projectId),
      canViewProjectInternalTabs(ctx.firmId, ctx.clientId, ctx.projectId),
    ])
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!canViewInternal) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const staleThreshold = new Date(today)
    staleThreshold.setDate(today.getDate() - 180)
    const largeSizeThreshold = 50 * 1024 * 1024 // 50 MB

    const [engagement, docs, comments, members, invitations, driveConnector, shares, sharedDocsCount, pendingApprovalSharesCount] = await Promise.all([
      prisma.engagement.findUnique({
        where: { id: projectId },
        select: { dueDate: true, name: true, connectorRootFolderId: true, kickoffDate: true, createdAt: true },
      }),
      prisma.engagementDocument.findMany({
        where: { engagementId: projectId, status: { not: 'ARCHIVED' } },
        select: {
          id: true,
          fileName: true,
          isFolder: true,
          fileSize: true,
          parentId: true,
          updatedAt: true,
          mimeType: true,
          dueDate: true,
          externalId: true,
          updatedBy: true,
        },
      }),
      prisma.docCommentMessage.findMany({
        where: { engagementId: projectId },
        select: {
          id: true,
          projectDocumentId: true,
          authorUserId: true,
          content: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.engagementMember.findMany({
        where: { engagementId: projectId },
        select: { userId: true, role: true },
      }),
      prisma.engagementInvitation.findMany({
        where: { engagementId: projectId, status: 'PENDING', expireAt: { gt: new Date() } },
        select: { email: true, expireAt: true },
        orderBy: { expireAt: 'asc' },
      }),
      prisma.connector.findFirst({
        where: { firmId: ctx.firmId, type: 'GOOGLE_DRIVE', status: 'ACTIVE' },
        select: { id: true },
      }),
      // Shares progress (EngagementDocument where slug != null)
      prisma.engagementDocument.findMany({
        where: { engagementId: projectId, slug: { not: null } },
        select: {
          id: true,
          settings: true,
          slug: true,
        },
      }),
      // Count of documents that have been published as shares (slug != null)
      (prisma.engagementDocument as any).count({
        where: { engagementId: projectId, slug: { not: null } },
      }),
      // Count of shares pending approval
      (prisma.engagementDocument as any).count({
        where: {
          engagementId: projectId,
          sharingUsers: { some: { sharingPermissionStatus: 'PENDING' } },
        },
      }),
    ])

    // External user IDs set
    const externalRoles = new Set(['eng_ext_collaborator', 'eng_viewer'])
    const externalUserIds = new Set(
      members.filter((m) => externalRoles.has(m.role)).map((m) => m.userId)
    )

    // Member counts by role
    const membersByRole: Record<string, number> = {}
    for (const m of members) {
      membersByRole[m.role] = (membersByRole[m.role] ?? 0) + 1
    }

    // Unanswered threads: group comments by document, check if last message is from external
    const commentsByDoc = new Map<string, typeof comments>()
    for (const c of comments) {
      if (!c.projectDocumentId) continue
      if (!commentsByDoc.has(c.projectDocumentId)) commentsByDoc.set(c.projectDocumentId, [])
      commentsByDoc.get(c.projectDocumentId)!.push(c)
    }

    const unansweredThreads: UnansweredThreadItem[] = []
    const docMap = new Map(docs.map((d) => [d.id, d]))

    for (const [docId, thread] of Array.from(commentsByDoc.entries())) {
      const lastMsg = thread[thread.length - 1]
      if (!lastMsg.authorUserId) continue
      if (!externalUserIds.has(lastMsg.authorUserId)) continue

      const doc = docMap.get(docId)
      if (!doc) continue

      const preview = String(lastMsg.content ?? '').slice(0, 150)
      unansweredThreads.push({
        documentId: docId,
        documentName: doc.fileName,
        lastMessageAt: lastMsg.createdAt.toISOString(),
        lastMessageAuthorUserId: lastMsg.authorUserId,
        lastMessagePreview: preview,
        messageCount: thread.length,
      })
    }
    unansweredThreads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

    // Document due dates
    const documentsDueSoon: DocumentDueDateItem[] = docs
      .filter((d) => d.dueDate && !d.isFolder)
      .map((d) => {
        const dd = new Date(d.dueDate!)
        dd.setHours(0, 0, 0, 0)
        const daysUntil = Math.round((dd.getTime() - today.getTime()) / 86400000)
        return {
          documentId: d.id,
          documentName: d.fileName,
          dueDate: d.dueDate!.toISOString(),
          daysUntil,
          isOverdue: daysUntil < 0,
        }
      })
      .sort((a, b) => a.daysUntil - b.daysUntil)

    // Engagement due date
    let engagementDueDate: string | null = null
    let engagementDaysUntilDue: number | null = null
    if (engagement?.dueDate) {
      const d = new Date(engagement.dueDate)
      d.setHours(0, 0, 0, 0)
      engagementDueDate = engagement.dueDate.toISOString()
      engagementDaysUntilDue = Math.round((d.getTime() - today.getTime()) / 86400000)
    }

    // Kickoff date
    const kickoffDate: string | null = engagement?.kickoffDate ? engagement.kickoffDate.toISOString() : null

    // Shares progress
    const sharesProgress: SharesProgress = {
      total: shares.length,
      toDo: 0,
      inProgress: 0,
      done: 0,
      finalized: 0,
      externalCollaborators: 0,
      externalViewers: 0,
    }
    for (const share of shares) {
      const settings = share.settings as any
      const status = settings?.activity?.status ?? 'to_do'
      if (status === 'to_do') sharesProgress.toDo++
      else if (status === 'in_progress') sharesProgress.inProgress++
      else if (status === 'done') sharesProgress.done++
      if (settings?.share?.finalizedAt) sharesProgress.finalized++
      if (settings?.externalCollaborator) sharesProgress.externalCollaborators++
      if (settings?.guest) sharesProgress.externalViewers++
    }

    // Folder health (convert bigint fileSize to number)
    const folderHealth = buildFolderHealthReport(docs.map((d) => ({
      id: d.id,
      externalId: d.externalId,
      isFolder: d.isFolder,
      parentId: d.parentId,
      fileSize: d.fileSize != null ? Number(d.fileSize) : null,
    })))

    // Storage health
    const fileDocsOnly = docs.filter((d) => !d.isFolder)
    const fileSizes = fileDocsOnly.map((d) => (d.fileSize != null ? Number(d.fileSize) : 0))
    const totalSizeBytes = fileSizes.reduce((sum, s) => sum + s, 0)

    const fileDocsWithSizes = fileDocsOnly.map((d, i) => ({ ...d, fileSizeNum: fileSizes[i] }))

    const allStale = fileDocsWithSizes
      .filter((d) => d.updatedAt < staleThreshold)
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    const allLarge = fileDocsWithSizes
      .filter((d) => d.fileSizeNum > largeSizeThreshold)
      .sort((a, b) => b.fileSizeNum - a.fileSizeNum)

    const staleTotalBytes = allStale.reduce((sum, d) => sum + d.fileSizeNum, 0)

    // Build folder lookup maps for path computation (used by duplicates and recent docs)
    const docById = new Map(docs.map(d => [d.id, d]))
    const externalToId = new Map(docs.filter(d => d.externalId).map(d => [d.externalId!, d.id]))

    const getFolderPath = (parentId: string | null): string | null => {
      const parts: string[] = []
      let current = parentId
      let safety = 0
      while (current && safety++ < 10) {
        const platformId = externalToId.get(current) ?? current
        const folder = docById.get(platformId)
        if (!folder || !folder.isFolder) break
        parts.unshift(folder.fileName)
        current = folder.parentId
      }
      return parts.length > 0 ? parts.join(' / ') : null
    }

    const { groups: duplicateGroups, count: duplicateCount } = buildDuplicateGroups(
      fileDocsWithSizes.map(d => ({ id: d.id, fileName: d.fileName, fileSizeNum: d.fileSizeNum, mimeType: d.mimeType, folderPath: getFolderPath(d.parentId) }))
    )

    const storageHealth: StorageHealthReport = {
      totalFiles: fileDocsOnly.length,
      totalSizeBytes,
      staleCount: allStale.length,
      largeCount: allLarge.length,
      staleTotalBytes,
      duplicateGroups: duplicateGroups.slice(0, 20),
      duplicateCount,
      staleFiles: allStale.slice(0, 10).map((d) => ({
        documentId: d.id,
        fileName: d.fileName,
        fileSize: d.fileSizeNum,
        lastUpdated: d.updatedAt.toISOString(),
        monthsStale: Math.floor((today.getTime() - d.updatedAt.getTime()) / (30 * 86400000)),
      })),
      largeFiles: allLarge.slice(0, 10).map((d) => ({
        documentId: d.id,
        fileName: d.fileName,
        fileSize: d.fileSizeNum,
        lastUpdated: d.updatedAt.toISOString(),
      })),
    }

    // Collect unique updatedBy UUIDs from recent docs
    const recentSlice = fileDocsWithSizes
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 50)

    const updaterIds = Array.from(new Set(recentSlice.map(d => d.updatedBy).filter(Boolean) as string[]))
    let userEmailMap = new Map<string, string>()
    if (updaterIds.length > 0) {
      try {
        const { createClient: createAdminClient } = await import('@supabase/supabase-js')
        const adminClient = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: usersData } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
        if (usersData) {
          for (const u of usersData.users) {
            userEmailMap.set(u.id, u.email ?? u.id)
          }
        }
      } catch {
        // Non-fatal — Modified By will show null
      }
    }

    // Recently modified non-folder documents (top 50)
    const recentDocuments: RecentDocumentItem[] = recentSlice
      .map((d) => ({
        id: d.id,
        fileName: d.fileName,
        mimeType: d.mimeType,
        fileSize: d.fileSizeNum,
        updatedAt: d.updatedAt.toISOString(),
        folderPath: getFolderPath(d.parentId),
        updatedByEmail: d.updatedBy ? (userEmailMap.get(d.updatedBy) ?? null) : null,
      }))

    // Pending invitations
    const pendingInvitations = invitations
      .filter((inv) => inv.expireAt != null)
      .map((inv) => {
        const d = new Date(inv.expireAt!)
        d.setHours(0, 0, 0, 0)
        return {
          email: inv.email,
          expireAt: inv.expireAt!.toISOString(),
          daysUntilExpiry: Math.round((d.getTime() - today.getTime()) / 86400000),
        }
      })

    // Sensitive files: scan engagementDocument table + Google Drive if connector available
    const dbSensitive: SensitiveFileItem[] = docs
      .filter((d) => !d.isFolder && SENSITIVE_PATTERN.test(d.fileName))
      .map((d) => ({ documentId: d.id, fileName: d.fileName }))

    // Also scan Drive files not yet synced to engagementDocument.
    // Scope to the "General" subfolder only — the "Confidential" folder is internal
    // and should not surface as "sensitive" alerts for the engagement team.
    const externalIdToDocId = new Map(docs.filter(d => d.externalId).map(d => [d.externalId, d.id]))
    let driveSensitive: SensitiveFileItem[] = []
    if (driveConnector && engagement?.connectorRootFolderId) {
      try {
        // Discover the General subfolder (one level below root)
        let scanFolderId = engagement.connectorRootFolderId
        const rootChildren = await googleDriveConnector.listFiles(
          driveConnector.id, engagement.connectorRootFolderId, 50, undefined, null
        )
        const generalFolder = rootChildren.find(
          (f: { mimeType?: string; name?: string }) =>
            f.mimeType === 'application/vnd.google-apps.folder' &&
            (f.name ?? '').toLowerCase().includes('general')
        ) as { id: string } | undefined
        if (generalFolder) scanFolderId = generalFolder.id

        const driveFiles = await googleDriveConnector.listFiles(
          driveConnector.id, scanFolderId, 200, undefined, null
        )
        driveSensitive = driveFiles
          .filter((f: { mimeType?: string }) => f.mimeType !== 'application/vnd.google-apps.folder')
          .filter((f: { name?: string }) => SENSITIVE_PATTERN.test(f.name ?? ''))
          .filter((f: { id: string }) => !externalIdToDocId.has(f.id))
          .map((f: { id: string; name?: string; webViewLink?: string }) => ({
            documentId: f.id,
            fileName: f.name ?? '',
            driveWebViewLink: f.webViewLink,
          }))
      } catch {
        // Drive scan failure is non-fatal
      }
    }

    const sensitiveFiles: SensitiveFileItem[] = [...dbSensitive, ...driveSensitive]

    // Health score: start at 100, subtract weighted penalties
    const penalties: HealthPenalty[] = []
    const overdueDocCount = (documentsDueSoon ?? []).filter((d) => d.daysUntil < 0).length

    if ((unansweredThreads?.length ?? 0) > 0) penalties.push({ label: `${unansweredThreads.length} unanswered thread${unansweredThreads.length > 1 ? 's' : ''}`, points: Math.min(20, unansweredThreads.length * 5) })
    if (overdueDocCount > 0) penalties.push({ label: `${overdueDocCount} overdue doc${overdueDocCount > 1 ? 's' : ''}`, points: Math.min(15, overdueDocCount * 5) })
    if ((sensitiveFiles?.length ?? 0) > 0) penalties.push({ label: `${sensitiveFiles.length} sensitive file${sensitiveFiles.length > 1 ? 's' : ''}`, points: Math.min(20, sensitiveFiles.length * 5) })
    if ((storageHealth.staleCount ?? 0) > 0) penalties.push({ label: `${storageHealth.staleCount} stale file${storageHealth.staleCount > 1 ? 's' : ''}`, points: Math.min(15, storageHealth.staleCount * 3) })
    if ((storageHealth.largeCount ?? 0) > 0) penalties.push({ label: `${storageHealth.largeCount} large file${storageHealth.largeCount > 1 ? 's' : ''}`, points: Math.min(10, storageHealth.largeCount * 2) })
    if ((storageHealth.duplicateCount ?? 0) > 0) penalties.push({ label: `${storageHealth.duplicateCount} duplicate${storageHealth.duplicateCount > 1 ? 's' : ''}`, points: Math.min(10, storageHealth.duplicateCount * 2) })
    const days = engagementDaysUntilDue ?? null
    if (days !== null) {
      if (days < -30)      penalties.push({ label: `Engagement ${Math.abs(days)} days overdue`, points: 25 })
      else if (days < -7)  penalties.push({ label: `Engagement ${Math.abs(days)} days overdue`, points: 20 })
      else if (days < 0)   penalties.push({ label: `Engagement ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, points: 15 })
      else if (days === 0) penalties.push({ label: 'Engagement due today', points: 12 })
      else if (days === 1) penalties.push({ label: 'Engagement due tomorrow', points: 8 })
      else if (days === 2) penalties.push({ label: 'Engagement due in 2 days', points: 5 })
    }
    // TODO: re-enable when Shares board graduates from beta
    // if (sharesProgress.total > 0) {
    //   const deliveryPct = Math.round((sharesProgress.done / sharesProgress.total) * 100)
    //   if (deliveryPct < 50) penalties.push({ label: `${deliveryPct}% deliverables done`, points: Math.min(25, Math.round((50 - deliveryPct) / 2)) })
    // }

    const healthPenalty = penalties.reduce((sum, p) => sum + p.points, 0)
    const healthScoreValue = Math.max(0, 100 - healthPenalty)
    const healthLevel: EngagementHealthScore['level'] = healthScoreValue >= 80 ? 'good' : healthScoreValue >= 50 ? 'warning' : 'critical'
    const healthScore: EngagementHealthScore = { score: healthScoreValue, level: healthLevel, penalties }

    const response: EngagementInsightsResponse = {
      unansweredThreads,
      documentsDueSoon,
      engagementDueDate,
      engagementDaysUntilDue,
      kickoffDate,
      engagementCreatedAt: engagement?.createdAt ? engagement.createdAt.toISOString() : null,
      folderHealth,
      storageHealth,
      pendingInvitations,
      memberCount: members.length,
      membersByRole,
      recentDocuments,
      sensitiveFiles,
      sharesProgress,
      sharedDocsCount,
      pendingApprovalSharesCount,
      healthScore,
    }

    return NextResponse.json(response)
  } catch (e) {
    console.error('GET project insights error', e)
    return NextResponse.json({ error: 'Failed to load insights' }, { status: 500 })
  }
}
