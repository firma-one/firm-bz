import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// The permission calls that change who can open something answer with why when storage refuses
// (a StorageFailure), on both storages. A `false` told callers nothing, and a revoke that read a refusal
// as "already gone" left the access standing with no record of it.

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/connectors/onedrive-connector', () => ({ OneDriveConnector: { getInstance: () => ({ getAccessToken: async () => 'token' }) } }))
vi.mock('./onedrive-adapter', () => ({ resolveOneDriveDriveBase: async () => 'https://graph/me/drive' }))

import { createOneDrivePermissionAdapter } from './onedrive-permission-adapter'
import { createGoogleDrivePermissionAdapter } from './google-drive-permission-adapter'
import { GoogleDriveConnector } from '@/lib/google-drive-connector'

type Call = { url: string; method: string; body: any }
let calls: Call[] = []
/** The answer for each request, by method and a piece of its URL; the first match wins. */
let answers: Array<{ method?: string; url?: string; status: number; body?: unknown }> = []

beforeEach(() => {
    calls = []
    answers = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null })
        const answer = answers.find((a) => (!a.method || a.method === method) && (!a.url || url.includes(a.url)))
        const status = answer?.status ?? 200
        return new Response(status === 204 ? null : JSON.stringify(answer?.body ?? {}), { status })
    }))
})
afterEach(() => vi.unstubAllGlobals())

const writes = () => calls.filter((c) => c.method !== 'GET')

describe('Google Drive', () => {
    const connector = GoogleDriveConnector.getInstance()
    const adapter = createGoogleDrivePermissionAdapter()
    beforeEach(() => { vi.spyOn(connector, 'getAccessToken').mockResolvedValue('token') })

    describe('revokePermission', () => {
        it('asks with supportsAllDrives, so a shared drive item is found rather than read as gone', async () => {
            expect(await adapter.revokePermission('conn', 'file', 'perm')).toBe(true)
            expect(calls[0].method).toBe('DELETE')
            expect(calls[0].url).toBe('https://www.googleapis.com/drive/v3/files/file/permissions/perm?supportsAllDrives=true')
        })

        it('counts a permission already gone as revoked', async () => {
            answers = [{ method: 'DELETE', status: 404 }]
            expect(await adapter.revokePermission('conn', 'file', 'perm')).toBe(true)
        })

        it('says why when Drive refuses, so the caller keeps the id', async () => {
            answers = [{ method: 'DELETE', status: 403, body: { error: { message: 'Insufficient permissions', errors: [{ reason: 'insufficientFilePermissions' }] } } }]
            await expect(adapter.revokePermission('conn', 'file', 'perm')).rejects.toMatchObject({ name: 'StorageFailure', reason: 'no_permission' })
        })

        it('says the connection needs renewing when there is no token', async () => {
            vi.spyOn(connector, 'getAccessToken').mockResolvedValue(null)
            await expect(adapter.revokePermission('conn', 'file', 'perm')).rejects.toMatchObject({ reason: 'reconnect' })
        })
    })

    it('a guard: every permission call on files and folders says supportsAllDrives', () => {
        const source = readFileSync(resolve(__dirname, '../../google-drive-connector.ts'), 'utf8').split('\n')
        const missing: string[] = []
        source.forEach((line, i) => {
            if (!/drive\/v3\/files\/\$\{[^}]+\}\/permissions/.test(line)) return
            const window = source.slice(i, i + 4).join('\n')
            if (!/supportsAllDrives|\$\{queryParams\}/.test(window)) missing.push(`${i + 1}: ${line.trim()}`)
        })
        expect(missing, 'permission calls without supportsAllDrives').toEqual([])
    })

    it('listFilePermissions throws when Drive will not list them, so [] means none', async () => {
        answers = [{ status: 500, body: { error: { message: 'Backend Error' } } }]
        await expect(adapter.listFilePermissions('conn', 'file')).rejects.toMatchObject({ name: 'StorageFailure' })
    })

    it('grantFolderPermission says why when Drive refuses', async () => {
        answers = [{ method: 'POST', status: 403, body: { error: { message: 'Sharing is off', errors: [{ reason: 'forbidden' }] } } }]
        await expect(adapter.grantFolderPermission('conn', 'folder', 'ana@firm.test', 'editor', { notify: false })).rejects.toMatchObject({ name: 'StorageFailure' })
    })

    describe('revokeFolderPermissionByEmail', () => {
        it("removes the person's own permission on the folder, and leaves one inherited from the shared drive", async () => {
            answers = [{
                method: 'GET', status: 200, body: {
                    permissions: [
                        { id: 'direct', emailAddress: 'Ana@Firm.test', role: 'writer' },
                        { id: 'from-drive', emailAddress: 'ana@firm.test', role: 'organizer', permissionDetails: [{ inherited: true }] },
                        { id: 'other', emailAddress: 'bob@firm.test', role: 'writer' },
                    ],
                },
            }]
            await adapter.revokeFolderPermissionByEmail('conn', 'general', 'ana@firm.test')
            expect(calls[0].url).toContain('supportsAllDrives=true')
            expect(writes().map((c) => [c.method, c.url])).toEqual([
                ['DELETE', 'https://www.googleapis.com/drive/v3/files/general/permissions/direct?supportsAllDrives=true'],
            ])
        })

        it('is done when they hold nothing there', async () => {
            answers = [{ method: 'GET', status: 200, body: { permissions: [] } }]
            await expect(adapter.revokeFolderPermissionByEmail('conn', 'general', 'ana@firm.test')).resolves.toBeUndefined()
            expect(writes()).toEqual([])
        })

        it('says why when Drive refuses the delete', async () => {
            answers = [
                { method: 'GET', status: 200, body: { permissions: [{ id: 'direct', emailAddress: 'ana@firm.test', role: 'writer' }] } },
                { method: 'DELETE', status: 403, body: { error: { message: 'No' } } },
            ]
            await expect(adapter.revokeFolderPermissionByEmail('conn', 'general', 'ana@firm.test')).rejects.toMatchObject({ reason: 'no_permission' })
        })
    })

    describe('restrictFolderToOwnerOnly', () => {
        it('reads each answer, keeps the owner and the shared drive, and names who Drive kept', async () => {
            answers = [
                {
                    method: 'GET', status: 200, body: {
                        permissions: [
                            { id: 'owner', emailAddress: 'owner@firm.test', role: 'owner' },
                            { id: 'kept', emailAddress: 'ana@client.test', role: 'reader' },
                            { id: 'gone', emailAddress: 'bob@firm.test', role: 'writer' },
                            { id: 'drive', emailAddress: 'team@firm.test', role: 'organizer', permissionDetails: [{ inherited: true }] },
                        ],
                    },
                },
                { method: 'DELETE', url: '/permissions/kept', status: 403, body: { error: { message: 'Not allowed' } } },
            ]
            const outcome = await adapter.restrictFolderToOwnerOnly('conn', 'folder')
            expect(writes().map((c) => c.url.split('/permissions/')[1])).toEqual(['kept?supportsAllDrives=true', 'gone?supportsAllDrives=true'])
            expect(outcome.removed).toBe(1)
            expect(outcome.remaining).toEqual(['ana@client.test'])
            expect(outcome.reason).toBeTruthy()
        })

        it("throws when Drive won't list the folder's permissions", async () => {
            answers = [{ method: 'GET', status: 500 }]
            await expect(adapter.restrictFolderToOwnerOnly('conn', 'folder')).rejects.toMatchObject({ name: 'StorageFailure' })
        })
    })

    describe('getTrashState', () => {
        it.each([
            [{ trashed: false }, 'restored'],
            [{ trashed: true }, 'trashed'],
        ])('reads %j as %s', async (body, state) => {
            answers = [{ status: 200, body }]
            expect(await adapter.getTrashState('conn', 'file')).toBe(state)
        })

        it('reads 404 as gone, and anything else as a refusal, never as still trashed', async () => {
            answers = [{ status: 404 }]
            expect(await adapter.getTrashState('conn', 'file')).toBe('gone')
            answers = [{ status: 503 }]
            await expect(adapter.getTrashState('conn', 'file')).rejects.toMatchObject({ reason: 'busy' })
        })
    })
})

describe('OneDrive', () => {
    const adapter = createOneDrivePermissionAdapter()
    const person = (id: string, email: string, roles: string[], extra: object = {}) => ({ id, roles, grantedToV2: { user: { email } }, ...extra })

    describe('revokePermission', () => {
        it('counts a permission already gone as revoked', async () => {
            answers = [{ method: 'DELETE', status: 404 }]
            expect(await adapter.revokePermission('conn', 'file', 'perm')).toBe(true)
        })

        it('says why when Graph refuses', async () => {
            answers = [{ method: 'DELETE', status: 403, body: { error: { code: 'accessDenied', message: 'Access denied' } } }]
            await expect(adapter.revokePermission('conn', 'file', 'perm')).rejects.toMatchObject({ name: 'StorageFailure', reason: 'no_permission' })
        })
    })

    it('listFilePermissions throws when Graph will not list them', async () => {
        answers = [{ status: 401, body: { error: { code: 'InvalidAuthenticationToken' } } }]
        await expect(adapter.listFilePermissions('conn', 'file')).rejects.toMatchObject({ reason: 'reconnect' })
    })

    describe('revokeFolderPermissionByEmail', () => {
        it('lists the folder permissions, as Graph has no revoke by email, then deletes theirs', async () => {
            answers = [{
                method: 'GET', status: 200, body: {
                    value: [
                        person('p-ana', 'Ana@Firm.test', ['write']),
                        person('p-inherited', 'ana@firm.test', ['write'], { inheritedFrom: { id: 'root' } }),
                        person('p-bob', 'bob@firm.test', ['write']),
                    ],
                },
            }]
            await adapter.revokeFolderPermissionByEmail('conn', 'general', 'ana@firm.test')
            expect(calls[0]).toMatchObject({ method: 'GET', url: 'https://graph/me/drive/items/general/permissions' })
            expect(writes().map((c) => [c.method, c.url])).toEqual([['DELETE', 'https://graph/me/drive/items/general/permissions/p-ana']])
        })

        it('finds a link grant by its identities too', async () => {
            answers = [{ method: 'GET', status: 200, body: { value: [{ id: 'p-link', roles: ['read'], grantedToIdentitiesV2: [{ user: { email: 'ana@firm.test' } }] }] } }]
            await adapter.revokeFolderPermissionByEmail('conn', 'general', 'ana@firm.test')
            expect(writes()[0].url).toBe('https://graph/me/drive/items/general/permissions/p-link')
        })

        it('says why when Graph refuses the delete', async () => {
            answers = [
                { method: 'GET', status: 200, body: { value: [person('p-ana', 'ana@firm.test', ['write'])] } },
                { method: 'DELETE', status: 423, body: { error: { code: 'resourceLocked' } } },
            ]
            await expect(adapter.revokeFolderPermissionByEmail('conn', 'general', 'ana@firm.test')).rejects.toMatchObject({ reason: 'locked' })
        })
    })

    it('restrictFolderToOwnerOnly keeps the owner and inherited ones, and names who Graph kept', async () => {
        answers = [
            {
                method: 'GET', status: 200, body: {
                    value: [
                        person('owner', 'owner@firm.test', ['owner']),
                        person('ana', 'ana@client.test', ['read']),
                        person('site', 'team@firm.test', ['write'], { inheritedFrom: { id: 'site' } }),
                    ],
                },
            },
            { method: 'DELETE', status: 403, body: { error: { code: 'accessDenied' } } },
        ]
        const outcome = await adapter.restrictFolderToOwnerOnly('conn', 'folder')
        expect(writes().map((c) => c.url)).toEqual(['https://graph/me/drive/items/folder/permissions/ana'])
        expect(outcome).toMatchObject({ removed: 0, remaining: ['ana@client.test'] })
    })

    describe('downgradeFolderUserPermissionToReader', () => {
        it.each([
            ['no permission of theirs', []],
            ["the owner's, which can't be lowered", [person('p', 'sam@firm.test', ['owner'])]],
            ['one that only reads already', [person('p', 'sam@firm.test', ['read'])]],
        ])('has nothing to do for %s', async (_what, value) => {
            answers = [{ method: 'GET', status: 200, body: { value } }]
            expect(await adapter.downgradeFolderUserPermissionToReader('conn', 'folder', 'sam@firm.test')).toBe(true)
            expect(writes()).toEqual([])
        })

        it('says why when Graph refuses', async () => {
            answers = [
                { method: 'GET', status: 200, body: { value: [person('p', 'sam@firm.test', ['write'])] } },
                { method: 'PATCH', status: 403, body: { error: { code: 'accessDenied' } } },
            ]
            await expect(adapter.downgradeFolderUserPermissionToReader('conn', 'folder', 'sam@firm.test')).rejects.toMatchObject({ reason: 'no_permission' })
        })
    })

    it('grantFolderPermission says why when the tenant does not allow sharing with that address', async () => {
        answers = [{ method: 'POST', status: 403, body: { error: { code: 'sharingFailed', message: 'sharing failed' } } }]
        await expect(adapter.grantFolderPermission('conn', 'folder', 'ana@client.test', 'editor')).rejects.toMatchObject({
            name: 'StorageFailure',
            message: expect.stringContaining("sharing settings don't allow"),
        })
    })

    it('getTrashState reads 404 as gone and an outage as a refusal', async () => {
        answers = [{ status: 404 }]
        expect(await adapter.getTrashState('conn', 'file')).toBe('gone')
        answers = [{ status: 200, body: { id: 'file' } }]
        expect(await adapter.getTrashState('conn', 'file')).toBe('restored')
        answers = [{ status: 503 }]
        await expect(adapter.getTrashState('conn', 'file')).rejects.toMatchObject({ reason: 'busy' })
    })
})
