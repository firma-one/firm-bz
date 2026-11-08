import { Inngest } from "inngest"
import { logger } from "@/lib/logger"

// Create a client to send and receive events
// In development, we use a dummy event key and will handle send errors gracefully
export const inngest = new Inngest({
    id: "pockett",
    eventKey: process.env.INNGEST_EVENT_KEY,
    baseUrl: (process.env.INNGEST_DEV === '1' || process.env.INNGEST_EVENT_KEY === 'local')
        ? 'http://localhost:8288'
        : undefined
})

/**
 * Safely send an Inngest event — never throws.
 *
 * Answers whether the event was sent: `true` once Inngest has it, `false` when it couldn't be reached
 * (logged here). A background job that a person is waiting on, such as taking access back, should read
 * the answer and say the follow-up didn't start; indexing and other best-effort jobs can ignore it.
 */
export async function safeInngestSend(
    name: string,
    data: Record<string, any>
): Promise<boolean> {
    try {
        await inngest.send({
            name,
            data
        })
        return true
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        logger.error(`Failed to send Inngest event '${name}': ${errorMsg}`)
        return false
    }
}
