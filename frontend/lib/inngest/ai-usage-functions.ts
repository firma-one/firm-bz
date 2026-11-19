import { inngest } from '@/lib/inngest/client'
import { previousUtcMonth } from '@/lib/ai/ledger-window'

/**
 * AI usage crons (.claude/plans/ai-metering-by-tokens.md, step 3). Each does nothing until its env is
 * set: POLAR_AI_EVENTS, and POLAR_AI_CREDITS_METER_ID for the reconciliation.
 */

/** Every 10 minutes: send unsent ledger rows to Polar as usage events. One run at a time. */
export const syncAiUsageToPolarCron = inngest.createFunction(
    { id: 'sync-ai-usage-to-polar', triggers: [{ cron: '*/10 * * * *' }], concurrency: { limit: 1 } },
    async ({ step }) =>
        step.run('sync', async () => {
            const { syncAiUsageToPolar } = await import('@/lib/billing/polar-ai-usage-sync')
            return syncAiUsageToPolar()
        }),
)

/** The 2nd of each month, 08:00 UTC: ledger credits vs Polar's meter, per group, for last month. */
export const reconcileAiUsageWithPolarMonthly = inngest.createFunction(
    { id: 'reconcile-ai-usage-with-polar-monthly', triggers: [{ cron: '0 8 2 * *' }] },
    async ({ step }) =>
        step.run('reconcile', async () => {
            const { reconcileAiUsageWithPolar } = await import('@/lib/billing/polar-ai-usage-sync')
            const { start, end } = previousUtcMonth()
            return reconcileAiUsageWithPolar(start, end)
        }),
)
