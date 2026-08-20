import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
    getActiveSubscriptionForGroup,
    subscriptionAccessStatusLabel,
} from '@/lib/billing/active-billing-subscription'
import {
    resolveGroupId,
    countBillableFirmsInBillingGroup,
    listBillableFirmIdsInBillingGroup,
} from '@/lib/billing/billing-group'
import { parseEntitledFirms, parseEntitledEngagements, parseEntitledClients, parseEntitledClientContacts, parseEntitledDeliverables, parseEntitledDocuments, parseEntitledAuditDays, parseEntitledCommentHistoryDays } from '@/lib/billing/subscription-metadata'

// Free-plan groups keep full audit history so seeded/early data is visible,
// regardless of entitledAuditDays in metadata (which is 0 for the free plan).
const SANDBOX_AUDIT_DAYS = null

/** The Subscription.plan value written for every free-tier group (see lib/billing/polar-free-plan.ts). */
const FREE_PLAN_NAME = 'Free'

/**
 * Returns true when a firm is a platform anchor/demo firm.
 * DB column: `isAnchor` (Prisma alias: `sandboxOnly`).
 * Exported here to avoid a circular dependency with lib/firm-service.ts.
 * The full refactor to migrate all 165 `sandboxOnly` references is tracked in
 * .claude/plans/refactor-is-anchor-firm.md
 */
export function isAnchorFirm(firm: { sandboxOnly: boolean }): boolean {
    return firm.sandboxOnly === true
}

function enforceBillingCaps(): boolean {
    return process.env.ENFORCE_BILLING_GATES === 'true'
}

function planFirmCapFallback(plan: string | null): number {
    const p = (plan ?? '').toLowerCase()
    if (/enterprise/.test(p)) return 100
    if (/business/.test(p)) return 3
    if (/pro/.test(p)) return 1
    return 1  // Standard + unknown
}

function planEngagementCapFallback(plan: string | null): number {
    const p = (plan ?? '').toLowerCase()
    if (/enterprise/.test(p)) return 100
    if (/business/.test(p)) return 50
    if (/pro/.test(p)) return 25
    return 10  // Standard + unknown
}

export type AnchorCapsRow = {
    id: string
    groupId: string
    subscriptionStatus: string | null
    subscriptionPlan: string | null
    pricingModel: string | null
    hasPolarSubscriptionId: boolean
    entitledFirms: number | null
    entitledEngagements: number | null
    entitledClients: number | null
    entitledClientContacts: number | null
    entitledDeliverables: number | null
    entitledDocuments: number | null
    entitledAuditDays: number | null
    entitledCommentHistoryDays: number | null
    capsLocked: boolean
}

/** Shared row-building logic for both firm-scoped and group-scoped anchor lookups. */
async function buildAnchorCapsRow(id: string, groupId: string): Promise<AnchorCapsRow> {
    const sub = await getActiveSubscriptionForGroup(groupId)
    const settings = (sub?.settings ?? {}) as Record<string, unknown>
    const meta = (settings.metadata ?? {}) as Record<string, unknown>
    return {
        id,
        groupId,
        subscriptionStatus: subscriptionAccessStatusLabel(sub),
        subscriptionPlan: sub?.plan ?? null,
        pricingModel: sub?.pricingModel ?? null,
        hasPolarSubscriptionId: Boolean(sub?.polarSubscriptionId),
        entitledFirms: parseEntitledFirms(meta),
        entitledEngagements: parseEntitledEngagements(meta),
        entitledClients: parseEntitledClients(meta),
        entitledClientContacts: parseEntitledClientContacts(meta),
        entitledDeliverables: parseEntitledDeliverables(meta),
        entitledDocuments: parseEntitledDocuments(meta),
        entitledAuditDays: parseEntitledAuditDays(meta),
        entitledCommentHistoryDays: parseEntitledCommentHistoryDays(meta),
        capsLocked: settings.capsLocked === true,
    }
}

export async function loadAnchorForCaps(firmId: string): Promise<AnchorCapsRow | null> {
    const requestingFirm = await prisma.firm.findUnique({ where: { id: firmId }, select: { id: true, groupId: true } })
    if (!requestingFirm) return null
    return buildAnchorCapsRow(requestingFirm.id, requestingFirm.groupId)
}

/** Group-scoped variant — used where there's no specific "requesting firm" in context
 * (e.g. checking a group's overall firm-workspace cap before a new firm is created). */
export async function loadAnchorForCapsByGroupId(groupId: string): Promise<AnchorCapsRow> {
    return buildAnchorCapsRow(groupId, groupId)
}

/**
 * True when the anchor's group is on the free plan and should use free-tier default caps,
 * not paid-plan caps. Derived from the group's actual Subscription.plan — not any firm's
 * sandboxOnly flag, since sandboxOnly firms are being retired (see
 * .claude/plans/sandbox-firm-removal.md). hasPolarSubscriptionId is kept as a secondary
 * signal: free-plan provisioning always writes polarSubscriptionId=null.
 */
export function anchorUsesSandboxCapDefaults(anchor: AnchorCapsRow): boolean {
    if (anchor.hasPolarSubscriptionId) return false
    return anchor.subscriptionPlan === FREE_PLAN_NAME || anchor.subscriptionPlan == null
}

export function effectiveActiveEngagementCap(anchor: AnchorCapsRow): number {
    if (anchor.entitledEngagements != null && anchor.entitledEngagements >= 0) return anchor.entitledEngagements
    return anchorUsesSandboxCapDefaults(anchor) ? 1 : planEngagementCapFallback(anchor.subscriptionPlan)
}

export function effectiveFirmGroupCapForAnchor(anchor: AnchorCapsRow): number {
    if (anchor.entitledFirms != null && anchor.entitledFirms >= 1) return anchor.entitledFirms
    return anchorUsesSandboxCapDefaults(anchor) ? 1 : planFirmCapFallback(anchor.subscriptionPlan)
}

export function effectiveClientCap(anchor: AnchorCapsRow): number | null {
    if (anchor.entitledClients != null && anchor.entitledClients >= 0) return anchor.entitledClients
    return null
}

export function effectiveClientContactCap(anchor: AnchorCapsRow): number | null {
    if (anchor.entitledClientContacts != null && anchor.entitledClientContacts >= 0) return anchor.entitledClientContacts
    return null
}

export function effectiveDocumentCap(anchor: AnchorCapsRow): number | null {
    if (anchor.entitledDocuments != null && anchor.entitledDocuments >= 0) return anchor.entitledDocuments
    return null
}

export function effectiveDeliverableCap(anchor: AnchorCapsRow): number | null {
    if (anchor.entitledDeliverables != null && anchor.entitledDeliverables >= 0) return anchor.entitledDeliverables
    return null
}

/** Returns the audit retention window in days, or null for unlimited. 0 = no history. */
export function effectiveAuditDays(anchor: AnchorCapsRow): number | null {
    // Sandbox demo firms always keep unlimited history regardless of plan metadata
    if (anchorUsesSandboxCapDefaults(anchor)) return SANDBOX_AUDIT_DAYS
    if (anchor.entitledAuditDays != null && anchor.entitledAuditDays >= 0) return anchor.entitledAuditDays
    return null
}

/** Returns the comment history retention window in days, or null for unlimited. 0 = no history. */
export function effectiveCommentHistoryDays(anchor: AnchorCapsRow): number | null {
    if (anchor.entitledCommentHistoryDays != null && anchor.entitledCommentHistoryDays >= 0) return anchor.entitledCommentHistoryDays
    return null
}

export async function assertWithinActiveEngagementCap(workspaceFirmId: string): Promise<void> {
    if (!enforceBillingCaps()) return

    const anchor = await loadAnchorForCaps(workspaceFirmId)
    if (!anchor) throw new Error('Firm not found')

    // For sandbox anchors (free plan), enforce entitledEngagements from metadata
    // against billable (non-sandbox) firms only — sandbox firm engagements don't count.
    const isSandboxAnchor = anchorUsesSandboxCapDefaults(anchor)
    if (isSandboxAnchor && (anchor.entitledEngagements == null || anchor.entitledEngagements < 0)) return

    const cap = effectiveActiveEngagementCap(anchor)
    const groupFirmIds = await listBillableFirmIdsInBillingGroup(anchor.groupId)
    const count = await prisma.engagement.count({
        where: {
            firmId: { in: groupFirmIds },
            deletedAt: null,
            isDeleted: false,
        },
    })
    if (count >= cap) {
        throw new Error(
            `Your plan allows ${cap} active engagement${cap === 1 ? '' : 's'}. Close or complete one to add another, upgrade, or contact support for a higher limit.`
        )
    }
}

/** Firm workspaces allowed for this billing group. Sandbox firms excluded from count. */
export async function assertWithinFirmGroupCap(groupId: string): Promise<void> {
    if (!enforceBillingCaps()) return

    const anchor = await loadAnchorForCapsByGroupId(groupId)

    const cap = anchorUsesSandboxCapDefaults(anchor)
        ? (anchor.entitledFirms ?? 1)
        : effectiveFirmGroupCapForAnchor(anchor)

    const n = await countBillableFirmsInBillingGroup(groupId)
    if (n >= cap) {
        throw new Error(
            `Your plan allows ${cap} firm workspace${cap === 1 ? '' : 's'}. Upgrade or contact support to add more.`
        )
    }
}

export async function assertWithinClientCap(firmId: string): Promise<void> {
    if (!enforceBillingCaps()) return

    const anchor = await loadAnchorForCaps(firmId)
    if (!anchor) return
    if (anchorUsesSandboxCapDefaults(anchor) && (anchor.entitledClients == null || anchor.entitledClients < 0)) return

    const cap = effectiveClientCap(anchor)
    if (cap === null) return

    const groupFirmIds = await listBillableFirmIdsInBillingGroup(anchor.groupId)
    const count = await prisma.client.count({
        where: { firmId: { in: groupFirmIds }, deletedAt: null },
    })
    if (count >= cap) {
        throw new Error(
            `Your plan allows ${cap} client${cap === 1 ? '' : 's'}. Upgrade to add more.`
        )
    }
}

export async function assertWithinClientContactCap(firmId: string): Promise<void> {
    if (!enforceBillingCaps()) return

    const anchor = await loadAnchorForCaps(firmId)
    if (!anchor) return
    if (anchorUsesSandboxCapDefaults(anchor) && (anchor.entitledClientContacts == null || anchor.entitledClientContacts < 0)) return

    const cap = effectiveClientContactCap(anchor)
    if (cap === null) return

    const groupFirmIds = await listBillableFirmIdsInBillingGroup(anchor.groupId)
    const count = await prisma.clientContact.count({
        where: { firmId: { in: groupFirmIds } },
    })
    if (count >= cap) {
        throw new Error(
            `Your plan allows ${cap} client contact${cap === 1 ? '' : 's'} across all clients. Upgrade to add more.`
        )
    }
}

/**
 * Check deliverable cap before marking a folder as a Deliverable.
 * Counts folders tagged as Deliverables (settings.share.createdAt set) across the billing group,
 * matching the "Deliverables" definition used by the Board and shares list.
 */
export async function assertWithinDeliverableCap(firmId: string): Promise<void> {
    if (!enforceBillingCaps()) return

    const anchor = await loadAnchorForCaps(firmId)
    if (!anchor) return
    if (anchorUsesSandboxCapDefaults(anchor) && (anchor.entitledDeliverables == null || anchor.entitledDeliverables < 0)) return

    const cap = effectiveDeliverableCap(anchor)
    if (cap === null) return

    const groupFirmIds = await listBillableFirmIdsInBillingGroup(anchor.groupId)
    const result = await prisma.$queryRaw<{ count: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS count FROM platform.engagement_documents
         WHERE "firmId" = ANY(${groupFirmIds}::uuid[]) AND "isFolder" = true
           AND (settings->'share'->>'createdAt') IS NOT NULL`
    )
    const count = result[0]?.count ?? 0
    if (count >= cap) {
        throw new Error(
            `Your plan allows ${cap} deliverable${cap === 1 ? '' : 's'}. Upgrade to add more.`
        )
    }
}

/**
 * Check document cap before indexing. Pass batchSize > 1 for batch uploads so
 * the entire batch is rejected upfront if it would exceed the cap.
 */
export async function assertWithinDocumentCap(firmId: string, batchSize = 1): Promise<void> {
    if (!enforceBillingCaps()) return

    const anchor = await loadAnchorForCaps(firmId)
    if (!anchor) return
    if (anchorUsesSandboxCapDefaults(anchor) && (anchor.entitledDocuments == null || anchor.entitledDocuments < 0)) return

    const cap = effectiveDocumentCap(anchor)
    if (cap === null) return

    const groupFirmIds = await listBillableFirmIdsInBillingGroup(anchor.groupId)
    const count = await prisma.engagementDocument.count({
        where: { firmId: { in: groupFirmIds }, isFolder: false },
    })
    if (count + batchSize > cap) {
        throw new Error(
            `Your plan allows ${cap} file${cap === 1 ? '' : 's'} and folder${cap === 1 ? '' : 's'}. You have ${count} indexed. Upgrade to add more.`
        )
    }
}
