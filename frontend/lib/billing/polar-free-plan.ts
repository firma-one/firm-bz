import { Polar } from '@polar-sh/sdk'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveGroupId } from '@/lib/billing/billing-group'
import { type PricingModel, pricingModelFromRecurringFlag } from '@/lib/billing/pricing-model'
import { refreshBillingPlanForFirmGroupUsers } from '@/lib/billing/billing-user-session-sync'
import { resolveSubscriptionAuditUserId } from '@/lib/billing/subscription-audit'
import { subscriptionAccessStatusLabel } from '@/lib/billing/active-billing-subscription'

type PolarProduct = Awaited<ReturnType<Polar['products']['get']>>

/** Lossless JSON snapshot of a Polar SDK object (Dates → ISO strings) for `subscriptions.settings`. */
function polarEntityToJsonSnapshot(value: unknown): Record<string, unknown> {
    return JSON.parse(
        JSON.stringify(value, (_key, v) => (v instanceof Date ? v.toISOString() : v))
    ) as Record<string, unknown>
}

function polarServer(): 'production' | 'sandbox' {
    return process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox'
}

function allowOnboardingWithoutPolarBilling(): boolean {
    return process.env.POLAR_ALLOW_ONBOARDING_WITHOUT_BILLING === 'true'
}

/** Unique billing email per firm (Polar requires unique email per org). */
export function billingEmailForFirm(userEmail: string, firmId: string): string {
    const trimmed = userEmail.trim().toLowerCase()
    const at = trimmed.indexOf('@')
    if (at <= 0) return trimmed || `billing+${firmId.slice(0, 8)}@invalid.local`
    const local = trimmed.slice(0, at)
    const domain = trimmed.slice(at + 1)
    const tag = firmId.replace(/-/g, '').slice(0, 12)
    if (local.includes('+')) {
        return `${local}.firm${tag}@${domain}`
    }
    return `${local}+firm${tag}@${domain}`
}

async function loadPolarFreeCatalogProduct(polar: Polar, productId: string): Promise<PolarProduct> {
    try {
        const product = await polar.products.get({ id: productId })
        const name = product.name?.trim()
        if (!name) {
            throw new Error(`Polar product ${productId} returned an empty name`)
        }
        return product
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logger.error(
            '[polar-free-plan] products.get failed for POLAR_FREE_PRODUCT_ID',
            e instanceof Error ? e : new Error(msg),
            undefined,
            { productId }
        )
        throw new Error(
            `Could not load Polar free product ${productId} from the API. Fix POLAR_FREE_PRODUCT_ID / token / POLAR_SERVER. ${msg}`
        )
    }
}

/** Writes `platform.subscriptions` for a group after Polar API has returned a stable `customerId` (not webhook-driven). */
async function persistGroupWithLifetimeFreePlan(
    groupId: string,
    customerId: string,
    actorUserId: string | null | undefined,
    polarProduct: PolarProduct
) {
    const planLabel = polarProduct.name.trim()
    const pricingModel = pricingModelFromRecurringFlag(polarProduct.isRecurring)
    const polarProductSnapshot = polarEntityToJsonSnapshot(polarProduct)
    const polarPlanMetadataFlat = polarEntityToJsonSnapshot(polarProduct.metadata ?? {})
    await prisma.$transaction(async (tx) => {
        const auditUserId = await resolveSubscriptionAuditUserId(tx, groupId, actorUserId)

        const activePaidPolar = await tx.subscription.findFirst({
            where: {
                groupId,
                active: true,
                deletedAt: null,
                polarSubscriptionId: { not: null },
            },
            select: { id: true },
        })
        if (activePaidPolar) {
            logger.warn('[polar-free-plan] persistGroupWithLifetimeFreePlan skipped: active paid Polar subscription', {
                groupId,
            })
            return
        }

        const activeRecurring = await tx.subscription.findFirst({
            where: {
                groupId,
                active: true,
                deletedAt: null,
                pricingModel: 'recurring_subscription',
            },
            select: { id: true },
        })
        if (activeRecurring) {
            logger.warn('[polar-free-plan] persistGroupWithLifetimeFreePlan skipped: active recurring subscription', {
                groupId,
            })
            return
        }

        const existingActiveSameCustomer = await tx.subscription.findFirst({
            where: {
                groupId,
                active: true,
                deletedAt: null,
                polarCustomerId: customerId,
            },
            select: { id: true, settings: true, plan: true },
        })
        if (existingActiveSameCustomer) {
            const settings = (existingActiveSameCustomer.settings as Record<string, unknown> | null) ?? {}
            const metadata =
                settings && typeof settings.metadata === 'object' && settings.metadata !== null
                    ? (settings.metadata as Record<string, unknown>)
                    : {}
            const metaProductId = typeof metadata.polarProductId === 'string' ? metadata.polarProductId : null
            const alreadyFreeProduct =
                metaProductId === polarProduct.id ||
                (metadata.source === 'polar_free_product_sync' &&
                    existingActiveSameCustomer.plan?.trim() === planLabel)
            if (alreadyFreeProduct) {
                logger.info('[polar-free-plan] Free plan row already active for customer; no-op', {
                    groupId,
                })
                return
            }
        }

        await tx.subscription.updateMany({
            where: {
                groupId,
                active: true,
                deletedAt: null,
                polarSubscriptionId: null,
            },
            data: {
                active: false,
                deactivatedAt: new Date(),
                ...(auditUserId ? { updatedBy: auditUserId } : {}),
            },
        })

        await tx.subscription.create({
            data: {
                groupId,
                provider: 'polar',
                plan: planLabel,
                pricingModel,
                currentPeriodEnd: null,
                polarCustomerId: customerId,
                polarSubscriptionId: null,
                polarOrderId: null,
                active: true,
                ...(auditUserId ? { createdBy: auditUserId, updatedBy: auditUserId } : {}),
                settings: {
                    metadata: {
                        ...polarPlanMetadataFlat,
                        entitledFirms: '1',
                        entitledEngagements: 1,
                        entitledClients: '1',
                        entitledClientContacts: '5',
                        entitledDocuments: '20',
                        entitledAuditDays: '0',
                        entitledCommentHistoryDays: '15',
                        source: 'polar_free_product_sync',
                        polarProductId: polarProduct.id,
                        polarProduct: polarProductSnapshot,
                    },
                },
            },
        })
    })
}

async function assertGroupBillingLinked(groupId: string, expectedPricingModel: PricingModel): Promise<void> {
    const sub = await prisma.subscription.findFirst({
        where: { groupId, active: true, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: {
            polarCustomerId: true,
            polarSubscriptionId: true,
            polarOrderId: true,
            active: true,
            plan: true,
            pricingModel: true,
        },
    })
    logger.info('[polar-free-plan] Post-provision subscription snapshot', {
        groupId,
        hasPolarCustomerId: Boolean(sub?.polarCustomerId),
        hasPolarSubscriptionId: Boolean(sub?.polarSubscriptionId),
        hasPolarOrderId: Boolean(sub?.polarOrderId),
        subscriptionStatus: subscriptionAccessStatusLabel(sub),
        subscriptionPlan: sub?.plan ?? null,
        pricingModel: sub?.pricingModel ?? null,
    })
    if (!sub?.polarCustomerId) {
        throw new Error('Group billing link verification failed: missing polarCustomerId on active subscription after Polar setup.')
    }
    if (!sub.active) {
        throw new Error('Group billing link verification failed: active subscription row is not active after Polar setup.')
    }
    if (!sub.plan?.trim()) {
        throw new Error('Group billing link verification failed: plan not set on subscription after Polar setup.')
    }
    if (sub.pricingModel !== expectedPricingModel) {
        throw new Error(
            `Group billing link verification failed: pricingModel must match Polar product (${expectedPricingModel}), got ${sub.pricingModel ?? 'null'}.`
        )
    }
}

async function shouldSkipFreeProvisioningForActivePaid(groupId: string): Promise<boolean> {
    const paidPolar = await prisma.subscription.findFirst({
        where: {
            groupId,
            active: true,
            deletedAt: null,
            polarSubscriptionId: { not: null },
        },
        select: { id: true },
    })
    if (paidPolar) {
        logger.info('[polar-free-plan] Skipping free provision: active paid Polar subscription row', { groupId })
        return true
    }

    const recurring = await prisma.subscription.findFirst({
        where: {
            groupId,
            active: true,
            deletedAt: null,
            pricingModel: 'recurring_subscription',
        },
        select: { id: true },
    })
    if (recurring) {
        logger.info('[polar-free-plan] Skipping free provision: active recurring subscription', { groupId })
        return true
    }
    return false
}

/**
 * Sandbox free tier: **Polar API first** (`getStateExternal` / `customers.create`), then **DB insert on success**
 * (`platform.subscriptions` active row + firm billing columns). Initial free provisioning is not done via Polar webhooks.
 * Required for onboarding unless POLAR_ALLOW_ONBOARDING_WITHOUT_BILLING=true.
 * On failure, throws so sandbox onboarding does not succeed.
 */
export async function ensurePolarFreePlanForSandboxFirm(params: {
    firmId: string
    userEmail: string
    customerName?: string | null
    /** User performing onboarding / billing setup; used for `subscriptions.createdBy` / `updatedBy`. */
    userId?: string | null
}): Promise<void> {
    if (allowOnboardingWithoutPolarBilling()) {
        logger.warn(
            '[polar-free-plan] POLAR_ALLOW_ONBOARDING_WITHOUT_BILLING=true — skipping Polar free plan (dev/CI only). Firm row will not be billing-linked.'
        )
        return
    }

    const token = process.env.POLAR_ACCESS_TOKEN?.trim()
    if (!token) {
        const msg =
            'Polar free plan is required to finish sandbox onboarding. Set POLAR_ACCESS_TOKEN, ' +
            'or set POLAR_ALLOW_ONBOARDING_WITHOUT_BILLING=true only for local/CI without billing.'
        logger.error(
            '[polar-free-plan] Missing Polar configuration for onboarding.',
            undefined,
            undefined,
            {
                hasToken: Boolean(token),
            }
        )
        throw new Error(msg)
    }
    const freeProductId = process.env.POLAR_FREE_PRODUCT_ID?.trim()
    if (!freeProductId) {
        throw new Error(
            'Set POLAR_FREE_PRODUCT_ID to your Polar free/sandbox product id. Plan name, pricing model, and a full product snapshot are read from the Polar API (products.get) and written to the database.'
        )
    }

    const groupId = await resolveGroupId(params.firmId)
    if (await shouldSkipFreeProvisioningForActivePaid(groupId)) {
        return
    }

    const server = polarServer()

    logger.info('[polar-free-plan] Starting free-plan provisioning', {
        firmId: params.firmId,
        groupId,
        polarServer: server,
        userEmailDomain: params.userEmail.includes('@') ? params.userEmail.split('@')[1] : 'unknown',
    })

    const polar = new Polar({
        accessToken: token,
        server,
    })

    const polarProduct = await loadPolarFreeCatalogProduct(polar, freeProductId)
    const expectedPricingModel = pricingModelFromRecurringFlag(polarProduct.isRecurring)

    type PolarCustomerState = Awaited<ReturnType<Polar['customers']['getStateExternal']>>
    let state: PolarCustomerState | null = null
    try {
        state = await polar.customers.getStateExternal({ externalId: groupId })
        logger.info('[polar-free-plan] getStateExternal ok', {
            groupId,
            polarCustomerId: state.id,
            activeSubscriptions: state.activeSubscriptions.length,
        })
    } catch (e) {
        logger.info('[polar-free-plan] getStateExternal failed (customer likely new)', {
            groupId,
            message: e instanceof Error ? e.message : String(e),
        })
        state = null
    }

    if (state) {
        await persistGroupWithLifetimeFreePlan(groupId, state.id, params.userId, polarProduct)
        logger.info('[polar-free-plan] Linked existing Polar customer to lifetime free plan', {
            firmId: params.firmId,
            groupId,
        })
        await assertGroupBillingLinked(groupId, expectedPricingModel)
        await refreshBillingPlanForFirmGroupUsers(groupId)
        return
    }

    const email = billingEmailForFirm(params.userEmail, groupId)
    const displayName = params.customerName?.trim() || undefined

    logger.info('[polar-free-plan] Creating Polar customer', {
        groupId,
        billingEmailLocal: email.split('@')[0]?.slice(0, 20),
    })

    try {
        const created = await polar.customers.create({
            email,
            name: displayName,
            externalId: groupId,
            metadata: { groupId },
        })
        logger.info('[polar-free-plan] customers.create ok', {
            groupId,
            polarCustomerId: created.id,
        })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!/already exists|unique|duplicate/i.test(msg)) {
            logger.error(
                '[polar-free-plan] customers.create failed',
                e instanceof Error ? e : new Error(msg),
                undefined,
                { groupId, msg }
            )
            throw e
        }
        logger.warn('[polar-free-plan] customers.create duplicate/race; continuing', { groupId, msg })
    }

    const refreshed = await polar.customers.getStateExternal({ externalId: groupId })
    await persistGroupWithLifetimeFreePlan(groupId, refreshed.id, params.userId, polarProduct)
    await assertGroupBillingLinked(groupId, expectedPricingModel)
    logger.info('[polar-free-plan] Lifetime free plan provisioning complete', { firmId: params.firmId, groupId })
    await refreshBillingPlanForFirmGroupUsers(groupId)
}
