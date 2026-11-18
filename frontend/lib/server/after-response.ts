import { after } from 'next/server'

/**
 * Work that follows an answer (notices, emails): Next's `after()`, which keeps a serverless function
 * alive until it's done. A bare promise can be frozen once the answer goes, and its work silently lost.
 * Outside a request (a script, a test) `after()` throws, so it runs as a plain promise there.
 */
export function afterResponse(task: () => Promise<unknown>): void {
    const run = () => task().catch((e) => console.error('[after-response] task failed:', e))
    try {
        after(run)
    } catch {
        void run()
    }
}
