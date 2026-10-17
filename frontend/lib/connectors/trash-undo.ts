import 'server-only'

import { getPermissionAdapter } from '@/lib/connectors/registry'

/**
 * How long the cleanup after "Move to Bin" waits before deleting the app's records, so Undo can
 * bring the item back with its ID, comments and sharing intact (.claude/plans/undo-move-to-bin.md).
 */
export const TRASH_UNDO_WINDOW_SECONDS = 60

/**
 * Whether an item moved to the Bin has been taken out of it again — by Undo, or by someone
 * restoring it in the provider. Only a positive answer counts: if the item is still trashed, gone
 * for good, or the provider can't be reached, the cleanup goes ahead as it always has.
 */
export async function wasRestoredFromBin(connectorId: string, externalId: string): Promise<boolean> {
    try {
        const adapter = await getPermissionAdapter(connectorId)
        const meta = adapter ? await adapter.getFileMetadata(connectorId, externalId) : null
        return !!meta && meta.trashed !== true
    } catch {
        return false
    }
}
