import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveGroupId } from '@/lib/billing/billing-group'
import { loadAuthUsers, displayName } from '@/lib/system/auth-users'
import type { AiFeature } from './usage'
import type { FeedbackReason } from './feedback-reasons'

/**
 * Thumbs up/down on individual AI answers.
 *
 * ## What this is NOT
 *
 * It does not improve responses automatically. There is no fine-tuning and the model has no memory
 * across calls, so a thumbs-down changes nothing by itself. Anyone promising otherwise is selling
 * something.
 *
 * What it does is tell US where the prompt is wrong — which feature is failing, how often, and on
 * what kind of question. That is actionable by a person editing a prompt, which is how every AI
 * quality fix in this codebase has actually happened.
 *
 * ## What it stores
 *
 * The rating, the chip, and ids. Neither the question nor the answer.
 *
 * The question used to be stored, so a negative rating could be diagnosed. It never achieved that:
 * the answer is not stored either, so the question alone narrows a search without answering it,
 * against engagement data that has since changed. That was a poor trade for text a user typed,
 * which can name a client.
 *
 * The chips carry the signal instead — "Got facts wrong" on the chat feature, counted over time,
 * says what the assistant is unreliable at while holding nobody's words. If that proves too coarse,
 * collect more then and update the privacy policy to match. Collecting first and justifying later
 * is the wrong order.
 */

// Re-exported so server callers have one import for the whole feedback surface. The definitions
// live in a client-safe module because the chat panel renders the picker.
export {
    POSITIVE_REASONS,
    NEGATIVE_REASONS,
    REASON_LABELS,
    reasonsFor,
    isValidReason,
    type FeedbackReason,
} from './feedback-reasons'


export interface RecordFeedbackParams {
    firmId: string
    engagementId?: string | null
    userId?: string | null
    feature: AiFeature
    helpful: boolean
    reason?: FeedbackReason | null
    /**
     * @deprecated Always null. Kept so the column and any rows written before this change still
     * read back, and so a caller passing it fails the typecheck rather than silently storing text.
     */
    question?: null
    /** Client-minted id of the answer, so a corrected rating replaces rather than duplicates. */
    answerId?: string | null
    /** Client-minted id of the conversation, for reading a thread's ratings together. */
    threadId?: string | null
}

/**
 * Records one rating, replacing any earlier rating of the same answer by the same user.
 *
 * Ratings are editable in the UI — someone who picks the wrong chip, or marks an answer bad before
 * realising their complaint belongs in a different category, must be able to correct it. Appending
 * on each change would inflate the efficacy counts, so a rating carrying an `answerId` upserts.
 *
 * Without an `answerId` (the brief and summary surfaces, which have no chat turn to key on) this
 * falls back to a plain insert.
 *
 * Never throws. Feedback is diagnostics: losing a row costs a data point, while an error surfacing
 * in the UI would punish the user for trying to help. Same reasoning as `recordAiUsage`.
 */
export async function recordAiFeedback(params: RecordFeedbackParams): Promise<void> {
    try {
        const groupId = await resolveGroupId(params.firmId)
        if (!groupId) {
            logger.warn(`AI feedback not recorded (${params.feature}): no billing group for firm`)
            return
        }

        const data = {
            groupId,
            firmId: params.firmId,
            engagementId: params.engagementId ?? null,
            userId: params.userId ?? null,
            feature: params.feature,
            helpful: params.helpful,
            // Kept for both signs. Positive ratings now carry their own vocabulary ("what made it
            // good"), which is what tells us which capability to protect when a prompt is edited —
            // a bare thumbs-up cannot.
            reason: params.reason ?? null,
            // Always null — see the note at the top of this file. Written explicitly rather than
            // omitted so the column is set rather than left to a default, and so this line is
            // where anyone looking for the question storage lands.
            question: null,
            answerId: params.answerId ?? null,
            threadId: params.threadId ?? null,
        }

        // The unique index is on (answerId, userId), so an upsert needs both. Anonymous ratings
        // cannot be keyed and simply insert.
        if (data.answerId && data.userId) {
            await prisma.platformAiFeedback.upsert({
                where: { answerId_userId: { answerId: data.answerId, userId: data.userId } },
                create: data,
                // createdAt is deliberately left alone: it marks when the user first reacted to the
                // answer, which is what dates the row against the answer it describes.
                update: {
                    helpful: data.helpful,
                    reason: data.reason,
                    question: data.question,
                },
            })
            return
        }

        await prisma.platformAiFeedback.create({ data })
    } catch (error) {
        logger.error(`Failed to record AI feedback (${params.feature}):`, error as Error)
    }
}

export interface FeatureEfficacy {
    feature: string
    helpful: number
    unhelpful: number
    total: number
    /** Share rated helpful, 0-100. Null below the sample threshold. */
    helpfulPct: number | null
}

/** Who gave a rating and what it was about, for grouping and for offline follow-up. */
export interface RatingAttribution {
    firmId: string | null
    firmName: string | null
    clientName: string | null
    engagementId: string | null
    engagementName: string | null
    userId: string | null
    userName: string | null
    userEmail: string | null
}

export interface RatingRow extends RatingAttribution {
    createdAt: string
    feature: string
    helpful: boolean
    reason: string | null
    question: string | null
    threadId: string | null
}

/** One firm's rating tally, so a struggling account is visible without reading every row. */
export interface FirmEfficacy {
    firmId: string
    firmName: string | null
    helpful: number
    unhelpful: number
    total: number
    helpfulPct: number | null
}

export interface AiEfficacyReport {
    sinceIso: string
    byFeature: FeatureEfficacy[]
    byFirm: FirmEfficacy[]
    /** Counts for negative chips. */
    reasonCounts: Array<{ reason: string; count: number }>
    /** Counts for positive chips — which capability users value, and worth protecting. */
    positiveReasonCounts: Array<{ reason: string; count: number }>
    recentNegatives: RatingRow[]
    totalRatings: number
}

/**
 * Below this, a percentage misleads more than it informs — one thumbs-down out of two reads as
 * "50% unhelpful" when it is really a single data point.
 */
const MIN_SAMPLE_FOR_PCT = 5

function pct(helpful: number, total: number): number | null {
    return total >= MIN_SAMPLE_FOR_PCT ? Math.round((helpful / total) * 100) : null
}

/**
 * Resolves firm, client, engagement and reporter names for a set of rating rows.
 *
 * The table stores ids only, which is right for the write path but useless for the one thing this
 * dashboard is for: noticing that a particular account is struggling and going to talk to them.
 * Names are therefore joined at read time, by an admin who is already authorised to see them.
 */
async function attributeRows(
    rows: Array<{
        createdAt: Date
        feature: string
        helpful: boolean
        reason: string | null
        question: string | null
        threadId: string | null
        firmId: string | null
        engagementId: string | null
        userId: string | null
    }>,
): Promise<RatingRow[]> {
    const firmIds = Array.from(new Set(rows.map((r) => r.firmId).filter((v): v is string => Boolean(v))))
    const engagementIds = Array.from(new Set(rows.map((r) => r.engagementId).filter((v): v is string => Boolean(v))))
    const userIds = new Set(rows.map((r) => r.userId).filter((v): v is string => Boolean(v)))

    const [firms, engagements, authById] = await Promise.all([
        firmIds.length
            ? prisma.firm.findMany({ where: { id: { in: firmIds } }, select: { id: true, name: true } })
            : [],
        engagementIds.length
            ? prisma.engagement.findMany({
                where: { id: { in: engagementIds } },
                select: { id: true, name: true, client: { select: { name: true } } },
            })
            : [],
        loadAuthUsers(userIds),
    ])

    const firmById = new Map(firms.map((f) => [f.id, f.name]))
    const engById = new Map(engagements.map((e) => [e.id, e]))

    return rows.map((r) => {
        const auth = r.userId ? authById.get(r.userId) : null
        const eng = r.engagementId ? engById.get(r.engagementId) : null
        return {
            createdAt: r.createdAt.toISOString(),
            feature: r.feature,
            helpful: r.helpful,
            reason: r.reason,
            question: r.question,
            threadId: r.threadId,
            firmId: r.firmId,
            firmName: r.firmId ? firmById.get(r.firmId) ?? null : null,
            clientName: eng?.client?.name ?? null,
            engagementId: r.engagementId,
            engagementName: eng?.name ?? null,
            userId: r.userId,
            userName: r.userId ? displayName(auth, r.userId) : null,
            userEmail: auth?.email ?? null,
        }
    })
}

/**
 * Efficacy across all firms, for the system admin dashboard.
 *
 * `firmId` narrows every section to one account, so a known-unhappy firm can be read on its own.
 */
export async function getAiEfficacyReport(days = 30, firmId?: string): Promise<AiEfficacyReport> {
    const since = new Date(Date.now() - days * 86_400_000)
    const scope = { createdAt: { gte: since }, ...(firmId ? { firmId } : {}) }

    const [grouped, byFirmRaw, reasons, positiveReasons, negatives, total] = await Promise.all([
        prisma.platformAiFeedback.groupBy({
            by: ['feature', 'helpful'],
            where: scope,
            _count: { _all: true },
        }),
        prisma.platformAiFeedback.groupBy({
            by: ['firmId', 'helpful'],
            where: { ...scope, firmId: { not: null } },
            _count: { _all: true },
        }),
        prisma.platformAiFeedback.groupBy({
            by: ['reason'],
            where: { ...scope, helpful: false, reason: { not: null } },
            _count: { _all: true },
        }),
        prisma.platformAiFeedback.groupBy({
            by: ['reason'],
            where: { ...scope, helpful: true, reason: { not: null } },
            _count: { _all: true },
        }),
        prisma.platformAiFeedback.findMany({
            where: { ...scope, helpful: false },
            orderBy: { createdAt: 'desc' },
            take: 25,
            select: {
                createdAt: true, feature: true, helpful: true, reason: true, question: true,
                threadId: true, firmId: true, engagementId: true, userId: true,
            },
        }),
        prisma.platformAiFeedback.count({ where: scope }),
    ])

    const byFeatureMap = new Map<string, FeatureEfficacy>()
    for (const row of grouped) {
        const current = byFeatureMap.get(row.feature)
            ?? { feature: row.feature, helpful: 0, unhelpful: 0, total: 0, helpfulPct: null }
        if (row.helpful) current.helpful += row._count._all
        else current.unhelpful += row._count._all
        current.total = current.helpful + current.unhelpful
        byFeatureMap.set(row.feature, current)
    }

    const byFirmMap = new Map<string, FirmEfficacy>()
    for (const row of byFirmRaw) {
        if (!row.firmId) continue
        const current = byFirmMap.get(row.firmId)
            ?? { firmId: row.firmId, firmName: null, helpful: 0, unhelpful: 0, total: 0, helpfulPct: null }
        if (row.helpful) current.helpful += row._count._all
        else current.unhelpful += row._count._all
        current.total = current.helpful + current.unhelpful
        byFirmMap.set(row.firmId, current)
    }

    const firmNames = byFirmMap.size
        ? await prisma.firm.findMany({
            where: { id: { in: Array.from(byFirmMap.keys()) } },
            select: { id: true, name: true },
        })
        : []
    const firmNameById = new Map(firmNames.map((f) => [f.id, f.name]))

    const byFeature = Array.from(byFeatureMap.values())
        .map((f) => ({ ...f, helpfulPct: pct(f.helpful, f.total) }))
        .sort((a, b) => b.total - a.total)

    const byFirm = Array.from(byFirmMap.values())
        .map((f) => ({
            ...f,
            firmName: firmNameById.get(f.firmId) ?? null,
            helpfulPct: pct(f.helpful, f.total),
        }))
        // Worst first: the point of this table is finding the account to go talk to.
        .sort((a, b) => (a.helpfulPct ?? 101) - (b.helpfulPct ?? 101) || b.total - a.total)

    const counts = (rows: Array<{ reason: string | null; _count: { _all: number } }>) =>
        rows.map((r) => ({ reason: r.reason ?? 'unspecified', count: r._count._all }))
            .sort((a, b) => b.count - a.count)

    return {
        sinceIso: since.toISOString(),
        byFeature,
        byFirm,
        reasonCounts: counts(reasons),
        positiveReasonCounts: counts(positiveReasons),
        recentNegatives: await attributeRows(negatives),
        totalRatings: total,
    }
}
