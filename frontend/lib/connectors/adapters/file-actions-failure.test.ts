import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Move, Copy and Move to trash, on each storage: when the storage refuses, the caller gets a StorageFailure
// saying why, never a null or a bare "failed" that a toast can only repeat.

const { connection } = vi.hoisted(() => ({ connection: { broken: false } }))

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/connectors/onedrive-connector', () => ({
    OneDriveConnector: {
        getInstance: () => ({
            getAccessToken: async () => {
                if (connection.broken) throw new Error('refresh token expired')
                return 'token'
            },
        }),
    },
}))
vi.mock('./onedrive-adapter', () => ({ resolveOneDriveDriveBase: async () => 'https://graph/me/drive' }))

import { StorageFailure, type StorageFailureReason } from '@/lib/connectors/storage-failure'
import { GoogleDriveConnector } from '@/lib/google-drive-connector'
import { copyOneDriveFile, moveOneDriveFile } from './onedrive-file-ops'
import { createOneDrivePermissionAdapter } from './onedrive-permission-adapter'

type Answer = (url: string, method: string) => Response
const answers = (answer: Answer) => vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => answer(String(url), init?.method ?? 'GET')))
const unreachable = () => vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const graphError = (status: number, code: string, message = 'No') => json({ error: { code, message } }, status)
const driveError = (status: number, reason: string, message = 'No') => json({ error: { code: status, message, errors: [{ reason }] } }, status)

/** The failure a call ended in, with the reason it gave. */
async function failureOf(call: Promise<unknown>): Promise<StorageFailure> {
    const outcome = await call.then(() => null, (e) => e)
    expect(outcome).toBeInstanceOf(StorageFailure)
    return outcome as StorageFailure
}
const expectReason = async (call: Promise<unknown>, reason: StorageFailureReason) => expect((await failureOf(call)).reason).toBe(reason)

beforeEach(() => { connection.broken = false })
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('on OneDrive', () => {
    describe('moving', () => {
        const move = () => moveOneDriveFile('conn', 'f1', 'dest')

        it('moves', async () => {
            answers(() => json({ id: 'f1' }))
            expect(await move()).toEqual({ id: 'f1' })
        })

        it('says the file is locked when it is open somewhere', async () => {
            answers(() => graphError(423, 'resourceLocked'))
            await expectReason(move(), 'locked')
        })

        it("says it couldn't reach OneDrive", async () => {
            unreachable()
            await expectReason(move(), 'unreachable')
        })

        it('asks to reconnect when there is no token', async () => {
            connection.broken = true
            await expectReason(move(), 'reconnect')
        })
    })

    describe('copying', () => {
        const copy = () => copyOneDriveFile('conn', 'f1', 'dest', 'New.docx')
        /** Graph accepts a copy, then answers the monitor URL it gave with how it's going. */
        const copying = (status: unknown, children: unknown[] = []): Answer => (url, method) => {
            if (method === 'POST') return new Response(null, { status: 202, headers: { Location: 'https://graph/monitor/1' } })
            if (url === 'https://graph/monitor/1') return json(status)
            return json({ value: children })
        }

        it.each([
            [409, 'nameAlreadyExists', 'name_taken'],
            [403, 'accessDenied', 'no_permission'],
            [507, 'quotaLimitReached', 'storage_full'],
        ] as const)('a %i %s is %s', async (status, code, reason) => {
            answers(() => graphError(status, code))
            await expectReason(copy(), reason)
        })

        it("gives Graph's own words when the copy fails partway", async () => {
            answers(copying({ status: 'failed', error: { message: 'The source is too large' } }))
            const failure = await failureOf(copy())
            expect(failure.reason).toBe('other')
            expect(failure.message).toBe('OneDrive refused the change: The source is too large')
        })

        it('returns the new item when the copy completes', async () => {
            answers(copying({ status: 'completed', resourceId: 'new-1' }))
            expect(await copy()).toEqual({ id: 'new-1' })
        })

        it('finds the new item by name when the monitor leaves out its id', async () => {
            answers(copying({ status: 'completed' }, [{ id: 'other', name: 'Other.docx' }, { id: 'new-2', name: 'New.docx' }]))
            expect(await copy()).toEqual({ id: 'new-2' })
        })

        it("doesn't call a same-named item done while the copy is still running", async () => {
            vi.useFakeTimers()
            // An older folder of that name is already there: it is not this copy.
            answers(copying({ status: 'inProgress' }, [{ id: 'older', name: 'New.docx' }]))
            const outcome = failureOf(copy())
            await vi.runAllTimersAsync()
            expect((await outcome).reason).toBe('timed_out')
        })

        it('says it may still finish when the copy outlasts the wait', async () => {
            vi.useFakeTimers()
            answers(copying({ status: 'inProgress' }))
            const outcome = failureOf(copy())
            await vi.runAllTimersAsync()
            const failure = await outcome
            expect(failure.reason).toBe('timed_out')
            expect(failure.message).toBe('OneDrive is taking longer than expected. Refresh in a minute to see if it finished.')
        })
    })

    describe.each(['trashFile', 'deleteFile'] as const)('%s', (method) => {
        const remove = () => createOneDrivePermissionAdapter()[method]('conn', 'f1')

        it('moves the item to the recycle bin', async () => {
            answers(() => new Response(null, { status: 204 }))
            await expect(remove()).resolves.toBeUndefined()
        })

        it('treats an item already gone as done', async () => {
            answers(() => graphError(404, 'itemNotFound'))
            await expect(remove()).resolves.toBeUndefined()
        })

        it.each([
            [423, 'resourceLocked', 'locked'],
            [403, 'accessDenied', 'no_permission'],
        ] as const)('a %i %s is %s', async (status, code, reason) => {
            answers(() => graphError(status, code))
            await expectReason(remove(), reason)
        })

        it('asks to reconnect when there is no token', async () => {
            connection.broken = true
            await expectReason(remove(), 'reconnect')
        })
    })
})

describe('on Google Drive', () => {
    const connector = GoogleDriveConnector.getInstance()

    beforeEach(() => { vi.spyOn(connector, 'getAccessToken').mockResolvedValue('token') })

    describe('moving', () => {
        const move = () => connector.moveFile('conn', 'f1', 'dest')

        it('moves out of the old folder into the new one', async () => {
            const urls: string[] = []
            answers((url, method) => {
                urls.push(url)
                return method === 'GET' ? json({ parents: ['old-1'] }) : json({ id: 'f1' })
            })
            expect(await move()).toEqual({ id: 'f1' })
            expect(urls[1]).toContain('addParents=dest')
            expect(urls[1]).toContain('removeParents=old-1')
        })

        it('says the file is gone when Drive can no longer find it', async () => {
            answers(() => driveError(404, 'notFound'))
            await expectReason(move(), 'not_found')
        })

        it('says the account has no permission when Drive refuses the move', async () => {
            answers((_url, method) => (method === 'GET' ? json({ parents: ['old-1'] }) : driveError(403, 'insufficientFilePermissions')))
            await expectReason(move(), 'no_permission')
        })

        it('says why when the file has no folder to leave', async () => {
            answers(() => json({ parents: [] }))
            const failure = await failureOf(move())
            expect(failure.reason).toBe('other')
            expect(failure.message).toBe('Google Drive refused the change: this item has no folder to move it from')
        })

        it("says it couldn't reach Drive", async () => {
            unreachable()
            await expectReason(move(), 'unreachable')
        })

        it('asks to reconnect when there is no token, or getting one fails', async () => {
            vi.spyOn(connector, 'getAccessToken').mockResolvedValueOnce(null as never)
            await expectReason(move(), 'reconnect')
            vi.spyOn(connector, 'getAccessToken').mockRejectedValueOnce(new Error('refresh token expired'))
            await expectReason(move(), 'reconnect')
        })
    })

    describe('copying', () => {
        const copy = () => connector.copyFile('conn', 'f1', 'dest', 'New.docx')

        it('copies', async () => {
            answers(() => json({ id: 'new-1' }))
            expect(await copy()).toEqual({ id: 'new-1' })
        })

        it.each([
            ['storageQuotaExceeded', 'storage_full'],
            ['userRateLimitExceeded', 'busy'],
            ['insufficientFilePermissions', 'no_permission'],
        ] as const)('a 403 %s is %s', async (code, reason) => {
            answers(() => driveError(403, code))
            await expectReason(copy(), reason)
        })
    })

    describe('moving to the trash', () => {
        const trash = () => connector.trashFileWithReason('conn', 'f1')

        it('trashes', async () => {
            answers(() => json({ id: 'f1', trashed: true }))
            await expect(trash()).resolves.toBeUndefined()
        })

        it.each([
            [403, 'insufficientFilePermissions', 'no_permission'],
            [404, 'notFound', 'not_found'],
        ] as const)('a %i %s is %s', async (status, code, reason) => {
            answers(() => driveError(status, code))
            await expectReason(trash(), reason)
        })

        it('leaves the yes-or-no trashFile for callers that only need that', async () => {
            answers(() => driveError(403, 'insufficientFilePermissions'))
            expect(await connector.trashFile('conn', 'f1')).toBe(false)
        })
    })
})
