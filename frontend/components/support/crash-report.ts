import { PLATFORM_SUPPORT_EMAIL } from '@/config/platform-emails'

/**
 * What the crash screens (app/error.tsx, app/global-error.tsx, components/error-boundary.tsx) say,
 * and how they send a report. One place, so all three read the same and a report always carries
 * the firm it happened in.
 */

/** What every crash screen says first. */
export const CRASH_TITLE = 'Something went wrong on this page'

/** Next's digest for a server error, as a reference the person can quote to support. */
export function crashReference(digest?: string | null): string | null {
    return digest ? `Reference ${digest}` : null
}

/** Shown when the report itself didn't arrive. */
export const REPORT_NOT_SENT = `Couldn't send your report. Please email ${PLATFORM_SUPPORT_EMAIL}.`

/**
 * The firm, client and engagement in today's URLs, `/d/[groupSlug]/f/[firmSlug]/c/[clientSlug]/e/
 * [engagementSlug]/…`, so a report lands on that firm's Support page. The old pattern looked for
 * `/o/` and `/p/`, which no URL has had for a long time, so every report arrived with no firm.
 */
export function slugsFromPath(pathname: string): { firmSlug?: string; clientSlug?: string; projectSlug?: string } {
    const m = pathname.match(/^\/d\/[^/]+\/f\/([^/?#]+)(?:\/c\/([^/?#]+)(?:\/e\/([^/?#]+))?)?/)
    const decode = (v?: string) => (v ? decodeURIComponent(v) : undefined)
    return { firmSlug: decode(m?.[1]), clientSlug: decode(m?.[2]), projectSlug: decode(m?.[3]) }
}

export interface CrashReportInput {
    feedback: string
    error: { message: string; stack?: string; digest?: string }
    /** Which boundary caught it, for the report. */
    context?: string
}

/**
 * Files the crash as a support request. Answers whether it arrived: the action returns
 * `{ success: false }` rather than throwing when it can't save, and the screens used to ignore that
 * and say "Thank you! Report submitted." over a report that didn't exist.
 */
export async function sendCrashReport(input: CrashReportInput): Promise<{ ok: true; ticketNumber?: string } | { ok: false; message: string }> {
    try {
        const { submitErrorTicket } = await import('@/app/actions/submit-ticket')
        const result = await submitErrorTicket({
            description: input.feedback.trim(),
            type: 'BUG',
            errorDetails: {
                message: input.error.message,
                stack: input.error.stack,
                digest: input.error.digest,
                url: typeof window !== 'undefined' ? window.location.href : undefined,
                context: input.context,
            },
            metadata: {
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
                screen: typeof window !== 'undefined' ? { width: window.screen.width, height: window.screen.height } : undefined,
            },
            ...(typeof window !== 'undefined' ? slugsFromPath(window.location.pathname) : {}),
        })
        return result.success ? { ok: true, ticketNumber: result.ticketNumber } : { ok: false, message: REPORT_NOT_SENT }
    } catch {
        return { ok: false, message: REPORT_NOT_SENT }
    }
}
