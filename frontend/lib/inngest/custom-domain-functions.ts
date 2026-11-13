import { inngest } from '@/lib/inngest/client'
import { recheckApprovedDomains } from '@/lib/custom-domains/group-domains'

/**
 * Daily at 03:00 UTC: re-check every approved custom domain (.claude/plans/branded-host-email-links.md).
 * One that stops answering is marked unreachable, which turns off its sign-in hand-off and email links
 * (they fall back to the main address), and its Group admin and System Admins are emailed. One that
 * answers again recovers on the next run.
 */
export const recheckCustomDomainsDaily = inngest.createFunction(
    { id: 'recheck-custom-domains-daily', triggers: [{ cron: '0 3 * * *' }] },
    async ({ step }) => step.run('recheck', () => recheckApprovedDomains()),
)
