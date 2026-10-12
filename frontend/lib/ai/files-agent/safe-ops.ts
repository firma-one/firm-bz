import 'server-only'
import { METADATA_FOLDER_NAME } from '@/lib/connectors/types'
import type { IConnectorStorageAdapter } from '@/lib/connectors/types'

/**
 * The only way agent code creates a folder.
 *
 * ## Why a wrapper and not just `adapter.findOrCreateFolder`
 *
 * That method deletes duplicate siblings when the folder name is the connector's metadata folder
 * (`.meta`), to keep a single canonical one. For the platform's own provisioning that is correct.
 * For the agent it is a hole: "create a folder called .meta" is a request the agent could make and
 * a person could approve, and it would delete folders neither of them named.
 *
 * The agent never calls a delete. It must also never cause one, which is a different and stricter
 * property — the boundary has to cover what an operation DOES, not only what it is called.
 *
 * Validation already refuses dot-prefixed names, so this should never fire. It exists because that
 * is one regex in one file, and the guarantee is worth more than one layer: if a future change
 * widens the name rules, this still refuses, and it refuses LOUDLY rather than silently producing
 * a destructive call.
 */
export async function agentCreateFolder(
    adapter: IConnectorStorageAdapter,
    connectionId: string,
    parentFolderId: string,
    name: string,
): Promise<string> {
    if (name === METADATA_FOLDER_NAME || name.startsWith('.')) {
        throw new Error(
            `Refused to create a reserved folder ("${name}"): the agent must never perform or `
            + 'cause a destructive operation.',
        )
    }
    return adapter.findOrCreateFolder(connectionId, parentFolderId, name)
}
