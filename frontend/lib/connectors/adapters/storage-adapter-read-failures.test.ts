import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * P2-35: a refused folder read is not "no such folder". The storage adapters used to answer [] when
 * Drive or Graph refused a listing or a search, so setup went on to create a duplicate folder (or a
 * second meta.json) and onboarding read "no existing structure". A refused read now throws the
 * storage's reason; a real empty folder still answers [].
 */

vi.mock('@/lib/prisma', () => ({
    prisma: {
        connector: { findUnique: vi.fn().mockResolvedValue({ id: 'conn-1', workspaceRootLocation: 'PERSONAL', workspaceRootSharedStorageId: null }) },
    },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import { createGoogleDriveAdapter } from './google-drive-adapter'
import { createOneDriveAdapter } from './onedrive-adapter'
import { StorageFailure } from '@/lib/connectors/storage-failure'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const driveRefusal = (status: number, reason: string, message: string) => json(status, { error: { code: status, message, errors: [{ reason }] } })
const graphRefusal = (status: number, code: string, message: string) => json(status, { error: { code, message } })

const fetchMock = vi.fn()
beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const token = async () => 'token'

describe('Google Drive adapter reads', () => {
    it('listFolderChildren answers [] for an empty folder', async () => {
        fetchMock.mockResolvedValueOnce(json(200, { files: [] }))
        await expect(createGoogleDriveAdapter(token).listFolderChildren('conn-1', 'f1')).resolves.toEqual([])
    })

    it('listFolderChildren throws the reason when Drive refuses the listing', async () => {
        fetchMock.mockResolvedValueOnce(driveRefusal(403, 'insufficientPermissions', 'The user does not have sufficient permissions for this file.'))
        const err = await createGoogleDriveAdapter(token).listFolderChildren('conn-1', 'f1').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('no_permission')
        expect(err.message).toMatch(/doesn't have permission/)
    })

    it('findOrCreateFolder does not create a folder when the lookup is refused', async () => {
        fetchMock.mockResolvedValueOnce(driveRefusal(401, 'authError', 'Invalid Credentials'))
        const err = await createGoogleDriveAdapter(token).findOrCreateFolder('conn-1', 'parent', 'Acme').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('reconnect')
        // Only the lookup ran: no POST that would have made a duplicate.
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls.every(([, init]) => !init || init.method !== 'POST')).toBe(true)
    })

    it('findOrCreateFolder still creates the folder when the lookup finds none', async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { files: [] }))
            .mockResolvedValueOnce(json(200, { id: 'new-id' }))
            .mockResolvedValueOnce(json(200, { files: [{ id: 'new-id', createdTime: '2026-11-08T00:00:00Z' }] }))
        await expect(createGoogleDriveAdapter(token).findOrCreateFolder('conn-1', 'parent', 'Acme')).resolves.toBe('new-id')
    })

    it('writeFile does not write a second copy when the folder listing is refused', async () => {
        fetchMock.mockResolvedValueOnce(driveRefusal(503, 'backendError', 'Backend Error'))
        const err = await createGoogleDriveAdapter(token).writeFile('conn-1', 'meta-folder', 'meta.json', '{}').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('busy')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('search throws the reason when Drive refuses it, and answers [] when nothing matches', async () => {
        fetchMock.mockResolvedValueOnce(json(200, { files: [] }))
        await expect(createGoogleDriveAdapter(token).search('conn-1', "name = '.meta'")).resolves.toEqual([])
        fetchMock.mockResolvedValueOnce(driveRefusal(429, 'rateLimitExceeded', 'Rate Limit Exceeded'))
        const err = await createGoogleDriveAdapter(token).search('conn-1', "name = '.meta'").catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('busy')
    })
})

describe('OneDrive adapter reads', () => {
    it('listFolderChildren answers [] for an empty folder', async () => {
        fetchMock.mockResolvedValueOnce(json(200, { value: [] }))
        await expect(createOneDriveAdapter(token).listFolderChildren('conn-1', 'f1')).resolves.toEqual([])
    })

    it('listFolderChildren throws the reason when Graph refuses the listing', async () => {
        fetchMock.mockResolvedValueOnce(graphRefusal(403, 'accessDenied', 'Access denied'))
        const err = await createOneDriveAdapter(token).listFolderChildren('conn-1', 'f1').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('no_permission')
        expect(err.message).toMatch(/OneDrive/)
    })

    it('search throws the reason when Graph refuses it', async () => {
        fetchMock.mockResolvedValueOnce(graphRefusal(401, 'InvalidAuthenticationToken', 'Access token has expired'))
        const err = await createOneDriveAdapter(token).search('conn-1', '.meta').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('reconnect')
    })
})
