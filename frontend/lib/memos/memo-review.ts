import 'server-only'
import { prisma } from '@/lib/prisma'
import { isAiConfigured } from '@/lib/ai/client'
import { AiCreditLimitError } from '@/lib/ai/guarded-client'
import { MAX_MEMO_CHARS, findNotesActions, loadNotesDeliverables, resolveToday } from '@/lib/ai/notes-proposals'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
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

/** What set Brio reading a memo: it was added, its notes were edited (the box ticked), or a person pressed the sparkle. */
export type MemoReadTrigger = 'added' | 'edited' | 'person'

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const WHEN: Record<MemoReadTrigger, string> = { added: 'when it was added', edited: 'after its notes were edited', person: 'asked for' }

/**
 * The audit trail's record that Brio read a memo (its words went to the model): who set it off and what
 * it found, never the memo's words. Firm only, as every memo event is (lib/audit-event-types.ts).
 * `actionItems` null: nothing usable came back.
 */
export function auditMemoRead(params: {
    firmId: string
    clientId?: string | null
    engagementId: string
    memoId: string
    fileName: string
    actorUserId: string | null
    trigger: MemoReadTrigger
    actionItems: number | null
    raidSuggested?: number
}): void {
    const found = params.actionItems === null
        ? 'nothing usable came back'
        : [plural(params.actionItems, 'action item'), ...(params.raidSuggested ? [plural(params.raidSuggested, 'RAID suggestion')] : [])].join(' · ')
    audit(AUDIT_EVENT.DOCUMENT_AI_REVIEWED)
        .firm(params.firmId).client(params.clientId ?? undefined).engagement(params.engagementId).document(params.memoId)
        .actor(params.actorUserId).scope(AUDIT_SCOPE.DOCUMENT)
        .meta({
            fileName: params.fileName,
            memo: true,
            agent: 'Brio',
            trigger: params.trigger,
            actionItems: params.actionItems,
            ...(params.raidSuggested !== undefined ? { raidSuggested: params.raidSuggested } : {}),
            summary: `${found} · ${WHEN[params.trigger]}`,
        })
        .fireAndForget()
}

export type MemoReviewOnAddOutcome =
    | { status: 'reviewed'; actionItems: number; raidSuggested: number }
    | { status: 'off' | 'unconfigured' | 'unread' | 'empty' | 'too_long' | 'over_limit' | 'no_answer' | 'failed' }

/**
 * Reviews a memo that was just added, or whose notes were just edited. Never throws.
 *
 * `requested`: a person asked for it, ticking "Identify action items in the new notes" when editing a memo
 * (§14.3), so the firm's switch for new memos doesn't apply. Still one credit, from the firm.
 */
export async function reviewMemoOnAdd(params: {
    engagementId: string
    firmId: string
    memoId: string
    now?: Date
    requested?: boolean
    /** For the audit trail: who added or edited the memo, and the client. */
    actorUserId?: string | null
    clientId?: string | null
    trigger?: Exclude<MemoReadTrigger, 'person'>
}): Promise<MemoReviewOnAddOutcome> {
    const now = params.now ?? new Date()
    try {
        if (!isAiConfigured()) return { status: 'unconfigured' }
        if (!params.requested && !(await memoReviewEnabled(params.firmId))) return { status: 'off' }

        // Read for these calls only, as Find actions reads it; never stored.
        const memo = await readMemoText(params.engagementId, params.memoId)
        if (!memo.ok) {
            logger.warn('[memo-review] the memo could not be read', { engagementId: params.engagementId, memoId: params.memoId, status: memo.status })
            return { status: 'unread' }
        }
        const text = memo.text.trim()
        if (!text) return { status: 'empty' }
        if (text.length > MAX_MEMO_CHARS) return { status: 'too_long' }

        const found = await findNotesActions({
            notes: text,
            deliverables: await loadNotesDeliverables(params.engagementId),
            today: resolveToday(undefined, now),
            scope: { firmId: params.firmId, userId: null, feature: 'notesProposals' },
        })
        const read = {
            firmId: params.firmId,
            clientId: params.clientId,
            engagementId: params.engagementId,
            memoId: params.memoId,
            fileName: memo.memo.fileName,
            actorUserId: params.actorUserId ?? null,
            trigger: params.trigger ?? 'added',
        }
        if (!found.ok) {
            if (found.reason === 'unconfigured') return { status: 'unconfigured' }
            auditMemoRead({ ...read, actionItems: null })
            return { status: 'no_answer' }
        }
        await writeMemoReview(params.engagementId, params.memoId, memoReviewOf(found, text, 'auto', now))

        // The memo's RAID suggestions, beside its action items. Its own failure doesn't undo them.
        let raidSuggested = 0
        try {
            const raid = await runMemoRaidCheck({
                engagementId: params.engagementId,
                firmId: params.firmId,
                memo: { id: params.memoId, title: memo.memo.title, date: memo.memo.date, text },
                now,
            })
            if (raid.ok) raidSuggested = raid.suggested
        } catch (error) {
            if (!(error instanceof AiCreditLimitError)) logger.error('[memo-review] the memo RAID pass failed', error as Error)
        }
        auditMemoRead({ ...read, actionItems: found.proposals.length, raidSuggested })
        return { status: 'reviewed', actionItems: found.proposals.length, raidSuggested }
    } catch (error) {
        if (error instanceof AiCreditLimitError) return { status: 'over_limit' }
        logger.error('[memo-review] reviewing a new memo failed', error as Error)
        return { status: 'failed' }
    }
}
