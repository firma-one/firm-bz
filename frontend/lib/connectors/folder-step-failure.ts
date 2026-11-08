import { NextResponse } from 'next/server'
import { reasonFor, StorageFailure, storageFailure, type StorageProvider } from '@/lib/connectors/storage-failure'

/**
 * Server-only: the words for a folder step (create, find, set up the firm or client folder) that the
 * storage refused. The adapters still throw `Error("Failed to create folder X: 403 - {json}")`; this
 * reads the status and the provider's own code out of that, so the person sees `StorageFailure`'s
 * words ("…doesn't have permission…", "…out of storage space…") instead of "Internal server error".
 */

const STATUS_AND_BODY = /:\s*(\d{3})\s*-\s*([\s\S]*)$/

/** A StorageFailure for this error when it came from the storage, else null (a bug of ours). */
export function asStorageFailure(e: unknown, provider: StorageProvider): StorageFailure | null {
    if (e instanceof StorageFailure) return e
    const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
    const m = msg.match(STATUS_AND_BODY)
    if (m) {
        const status = Number(m[1])
        let code: string | undefined
        let message: string | undefined
        try {
            const j = JSON.parse(m[2]) as { error?: { code?: unknown; message?: string; errors?: { reason?: string }[] } }
            code = j.error?.errors?.[0]?.reason ?? (typeof j.error?.code === 'string' ? j.error.code : undefined)
            message = j.error?.message
        } catch {
            message = undefined
        }
        return storageFailure(reasonFor(status, code, message), provider, message)
    }
    if (e instanceof TypeError || /fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(msg)) {
        return storageFailure('unreachable', provider)
    }
    return null
}

/** Always a StorageFailure: one the storage gave, or "refused the change" with no internal detail. */
export function folderStepFailure(e: unknown, provider: StorageProvider): StorageFailure {
    return asStorageFailure(e, provider) ?? storageFailure('other', provider)
}

/** The connection needs renewing (`getAccessToken` answered null). One reason, everywhere. */
export function reconnectFailure(provider: StorageProvider): StorageFailure {
    return storageFailure('reconnect', provider)
}

/** The route answer for a StorageFailure. */
export function storageFailureResponse(f: StorageFailure): NextResponse {
    return NextResponse.json({ error: f.message, code: f.reason }, { status: f.status })
}
