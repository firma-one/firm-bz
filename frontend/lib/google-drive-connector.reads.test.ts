import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
    prisma: { connector: { findUnique: vi.fn(async () => ({ id: 'conn-1', settings: {}, tokenExpiresAt: null, accessToken: 'token' })) } },
    basePrisma: {},
}))
vi.mock('./prisma', () => ({
    prisma: { connector: { findUnique: vi.fn(async () => ({ id: 'conn-1', settings: {}, tokenExpiresAt: null, accessToken: 'token' })) } },
    basePrisma: {},
}))

import { GoogleDriveConnector } from './google-drive-connector'
import { StorageFailure } from '@/lib/connectors/storage-failure'

/**
 * Reads that used to answer as if nothing was there when Drive refused them (P2-37), and the connector's
 * Test button, which said only "Failed to fetch user info" (P1-34). Each now says why, in Drive's terms.
 */

const g = GoogleDriveConnector.getInstance()

const json = (body: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response
const refusal = (status: number, reason: string, message: string) => json({ error: { code: status, message, errors: [{ reason }] } }, status)

afterEach(() => { vi.restoreAllMocks() })

describe('testConnection', () => {
    it('answers the account and recent files when Drive answers', async () => {
        vi.spyOn(g, 'getAccessToken').mockResolvedValue('token')
        vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) =>
            String(input).includes('/about')
                ? json({ user: { emailAddress: 'a@acme.com', displayName: 'Ana' }, storageQuota: { usage: '5', limit: '10' } })
                : json({ files: [{ id: 'f1' }] }))
        await expect(g.testConnection('conn-1')).resolves.toEqual(expect.objectContaining({ userInfo: expect.objectContaining({ email: 'a@acme.com' }), totalFiles: 1 }))
    })

    it('says to reconnect when there is no usable sign-in', async () => {
        vi.spyOn(g, 'getAccessToken').mockResolvedValue(null)
        const err = await g.testConnection('conn-1').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('reconnect')
        expect(err.message).toMatch(/Reconnect/)
    })

    it("says Drive rejected the sign-in when it answers 401", async () => {
        vi.spyOn(g, 'getAccessToken').mockResolvedValue('token')
        vi.spyOn(global, 'fetch').mockResolvedValue(refusal(401, 'authError', 'Invalid Credentials'))
        const err = await g.testConnection('conn-1').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('reconnect')
    })

    it("says Drive couldn't be reached when the request never got there", async () => {
        vi.spyOn(g, 'getAccessToken').mockResolvedValue('token')
        vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
        const err = await g.testConnection('conn-1').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('unreachable')
    })
})

describe('getDuplicateFiles', () => {
    it('throws the reason when Drive refuses the listing, instead of "no duplicates"', async () => {
        vi.spyOn(g, 'getAccessToken').mockResolvedValue('token')
        vi.spyOn(global, 'fetch').mockResolvedValue(refusal(403, 'insufficientPermissions', 'Insufficient permissions'))
        const err = await g.getDuplicateFiles('conn-1').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('no_permission')
    })

    it('throws reconnect without a sign-in', async () => {
        vi.spyOn(g, 'getAccessToken').mockResolvedValue(null)
        await expect(g.getDuplicateFiles('conn-1')).rejects.toBeInstanceOf(StorageFailure)
    })

    it('still groups duplicates when Drive answers', async () => {
        vi.spyOn(g, 'getAccessToken').mockResolvedValue('token')
        vi.spyOn(global, 'fetch').mockResolvedValue(json({ files: [
            { id: 'a', name: 'Q3.pdf', size: '10', md5Checksum: 'x' },
            { id: 'b', name: 'Q3 copy.pdf', size: '10', md5Checksum: 'x' },
            { id: 'c', name: 'Other.pdf', size: '5', md5Checksum: 'y' },
        ] }))
        const groups = await g.getDuplicateFiles('conn-1')
        expect(groups).toHaveLength(1)
        expect(groups[0].count).toBe(2)
    })
})

describe('getNonNativeFiles', () => {
    it('throws the reason when Drive refuses the listing', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(refusal(429, 'rateLimitExceeded', 'Rate Limit Exceeded'))
        const err = await g.getNonNativeFiles('conn-1').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('busy')
    })
})

describe('getStorageFiles activity', () => {
    it("fails rather than mark every file 'No activity in 90+ days' when the activity read is refused", async () => {
        vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) =>
            String(input).includes('driveactivity')
                ? refusal(403, 'forbidden', 'Drive Activity API has not been used')
                : json({ files: [{ id: 'big', name: 'Video.mp4', size: String(2 * 1024 ** 3), quotaBytesUsed: String(2 * 1024 ** 3) }] }))
        await expect(g.getStorageFiles('conn-1', 10, '1-5', 'all')).rejects.toBeInstanceOf(StorageFailure)
    })
})
