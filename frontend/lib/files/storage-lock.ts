import 'server-only'
import { ConnectorType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { StorageFailure, type StorageProvider } from '@/lib/connectors/storage-failure'
import type { ConnectorRole } from '@/lib/connectors/types'
import { logger } from '@/lib/logger'

/**
 * Locking a file in its storage, and undoing it: what Finalize and Unlock do to the file itself.
 * Moved out of `sharing/finalize` and `sharing/unlock` so approving a document can lock it the
 * same way (.claude/plans/document-approval-record.md). The lock's record in `settings.lock` is
 * each caller's to write.
 *
 * A lock is all or nothing (AP-1): when the permissions can't be read, an editor can't be made a
 * viewer, or Google won't make the content read-only, the lock is refused with the reason and what
 * was already downgraded is put back. OneDrive has no read-only content (`setFileContentReadOnly` is
 * always false there), so that step isn't asked of it.
 *
 * An unlock reports what it couldn't give back (AP-2), so the caller keeps those in the lock record
 * rather than forgetting who was downgraded.
 */

export interface DowngradedPermission {
    permissionId: string
    previousRole: string
    /** Who it is, for the words when it can't be given back. Older lock records don't have it. */
    email?: string
}

export class StorageNotSupportedError extends Error {
    constructor() {
        super("This storage can't lock files. Reconnect it, then try again.")
    }
}

export interface UnlockOutcome {
    /** The permissions whose role couldn't be given back: keep them in the lock record. */
    notRestored: DowngradedPermission[]
    /** Google refused to lift the read-only content. */
    stillReadOnly: boolean
    /** "Couldn't restore edit access for ana@client.com in Google Drive · …"; null when it was all undone. */
    problem: string | null
}

const ELEVATED_ROLES = new Set(['editor', 'commenter'])

async function providerOf(connectorId: string): Promise<StorageProvider> {
    const connector = await prisma.connector.findUnique({ where: { id: connectorId }, select: { type: true } })
    return connector?.type === ConnectorType.ONEDRIVE ? 'OneDrive' : 'Google Drive'
}

/** "ana@client.com", "ana@client.com and ben@client.com", "ana@client.com, ben@client.com and 2 others". */
function peopleNamed(emails: string[]): string {
    if (emails.length <= 1) return emails[0] ?? 'Someone'
    if (emails.length === 2) return `${emails[0]} and ${emails[1]}`
    return `${emails[0]}, ${emails[1]} and ${emails.length - 2} other${emails.length === 3 ? '' : 's'}`
}

/** The storage's reason, when it gave one. */
const reasonOf = (failure: StorageFailure | null, provider: StorageProvider) =>
    failure?.message ?? `${provider} refused the change. Try again in a moment.`

/** A patch's answer: true, or the failure it threw (A1's adapters may throw a StorageFailure). */
async function attempt(run: () => Promise<boolean>): Promise<true | StorageFailure | null> {
    try {
        return (await run()) === true ? true : null
    } catch (e) {
        return e instanceof StorageFailure ? e : null
    }
}

/** Every editor and commenter becomes a viewer, and the content is made read-only. Returns who was downgraded. */
export async function lockFileInStorage(connectorId: string, externalId: string): Promise<DowngradedPermission[]> {
    const permissionAdapter = await getPermissionAdapter(connectorId)
    if (!permissionAdapter) throw new StorageNotSupportedError()
    const provider = await providerOf(connectorId)

    // A listing that fails throws a StorageFailure (the adapters' contract): nothing has changed yet.
    let perms: Awaited<ReturnType<typeof permissionAdapter.listFilePermissions>>
    try {
        perms = await permissionAdapter.listFilePermissions(connectorId, externalId)
    } catch (e) {
        const failure = e instanceof StorageFailure ? e : null
        throw new StorageFailure(failure?.reason ?? 'unreachable', `Couldn't lock this in ${provider} · its sharing couldn't be read. ${failure?.message ?? 'Try again in a moment.'}`)
    }

    const downgraded: DowngradedPermission[] = []
    const refused: { email: string; failure: StorageFailure | null }[] = []
    for (const p of perms) {
        if (!p.id || !p.email) continue
        if (!ELEVATED_ROLES.has(p.role)) continue
        const answer = await attempt(() => permissionAdapter.patchFilePermissionRole(connectorId, externalId, p.id, 'viewer'))
        if (answer === true) downgraded.push({ permissionId: p.id, previousRole: p.role, email: p.email })
        else refused.push({ email: p.email, failure: answer })
    }

    if (refused.length > 0) {
        await giveBack(connectorId, externalId, downgraded)
        const failure = refused.find((r) => r.failure)?.failure ?? null
        const who = peopleNamed(refused.map((r) => r.email))
        throw new StorageFailure(failure?.reason ?? 'other', `Couldn't lock this in ${provider}. ${who} can still edit it · ${reasonOf(failure, provider)}`)
    }

    if (provider === 'Google Drive') {
        const answer = await attempt(() => permissionAdapter.setFileContentReadOnly(connectorId, externalId, true))
        if (answer !== true) {
            await giveBack(connectorId, externalId, downgraded)
            throw new StorageFailure(answer?.reason ?? 'other', `Couldn't lock this in Google Drive · it wouldn't make the file read-only. ${reasonOf(answer, provider)}`)
        }
    }
    return downgraded
}

/** Undoes a lock that couldn't be finished. What can't be undone is logged: the lock is refused either way. */
async function giveBack(connectorId: string, externalId: string, downgraded: DowngradedPermission[]): Promise<void> {
    if (downgraded.length === 0) return
    const outcome = await unlockFileInStorage(connectorId, externalId, downgraded, { contentWasLocked: false }).catch((e) => {
        logger.error('[lock] could not undo a refused lock', e instanceof Error ? e : new Error(String(e)), undefined, { connectorId, externalId })
        return null
    })
    if (outcome?.problem) logger.error('[lock] could not undo a refused lock', new Error(outcome.problem), undefined, { connectorId, externalId })
}

/** Restores the roles recorded at lock time, and lifts the read-only content. Says what it couldn't give back. */
export async function unlockFileInStorage(
    connectorId: string,
    externalId: string,
    downgraded: DowngradedPermission[],
    opts: { contentWasLocked?: boolean } = {},
): Promise<UnlockOutcome> {
    const permissionAdapter = await getPermissionAdapter(connectorId)
    if (!permissionAdapter) throw new StorageNotSupportedError()
    const provider = await providerOf(connectorId)

    // previousRole may be stored as either Google-native strings (writer/reader/...) from
    // older locks, or the provider-agnostic ConnectorRole vocabulary (editor/viewer/commenter)
    // from locks created after the registry migration — normalize both.
    const toConnectorRole = (r: string): ConnectorRole | null => {
        if (r === 'writer' || r === 'fileOrganizer' || r === 'organizer' || r === 'editor') return 'editor'
        if (r === 'commenter') return 'commenter'
        if (r === 'reader' || r === 'viewer') return 'viewer'
        return null
    }
    let notRestored: DowngradedPermission[] = []
    let failure: StorageFailure | null = null
    for (const row of downgraded) {
        const role = toConnectorRole(row.previousRole)
        if (!role) continue
        const answer = await attempt(() => permissionAdapter.patchFilePermissionRole(connectorId, externalId, row.permissionId, role))
        if (answer === true) continue
        failure ??= answer
        notRestored.push(row)
    }

    // A permission removed in storage since has nothing to give back. Kept, it would hold the lock
    // forever; when the listing can't be read, everything refused is kept.
    if (notRestored.length > 0) {
        const standing = await permissionAdapter.listFilePermissions(connectorId, externalId).catch(() => null)
        if (standing) notRestored = notRestored.filter((row) => standing.some((p) => p.id === row.permissionId))
    }

    let stillReadOnly = false
    if (provider === 'Google Drive' && opts.contentWasLocked !== false) {
        const answer = await attempt(() => permissionAdapter.setFileContentReadOnly(connectorId, externalId, false))
        if (answer !== true) {
            stillReadOnly = true
            failure ??= answer
        }
    }

    const parts: string[] = []
    if (notRestored.length > 0) {
        const named = notRestored.map((r) => r.email).filter((e): e is string => !!e)
        const who = named.length === notRestored.length
            ? peopleNamed(named)
            : `${notRestored.length} ${notRestored.length === 1 ? 'person' : 'people'}`
        parts.push(`Couldn't restore edit access for ${who} in ${provider}`)
    }
    if (stillReadOnly) parts.push(parts.length > 0 ? 'and it is still read-only there' : `${provider} kept this file read-only`)
    const problem = parts.length > 0 ? `${parts.join(', ')} · ${reasonOf(failure, provider)}` : null
    return { notRestored, stillReadOnly, problem }
}
