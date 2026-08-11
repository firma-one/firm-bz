'use server'

import { submitErrorTicket } from '@/app/actions/submit-ticket'
import { logger } from '@/lib/logger'

/**
 * Auto-files a support ticket for a server action that failed in a way the user needs to know
 * about (not a silent-log-and-continue case). Use from a catch block right before re-throwing,
 * so the caller's UI can show the ticket number alongside the error instead of a false success.
 *
 * Repro steps are derived from `context` — the caller already knows exactly what failed (which
 * action, which ids), so there's no free-text step for the user to fill in first.
 */
export async function reportActionFailure(params: {
    action: string
    error: unknown
    context?: Record<string, unknown>
    firmSlug?: string
    clientSlug?: string
    projectSlug?: string
}): Promise<{ ticketNumber: string | null }> {
    const { action, error, context, firmSlug, clientSlug, projectSlug } = params
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined

    try {
        const result = await submitErrorTicket({
            description: `Automatic report: "${action}" failed with error: ${message}`,
            type: 'BUG',
            errorDetails: { action, message, stack, context },
            metadata: { autoFiled: true },
            firmSlug,
            clientSlug,
            projectSlug,
        })
        return { ticketNumber: result.success ? (result.ticketNumber ?? null) : null }
    } catch (ticketErr) {
        logger.error('[reportActionFailure] Failed to auto-file support ticket', ticketErr as Error, action)
        return { ticketNumber: null }
    }
}
