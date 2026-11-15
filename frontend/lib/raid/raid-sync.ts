import 'server-only'
import { prisma } from '@/lib/prisma'
import { computeEngagementInsights } from '@/lib/insights/engagement-insights'
import { planningGapCount } from '@/lib/insights/health-penalties'
import { blockedOf } from '@/lib/files/blocked'
import { approvalsOf } from '@/lib/files/approvals'
import { loadPeople } from '@/lib/files/file-creator'
import { formatDisplayName } from '@/lib/comments/mentions'
import { logger } from '@/lib/logger'
import {
    planRaidSync,
    raidSignals,
    type BlockedDocumentSignal,
    type ExistingAutoItem,
    type RaidSignal,
} from './raid-signals'

/**
 * Keeps the free entries of an engagement's RAID log current (lib/raid/raid-signals.ts says which),
 * on read: the tab and the Overview card ask for the log, and the log is brought up to date first.
 *
 * The signals come from computeEngagementInsights, the same numbers the Action Center shows, plus the
 * Board's own flags (Blocked, and who approved). That call is not cheap, so a sync runs at most once a
 * minute per engagement on a server instance; "Check now" forces one. A completed engagement is read
 * only and is left as it was.
 */

const SYNC_EVERY_MS = 60_000
const lastSynced = new Map<string, number>()

/** For tests: forget when each engagement was synced. */
export function resetRaidSyncThrottle(): void {
    lastSynced.clear()
}

const firstName = (person: { name: string; email: string } | undefined) =>
    person ? formatDisplayName(person.name, person.email).split(/\s+/)[0] || null : null

interface BoardRow {
    id: string
    docId: string | null
    fileName: string
    parentId: string | null
    isFolder: boolean
    settings: unknown
}

/**
 * The Board's flags the insights don't carry: documents marked Blocked, and the approved deliverables'
 * settings (who finalized them, their documents' approvals). One query, filtered in SQL so a large
 * engagement's files aren't all read again.
 */
async function loadBoardFlags(engagementId: string, approvedIds: string[]): Promise<{ blocked: BlockedDocumentSignal[]; approvers: Map<string, string | null> }> {
    const rows = await prisma.$queryRawUnsafe<BoardRow[]>(
        `SELECT id, "docId", "fileName", "parentId", "isFolder", settings
           FROM platform.engagement_documents
          WHERE "engagementId" = $1::uuid
            AND status <> 'ARCHIVED'
            AND ((settings -> 'blocked') IS NOT NULL OR id = ANY($2::uuid[]))`,
        engagementId,
        approvedIds,
    )

    // A blocked document's reference: its own DOC-ID, or the folder above it.
    const blockedRows = rows.filter((r) => blockedOf(r.settings))
    const parentIds = Array.from(new Set(blockedRows.filter((r) => !r.docId && r.parentId).map((r) => r.parentId!)))
    const parents = parentIds.length > 0
        ? await prisma.engagementDocument.findMany({
            where: { engagementId, isFolder: true, externalId: { in: parentIds } },
            select: { externalId: true, docId: true },
        })
        : []
    const parentRef = new Map(parents.map((p) => [p.externalId, p.docId ?? null]))
    const blocked = blockedRows.map((r): BlockedDocumentSignal => {
        const flag = blockedOf(r.settings)!
        return {
            documentId: r.id,
            ref: r.docId ?? (r.parentId ? parentRef.get(r.parentId) ?? null : null),
            fileName: r.fileName,
            reason: flag.reason,
            ...(flag.note ? { note: flag.note } : {}),
            at: flag.at,
        }
    })

    // Who approved: the finalize lock's author, else the latest approval record on the folder.
    const approverIdByDeliverable = new Map<string, string | null>()
    for (const r of rows) {
        if (!approvedIds.includes(r.id)) continue
        const s = (r.settings ?? {}) as { lock?: { finalizedBy?: unknown; acceptedBy?: unknown } | null }
        const fromLock = typeof s.lock?.acceptedBy === 'string' ? s.lock.acceptedBy
            : typeof s.lock?.finalizedBy === 'string' ? s.lock.finalizedBy : null
        approverIdByDeliverable.set(r.id, fromLock ?? approvalsOf(r.settings).at(-1)?.approvedBy ?? null)
    }
    const people = await loadPeople(Array.from(approverIdByDeliverable.values()).filter((v): v is string => !!v))
    const approvers = new Map<string, string | null>()
    for (const [id, userId] of Array.from(approverIdByDeliverable.entries())) approvers.set(id, userId ? firstName(people.get(userId)) : null)

    return { blocked, approvers }
}

/**
 * Brings the engagement's STATUS, HEALTH and BOARD entries up to date. Never throws: the log is still
 * worth showing as it was if a sync fails, and the failure is logged.
 */
export async function syncRaidSignals(engagementId: string, firmId: string, options: { force?: boolean; now?: Date } = {}): Promise<void> {
    const now = options.now ?? new Date()
    const last = lastSynced.get(engagementId)
    if (!options.force && last && now.getTime() - last < SYNC_EVERY_MS) return
    lastSynced.set(engagementId, now.getTime())

    try {
        const engagement = await prisma.engagement.findFirst({ where: { id: engagementId, isDeleted: false }, select: { status: true } })
        if (!engagement || engagement.status === 'COMPLETED') return

        const insights = await computeEngagementInsights(engagementId, firmId, false)
        const approvedIds = insights.deliverables.filter((d) => d.stage === 'approved').map((d) => d.id)
        const [board, resolved, existingRows] = await Promise.all([
            loadBoardFlags(engagementId, approvedIds),
            prisma.docCommentThread.findMany({ where: { engagementId, resolvedAt: { not: null } }, select: { projectDocumentId: true } }),
            prisma.engagementRaidItem.findMany({
                where: { engagementId, signalKey: { not: null } },
                select: { id: true, signalKey: true, status: true, title: true, closedBy: true, priority: true, prioritySetBy: true },
            }),
        ])

        const signals = raidSignals({
            now,
            deliverables: insights.deliverables,
            unansweredThreads: insights.unansweredThreads,
            threadRefs: new Map(insights.commentThreads.documents.map((d) => [d.documentId, d.docId])),
            pace: insights.pace,
            planningGaps: planningGapCount(insights.planningHygiene),
            blocked: board.blocked,
            approvers: board.approvers,
            healthPoints: healthPointsOf(insights.healthScore?.penalties ?? []),
        })
        const existing: ExistingAutoItem[] = existingRows.map((r) => ({ ...r, signalKey: r.signalKey! }))
        const plan = planRaidSync(existing, signals, {
            now,
            deliverables: insights.deliverables,
            resolvedThreads: new Set(resolved.map((t) => t.projectDocumentId)),
        })

        await applyRaidSyncPlan(engagementId, firmId, plan, now)
    } catch (error) {
        // Try again on the next read rather than a minute later.
        lastSynced.delete(engagementId)
        logger.error('[raid] sync failed', error as Error)
    }
}

/**
 * The Health score's deductions for Behind pace and Planning gaps, by their labels
 * (lib/insights/engagement-insights.ts), so their RAID entries take the same grade.
 */
export function healthPointsOf(penalties: readonly { label: string; points: number }[]): { pace?: number; planning?: number } {
    const pointsFor = (prefix: string) => penalties.find((p) => p.label.startsWith(prefix))?.points
    return { pace: pointsFor('Behind pace'), planning: pointsFor('Planning gaps') }
}

const rowFor = (engagementId: string, firmId: string, s: RaidSignal) => ({
    firmId,
    engagementId,
    type: s.type,
    title: s.title,
    status: s.status,
    sourceKind: s.sourceKind,
    sourceRef: s.key,
    signalKey: s.key,
    internalSource: false,
    raisedAt: s.raisedAt,
    priority: s.priority ?? null,
})

/** Writes a plan. Titles, statuses, close reasons and the grade's priority: owners, notes and a chosen priority are a person's. */
export async function applyRaidSyncPlan(engagementId: string, firmId: string, plan: ReturnType<typeof planRaidSync>, now: Date): Promise<void> {
    if (plan.create.length > 0) {
        // skipDuplicates: two syncs racing on the same engagement make one entry per signal.
        await prisma.engagementRaidItem.createMany({ data: plan.create.map((s) => rowFor(engagementId, firmId, s)), skipDuplicates: true })
    }
    for (const r of plan.retitle) {
        await prisma.engagementRaidItem.update({ where: { id: r.id }, data: { title: r.title } })
    }
    for (const c of plan.close) {
        await prisma.engagementRaidItem.update({
            where: { id: c.id },
            data: { status: 'CLOSED', closedAt: now, closedReason: c.reason, closedBy: null },
        })
    }
    for (const r of plan.reopen) {
        await prisma.engagementRaidItem.update({
            where: { id: r.id },
            data: {
                status: r.signal.status,
                title: r.signal.title,
                raisedAt: r.signal.raisedAt,
                closedAt: null,
                closedReason: null,
                closedBy: null,
                ...(!r.keepPriority && r.signal.priority ? { priority: r.signal.priority } : {}),
            },
        })
    }
    for (const r of plan.reprioritize) {
        await prisma.engagementRaidItem.update({ where: { id: r.id }, data: { priority: r.priority } })
    }
}
