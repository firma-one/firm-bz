import { StorageFailure, reasonFor, storageFailure, type StorageProvider } from '@/lib/connectors/storage-failure'

/**
 * Failures whose message was written for the user and is safe to show, apart from a StorageFailure.
 *
 * A name collision is no longer one of these — collisions are resolved with a suffix rather than
 * refused. What remains is the case a suffix cannot fix: a name that breaks the format rules, such
 * as a changed extension or a reserved folder name.
 *
 * Matched on shape rather than tagged with an error class because these are thrown inline.
 */
const KNOWN_FAILURE = /cannot be used|reserved/i

/**
 * The adapters' folder-create refusal, `Failed to create folder <name>: <status> - <body>`, thrown as
 * a plain Error rather than a StorageFailure. Read so the storage's answer still reaches the panel.
 */
const ADAPTER_REFUSAL = /: (\d{3}) - ([\s\S]*)$/

/**
 * The storage's reason, in a person's words, when `error` is one: a StorageFailure, an adapter's
 * refusal with the provider's status and answer, or the provider being unreachable. Null for
 * anything else, whose text may carry internals.
 */
export function storageWordsFor(error: unknown, provider: StorageProvider): string | null {
    if (error instanceof StorageFailure) return error.message
    if (!(error instanceof Error)) return null
    // Node's fetch throws this when the provider can't be reached at all.
    if (error instanceof TypeError && /fetch failed/i.test(error.message)) return storageFailure('unreachable', provider).message
    const refusal = error.message.match(ADAPTER_REFUSAL)
    if (!refusal) return null
    const status = Number(refusal[1])
    let code: string | undefined
    let message: string | undefined
    try {
        const body = JSON.parse(refusal[2]) as { error?: { code?: unknown; message?: string; errors?: { reason?: string }[] } }
        code = body.error?.errors?.[0]?.reason ?? (typeof body.error?.code === 'string' ? body.error.code : undefined)
        message = body.error?.message
    } catch { /* not JSON: the status alone decides */ }
    return storageFailure(reasonFor(status, code, message), provider, message ?? `HTTP ${status}`).message
}

/**
 * What the panel says when one of Brio's proposals couldn't be applied. The reason, where it was written
 * for a reader: a StorageFailure's words for what the storage said, the storage's answer to a folder
 * create (when `provider` is known), or a format rule. Anything else collapses to the generic line,
 * since its text may carry internals.
 */
export function applyFailureMessage(error: unknown, provider?: StorageProvider): string {
    if (error instanceof StorageFailure) return error.message
    const fromStorage = provider ? storageWordsFor(error, provider) : null
    if (fromStorage) return fromStorage
    const message = error instanceof Error ? error.message : ''
    return KNOWN_FAILURE.test(message) ? message : 'Could not apply this change'
}

/** Why one folder of a scaffold wasn't created, in the same words as a refused proposal. */
export function scaffoldFolderFailure(error: unknown, provider: StorageProvider): string {
    const words = applyFailureMessage(error, provider)
    return words === 'Could not apply this change' ? "Couldn't create this folder." : words
}

/** Why a child folder was skipped: its parent wasn't created, and it isn't put at the root instead. */
export const SCAFFOLD_PARENT_MISSING = "Not created, because the folder it goes in couldn't be created."
