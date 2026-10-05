import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveGroupId } from '@/lib/billing/billing-group'
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
 * The question, never the answer. The question is text the user typed knowing it went to the
 * assistant; the answer is derived from engagement data, so storing it would copy client data into
 * a second table for no gain — the question plus timestamp reproduces it. This mirrors the boundary
 * the AI context itself holds.
 */

// Re-exported so server callers have one import for the whole feedback surface. The definitions
// live in a client-safe module because the chat panel renders the picker.
export { FEEDBACK_REASONS, isValidReason, type FeedbackReason } from './feedback-reasons'

/** Questions are truncated rather than rejected: a long one is still a usable signal. */
const MAX_QUESTION_CHARS = 500

export interface RecordFeedbackParams {
    firmId: string
    engagementId?: string | null
    userId?: string | null
    feature: AiFeature
    helpful: boolean
    reason?: FeedbackReason | null
    question?: string | null
}

/**
 * Records one rating.
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

        await prisma.platformAiFeedback.create({
            data: {
                groupId,
                firmId: params.firmId,
                engagementId: params.engagementId ?? null,
                userId: params.userId ?? null,
                feature: params.feature,
                helpful: params.helpful,
                // A reason only means something on a negative rating.
                reason: params.helpful ? null : (params.reason ?? null),
                question: params.question?.trim().slice(0, MAX_QUESTION_CHARS) || null,
            },
        })
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

export interface RecentNegative {
    createdAt: string
    feature: string
    reason: string | null
    question: string | null
}

export interface AiEfficacyReport {
    sinceIso: string
    byFeature: FeatureEfficacy[]
    reasonCounts: Array<{ reason: string; count: number }>
    recentNegatives: RecentNegative[]
    totalRatings: number
}

/**
 * Below this, a percentage misleads more than it informs — one thumbs-down out of two reads as
 * "50% unhelpful" when it is really a single data point.
 */
const MIN_SAMPLE_FOR_PCT = 5

/** Efficacy across all firms, for the system admin dashboard. */
export async function getAiEfficacyReport(days = 30): Promise<AiEfficacyReport> {
    const since = new Date(Date.now() - days * 86_400_000)

    const [grouped, reasons, negatives, total] = await Promise.all([
        prisma.platformAiFeedback.groupBy({
            by: ['feature', 'helpful'],
            where: { createdAt: { gte: since } },
            _count: { _all: true },
        }),
        prisma.platformAiFeedback.groupBy({
            by: ['reason'],
            where: { createdAt: { gte: since }, helpful: false, reason: { not: null } },
            _count: { _all: true },
        }),
        prisma.platformAiFeedback.findMany({
            where: { createdAt: { gte: since }, helpful: false },
            orderBy: { createdAt: 'desc' },
            take: 25,
            select: { createdAt: true, feature: true, reason: true, question: true },
        }),
        prisma.platformAiFeedback.count({ where: { createdAt: { gte: since } } }),
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

    const byFeature = Array.from(byFeatureMap.values())
        .map((f) => ({
            ...f,
            helpfulPct: f.total >= MIN_SAMPLE_FOR_PCT ? Math.round((f.helpful / f.total) * 100) : null,
        }))
        .sort((a, b) => b.total - a.total)

    return {
        sinceIso: since.toISOString(),
        byFeature,
        reasonCounts: reasons
            .map((r) => ({ reason: r.reason ?? 'unspecified', count: r._count._all }))
            .sort((a, b) => b.count - a.count),
        recentNegatives: negatives.map((n) => ({
            createdAt: n.createdAt.toISOString(),
            feature: n.feature,
            reason: n.reason,
            question: n.question,
        })),
        totalRatings: total,
    }
}
