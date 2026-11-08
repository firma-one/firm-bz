import { StorageFailure, storageFailure, type StorageProvider } from '@/lib/connectors/storage-failure'
import { ConnectorContentError } from '@/lib/connectors/types'

/**
 * Why a preview, a download or a version list couldn't be read from the storage, as a StorageFailure
 * a route can answer with (`{ error: message, code: reason }`). The content adapters speak three
 * dialects: ConnectorContentError (not found, no access), a StorageFailure, and a Drive auth error or
 * a missing token for a connection that needs renewing. Anything else is the storage being
 * unreachable or refusing, said without its raw answer. Returns null for a conversion failure or an
 * unsupported type, which the preview route draws as its own card.
 */
export function contentFailure(e: unknown, provider: StorageProvider): StorageFailure | null {
    if (e instanceof StorageFailure) return e
    if (e instanceof ConnectorContentError) {
        if (e.code === 'not_found') return storageFailure('not_found', provider)
        if (e.code === 'forbidden') {
            return new StorageFailure('no_permission', `The ${provider} account connected to this client can't open this file.`)
        }
        return null
    }
    const name = e instanceof Error ? e.name : ''
    const message = e instanceof Error ? e.message : String(e)
    // GoogleDriveAuthError (a refresh that failed), or an adapter that got no token at all.
    if (name === 'GoogleDriveAuthError' || /access token/i.test(message)) return storageFailure('reconnect', provider)
    if (e instanceof TypeError || /fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message)) {
        return storageFailure('unreachable', provider)
    }
    return new StorageFailure('other', `Couldn't get this file from ${provider}. Try again in a moment.`)
}

/** The storage's name for a connector type. */
export function providerOf(connectorType: string | null | undefined): StorageProvider {
    return connectorType === 'ONEDRIVE' ? 'OneDrive' : 'Google Drive'
}

/** No storage, or none this route can read from: what a person can do about it (P2-03). */
export const NO_STORAGE_MESSAGE = 'No storage is connected to this client. Connect Google Drive or OneDrive for this client, then try again.'
