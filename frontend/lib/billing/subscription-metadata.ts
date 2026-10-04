import { prisma } from '@/lib/prisma'
import { resolveGroupId } from '@/lib/billing/billing-group'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
    return value && typeof value === 'object' ? (value as JsonRecord) : {}
}

/**
 * The exact metadata keys an entitlement may be configured under. There are no aliases.
 *
 * Typo tolerance used to live in the parsers (`entitiledClients`, `entitiledClientConta`, …), which
 * absorbed a dashboard mistake instead of surfacing it. That is the wrong trade for this data: a key
 * that does not parse reads as "not configured", which every cap treats as UNCAPPED. Silently
 * accepting a misspelling hid the error; silently ignoring one is worse.
 *
 * So the spelling is exact, and {@link unknownEntitlementKeys} reports anything close-but-wrong so
 * the admin tools can show it rather than letting it fail open.
 */
export const ENTITLEMENT_KEYS = [
    'entitledFirms',
    'entitledClients',
    'entitledClientContacts',
    'entitledEngagements',
    'entitledDeliverables',
    'entitledDocuments',
    'entitledAuditDays',
    'entitledCommentHistoryDays',
    'entitledAiCredits',
] as const

const ENTITLEMENT_KEY_SET: ReadonlySet<string> = new Set(ENTITLEMENT_KEYS)

/**
 * Metadata keys that look like an entitlement but match none exactly — i.e. typos.
 *
 * Matches loosely (ignoring case and the common `entitiled` transposition) so a misspelling is
 * caught rather than passed over as an unrelated key. Everything returned here is being IGNORED by
 * enforcement, which is the point of reporting it.
 */
export function unknownEntitlementKeys(meta: JsonRecord): string[] {
    return Object.keys(meta).filter((key) => {
        if (ENTITLEMENT_KEY_SET.has(key)) return false
        return /^entit[il]*ed/i.test(key)
    })
}

function parseIntLike(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
    if (typeof value === 'string' && value.trim().length > 0) {
        const n = Number.parseInt(value.trim(), 10)
        return Number.isNaN(n) ? null : n
    }
    return null
}

export async function getActiveSubscriptionMetadataForFirm(firmId: string): Promise<JsonRecord> {
    const groupId = await resolveGroupId(firmId)
    const row = await prisma.subscription.findFirst({
        where: {
            groupId,
            active: true,
            deletedAt: null,
        },
        orderBy: { updatedAt: 'desc' },
        select: { settings: true },
    })
    return applyEntitlementOverrides(row?.settings)
}

/**
 * Metadata with system-admin entitlement overrides applied on top.
 *
 * Overrides live in `settings.entitlementOverrides`, deliberately NOT inside `settings.metadata` —
 * an override written into metadata would be indistinguishable from a value synced from Polar, so
 * the next resync would either clobber it or have to guess. Keeping them separate makes precedence
 * explicit and keeps "what did we change by hand, and why" answerable.
 *
 * The consequence is that EVERY read of entitlement metadata must come through here. A caller that
 * reads `settings.metadata` directly silently ignores overrides, which would make the admin UI
 * appear to work while changing nothing.
 */
export function applyEntitlementOverrides(settings: unknown): JsonRecord {
    const root = asRecord(settings)
    const meta = asRecord(root.metadata)
    const overrides = asRecord(root.entitlementOverrides)
    const values = asRecord(overrides.values)
    if (Object.keys(values).length === 0) return meta
    return { ...meta, ...values }
}

/**
 * Parse entitledEngagements from subscription metadata.
 * Returns null when unlimited (-1) or not configured.
 */
export function parseEntitledEngagements(meta: JsonRecord): number | null {
    const raw = meta['entitledEngagements']
    const parsed = parseIntLike(raw)
    if (parsed == null || parsed < 0) return null
    return parsed
}

/**
 * Parse entitledFirms from subscription metadata.
 * Returns null when "0" (free sandbox) or not configured — callers use sandbox defaults.
 */
export function parseEntitledFirms(meta: JsonRecord): number | null {
    const raw = meta['entitledFirms']
    const parsed = parseIntLike(raw)
    if (parsed == null || parsed <= 0) return null
    return parsed
}

/** Returns null when unlimited (-1) or not configured. */
export function parseEntitledClients(meta: JsonRecord): number | null {
    const raw = meta['entitledClients']
    const parsed = parseIntLike(raw)
    if (parsed == null || parsed < 0) return null
    return parsed
}

/** Returns null when unlimited (-1) or not configured. */
export function parseEntitledClientContacts(meta: JsonRecord): number | null {
    const raw = meta['entitledClientContacts']
    const parsed = parseIntLike(raw)
    if (parsed == null || parsed < 0) return null
    return parsed
}

/** Returns null when unlimited (-1) or not configured. */
export function parseEntitledDocuments(meta: JsonRecord): number | null {
    const raw = meta['entitledDocuments']
    const parsed = parseIntLike(raw)
    if (parsed == null || parsed < 0) return null
    return parsed
}

/** Returns null when unlimited (-1) or not configured. */
export function parseEntitledDeliverables(meta: JsonRecord): number | null {
    const raw = meta['entitledDeliverables']
    const parsed = parseIntLike(raw)
    if (parsed == null || parsed < 0) return null
    return parsed
}

/**
 * Returns null when unlimited (-1) or not configured.
 * 0 = no history (purge all on every insert), N = keep last N days.
 */
export function parseEntitledAuditDays(meta: JsonRecord): number | null {
    const raw = meta['entitledAuditDays']
    const parsed = parseIntLike(raw)
    if (parsed == null || parsed < 0) return null
    return parsed
}

/**
 * Returns null when unlimited (-1) or not configured.
 * 0 = no history, N = keep last N days of comment history.
 */
export function parseEntitledCommentHistoryDays(meta: JsonRecord): number | null {
    const raw = meta['entitledCommentHistoryDays']
    const parsed = parseIntLike(raw)
    if (parsed == null || parsed < 0) return null
    return parsed
}

/**
 * Returns null when unlimited (-1) or not configured.
 */
export async function getEntitledEngagementsCapForFirm(firmId: string): Promise<number | null> {
    const metadata = await getActiveSubscriptionMetadataForFirm(firmId)
    return parseEntitledEngagements(metadata)
}

/**
 * Returns null when not configured or free sandbox (entitledFirms=0).
 */
export async function getEntitledFirmsCapForFirm(firmId: string): Promise<number | null> {
    const metadata = await getActiveSubscriptionMetadataForFirm(firmId)
    return parseEntitledFirms(metadata)
}

/**
 * Parse entitledAiCredits from subscription metadata.
 *
 * Returns null when unset or negative, NOT zero — callers treat null as "entitlement unknown" and
 * do not cap, rather than treating unconfigured as "no AI". Without that, a webhook that has not
 * synced yet would silently throttle a paying customer.
 *
 * An explicit 0 IS honoured: it is a deliberate "no AI on this tier", not a missing value.
 */
export function parseEntitledAiCredits(meta: JsonRecord): number | null {
    const raw = meta['entitledAiCredits']
    if (raw === undefined || raw === null || raw === '') return null
    const parsed = parseIntLike(raw)
    if (parsed == null || parsed < 0) return null
    return parsed
}
