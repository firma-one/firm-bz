import 'server-only'
import { prisma } from '@/lib/prisma'
import { isAiConfigured } from '@/lib/ai/client'
import { AiCreditLimitError } from '@/lib/ai/guarded-client'
import { MAX_MEMO_CHARS, findNotesActions, loadNotesDeliverables, resolveToday } from '@/lib/ai/notes-proposals'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { runMemoRaidCheck } from '@/lib/raid/raid-check'
import { logger } from '@/lib/logger'
import { readMemoText, writeMemoReview } from './memo-store'
import { memoReviewOf } from './memo-shared'

/**
 * A memo reviewed in one place (.claude/plans/brio-features-round-2.md, §13). When a memo is added, Brio
 * identifies its action items and suggests its RAID entries, and both wait on the memo: action items
 * for someone to apply, RAID suggestions for someone to accept. Nothing here applies anything: it writes
 * the memo's review (proposals, quotes as anchors only) and SUGGESTED RAID rows, never a reminder, a due
 * date or an accepted entry.
 *
 * Runs after the memos route has answered (Next's `after()`), so saving stays quick. It never throws: a
 * memo it couldn't review is left as it was, and the sparkle runs it by hand.
 *
 * One credit, charged to the firm (no person pressed anything, so no per-person limit): the action items
 * (`notesProposals`, 1); the RAID pass is `memoRaid`, at 0.
 */

/** The firm's switch, on by default: Settings › Brio › "Identify action items when a memo is added". */
export async function memoReviewEnabled(firmId: string): Promise<boolean> {
    const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } })
    const brio = (firm?.settings as { brio?: { memoReview?: unknown } } | null)?.brio
    return brio?.memoReview !== false
}

/** What a reminder needs to point back to its engagement, as the Find actions route answers it. */
export async function notesEngagementRef(engagementId: string, firmId: string): Promise<{ id: string; name: string; firmId: string; ctaUrl: string | null }> {
    const engagement = await prisma.engagement.findUnique({
        where: { id: engagementId },
        select: {
            name: true,
            slug: true,
            client: { select: { slug: true, firm: { select: { slug: true, group: { select: { slug: true } } } } } },
        },
    })
    const groupSlug = engagement?.client?.firm?.group?.slug
    const firmSlug = engagement?.client?.firm?.slug
    const clientSlug = engagement?.client?.slug
    const ctaUrl = groupSlug && firmSlug && clientSlug && engagement?.slug
        ? engagementPath(groupSlug, firmSlug, clientSlug, engagement.slug)
        : null
    return { id: engagementId, name: engagement?.name ?? '', firmId, ctaUrl }
}

export type MemoReviewOnAddOutcome =
    | { status: 'reviewed'; actionItems: number; raidSuggested: number }
    | { status: 'off' | 'unconfigured' | 'unread' | 'empty' | 'too_long' | 'over_limit' | 'no_answer' | 'failed' }

/** Reviews a memo that was just added. Never throws. */
export async function reviewMemoOnAdd(params: { engagementId: string; firmId: string; memoId: string; now?: Date }): Promise<MemoReviewOnAddOutcome> {
    const now = params.now ?? new Date()
    try {
        if (!isAiConfigured()) return { status: 'unconfigured' }
        if (!(await memoReviewEnabled(params.firmId))) return { status: 'off' }

        // Read for these calls only, as Find actions reads it; never stored.
        const read = await readMemoText(params.engagementId, params.memoId)
        if (!read.ok) {
            logger.warn('[memo-review] the memo could not be read', { engagementId: params.engagementId, memoId: params.memoId, status: read.status })
            return { status: 'unread' }
        }
        const text = read.text.trim()
        if (!text) return { status: 'empty' }
        if (text.length > MAX_MEMO_CHARS) return { status: 'too_long' }

        const found = await findNotesActions({
            notes: text,
            deliverables: await loadNotesDeliverables(params.engagementId),
            today: resolveToday(undefined, now),
            scope: { firmId: params.firmId, userId: null, feature: 'notesProposals' },
        })
        if (!found.ok) return { status: found.reason === 'unconfigured' ? 'unconfigured' : 'no_answer' }
        await writeMemoReview(params.engagementId, params.memoId, memoReviewOf(found, text, 'auto', now))

        // The memo's RAID suggestions, beside its action items. Its own failure doesn't undo them.
        let raidSuggested = 0
        try {
            const raid = await runMemoRaidCheck({
                engagementId: params.engagementId,
                firmId: params.firmId,
                memo: { id: params.memoId, title: read.memo.title, date: read.memo.date, text },
                now,
            })
            if (raid.ok) raidSuggested = raid.suggested
        } catch (error) {
            if (!(error instanceof AiCreditLimitError)) logger.error('[memo-review] the memo RAID pass failed', error as Error)
        }
        return { status: 'reviewed', actionItems: found.proposals.length, raidSuggested }
    } catch (error) {
        if (error instanceof AiCreditLimitError) return { status: 'over_limit' }
        logger.error('[memo-review] reviewing a new memo failed', error as Error)
        return { status: 'failed' }
    }
}
