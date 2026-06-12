import { prisma } from '@/lib/prisma'
import { resolveBillingAnchorFirmId } from '@/lib/billing/billing-group'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
    return value && typeof value === 'object' ? (value as JsonRecord) : {}
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
    const anchorFirmId = await resolveBillingAnchorFirmId(firmId)
    const row = await prisma.subscription.findFirst({
        where: {
            firmId: anchorFirmId,
            active: true,
            deletedAt: null,
        },
        orderBy: { updatedAt: 'desc' },
        select: { settings: true },
    })
    return asRecord(asRecord(row?.settings).metadata)
}

/**
 * Parse entitledEngagements from subscription metadata.
 * Handles old Polar typo key 'entitiledEngagements' for rows written before the fix.
 * Returns null when unlimited (-1) or not configured.
 */
export function parseEntitledEngagements(meta: JsonRecord): number | null {
    const raw = meta['entitledEngagements'] ?? meta['entitiledEngagements']
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
    const raw = meta['entitledClients'] ?? meta['entitiledClients']
    const parsed = parseIntLike(raw)
    if (parsed == null || parsed < 0) return null
    return parsed
}

/** Returns null when unlimited (-1) or not configured. Handles typo keys from early Polar product setup. */
export function parseEntitledClientContacts(meta: JsonRecord): number | null {
    const raw = meta['entitledClientContacts'] ?? meta['entitiledClientContacts'] ?? meta['entitiledClientConta']
    const parsed = parseIntLike(raw)
    if (parsed == null || parsed < 0) return null
    return parsed
}

/** Returns null when unlimited (-1) or not configured. */
export function parseEntitledDocuments(meta: JsonRecord): number | null {
    const raw = meta['entitledDocuments'] ?? meta['entitiledDocuments']
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
