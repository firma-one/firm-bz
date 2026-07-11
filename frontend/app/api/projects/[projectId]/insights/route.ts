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

export interface FolderHealthPenalty {
  label: string
  points: number
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
  penalties: FolderHealthPenalty[]
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
  approved: number
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

// ── Deliverables analytics (Phase 7 & 8) ──────────────────────────────────────
export type DeliverableStage = 'to_do' | 'in_progress' | 'in_review' | 'approved'

export interface DeliverableProgress {
  id: string
  docId: string | null        // e.g. "NVQ-7"
  name: string
  stage: DeliverableStage
  dueDate: string | null
  isOverdue: boolean          // dueDate < now AND not yet approved
  createdAt: string | null    // settings.share.createdAt — when marked a Deliverable (bar start on the timeline)
  finalizedAt: string | null  // settings.share.finalizedAt — when approved (bar end for completed bars)
}

export interface DeliveryPenalty {
  label: string
  points: number
}

export interface DeliveryHealthScore {
  score: number               // 0-100
  level: 'good' | 'warning' | 'critical'
  penalties: DeliveryPenalty[]
  approvedCount: number
  overdueCount: number
  totalCount: number
  // Avg days deliverables have been sitting in their current stage (proxy — we
  // don't track full per-stage transition history).
  avgDaysPerStage: Record<DeliverableStage, number>
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
  badlyNamedCount: number
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

// Inputs that feed the Overall Health Score, each surfaced as its own ring.
// Planning hygiene tracks three coverage gaps across IN-FLIGHT (non-approved) work.
export interface PlanningHygiene {
  deliverableTotal: number        // in-flight deliverable folders
  deliverableWithDueDate: number
  docTotal: number                // in-flight subtasks (non-folder docs inside them)
  docWithDueDate: number
  docWithAssignee: number
}

export interface CommentThreads {
  answered: number
  unanswered: number
  total: number
}

export interface EngagementPace {
  deliveredPct: number   // % of deliverables approved
  timePct: number        // % of engagement duration elapsed
  hasDeadline: boolean
}

// Phase 7C — revision rounds per deliverable + approval cycle time.
export interface DeliverableRevisionMetric {
  documentId: string
  docId: string | null
  name: string
  revisions: number   // count of DOCUMENT_SHARE_CHANGED audit events for the deliverable
}

export interface ApprovalCycleMetric {
  avgCycleDays: number | null    // finalizedAt − createdAt, averaged across approved deliverables
  medianCycleDays: number | null
  deliverableCount: number       // deliverables shared (have createdAt)
  approvedCount: number          // deliverables finalized (have finalizedAt)
}

export interface FirstTimeRight {
  firstTime: number    // approved deliverables that had zero revision rounds
  reworked: number     // approved deliverables sent back at least once
  totalApproved: number
}

export interface InsightsConfig {
  hiddenRings: string[]
  hiddenSections: string[]
  hiddenActions: string[]
}

// Which sections are visible to external members — stored in firm.settings.externalSections.
// Internal members always see everything.
export interface ExternalSectionsConfig {
  engagementHealth: boolean   // default: true
  fileOrganization: boolean   // default: false
  documentActivity: boolean   // default: false
}

const EXTERNAL_SECTION_DEFAULTS: ExternalSectionsConfig = {
  engagementHealth: true,
  fileOrganization: false,
  documentActivity: false,
}

function buildExternalConfig(sections: ExternalSectionsConfig): InsightsConfig {
  const hiddenSections: string[] = ['team_status']
  if (!sections.fileOrganization) hiddenSections.push('file_organization')
  if (!sections.documentActivity) hiddenSections.push('document_activity')

  const hiddenRings: string[] = []
  if (!sections.engagementHealth) {
    hiddenRings.push(
      'engagement.health_score', 'engagement.delivery_status', 'engagement.delivery_schedule',
      'engagement.planning_hygiene', 'engagement.comment_responsiveness', 'engagement.pace',
      'engagement.first_time_right',
    )
  }
  if (!sections.fileOrganization) {
    hiddenRings.push(
      'folder.overall_score', 'folder.total_artifacts', 'folder.poorly_named',
      'folder.duplicates', 'folder.empty_folders', 'folder.deep_folders',
      'folder.orphaned_files', 'folder.stale_files', 'folder.large_files',
    )
  }

  const hiddenActions: string[] = []
  if (!sections.fileOrganization) {
    hiddenActions.push(
      'housekeeping.sensitive', 'housekeeping.poorly-named', 'housekeeping.duplicates',
      'housekeeping.stale', 'housekeeping.large', 'housekeeping.orphaned',
      'housekeeping.empty-folders', 'housekeeping.deep-folders',
    )
  }

  return { hiddenRings, hiddenSections, hiddenActions }
}

const INTERNAL_CONFIG: InsightsConfig = { hiddenRings: [], hiddenSections: [], hiddenActions: [] }

export interface EngagementInsightsResponse {
  insightsConfig: InsightsConfig
  unansweredThreads: UnansweredThreadItem[]
  documentsDueSoon: DocumentDueDateItem[]
  engagementDueDate: string | null
  engagementDaysUntilDue: number | null
  kickoffDate: string | null
  engagementCreatedAt: string | null
  insightsSummary: string | null
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
  deliverables: DeliverableProgress[]
  deliveryHealth: DeliveryHealthScore
  planningHygiene: PlanningHygiene
  commentThreads: CommentThreads
  pace: EngagementPace
  revisionMetrics: DeliverableRevisionMetric[]
  approvalCycle: ApprovalCycleMetric
  firstTimeRight: FirstTimeRight
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

  // Score calculation — penalties applied by caller after all metrics are known
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

  return { score, totalFolders, totalFiles, maxDepth, orphanedFiles, deeplyNestedFolders, emptyFolders, issues, penalties: [] as FolderHealthPenalty[] }
}

function normalizeBaseName(fileName: string): string {
  const noExt = fileName.replace(/\.[^.]+$/, '')
  return noExt
    .replace(/[-_\s]+(v\d+|small|large|med|medium|lg|sm|xl|xxl|\d+px|\d+x\d+|copy|backup|draft|final|old|new|\d+)$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .toLowerCase()
    .trim()
}

// Levenshtein distance for fuzzy name matching
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function nameSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

function buildDuplicateGroups(
  files: { id: string; fileName: string; fileSizeNum: number; mimeType: string | null; folderPath: string | null }[]
): { groups: DuplicateGroup[]; count: number } {
  const groups: DuplicateGroup[] = []
  const seenIds = new Set<string>()

  // Group by extension first, then find identical or ≥90% similar base names
  const byExt = new Map<string, typeof files>()
  for (const f of files) {
    const ext = (f.fileName.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase()
    const g = byExt.get(ext) ?? []
    g.push(f)
    byExt.set(ext, g)
  }

  for (const [ext, group] of Array.from(byExt.entries())) {
    if (group.length < 2) continue
    const bases = group.map(f => normalizeBaseName(f.fileName))
    const matched = new Set<number>()

    for (let i = 0; i < group.length; i++) {
      if (matched.has(i) || bases[i].length < 3) continue
      const cluster: typeof files = []
      for (let j = i; j < group.length; j++) {
        if (bases[j].length < 3) continue
        if (nameSimilarity(bases[i], bases[j]) >= 0.9) {
          cluster.push(group[j])
          matched.add(j)
        }
      }
      if (cluster.length < 2) continue
      const freshFiles = cluster.filter(f => !seenIds.has(f.id))
      if (freshFiles.length < 2) continue
      freshFiles.forEach(f => seenIds.add(f.id))
      groups.push({
        type: bases[i] === bases[cluster[1] ? 1 : 0] ? 'exact' : 'name',
        baseKey: `${ext}:${bases[i]}`,
        files: freshFiles.map(f => ({ documentId: f.id, fileName: f.fileName, folderPath: f.folderPath })),
      })
    }
  }

  const count = new Set(groups.flatMap(g => g.files.map(f => f.documentId))).size
  return { groups, count }
}

const BADLY_NAMED_PATTERN = /^(untitled|new file|new folder|copy of|document|spreadsheet|presentation|slide|sheet|folder|file|unnamed|noname|temp|tmp|test|asdf|draft)(\s*\d*)?$/i

function countBadlyNamed(files: { fileName: string; isFolder: boolean }[]): number {
  return files.filter((f) => {
    const base = f.fileName.replace(/\.[^.]+$/, '').trim()
    return BADLY_NAMED_PATTERN.test(base)
  }).length
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
    // External roles (EC/EV) may view the Overview, but only the deliverables analytics
    // section — all internal-only data is stripped from their response below.
    const isExternalPersona = !canViewInternal

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const staleThreshold = new Date(today)
    staleThreshold.setDate(today.getDate() - 180)
    const largeSizeThreshold = 50 * 1024 * 1024 // 50 MB

    const [engagement, firm, docs, comments, members, invitations, driveConnector, shares, pendingApprovalSharesCount] = await Promise.all([
      prisma.engagement.findUnique({
        where: { id: projectId },
        select: { dueDate: true, name: true, connectorRootFolderId: true, kickoffDate: true, createdAt: true, settings: true },
      }),
      prisma.firm.findUnique({
        where: { id: ctx.firmId },
        select: { settings: true },
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
          settings: true,
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
      // Shares progress — documents explicitly shared via modal (createdAt set) or intake (sharing row)
      (prisma as any).$queryRawUnsafe(
        `SELECT DISTINCT ed.id, ed.settings, ed."fileName", ed."docId", ed."dueDate", ed."isFolder"
         FROM platform.engagement_documents ed
         LEFT JOIN platform.engagement_document_sharing_users su
           ON su."projectDocumentId" = ed.id AND su."sharingPermissionStatus" IN ('GRANTED', 'PENDING')
         WHERE ed."engagementId" = $1::uuid
           AND (
             (ed.settings->'share'->>'createdAt') IS NOT NULL
             OR su.id IS NOT NULL
           )`,
        projectId
      ) as Promise<{ id: string; settings: unknown; fileName: string; docId: string | null; dueDate: Date | null; isFolder: boolean }[]>,
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
      approved: 0,
      finalized: 0,
      externalCollaborators: 0,
      externalViewers: 0,
    }
    for (const share of shares) {
      const settings = share.settings as any
      // Normalize legacy 'done' to 'approved' on read
      const rawStatus = settings?.activity?.status ?? 'to_do'
      const status = rawStatus === 'done' ? 'approved' : rawStatus
      if (status === 'to_do') sharesProgress.toDo++
      else if (status === 'in_progress') sharesProgress.inProgress++
      else if (status === 'approved') sharesProgress.approved++
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

    const badlyNamedCount = countBadlyNamed(docs)

    // Build folder health penalties from all 6 signals + structure
    const folderPenalties: FolderHealthPenalty[] = []
    if (badlyNamedCount > 0) folderPenalties.push({ label: `${badlyNamedCount} badly named file${badlyNamedCount > 1 ? 's' : ''}`, points: Math.min(15, badlyNamedCount * 3) })
    if (duplicateCount > 0) folderPenalties.push({ label: `${duplicateCount} duplicate file${duplicateCount > 1 ? 's' : ''}`, points: Math.min(10, duplicateCount * 2) })
    if (allStale.length > 0) folderPenalties.push({ label: `${allStale.length} stale file${allStale.length > 1 ? 's' : ''} (6+ months)`, points: Math.min(10, allStale.length * 2) })
    if (allLarge.length > 0) folderPenalties.push({ label: `${allLarge.length} large file${allLarge.length > 1 ? 's' : ''} (>50 MB)`, points: Math.min(5, allLarge.length * 2) })
    if (folderHealth.deeplyNestedFolders > 0) folderPenalties.push({ label: `${folderHealth.deeplyNestedFolders} deeply nested folder${folderHealth.deeplyNestedFolders > 1 ? 's' : ''} (3+ levels)`, points: Math.min(25, folderHealth.deeplyNestedFolders * 5) })
    if (folderHealth.orphanedFiles > 5) folderPenalties.push({ label: `${folderHealth.orphanedFiles} files at root without a folder`, points: folderHealth.orphanedFiles > 15 ? 20 : 10 })
    if (folderHealth.emptyFolders > 3) folderPenalties.push({ label: `${folderHealth.emptyFolders} empty folders`, points: 5 })
    if (folderHealth.maxDepth >= 6) folderPenalties.push({ label: 'Folder depth ≥ 6 levels', points: 15 })
    folderPenalties.sort((a, b) => b.points - a.points)

    const totalFolderDeducted = folderPenalties.reduce((s, p) => s + p.points, 0)
    const folderHealthScore = Math.max(0, Math.min(100, 100 - totalFolderDeducted))
    const folderHealthWithAllSignals = { ...folderHealth, score: folderHealthScore, penalties: folderPenalties }

    const storageHealth: StorageHealthReport = {
      totalFiles: fileDocsOnly.length,
      totalSizeBytes,
      staleCount: allStale.length,
      largeCount: allLarge.length,
      staleTotalBytes,
      duplicateGroups: duplicateGroups.slice(0, 20),
      duplicateCount,
      badlyNamedCount,
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
    // NOTE: file-organization issues (stale/large/duplicate files) are intentionally
    // excluded from the engagement Health Score — they belong to the File Organization
    // section, not engagement health. Do not re-add them here.
    const days = engagementDaysUntilDue ?? null
    if (days !== null) {
      // An overdue engagement is the single most serious health signal — any overdue
      // engagement alone drives the score into "critical" (<50), and it escalates from there.
      if (days < -30)      penalties.push({ label: `Engagement ${Math.abs(days)} days overdue`, points: 80 })
      else if (days < -7)  penalties.push({ label: `Engagement ${Math.abs(days)} days overdue`, points: 65 })
      else if (days < 0)   penalties.push({ label: `Engagement ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, points: 55 })
      else if (days === 0) penalties.push({ label: 'Engagement due today', points: 12 })
      else if (days === 1) penalties.push({ label: 'Engagement due tomorrow', points: 8 })
      else if (days === 2) penalties.push({ label: 'Engagement due in 2 days', points: 5 })
    }
    // Assignee-coverage and pace penalties are appended after those metrics are
    // computed below; the Overall Health Score is finalized there.

    // ── Deliverables analytics (Phase 7 & 8) ──────────────────────────────────
    // Deliverables = shared rows that are folders with settings.share.createdAt set.
    // (The shares set also includes intake files via the sharing-user join; filter them out.)
    const nowMs = Date.now()
    const DAY_MS = 86400000
    const normalizeStage = (raw: unknown): DeliverableStage => {
      const s = raw === 'done' ? 'approved' : raw
      return (s === 'in_progress' || s === 'in_review' || s === 'approved') ? s : 'to_do'
    }
    const deliverableRows = (shares as any[]).filter((s) => {
      const st = s.settings as any
      return s.isFolder === true && !!st?.share?.createdAt
    })
    const deliverables: DeliverableProgress[] = deliverableRows.map((s) => {
      const st = s.settings as any
      const stage = normalizeStage(st?.activity?.status ?? 'to_do')
      const dueMs = s.dueDate ? new Date(s.dueDate).getTime() : null
      const createdRaw = st?.share?.createdAt
      const finalizedRaw = st?.share?.finalizedAt
      return {
        id: s.id as string,
        docId: (s.docId as string | null) ?? null,
        name: (s.fileName as string) ?? 'Untitled',
        stage,
        dueDate: s.dueDate ? new Date(s.dueDate).toISOString() : null,
        isOverdue: dueMs != null && stage !== 'approved' && dueMs < nowMs,
        createdAt: createdRaw ? new Date(createdRaw).toISOString() : null,
        finalizedAt: finalizedRaw ? new Date(finalizedRaw).toISOString() : null,
      }
    })

    // Delivery health score — starts at 100, penalties subtract, all-approved adds a bonus.
    const totalDeliverables = deliverables.length
    const approvedCount = deliverables.filter((d) => d.stage === 'approved').length
    const overdueCount = deliverables.filter((d) => d.isOverdue).length
    const deliveryPenalties: DeliveryPenalty[] = []

    if (overdueCount > 0) {
      deliveryPenalties.push({ label: `${overdueCount} overdue deliverable${overdueCount > 1 ? 's' : ''}`, points: Math.min(40, overdueCount * 10) })
    }
    if (totalDeliverables > 0 && kickoffDate) {
      const daysSinceKickoff = Math.floor((nowMs - new Date(kickoffDate).getTime()) / DAY_MS)
      if (daysSinceKickoff > 14) {
        const toDoCount = deliverables.filter((d) => d.stage === 'to_do').length
        const toDoPct = toDoCount / totalDeliverables
        if (toDoPct > 0.3) deliveryPenalties.push({ label: `${Math.round(toDoPct * 100)}% still in To Do`, points: 15 })
      }
    }
    const stalledInReview = deliverableRows.filter((s) => {
      const st = s.settings as any
      if (normalizeStage(st?.activity?.status ?? 'to_do') !== 'in_review') return false
      const upd = st?.activity?.updatedAt ? new Date(st.activity.updatedAt).getTime() : null
      return upd != null && (nowMs - upd) > 14 * DAY_MS
    }).length
    if (stalledInReview > 0) {
      deliveryPenalties.push({ label: `${stalledInReview} stalled in review (14+ days)`, points: Math.min(20, stalledInReview * 10) })
    }
    if (totalDeliverables > 0 && approvedCount === 0 && kickoffDate && engagementDueDate) {
      const start = new Date(kickoffDate).getTime()
      const end = new Date(engagementDueDate).getTime()
      if (end > start && nowMs > start + (end - start) / 2) {
        deliveryPenalties.push({ label: 'No approved deliverables past mid-point', points: 15 })
      }
    }

    const avgDaysPerStage: Record<DeliverableStage, number> = { to_do: 0, in_progress: 0, in_review: 0, approved: 0 }
    for (const stage of ['to_do', 'in_progress', 'in_review', 'approved'] as DeliverableStage[]) {
      const rows = deliverableRows.filter((s) => normalizeStage((s.settings as any)?.activity?.status ?? 'to_do') === stage)
      if (rows.length === 0) continue
      const totalDays = rows.reduce((sum, s) => {
        const upd = (s.settings as any)?.activity?.updatedAt ? new Date((s.settings as any).activity.updatedAt).getTime() : nowMs
        return sum + Math.max(0, (nowMs - upd) / DAY_MS)
      }, 0)
      avgDaysPerStage[stage] = Math.round(totalDays / rows.length)
    }

    const allApproved = totalDeliverables > 0 && approvedCount === totalDeliverables
    const deliveryPenaltyTotal = deliveryPenalties.reduce((sum, p) => sum + p.points, 0)
    const deliveryScoreValue = Math.max(0, Math.min(100, 100 - deliveryPenaltyTotal + (allApproved ? 10 : 0)))
    const deliveryLevel: DeliveryHealthScore['level'] = deliveryScoreValue >= 80 ? 'good' : deliveryScoreValue >= 50 ? 'warning' : 'critical'
    const deliveryHealth: DeliveryHealthScore = {
      score: deliveryScoreValue,
      level: deliveryLevel,
      penalties: deliveryPenalties,
      approvedCount,
      overdueCount,
      totalCount: totalDeliverables,
      avgDaysPerStage,
    }

    // ── Overall Health Score inputs (Phase 7 & 8) ─────────────────────────────
    // Planning hygiene — subtasks (non-folder docs, any depth) inside IN-FLIGHT
    // deliverable folders that are fully planned: BOTH an assignee and a due date.
    // Approved deliverables are completed, so their subtasks are intentionally excluded.
    const deliverableFolderExtIds = new Set(
      docs
        .filter((d) => {
          if (!d.isFolder) return false
          const s = d.settings as any
          if (!s?.share?.createdAt) return false
          const status = s?.activity?.status === 'done' ? 'approved' : s?.activity?.status
          return status !== 'approved'
        })
        .map((d) => d.externalId)
    )
    const childrenByParent = new Map<string, typeof docs>()
    for (const d of docs) {
      if (!d.parentId) continue
      if (!childrenByParent.has(d.parentId)) childrenByParent.set(d.parentId, [])
      childrenByParent.get(d.parentId)!.push(d)
    }
    const subtaskDocs: typeof docs = []
    const folderQueue = Array.from(deliverableFolderExtIds)
    const visitedFolders = new Set<string>()
    while (folderQueue.length) {
      const ext = folderQueue.shift()!
      if (visitedFolders.has(ext)) continue
      visitedFolders.add(ext)
      for (const child of childrenByParent.get(ext) ?? []) {
        if (child.isFolder) folderQueue.push(child.externalId)
        else subtaskDocs.push(child)
      }
    }
    const docWithDueDate = subtaskDocs.filter((d) => !!d.dueDate).length
    const docWithAssignee = subtaskDocs.filter((d) => {
      try { return !!((d.settings as any)?.assigneeUserId) } catch { return false }
    }).length
    const inFlightDeliverables = deliverables.filter((d) => d.stage !== 'approved')
    const planningHygiene: PlanningHygiene = {
      deliverableTotal: inFlightDeliverables.length,
      deliverableWithDueDate: inFlightDeliverables.filter((d) => !!d.dueDate).length,
      docTotal: subtaskDocs.length,
      docWithDueDate,
      docWithAssignee,
    }

    // Comment responsiveness — answered vs unanswered threads.
    const totalThreads = commentsByDoc.size
    const commentThreads: CommentThreads = {
      answered: Math.max(0, totalThreads - unansweredThreads.length),
      unanswered: unansweredThreads.length,
      total: totalThreads,
    }

    // Pace — % delivered vs % of engagement duration elapsed.
    const deliveredPct = totalDeliverables > 0 ? Math.round((approvedCount / totalDeliverables) * 100) : 0
    const paceStartStr = kickoffDate ?? (engagement?.createdAt ? engagement.createdAt.toISOString() : null)
    let paceTimePct = 0
    let paceHasDeadline = false
    if (engagementDueDate && paceStartStr) {
      const start = new Date(paceStartStr).getTime()
      const end = new Date(engagementDueDate).getTime()
      if (end > start) {
        paceHasDeadline = true
        paceTimePct = Math.round(Math.max(0, Math.min(100, ((nowMs - start) / (end - start)) * 100)))
      }
    }
    const pace: EngagementPace = { deliveredPct, timePct: paceTimePct, hasDeadline: paceHasDeadline }

    // Finalize the Overall Health Score: append planning-hygiene + pace penalties to
    // the penalties gathered earlier (threads / overdue docs / sensitive / overdue engagement).
    const hygieneCovs: number[] = []
    if (planningHygiene.deliverableTotal > 0) hygieneCovs.push(planningHygiene.deliverableWithDueDate / planningHygiene.deliverableTotal)
    if (planningHygiene.docTotal > 0) {
      hygieneCovs.push(planningHygiene.docWithDueDate / planningHygiene.docTotal)
      hygieneCovs.push(planningHygiene.docWithAssignee / planningHygiene.docTotal)
    }
    if (hygieneCovs.length > 0) {
      const avgCov = hygieneCovs.reduce((a, b) => a + b, 0) / hygieneCovs.length
      const gapPoints = Math.min(15, Math.round((1 - avgCov) * 15))
      if (gapPoints > 0) penalties.push({ label: `Planning gaps (${Math.round(avgCov * 100)}% set up)`, points: gapPoints })
    }
    if (paceHasDeadline && totalDeliverables > 0) {
      const paceGap = paceTimePct - deliveredPct
      if (paceGap > 15) penalties.push({ label: `Behind pace (${deliveredPct}% delivered vs ${paceTimePct}% elapsed)`, points: Math.min(20, Math.round((paceGap - 15) / 2) + 5) })
    }

    // ── Phase 7C — Revision rounds, first-time-right, approval cycle ───────────
    // Revision rounds = TRUE rework: backward status transitions (later stage →
    // earlier stage), read from DOCUMENT_STATUS_CHANGED metadata { oldStatus, newStatus }.
    const STAGE_ORDER: Record<string, number> = { to_do: 0, in_progress: 1, in_review: 2, done: 3, approved: 3 }
    const statusEvents = await prisma.platformAuditEvent.findMany({
      where: { engagementId: projectId, eventType: 'DOCUMENT_STATUS_CHANGED' },
      select: { projectDocumentId: true, metadata: true },
    })
    const revisionByDoc = new Map<string, number>()
    for (const ev of statusEvents) {
      if (!ev.projectDocumentId) continue
      const m = ev.metadata as any
      const oldIdx = STAGE_ORDER[m?.oldStatus as string]
      const newIdx = STAGE_ORDER[m?.newStatus as string]
      if (oldIdx === undefined || newIdx === undefined) continue
      if (newIdx < oldIdx) revisionByDoc.set(ev.projectDocumentId, (revisionByDoc.get(ev.projectDocumentId) ?? 0) + 1)
    }
    const revisionMetrics: DeliverableRevisionMetric[] = deliverables
      .map((d) => ({ documentId: d.id, docId: d.docId, name: d.name, revisions: revisionByDoc.get(d.id) ?? 0 }))
      .sort((a, b) => b.revisions - a.revisions)

    // First-time-right — approved deliverables that were never sent back.
    const approvedDelivs = deliverables.filter((d) => d.stage === 'approved')
    const firstTimeCount = approvedDelivs.filter((d) => (revisionByDoc.get(d.id) ?? 0) === 0).length
    const firstTimeRight: FirstTimeRight = {
      firstTime: firstTimeCount,
      reworked: approvedDelivs.length - firstTimeCount,
      totalApproved: approvedDelivs.length,
    }
    if (firstTimeRight.totalApproved > 0 && firstTimeRight.reworked > 0) {
      const pts = Math.min(10, Math.round((firstTimeRight.reworked / firstTimeRight.totalApproved) * 10))
      if (pts > 0) penalties.push({ label: `${firstTimeRight.reworked} deliverable${firstTimeRight.reworked > 1 ? 's' : ''} reworked before approval`, points: pts })
    }

    // Approval cycle time — finalizedAt − createdAt across deliverables that have both.
    const cycleDaysList: number[] = []
    for (const s of deliverableRows) {
      const st = s.settings as any
      const created = st?.share?.createdAt
      const finalized = st?.share?.finalizedAt
      if (created && finalized) {
        const days = (new Date(finalized).getTime() - new Date(created).getTime()) / DAY_MS
        if (Number.isFinite(days) && days >= 0) cycleDaysList.push(days)
      }
    }
    const sortedCycle = [...cycleDaysList].sort((a, b) => a - b)
    const rawMedian = sortedCycle.length === 0
      ? null
      : sortedCycle.length % 2 === 1
        ? sortedCycle[(sortedCycle.length - 1) / 2]
        : (sortedCycle[sortedCycle.length / 2 - 1] + sortedCycle[sortedCycle.length / 2]) / 2
    const approvalCycle: ApprovalCycleMetric = {
      avgCycleDays: cycleDaysList.length ? Math.round((cycleDaysList.reduce((a, b) => a + b, 0) / cycleDaysList.length) * 10) / 10 : null,
      medianCycleDays: rawMedian !== null ? Math.round(rawMedian * 10) / 10 : null,
      deliverableCount: deliverableRows.length,
      approvedCount: cycleDaysList.length,
    }

    // Finalize the Overall Health Score (after all penalty inputs are gathered).
    const healthPenalty = penalties.reduce((sum, p) => sum + p.points, 0)
    const healthScoreValue = Math.max(0, 100 - healthPenalty)
    const healthLevel: EngagementHealthScore['level'] = healthScoreValue >= 80 ? 'good' : healthScoreValue >= 50 ? 'warning' : 'critical'
    const healthScore: EngagementHealthScore = { score: healthScoreValue, level: healthLevel, penalties }

    const savedSections = (firm?.settings as Record<string, unknown>)?.externalSections as Partial<ExternalSectionsConfig> | undefined
    const externalSections: ExternalSectionsConfig = {
      engagementHealth: savedSections?.engagementHealth ?? EXTERNAL_SECTION_DEFAULTS.engagementHealth,
      fileOrganization: savedSections?.fileOrganization ?? EXTERNAL_SECTION_DEFAULTS.fileOrganization,
      documentActivity: savedSections?.documentActivity ?? EXTERNAL_SECTION_DEFAULTS.documentActivity,
    }
    const insightsConfig: InsightsConfig = isExternalPersona ? buildExternalConfig(externalSections) : INTERNAL_CONFIG

    const response: EngagementInsightsResponse = {
      insightsConfig,
      unansweredThreads,
      documentsDueSoon,
      engagementDueDate,
      engagementDaysUntilDue,
      kickoffDate,
      engagementCreatedAt: engagement?.createdAt ? engagement.createdAt.toISOString() : null,
      insightsSummary: ((engagement?.settings as Record<string, unknown> | null)?.insightsSummary as string | null) ?? null,
      folderHealth: folderHealthWithAllSignals,
      storageHealth,
      pendingInvitations,
      memberCount: members.length,
      membersByRole,
      recentDocuments,
      sensitiveFiles,
      sharesProgress,
      sharedDocsCount: shares.length,
      pendingApprovalSharesCount,
      healthScore,
      deliverables,
      deliveryHealth,
      planningHygiene,
      commentThreads,
      pace,
      revisionMetrics,
      approvalCycle,
      firstTimeRight,
    }

    // External roles (EC/EV): strip data they must never see regardless of config.
    // Only zero out fields that are always hidden from externals (File Org, Team Status, Document Activity).
    // Fields tied to visible rings (unansweredThreads → Comment Responsiveness, documentsDueSoon → header)
    // must pass through as-is so the real values are shown.
    if (isExternalPersona) {
      return NextResponse.json({
        ...response,
        // Team Status — always hidden for externals
        pendingInvitations: [],
        membersByRole: {},
        // File Organization — always hidden for externals
        folderHealth: { score: 0, totalFolders: 0, totalFiles: 0, maxDepth: 0, orphanedFiles: 0, deeplyNestedFolders: 0, emptyFolders: 0, issues: [], penalties: [] },
        storageHealth: { totalFiles: 0, totalSizeBytes: 0, staleFiles: [], largeFiles: [], staleCount: 0, largeCount: 0, staleTotalBytes: 0, duplicateGroups: [], duplicateCount: 0, badlyNamedCount: 0 },
        sensitiveFiles: [],
        // Document Activity — always hidden for externals
        recentDocuments: [],
        pendingApprovalSharesCount: 0,
      } satisfies EngagementInsightsResponse)
    }

    return NextResponse.json(response)
  } catch (e) {
    console.error('GET project insights error', e)
    return NextResponse.json({ error: 'Failed to load insights' }, { status: 500 })
  }
}
