import { logger } from '@/lib/logger'

/**
 * Why Drive or OneDrive refused an action, in words a person can act on. A failed file action must always
 * say why: "Failed to rename file" tells nobody anything, and the storage's own answer says what to do.
 * Each failure is logged with that answer, so it can be traced after the toast is gone.
 */

export type StorageProvider = 'Google Drive' | 'OneDrive'

export type StorageFailureReason =
    | 'locked'
    | 'name_taken'
    | 'invalid_name'
    | 'no_permission'
    | 'not_found'
    | 'reconnect'
    | 'busy'
    | 'storage_full'
    | 'timed_out'
    | 'unreachable'
    | 'other'

const STATUS_FOR: Record<StorageFailureReason, number> = {
    locked: 409,
    name_taken: 409,
    invalid_name: 400,
    no_permission: 403,
    not_found: 404,
    // Not 401: this is the connection to the storage, not the person's session with Firma.
    reconnect: 502,
    busy: 503,
    storage_full: 507,
    timed_out: 504,
    unreachable: 502,
    other: 502,
}

export class StorageFailure extends Error {
    readonly reason: StorageFailureReason
    readonly status: number

    constructor(reason: StorageFailureReason, message: string) {
        super(message)
        this.name = 'StorageFailure'
        this.reason = reason
        this.status = STATUS_FOR[reason]
    }
}

function explain(reason: StorageFailureReason, provider: StorageProvider, detail?: string): string {
    switch (reason) {
        case 'locked':
            return `${provider} has this locked, usually because a file is open in Word, Excel or another app. Close it everywhere, then try again. It can take a minute to unlock.`
        case 'name_taken':
            return 'Something with that name is already in that folder. Use a different name.'
        case 'invalid_name':
            return `${provider} doesn't allow that name. Try one without special characters such as " * : < > ? / \\ |.`
        case 'no_permission':
            return `The ${provider} account connected to this client doesn't have permission to change this.`
        case 'not_found':
            return `This is no longer in ${provider}. It may have been moved or deleted there. Refresh the list.`
        case 'reconnect':
            return `The connection to ${provider} needs renewing. Reconnect the storage, then try again.`
        case 'busy':
            return `${provider} is busy right now. Try again in a minute.`
        case 'storage_full':
            return `The ${provider} account connected to this client is out of storage space. Free some up, then try again.`
        case 'timed_out':
            return `${provider} is taking longer than expected. Refresh in a minute to see if it finished.`
        case 'unreachable':
            return `Couldn't reach ${provider}. Try again in a moment.`
        case 'other':
            return `${provider} refused the change${detail ? `: ${detail}` : '.'}`
    }
}

export function storageFailure(reason: StorageFailureReason, provider: StorageProvider, detail?: string): StorageFailure {
    return new StorageFailure(reason, explain(reason, provider, detail))
}

/** Which failure a storage's answer is. Graph sends `error.code`; Drive, `error.errors[0].reason`. */
export function reasonFor(status: number, code: string | undefined, message: string | undefined): StorageFailureReason {
    const said = `${code ?? ''} ${message ?? ''}`.toLowerCase()
    if (status === 423 || said.includes('resourcelocked') || /\blocked\b/.test(said)) return 'locked'
    // Before the space check: Drive words a rate limit as a "quota" too.
    if (said.includes('ratelimit') || status === 429 || status === 503 || status === 504) return 'busy'
    if (status === 507 || said.includes('storagequotaexceeded') || said.includes('quotalimitreached') || said.includes('insufficientstorage')) return 'storage_full'
    if (said.includes('namealreadyexists') || said.includes('already exists')) return 'name_taken'
    if (status === 400 && /\b(name|character)/.test(said)) return 'invalid_name'
    if (status === 401) return 'reconnect'
    if (status === 403) return 'no_permission'
    if (status === 404) return 'not_found'
    return 'other'
}

/** The failure a refused request stands for. Reads the storage's answer, and logs it. */
export async function storageFailureFromResponse(res: Response, provider: StorageProvider, action: string): Promise<StorageFailure> {
    const body = await res.json().catch(() => null) as { error?: { code?: unknown; message?: string; errors?: { reason?: string }[] } } | null
    const code = body?.error?.errors?.[0]?.reason ?? (typeof body?.error?.code === 'string' ? body.error.code : undefined)
    const message = body?.error?.message
    const reason = reasonFor(res.status, code, message)
    logger.warn(`${provider} refused to ${action}`, { status: res.status, code, message, reason })
    return storageFailure(reason, provider, message ?? `HTTP ${res.status}`)
}
