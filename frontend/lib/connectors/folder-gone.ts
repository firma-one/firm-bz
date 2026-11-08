import { StorageFailure, type StorageProvider } from '@/lib/connectors/storage-failure'

/**
 * What the Files list says when the folder it opens is gone from the storage (404, or in the trash),
 * in place of "Folder is empty": the person might otherwise recreate files that still exist elsewhere.
 * Code `not_found`, so the list can draw it as its own state.
 */
export function folderGoneFailure(provider: StorageProvider): StorageFailure {
    return new StorageFailure('not_found', `This folder is no longer available in ${provider}. It may have been moved or deleted there.`)
}
