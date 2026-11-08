import 'server-only'

import { getPermissionAdapter } from '@/lib/connectors/registry'
import { logger } from '@/lib/logger'

/**
 * How long the cleanup after "Move to trash" waits before deleting the app's records, so Undo can
 * bring the item back with its ID, comments and sharing intact (.claude/plans/undo-move-to-bin.md).
 */
export const TRASH_UNDO_WINDOW_SECONDS = 60

/** Tries of the check before giving up on an answer, and the pause between them. */
const CHECK_ATTEMPTS = 3
const CHECK_PAUSE_MS = 2_000

/**
 * Whether an item moved to the trash has been taken out of it again — by Undo, or by someone
 * restoring it in the provider. True when it's back; false when it's still trashed or gone for good, so
 * the cleanup goes ahead.
 *
 * "Couldn't reach the storage" is neither: the cleanup deletes Firma's row, comments and sharing for good,
 * so a file that came back must not lose them to a network blip. The check is tried a few times; if the
 * storage still can't say, this throws (the provider's StorageFailure), the job's step fails and Inngest retries it
 * later, and the records stay until there's an answer.
 */
export async function wasRestoredFromBin(
    connectorId: string,
    externalId: string,
    opts?: { pauseMs?: number },
): Promise<boolean> {
    const adapter = await getPermissionAdapter(connectorId)
    // No connector left to ask: nothing can come back through it.
    if (!adapter) return false

    let last: unknown = null
    for (let attempt = 1; attempt <= CHECK_ATTEMPTS; attempt++) {
        try {
            return (await adapter.getTrashState(connectorId, externalId)) === 'restored'
        } catch (e) {
            last = e
            if (attempt < CHECK_ATTEMPTS) await new Promise((r) => setTimeout(r, opts?.pauseMs ?? CHECK_PAUSE_MS))
        }
    }
    logger.warn('Could not tell whether a trashed item came back; keeping its records for now', {
        connectorId,
        externalId,
        reason: last instanceof Error ? last.message : String(last),
    })
    throw last instanceof Error ? last : new Error("Couldn't tell whether a trashed item came back")
}
