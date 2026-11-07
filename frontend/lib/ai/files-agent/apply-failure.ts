import { StorageFailure } from '@/lib/connectors/storage-failure'

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
 * What the panel says when one of Brio's proposals couldn't be applied. The reason, where it was written
 * for a reader: a StorageFailure's words for what the storage said, or a format rule. Anything else
 * collapses to the generic line, since its text may carry internals.
 */
export function applyFailureMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : ''
    return error instanceof StorageFailure || KNOWN_FAILURE.test(message) ? message : 'Could not apply this change'
}
