import { Webhooks } from '@polar-sh/nextjs'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { syncFirmSubscriptionFromPolarEvent } from '@/lib/billing/polar-webhook-sync'
import { refreshBillingPlanForFirmGroupUsers } from '@/lib/billing/billing-user-session-sync'
import {
    maybeRevokeFreePolarAfterPaidSubscriptionSync,
    resyncSandboxFreePlanAfterPaidSubscriptionEnd,
} from '@/lib/billing/polar-billing-lifecycle'

function getWebhookSecret(): string | null {
    const secret = process.env.POLAR_WEBHOOK_SECRET?.trim()
    return secret ? secret : null
}

function buildHandler() {
    const webhookSecret = getWebhookSecret()
    if (!webhookSecret) {
        logger.warn('Polar webhook: POLAR_WEBHOOK_SECRET not configured, returning 503')
        return async () =>
            NextResponse.json(
                { error: 'Polar webhook secret is not configured (POLAR_WEBHOOK_SECRET).' },
                { status: 503 }
            )
    }

    return Webhooks({
        webhookSecret,
        onSubscriptionCreated: async (payload) => {
            const r = await syncFirmSubscriptionFromPolarEvent(payload)
            if (r) await maybeRevokeFreePolarAfterPaidSubscriptionSync(r)
        },
        onSubscriptionUpdated: async (payload) => {
            const r = await syncFirmSubscriptionFromPolarEvent(payload)
            if (r) {
                await maybeRevokeFreePolarAfterPaidSubscriptionSync(r)
                if (r.status === 'canceled') {
                    await resyncSandboxFreePlanAfterPaidSubscriptionEnd(r.anchorFirmId)
                    await refreshBillingPlanForFirmGroupUsers(r.anchorFirmId)
                }
            }
        },
        onSubscriptionActive: async (payload) => {
            const r = await syncFirmSubscriptionFromPolarEvent(payload, { statusOverride: 'active' })
            if (r) await maybeRevokeFreePolarAfterPaidSubscriptionSync(r)
        },
        onSubscriptionCanceled: async (payload) => {
            const r = await syncFirmSubscriptionFromPolarEvent(payload, { statusOverride: 'canceled' })
            if (r?.anchorFirmId) {
                await resyncSandboxFreePlanAfterPaidSubscriptionEnd(r.anchorFirmId)
                await refreshBillingPlanForFirmGroupUsers(r.anchorFirmId)
            }
        },
        onSubscriptionRevoked: async (payload) => {
            const r = await syncFirmSubscriptionFromPolarEvent(payload, { statusOverride: 'canceled' })
            if (r?.anchorFirmId) {
                await resyncSandboxFreePlanAfterPaidSubscriptionEnd(r.anchorFirmId)
                await refreshBillingPlanForFirmGroupUsers(r.anchorFirmId)
            }
        },
        onSubscriptionUncanceled: async (payload) => {
            const r = await syncFirmSubscriptionFromPolarEvent(payload, { statusOverride: 'active' })
            if (r) await maybeRevokeFreePolarAfterPaidSubscriptionSync(r)
        },
        onPayload: async (payload) => {
            logger.warn('Polar webhook payload received', {
                type: payload.type,
            })
        },
    })
}

export async function POST(request: NextRequest) {
    const webhookSecretConfigured = !!getWebhookSecret()
    logger.warn('Polar webhook: incoming request', {
        method: request.method,
        url: request.url,
        webhookSecretConfigured,
        headers: {
            webhookId: request.headers.get('webhook-id'),
            webhookSignature: request.headers.get('webhook-signature')?.substring(0, 20) + '...',
            webhookTimestamp: request.headers.get('webhook-timestamp'),
        },
    })

    const handler = buildHandler()

    try {
        return await handler(request)
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error))
        logger.error('Polar webhook: handler threw error', errorObj, undefined, {
            errorStack: errorObj.stack,
        })
        return NextResponse.json(
            { error: 'Webhook processing failed' },
            { status: 500 }
        )
    }
}
