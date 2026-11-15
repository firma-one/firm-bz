import 'server-only'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { RaidConversationState } from './raid-shared'
import { lastCheckedAtOf } from './raid-store'

/**
 * Whether the RAID log is up to date with what Brio reads, the way the Overview's Summary knows it is
 * out of date (fingerprintInsights in lib/ai/engagement-summary.ts). Every check stores a fingerprint of
 * the conversation it covered in `engagement.settings.raid.fingerprint`; the log compares it with the
 * conversation now.
 *
 * The fingerprint hashes what a PERSON changed, never what the CLOCK changed: per document with thread
 * messages, how many and when the newest was written. A new message and a deleted message move it; a
 * day passing never does. Memos don't: each is read once, when it's added (§13).
 */

/** What the fingerprint is made of, as read from the database. */
export interface ConversationStamps {
    threads: Array<{ documentId: string; count: number; latestAt: string }>
    memos: Array<{ id: string; changedAt: string }>
}

const iso = (v: unknown): string | null =>
    typeof v === 'string' && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString()
        : v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString()
            : null

/**
 * The conversation Brio reads, up to `until` when given: a check stores exactly what it covered, and
 * anything written while it ran shows as new afterwards.
 */
export async function loadConversationStamps(engagementId: string, until?: Date): Promise<ConversationStamps> {
    const groups = await prisma.docCommentMessage.groupBy({
        by: ['projectDocumentId'],
        where: { engagementId, ...(until ? { createdAt: { lte: until } } : {}) },
        _count: { _all: true },
        _max: { createdAt: true },
    })
    return {
        threads: groups.flatMap((g) => {
            const latestAt = iso(g._max.createdAt)
            return latestAt ? [{ documentId: g.projectDocumentId, count: g._count._all, latestAt }] : []
        }),
        // Memos are read when they're added, on the memo (§13), not by the check, so they don't move it.
        memos: [],
    }
}

/** The fingerprint of a conversation; null when there is none to read. */
export function fingerprintConversation(stamps: ConversationStamps): string | null {
    if (stamps.threads.length === 0 && stamps.memos.length === 0) return null
    const parts = [
        ...stamps.threads.map((t) => `t:${t.documentId}:${t.count}:${t.latestAt}`),
        ...stamps.memos.map((m) => `n:${m.id}:${m.changedAt}`),
    ].sort()
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)
}

/** The fingerprint the last check stored (engagement.settings.raid.fingerprint). */
export function storedFingerprintOf(settings: unknown): string | null {
    const raw = ((settings ?? {}) as { raid?: { fingerprint?: unknown } }).raid?.fingerprint
    return typeof raw === 'string' && raw ? raw : null
}

/**
 * Up to date, out of date, or nothing to read. A log checked before fingerprints were stored is
 * compared by time instead: anything written or changed after its last check is new.
 */
export function conversationStateOf(stamps: ConversationStamps, settings: unknown): RaidConversationState {
    const now = fingerprintConversation(stamps)
    if (!now) return 'none'
    const stored = storedFingerprintOf(settings)
    if (stored) return stored === now ? 'current' : 'changed'
    const last = lastCheckedAtOf(settings)
    if (!last) return 'changed'
    const since = new Date(last).getTime()
    const newer = (at: string) => new Date(at).getTime() > since
    return stamps.threads.some((t) => newer(t.latestAt)) || stamps.memos.some((m) => newer(m.changedAt)) ? 'changed' : 'current'
}
