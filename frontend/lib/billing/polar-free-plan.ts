import { Polar } from '@polar-sh/sdk'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveBillingAnchorFirmId } from '@/lib/billing/billing-group'
import { type PricingModel, pricingModelFromRecurringFlag } from '@/lib/billing/pricing-model'
import { getDefaultCapsForPlanColumn } from '@/lib/billing/plan-default-caps'
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

/** Writes firm + `platform.subscriptions` after Polar API has returned a stable `customerId` (not webhook-driven). */
async function persistFirmWithLifetimeFreePlan(
    anchorFirmId: string,
    customerId: string,
    actorUserId: string | null | undefined,
    polarProduct: PolarProduct
) {
    const planLabel = polarProduct.name.trim()
    const pricingModel = pricingModelFromRecurringFlag(polarProduct.isRecurring)
    const polarProductSnapshot = polarEntityToJsonSnapshot(polarProduct)
    const polarPlanMetadataFlat = polarEntityToJsonSnapshot(polarProduct.metadata ?? {})
    const sandboxCaps = getDefaultCapsForPlanColumn('sandbox')
    await prisma.$transaction(async (tx) => {
        const auditUserId = await resolveSubscriptionAuditUserId(tx, anchorFirmId, actorUserId)

        const activePaidPolar = await tx.subscription.findFirst({
            where: {
                firmId: anchorFirmId,
                active: true,
                deletedAt: null,
                polarSubscriptionId: { not: null },
            },
            select: { id: true },
        })
        if (activePaidPolar) {
            logger.warn('[polar-free-plan] persistFirmWithLifetimeFreePlan skipped: active paid Polar subscription', {
                anchorFirmId,
            })
            return
        }

        const activeRecurring = await tx.subscription.findFirst({
            where: {
                firmId: anchorFirmId,
                active: true,
                deletedAt: null,
                pricingModel: 'recurring_subscription',
            },
            select: { id: true },
        })
        if (activeRecurring) {
            logger.warn('[polar-free-plan] persistFirmWithLifetimeFreePlan skipped: active recurring subscription', {
                anchorFirmId,
            })
            return
        }

        const existingActiveSameCustomer = await tx.subscription.findFirst({
            where: {
                firmId: anchorFirmId,
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
                await tx.firm.update({
                    where: { id: anchorFirmId },
                    data: {
                        billingActiveEngagementCap: sandboxCaps.activeEngagementCap,
                        billingGroupFirmCap: sandboxCaps.firmGroupCap,
                        billingCapsLocked: false,
                    },
                })
                logger.info('[polar-free-plan] Free plan row already active for customer; refreshed firm caps only', {
                    anchorFirmId,
                })
                return
            }
        }

        await tx.firm.update({
            where: { id: anchorFirmId },
            data: {
                billingActiveEngagementCap: sandboxCaps.activeEngagementCap,
                billingGroupFirmCap: sandboxCaps.firmGroupCap,
                billingCapsLocked: false,
            },
        })

        await tx.subscription.updateMany({
            where: {
                firmId: anchorFirmId,
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
                firmId: anchorFirmId,
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
                        entitledEngagements: sandboxCaps.activeEngagementCap,
                        source: 'polar_free_product_sync',
                        polarProductId: polarProduct.id,
                        polarProduct: polarProductSnapshot,
                    },
                },
            },
        })
    })
}

async function assertFirmBillingLinked(firmId: string, expectedPricingModel: PricingModel): Promise<void> {
    const sub = await prisma.subscription.findFirst({
        where: { firmId, active: true, deletedAt: null },
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
        firmId,
        hasPolarCustomerId: Boolean(sub?.polarCustomerId),
        hasPolarSubscriptionId: Boolean(sub?.polarSubscriptionId),
        hasPolarOrderId: Boolean(sub?.polarOrderId),
        subscriptionStatus: subscriptionAccessStatusLabel(sub),
        subscriptionPlan: sub?.plan ?? null,
        pricingModel: sub?.pricingModel ?? null,
    })
    if (!sub?.polarCustomerId) {
        throw new Error('Firm billing link verification failed: missing polarCustomerId on active subscription after Polar setup.')
    }
    if (!sub.active) {
        throw new Error('Firm billing link verification failed: active subscription row is not active after Polar setup.')
    }
    if (!sub.plan?.trim()) {
        throw new Error('Firm billing link verification failed: plan not set on subscription after Polar setup.')
    }
    if (sub.pricingModel !== expectedPricingModel) {
        throw new Error(
            `Firm billing link verification failed: pricingModel must match Polar product (${expectedPricingModel}), got ${sub.pricingModel ?? 'null'}.`
        )
    }
}

async function shouldSkipFreeProvisioningForActivePaid(anchorFirmId: string): Promise<boolean> {
    const paidPolar = await prisma.subscription.findFirst({
        where: {
            firmId: anchorFirmId,
            active: true,
            deletedAt: null,
            polarSubscriptionId: { not: null },
        },
        select: { id: true },
    })
    if (paidPolar) {
        logger.info('[polar-free-plan] Skipping free provision: active paid Polar subscription row', { anchorFirmId })
        return true
    }

    const recurring = await prisma.subscription.findFirst({
        where: {
            firmId: anchorFirmId,
            active: true,
            deletedAt: null,
            pricingModel: 'recurring_subscription',
        },
        select: { id: true },
    })
    if (recurring) {
        logger.info('[polar-free-plan] Skipping free provision: active recurring subscription', { anchorFirmId })
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

    const anchorFirmId = await resolveBillingAnchorFirmId(params.firmId)
    if (await shouldSkipFreeProvisioningForActivePaid(anchorFirmId)) {
        return
    }

    const server = polarServer()

    logger.info('[polar-free-plan] Starting free-plan provisioning', {
        firmId: params.firmId,
        anchorFirmId,
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
        state = await polar.customers.getStateExternal({ externalId: params.firmId })
        logger.info('[polar-free-plan] getStateExternal ok', {
            firmId: params.firmId,
            polarCustomerId: state.id,
            activeSubscriptions: state.activeSubscriptions.length,
        })
    } catch (e) {
        logger.info('[polar-free-plan] getStateExternal failed (customer likely new)', {
            firmId: params.firmId,
            message: e instanceof Error ? e.message : String(e),
        })
        state = null
    }

    if (state) {
        await persistFirmWithLifetimeFreePlan(anchorFirmId, state.id, params.userId, polarProduct)
        logger.info('[polar-free-plan] Linked existing Polar customer to lifetime free plan', {
            firmId: params.firmId,
            anchorFirmId,
        })
        await assertFirmBillingLinked(anchorFirmId, expectedPricingModel)
        await refreshBillingPlanForFirmGroupUsers(anchorFirmId)
        return
    }

    const email = billingEmailForFirm(params.userEmail, params.firmId)
    const displayName = params.customerName?.trim() || undefined

    logger.info('[polar-free-plan] Creating Polar customer', {
        firmId: params.firmId,
        billingEmailLocal: email.split('@')[0]?.slice(0, 20),
    })

    try {
        const created = await polar.customers.create({
            email,
            name: displayName,
            externalId: params.firmId,
            metadata: { firmId: params.firmId },
        })
        logger.info('[polar-free-plan] customers.create ok', {
            firmId: params.firmId,
            polarCustomerId: created.id,
        })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!/already exists|unique|duplicate/i.test(msg)) {
            logger.error(
                '[polar-free-plan] customers.create failed',
                e instanceof Error ? e : new Error(msg),
                undefined,
                { firmId: params.firmId, msg }
            )
            throw e
        }
        logger.warn('[polar-free-plan] customers.create duplicate/race; continuing', { firmId: params.firmId, msg })
    }

    const refreshed = await polar.customers.getStateExternal({ externalId: params.firmId })
    await persistFirmWithLifetimeFreePlan(anchorFirmId, refreshed.id, params.userId, polarProduct)
    await assertFirmBillingLinked(anchorFirmId, expectedPricingModel)
    logger.info('[polar-free-plan] Lifetime free plan provisioning complete', { firmId: params.firmId, anchorFirmId })
    await refreshBillingPlanForFirmGroupUsers(anchorFirmId)
}
