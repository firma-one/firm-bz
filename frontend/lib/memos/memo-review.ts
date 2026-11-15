import 'server-only'
import { prisma } from '@/lib/prisma'
import { isAiConfigured } from '@/lib/ai/client'
import { AiCreditLimitError } from '@/lib/ai/guarded-client'
import { MAX_MEMO_CHARS, loadNotesDeliverables } from '@/lib/ai/notes-proposals'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { runMemoRaidCheck } from '@/lib/raid/raid-check'
import { logger } from '@/lib/logger'
import { readMemoText, writeMemoReview } from './memo-store'
import { memoReadReview } from './memo-shared'
import { sealMinutes, writeMemoMinutes } from './memo-minutes'
import { vaultForEngagement } from '@/lib/ai/known-entities'

/**
 * A memo reviewed in one place (.claude/plans/raid-actions-memo-minutes.md). When a memo is added, Brio
 * reads it once and writes two things that wait on the memo: its minutes, to copy into an email, and its
 * RAID suggestions (Risks, Actions, Issues and Decisions, every commitment an Action), for someone to
 * accept. Nothing here accepts anything: it writes the memo's review (the minutes sealed, skipped lines as
 * anchors only) and SUGGESTED RAID rows, never an accepted entry.
 *
 * Runs after the memos route has answered (Next's `after()`), so saving stays quick. It never throws: a
 * memo it couldn't review is left as it was, and the sparkle runs it by hand.
 *
 * Two credits, charged to the firm (no person pressed anything, so no per-person limit): the RAID read
 * (`memoRaid`, 1) and the minutes (`memoMinutes`, 1). Every AI call is one credit (Deepak, 2026-11-15).
 */

/** The firm's switch, on by default: Settings › Brio › "Summarize memos and suggest RAID items when they're added". */
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
 * `raidSuggested` null and no minutes: nothing usable came back.
 */
export function auditMemoRead(params: {
    firmId: string
    clientId?: string | null
    engagementId: string
    memoId: string
    fileName: string
    actorUserId: string | null
    trigger: MemoReadTrigger
    minutes: boolean
    raidSuggested: number | null
}): void {
    const parts = [
        ...(params.minutes ? ['Minutes'] : []),
        ...(params.raidSuggested !== null ? [plural(params.raidSuggested, 'RAID suggestion')] : []),
    ]
    const found = parts.length > 0 ? parts.join(' · ') : 'nothing usable came back'
    audit(AUDIT_EVENT.DOCUMENT_AI_REVIEWED)
        .firm(params.firmId).client(params.clientId ?? undefined).engagement(params.engagementId).document(params.memoId)
        .actor(params.actorUserId).scope(AUDIT_SCOPE.DOCUMENT)
        .meta({
            fileName: params.fileName,
            memo: true,
            agent: 'Brio',
            trigger: params.trigger,
            minutes: params.minutes,
            ...(params.raidSuggested !== null ? { raidSuggested: params.raidSuggested } : {}),
            summary: `${found} · ${WHEN[params.trigger]}`,
        })
        .fireAndForget()
}

export type MemoReadOutcome =
    | { status: 'reviewed'; minutes: boolean; raidSuggested: number }
    /** The group's credits or the person's limits ran out before either call: the error says which. */
    | { status: 'over_limit'; error: AiCreditLimitError }
    | { status: 'unconfigured' }
    | { status: 'no_answer' }

/**
 * Brio's read of one memo's text: its RAID suggestions (saved as SUGGESTED rows) and its minutes, in
 * parallel, then the memo's review written with the minutes sealed and the skipped lines anchored. Each
 * call stands alone: a RAID read that fails still leaves the minutes, and the other way round. Shared by
 * the memo's own add and edit (reviewMemoOnAdd) and the sparkle's route. Throws only what the caller's
 * own reads throw; the model calls' failures are answered.
 */
export async function readMemoWithBrio(params: {
    engagementId: string
    firmId: string
    memo: { id: string; title: string; date: string; text: string }
    /** The person who pressed the sparkle; null when the memo was added or edited. */
    userId: string | null
    by: 'auto' | 'person'
    now: Date
}): Promise<MemoReadOutcome> {
    const vault = await vaultForEngagement(params.engagementId, params.firmId)
    const deliverables = await loadNotesDeliverables(params.engagementId)
    let overLimit: AiCreditLimitError | null = null
    const quiet = (what: string) => (error: unknown) => {
        if (error instanceof AiCreditLimitError) overLimit = error
        else logger.error(`[memo-review] the memo's ${what} failed`, error as Error)
        return null
    }
    const [raid, minutes] = await Promise.all([
        runMemoRaidCheck({ engagementId: params.engagementId, firmId: params.firmId, memo: params.memo, now: params.now, userId: params.userId, deliverables, vault })
            .catch(quiet('RAID read')),
        writeMemoMinutes({ engagementId: params.engagementId, firmId: params.firmId, memo: params.memo, userId: params.userId, vault })
            .catch(quiet('minutes')),
    ])
    const raidOk = raid?.ok ? raid : null
    const minutesOk = minutes?.ok ? minutes.minutes : null
    if (!raidOk && !minutesOk) {
        if (overLimit) return { status: 'over_limit', error: overLimit }
        if ((raid && !raid.ok && raid.reason === 'unconfigured') || (minutes && !minutes.ok && minutes.reason === 'unconfigured')) return { status: 'unconfigured' }
        return { status: 'no_answer' }
    }
    await writeMemoReview(params.engagementId, params.memo.id, memoReadReview(
        { skipped: raidOk?.skipped ?? [], dropped: raidOk?.dropped ?? 0, minutes: minutesOk ? sealMinutes(minutesOk) : null },
        params.memo.text,
        params.by,
        params.now,
    ))
    return { status: 'reviewed', minutes: !!minutesOk, raidSuggested: raidOk?.suggested ?? 0 }
}

export type MemoReviewOnAddOutcome =
    | { status: 'reviewed'; minutes: boolean; raidSuggested: number }
    | { status: 'off' | 'unconfigured' | 'unread' | 'empty' | 'too_long' | 'over_limit' | 'no_answer' | 'failed' }

/**
 * Reviews a memo that was just added, or whose notes were just edited. Never throws.
 *
 * `requested`: a person asked for it, ticking the box to read the new notes when editing a memo (§14.3),
 * so the firm's switch for new memos doesn't apply. Still two credits, from the firm.
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

        // Read for these calls only; never stored in the clear.
        const memo = await readMemoText(params.engagementId, params.memoId)
        if (!memo.ok) {
            logger.warn('[memo-review] the memo could not be read', { engagementId: params.engagementId, memoId: params.memoId, status: memo.status })
            return { status: 'unread' }
        }
        const text = memo.text.trim()
        if (!text) return { status: 'empty' }
        if (text.length > MAX_MEMO_CHARS) return { status: 'too_long' }

        const outcome = await readMemoWithBrio({
            engagementId: params.engagementId,
            firmId: params.firmId,
            memo: { id: params.memoId, title: memo.memo.title, date: memo.memo.date, text },
            userId: null,
            by: 'auto',
            now,
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
        if (outcome.status !== 'reviewed') {
            if (outcome.status === 'no_answer') auditMemoRead({ ...read, minutes: false, raidSuggested: null })
            return { status: outcome.status === 'over_limit' ? 'over_limit' : outcome.status }
        }
        auditMemoRead({ ...read, minutes: outcome.minutes, raidSuggested: outcome.raidSuggested })
        return outcome
    } catch (error) {
        if (error instanceof AiCreditLimitError) return { status: 'over_limit' }
        logger.error('[memo-review] reviewing a new memo failed', error as Error)
        return { status: 'failed' }
    }
}
