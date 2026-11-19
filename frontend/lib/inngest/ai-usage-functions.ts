import { inngest } from '@/lib/inngest/client'
import { previousUtcMonth } from '@/lib/ai/ledger-window'

/**
 * AI usage crons (.claude/plans/ai-metering-by-tokens.md, steps 3 and 8). Each does nothing until its
 * env is set: POLAR_AI_EVENTS / POLAR_AI_CREDITS_METER_ID for Polar, ANTHROPIC_ADMIN_KEY for the bill.
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

/** The 2nd of each month, 08:30 UTC: the ledger's cost vs Anthropic's bill for last month. */
export const checkAnthropicBillMonthly = inngest.createFunction(
    { id: 'check-anthropic-bill-monthly', triggers: [{ cron: '30 8 2 * *' }] },
    async ({ step }) =>
        step.run('check', async () => {
            const { checkAnthropicBillAgainstLedger } = await import('@/lib/ai/anthropic-cost-check')
            const { start, end } = previousUtcMonth()
            return checkAnthropicBillAgainstLedger(start, end)
        }),
)
