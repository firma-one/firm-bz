import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createPolarClient } from '@/lib/billing/polar-client'
import { getActiveSubscriptionForGroup } from '@/lib/billing/active-billing-subscription'
import { unknownEntitlementKeys } from '@/lib/billing/subscription-metadata'

/**
 * Re-reads entitlements from Polar into `platform.subscriptions.settings.metadata`, and applies
 * system-admin overrides on top.
 *
 * ## Why this exists
 *
 * `settings.metadata` is a POINT-IN-TIME SNAPSHOT of Polar product metadata, taken when a
 * subscription is created or when a lifecycle webhook fires. It is never re-read on the request
 * path — `allowanceForGroup()` and every `parseEntitled*` helper read the stored copy.
 *
 * Polar fires no webhook when a PRODUCT's metadata is edited (its subscription webhooks cover
 * created / updated / canceled / revoked), and nothing here polls. So editing entitlements in the
 * Polar dashboard has no effect on existing subscribers until an unrelated lifecycle event happens
 * to rewrite the row.
 *
 * That drift is silent and fails open: a missing `entitledAiCredits` parses to "unknown", which the
 * credit cap deliberately treats as uncapped. It cost 10 days of unenforced AI credits once —
 * `entitledAiCredits` was set on all three sandbox products while every active row still predated
 * the edit, and the billing page honestly reported "no limit applied".
 *
 * The snapshot is kept deliberately rather than read live: entitlements are a contract, a
 * subscriber keeping the terms they signed up under is a feature, and `getActiveSubscriptionForGroup`
 * sits on the hot path of every credit check where a network call would be felt. The defect was
 * never that we snapshot — it was that drift was invisible. This makes refreshing it explicit.
 */

type JsonRecord = Record<string, unknown>

/** Where the Polar product id was recovered from. 'none' means resync cannot proceed. */
export type ProductIdSource = 'metadata' | 'snapshot' | 'subscription' | 'none'

/** Keys that carry an entitlement. Anything else in metadata is provenance, not policy. */
const ENTITLEMENT_PREFIX = 'entitled'

/**
 * Entitlement keys an override may set.
 *
 * An allowlist rather than a prefix test: a misspelled key (`entitledAiCredit`) would otherwise be
 * stored happily and do nothing, which is the same class of silent failure this module exists to
 * fix. Mirrors the `parseEntitled*` helpers in `subscription-metadata.ts`.
 */
export const OVERRIDABLE_ENTITLEMENTS = [
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

export type OverridableEntitlement = (typeof OVERRIDABLE_ENTITLEMENTS)[number]

/**
 * Entitlements advertised on the pricing page. A paid subscription missing one of these is a
 * reportable finding, not a warning — these are the numbers a customer was sold.
 */
export const PUBLISHED_ENTITLEMENTS: OverridableEntitlement[] = [
    'entitledClients',
    'entitledAiCredits',
    'entitledAuditDays',
    'entitledCommentHistoryDays',
]

export interface EntitlementOverrides {
    values: Partial<Record<OverridableEntitlement, string>>
    setBy: string | null
    setAt: string | null
    note: string | null
}

export interface EntitlementView {
    groupId: string
    hasActiveSubscription: boolean
    plan: string | null
    isPaid: boolean
    /** When the stored snapshot was last written — how stale the entitlements may be. */
    snapshotUpdatedAt: string | null
    polarProductId: string | null
    /** Where `polarProductId` came from, since many rows do not carry it directly. */
    productIdSource: ProductIdSource
    /** Entitlements as enforcement currently sees them: snapshot merged with overrides. */
    effective: JsonRecord
    /** The raw stored snapshot, before overrides. */
    synced: JsonRecord
    overrides: EntitlementOverrides | null
    /** Published entitlements absent from the effective view — these fail open. */
    missingPublished: OverridableEntitlement[]
    /**
     * Metadata keys that look like an entitlement but match none exactly — typos in the Polar
     * dashboard. Enforcement ignores them, so whatever they were meant to cap is uncapped.
     */
    unknownKeys: string[]
}

export interface ResyncResult {
    groupId: string
    status: 'synced' | 'no-subscription' | 'no-product'
    productId: string | null
    productIdSource: ProductIdSource
    before: JsonRecord
    after: JsonRecord
    /** Keys whose value actually changed, so the UI can say "no changes" honestly. */
    changed: Array<{ key: string; from: unknown; to: unknown }>
    overridesPreserved: OverridableEntitlement[]
    message: string
}

function entitlementKeysOf(meta: JsonRecord): JsonRecord {
    const out: JsonRecord = {}
    for (const [k, v] of Object.entries(meta)) {
        if (k.startsWith(ENTITLEMENT_PREFIX)) out[k] = v
    }
    return out
}

function metadataOf(settings: unknown): JsonRecord {
    const s = (settings as { metadata?: unknown } | null)?.metadata
    return s && typeof s === 'object' ? (s as JsonRecord) : {}
}

function overridesOf(settings: unknown): EntitlementOverrides | null {
    const raw = (settings as { entitlementOverrides?: unknown } | null)?.entitlementOverrides
    if (!raw || typeof raw !== 'object') return null
    const o = raw as JsonRecord
    const values = (o.values && typeof o.values === 'object' ? o.values : {}) as EntitlementOverrides['values']
    if (Object.keys(values).length === 0) return null
    return {
        values,
        setBy: typeof o.setBy === 'string' ? o.setBy : null,
        setAt: typeof o.setAt === 'string' ? o.setAt : null,
        note: typeof o.note === 'string' ? o.note : null,
    }
}

/**
 * Entitlements as enforcement should see them: the synced snapshot with overrides applied last.
 *
 * Overrides win over everything, including the structural literals written at provisioning. That is
 * the point of an override — a system admin granting an exception must not be silently reverted by
 * whatever the product says.
 */
export function mergeEntitlements(
    synced: JsonRecord,
    overrides: EntitlementOverrides | null,
): JsonRecord {
    if (!overrides) return { ...synced }
    return { ...synced, ...overrides.values }
}

/**
 * Resolves the Polar product to re-read, from metadata alone.
 *
 * Older rows predate `polarProductId` being written into metadata, so this falls back to the stored
 * product snapshot. Reports which source was used rather than guessing silently.
 *
 * Returns null for rows written by the webhook sync, which stores neither key — those are resolved
 * from the Polar subscription instead, see {@link resolveProductIdForSubscription}.
 */
function resolveProductIdFromMetadata(
    meta: JsonRecord,
): { id: string | null; source: 'metadata' | 'snapshot' | 'none' } {
    const direct = meta.polarProductId
    if (typeof direct === 'string' && direct.trim()) return { id: direct.trim(), source: 'metadata' }

    const snapshot = meta.polarProduct
    if (snapshot && typeof snapshot === 'object') {
        const id = (snapshot as JsonRecord).id
        if (typeof id === 'string' && id.trim()) return { id: id.trim(), source: 'snapshot' }
    }
    return { id: null, source: 'none' }
}

/**
 * Resolves the product id, falling back to the live Polar subscription when metadata has none.
 *
 * This third tier is load-bearing, not defensive. Rows written by the webhook sync carry only
 * `{ version, recommended, entitled* }` in metadata — no `polarProductId`, no product snapshot —
 * so metadata-only resolution fails for exactly the paid subscriptions most likely to be stale.
 * The subscription row does hold `polarSubscriptionId`, and a Polar subscription carries its
 * product, so the id is recoverable.
 *
 * Only `polarSubscriptionId` is used, never `polarCustomerId`: a customer may hold several
 * subscriptions, and picking one would be a guess.
 */
async function resolveProductIdForSubscription(
    meta: JsonRecord,
    polarSubscriptionId: string | null,
    polar: ReturnType<typeof createPolarClient>,
): Promise<{ id: string | null; source: ProductIdSource }> {
    const fromMeta = resolveProductIdFromMetadata(meta)
    if (fromMeta.id) return fromMeta

    if (!polarSubscriptionId) return { id: null, source: 'none' }

    try {
        const sub = await polar.subscriptions.get({ id: polarSubscriptionId })
        const id = sub.productId ?? sub.product?.id ?? null
        if (typeof id === 'string' && id.trim()) {
            return { id: id.trim(), source: 'subscription' }
        }
    } catch (error) {
        logger.warn('[entitlement-resync] Could not read Polar subscription for product id', {
            polarSubscriptionId,
            message: error instanceof Error ? error.message : String(error),
        })
    }
    return { id: null, source: 'none' }
}

/** Reads the current entitlement picture for a group. No writes, safe for display. */
export async function readEntitlementView(groupId: string): Promise<EntitlementView> {
    const sub = await getActiveSubscriptionForGroup(groupId)
    if (!sub) {
        return {
            groupId,
            hasActiveSubscription: false,
            plan: null,
            isPaid: false,
            snapshotUpdatedAt: null,
            polarProductId: null,
            productIdSource: 'none',
            effective: {},
            synced: {},
            overrides: null,
            missingPublished: [],
            unknownKeys: [],
        }
    }

    const meta = metadataOf(sub.settings)
    const synced = entitlementKeysOf(meta)
    const overrides = overridesOf(sub.settings)
    const effective = mergeEntitlements(synced, overrides)
    // Metadata-only here: this runs on every page render, and the subscription fallback costs a
    // Polar round-trip. A null id therefore means "not in metadata", NOT "unresolvable" — resync
    // can still recover it from the Polar subscription, so the UI must not present this as fatal.
    const { id: polarProductId, source } = resolveProductIdFromMetadata(meta)

    // A free plan carries no Polar subscription id; a missing entitlement there is covered by the
    // provisioning fallback, so only paid plans are worth flagging.
    const isPaid = Boolean(sub.polarSubscriptionId)

    const missingPublished = PUBLISHED_ENTITLEMENTS.filter((k) => {
        const v = effective[k]
        return v === undefined || v === null || v === ''
    })

    return {
        groupId,
        hasActiveSubscription: true,
        plan: sub.plan,
        isPaid,
        snapshotUpdatedAt: sub.updatedAt.toISOString(),
        polarProductId,
        productIdSource: source,
        effective,
        synced,
        overrides,
        missingPublished,
        unknownKeys: unknownEntitlementKeys(meta),
    }
}

/**
 * Re-reads the Polar product and rewrites the stored snapshot, preserving overrides.
 *
 * Key order matters and mirrors `polar-free-plan.ts`: fresh Polar metadata first, then the
 * structural literals already on the row, then overrides. The literals are kept because
 * provisioning writes them deliberately ABOVE the Polar spread — inverting that here would silently
 * change the structural caps of every free group.
 */
export async function resyncGroupEntitlements(
    groupId: string,
    actorUserId: string,
): Promise<ResyncResult> {
    const sub = await getActiveSubscriptionForGroup(groupId)
    if (!sub) {
        return {
            groupId,
            status: 'no-subscription',
            productId: null,
            productIdSource: 'none',
            before: {},
            after: {},
            changed: [],
            overridesPreserved: [],
            message: 'No active subscription for this billing group; nothing to sync.',
        }
    }

    const meta = metadataOf(sub.settings)
    const before = entitlementKeysOf(meta)
    const overrides = overridesOf(sub.settings)

    // The client is built before resolving the product id, because the last-resort tier reads the
    // Polar subscription to recover it.
    const token = process.env.POLAR_ACCESS_TOKEN?.trim()
    if (!token) throw new Error('POLAR_ACCESS_TOKEN is not set; cannot read product metadata.')
    const polar = createPolarClient(token)

    const { id: productId, source } = await resolveProductIdForSubscription(
        meta,
        sub.polarSubscriptionId,
        polar,
    )

    if (!productId) {
        return {
            groupId,
            status: 'no-product',
            productId: null,
            productIdSource: 'none',
            before,
            after: before,
            changed: [],
            overridesPreserved: [],
            message:
                'Could not determine the Polar product for this subscription — metadata carries no ' +
                'polarProductId or product snapshot, and no product was recoverable from its Polar ' +
                'subscription. Cannot resync without knowing which product to read.',
        }
    }

    const product = await polar.products.get({ id: productId })
    const freshMetadata = (product.metadata ?? {}) as JsonRecord

    // Structural literals already on the row. Provisioning writes these after the Polar spread, so
    // they are authoritative over the product and must survive a resync.
    const structural = entitlementKeysOf(meta)
    const freshEntitlements = entitlementKeysOf(freshMetadata)

    const nextEntitlements: JsonRecord = {
        ...freshEntitlements,
        // Only keys the product does NOT define stay pinned to their provisioned literal; anything
        // the product now defines is the newer intent and wins. Without this, a resync could never
        // change a value that provisioning had hardcoded.
        ...Object.fromEntries(
            Object.entries(structural).filter(([k]) => freshEntitlements[k] === undefined),
        ),
    }

    const effectiveBefore = mergeEntitlements(before, overrides)
    const effectiveAfter = mergeEntitlements(nextEntitlements, overrides)

    const keys = Array.from(new Set([...Object.keys(effectiveBefore), ...Object.keys(effectiveAfter)]))
    const changed: ResyncResult['changed'] = []
    for (const key of keys) {
        const from = effectiveBefore[key]
        const to = effectiveAfter[key]
        // String-compare so '500' and 500 are not reported as a change — Polar metadata is stringly
        // typed and provisioning writes a mix of both.
        if (String(from ?? '') !== String(to ?? '')) changed.push({ key, from, to })
    }

    if (changed.length > 0) {
        const nextMetadata: JsonRecord = {
            ...freshMetadata,
            ...nextEntitlements,
            polarProductId: product.id,
            polarProduct: JSON.parse(
                JSON.stringify(product, (_k, v) => (v instanceof Date ? v.toISOString() : v)),
            ),
            lastResyncedAt: new Date().toISOString(),
            lastResyncedBy: actorUserId,
        }

        const existingSettings = (sub.settings as JsonRecord | null) ?? {}
        await prisma.subscription.update({
            where: { id: sub.id },
            data: {
                settings: { ...existingSettings, metadata: nextMetadata } as never,
                updatedBy: actorUserId,
            },
        })

        logger.info('[entitlement-resync] Entitlements updated', {
            groupId,
            productId: product.id,
            changedKeys: changed.map((c) => c.key).join(', '),
        })
    }

    return {
        groupId,
        status: 'synced',
        productId: product.id,
        productIdSource: source,
        before: effectiveBefore,
        after: effectiveAfter,
        changed,
        overridesPreserved: Object.keys(overrides?.values ?? {}) as OverridableEntitlement[],
        message:
            changed.length === 0
                ? 'Already up to date with Polar; nothing changed.'
                : `Updated ${changed.length} entitlement${changed.length === 1 ? '' : 's'} from Polar.`,
    }
}

export interface SaveOverridesInput {
    groupId: string
    /** Empty string or null removes an override, reverting that key to the synced value. */
    values: Partial<Record<OverridableEntitlement, string | null>>
    note: string
    actorUserId: string
}

/**
 * Persists manual entitlement overrides, then resyncs so the caller sees the final merged state.
 *
 * Overrides live under `settings.entitlementOverrides`, NOT inside `settings.metadata`. An override
 * written into metadata would be indistinguishable from a synced value, so the next resync would
 * either clobber it or have to guess. A separate layer makes precedence explicit, keeps "what did
 * we change by hand, and why" answerable, and is why a note is required.
 */
export async function saveEntitlementOverrides(
    input: SaveOverridesInput,
): Promise<{ view: EntitlementView; resync: ResyncResult }> {
    const { groupId, values, note, actorUserId } = input

    const sub = await getActiveSubscriptionForGroup(groupId)
    if (!sub) throw new Error('No active subscription for this billing group.')

    const existingSettings = (sub.settings as JsonRecord | null) ?? {}
    const current = overridesOf(sub.settings)
    const nextValues: Partial<Record<OverridableEntitlement, string>> = { ...(current?.values ?? {}) }

    for (const [key, raw] of Object.entries(values)) {
        if (!(OVERRIDABLE_ENTITLEMENTS as readonly string[]).includes(key)) {
            throw new Error(`Unknown entitlement "${key}".`)
        }
        const k = key as OverridableEntitlement
        if (raw === null || raw === '') {
            delete nextValues[k]
            continue
        }
        const n = Number(raw)
        if (!Number.isInteger(n) || n < 0) {
            throw new Error(`"${key}" must be a non-negative whole number, got "${raw}".`)
        }
        nextValues[k] = String(n)
    }

    const hasAny = Object.keys(nextValues).length > 0
    await prisma.subscription.update({
        where: { id: sub.id },
        data: {
            settings: {
                ...existingSettings,
                entitlementOverrides: hasAny
                    ? { values: nextValues, setBy: actorUserId, setAt: new Date().toISOString(), note }
                    : null,
            } as never,
            updatedBy: actorUserId,
        },
    })

    logger.info('[entitlement-resync] Overrides saved', {
        groupId,
        keys: Object.keys(nextValues).join(', ') || '(cleared)',
    })

    // Resync after saving, as requested: the admin sees the final merged state in one step rather
    // than having to guess how an override interacts with the product.
    const resync = await resyncGroupEntitlements(groupId, actorUserId)
    const view = await readEntitlementView(groupId)
    return { view, resync }
}
