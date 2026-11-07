import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A file action that fails says why. The storage's own answer decides what the person is told, and is
// logged, so "Failed to rename file" with no reason can't happen.

const { logged } = vi.hoisted(() => ({ logged: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

vi.mock('@/lib/logger', () => ({ logger: logged }))
vi.mock('@/lib/connectors/onedrive-connector', () => ({ OneDriveConnector: { getInstance: () => ({ getAccessToken: async () => 'token' }) } }))
vi.mock('@/lib/connectors/adapters/onedrive-adapter', () => ({ resolveOneDriveDriveBase: async () => 'https://graph/me/drive' }))

import { reasonFor, storageFailureFromResponse, StorageFailure } from './storage-failure'
import { renameOneDriveFile } from './adapters/onedrive-file-ops'

const graphError = (status: number, code: string, message: string) =>
    new Response(JSON.stringify({ error: { code, message } }), { status })
const driveError = (status: number, reason: string, message: string) =>
    new Response(JSON.stringify({ error: { code: status, message, errors: [{ reason }] } }), { status })

beforeEach(() => { for (const fn of Object.values(logged)) fn.mockClear() })
afterEach(() => vi.unstubAllGlobals())

describe('what a storage answer means', () => {
    it.each([
        [423, 'resourceLocked', 'The resource you are attempting to access is locked', 'locked'],
        [409, 'resourceModified', 'The file is locked for shared use', 'locked'],
        [409, 'nameAlreadyExists', 'Name already exists', 'name_taken'],
        [409, 'resourceModified', 'The item was changed by someone else', 'other'],
        [507, 'quotaLimitReached', 'Insufficient Storage', 'storage_full'],
        [403, 'accessDenied', 'Blocked by your administrator', 'no_permission'],
        [400, 'invalidRequest', 'The provided name contains an invalid character', 'invalid_name'],
        [400, 'invalidRequest', 'Bad value for something else', 'other'],
        [401, 'unauthenticated', 'Token expired', 'reconnect'],
        [403, 'accessDenied', 'Access denied', 'no_permission'],
        [404, 'itemNotFound', 'Item not found', 'not_found'],
        [429, 'activityLimitReached', 'Slow down', 'busy'],
        [503, 'serviceNotAvailable', 'Unavailable', 'busy'],
        [500, 'generalException', 'Something broke', 'other'],
    ])('OneDrive: %i %s is %s → %s', (status, code, message, reason) => {
        expect(reasonFor(status, code, message)).toBe(reason)
    })

    it.each([
        [403, 'insufficientFilePermissions', 'The user does not have sufficient permissions', 'no_permission'],
        [403, 'userRateLimitExceeded', 'User rate limit exceeded', 'busy'],
        [403, 'rateLimitExceeded', 'Rate limit exceeded', 'busy'],
        [403, 'rateLimitExceeded', 'You have exceeded your quota', 'busy'],
        [403, 'storageQuotaExceeded', "The user's Drive storage quota has been exceeded", 'storage_full'],
        [403, 'domainPolicy', 'The domain administrators have blocked this', 'no_permission'],
        [404, 'notFound', 'File not found', 'not_found'],
    ])('Google Drive: %i %s → %s', (status, code, message, reason) => {
        expect(reasonFor(status, code, message)).toBe(reason)
    })
})

describe('what the person is told', () => {
    it('says a locked file is usually open, and what to do', async () => {
        const failure = await storageFailureFromResponse(graphError(423, 'resourceLocked', 'Locked'), 'OneDrive', 'rename a file')
        expect(failure.reason).toBe('locked')
        expect(failure.message).toBe('OneDrive has this locked, usually because a file is open in Word, Excel or another app. Close it everywhere, then try again. It can take a minute to unlock.')
    })

    it('reads Drive\'s reason from where Drive puts it', async () => {
        const failure = await storageFailureFromResponse(driveError(403, 'insufficientFilePermissions', 'No'), 'Google Drive', 'rename a file')
        expect(failure.message).toBe("The Google Drive account connected to this client doesn't have permission to change this.")
    })

    it('says the account is full, not that it has no permission', async () => {
        const failure = await storageFailureFromResponse(driveError(403, 'storageQuotaExceeded', 'Quota exceeded'), 'Google Drive', 'copy a file')
        expect(failure.status).toBe(507)
        expect(failure.message).toBe('The Google Drive account connected to this client is out of storage space. Free some up, then try again.')
    })

    it("passes on the storage's own words when it's nothing we recognize", async () => {
        const failure = await storageFailureFromResponse(graphError(500, 'generalException', 'The disk is on fire'), 'OneDrive', 'rename a file')
        expect(failure.message).toBe('OneDrive refused the change: The disk is on fire')
    })

    it('still gives a reason when the answer has no body', async () => {
        const failure = await storageFailureFromResponse(new Response('<html>', { status: 502 }), 'OneDrive', 'rename a file')
        expect(failure.message).toBe('OneDrive refused the change: HTTP 502')
    })

    it('logs what the storage said, so it can be traced later', async () => {
        await storageFailureFromResponse(graphError(423, 'resourceLocked', 'Locked'), 'OneDrive', 'rename a file')
        expect(logged.warn).toHaveBeenCalledWith('OneDrive refused to rename a file', expect.objectContaining({ status: 423, code: 'resourceLocked', reason: 'locked' }))
    })
})

describe('renaming on OneDrive', () => {
    it('renames', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'f1', name: 'New.docx' }), { status: 200 })))
        expect(await renameOneDriveFile('conn', 'f1', ' New.docx ')).toEqual({ id: 'f1', name: 'New.docx' })
    })

    it('throws why when the file is open', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => graphError(423, 'resourceLocked', 'Locked')))
        const error = await renameOneDriveFile('conn', 'f1', 'New.docx').catch((e) => e)
        expect(error).toBeInstanceOf(StorageFailure)
        expect(error.reason).toBe('locked')
        expect(error.status).toBe(409)
    })

    it('says so when OneDrive can\'t be reached', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
        const error = await renameOneDriveFile('conn', 'f1', 'New.docx').catch((e) => e)
        expect(error.reason).toBe('unreachable')
        expect(error.message).toBe("Couldn't reach OneDrive. Try again in a moment.")
    })

    it('refuses an empty name', async () => {
        const error = await renameOneDriveFile('conn', 'f1', '   ').catch((e) => e)
        expect(error.reason).toBe('invalid_name')
    })
})
