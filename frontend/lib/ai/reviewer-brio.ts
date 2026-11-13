import 'server-only'
import { prisma } from '@/lib/prisma'
import { REVIEWER_DAILY_ANSWERS } from './features'

export { REVIEWER_DAILY_ANSWERS }

/**
 * The switches around Brio for Reviewers (.claude/plans/brio-features-round-2.md, §3.6).
 */

/** Off until a firm admin turns it on: Settings › what Reviewers and Limited Access contributors see. */
export async function reviewerBrioEnabled(firmId: string): Promise<boolean> {
    const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } })
    const sections = (firm?.settings as { externalSections?: { brioForReviewers?: unknown } } | null)?.externalSections
    return sections?.brioForReviewers === true
}

/** Answers this person has had today (UTC), from the usage ledger. */
export async function reviewerAnswersToday(userId: string, now: Date = new Date()): Promise<number> {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    return prisma.platformAiUsage.count({
        where: { userId, feature: 'reviewerChat', createdAt: { gte: start } },
    })
}
