import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Giving a firm member write on a folder again, on each storage: a reader is raised, someone with no
// access is granted it without an email, and anyone higher (the owner above all) is left alone.

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/connectors/onedrive-connector', () => ({ OneDriveConnector: { getInstance: () => ({ getAccessToken: async () => 'token' }) } }))
vi.mock('./onedrive-adapter', () => ({ resolveOneDriveDriveBase: async () => 'https://graph/me/drive' }))

import { createOneDrivePermissionAdapter } from './onedrive-permission-adapter'
import { GoogleDriveConnector } from '@/lib/google-drive-connector'

let calls: { url: string; method: string; body: any }[] = []
let permissions: unknown

beforeEach(() => {
    calls = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null })
        if (method === 'GET') return new Response(JSON.stringify(permissions), { status: 200 })
        return new Response(JSON.stringify({ id: 'new-perm', value: [{ id: 'new-perm' }] }), { status: 200 })
    }))
})
afterEach(() => vi.unstubAllGlobals())

const writes = () => calls.filter((c) => c.method !== 'GET')

describe('on OneDrive', () => {
    const restore = () => createOneDrivePermissionAdapter().upgradeFolderUserPermissionToEditor('conn', 'folder', 'Sam@Firm.test')
    const person = (id: string, roles: string[]) => ({ id, roles, grantedToV2: { user: { email: 'sam@firm.test' } } })

    it('raises a reader to write', async () => {
        permissions = { value: [person('p1', ['read'])] }
        expect(await restore()).toBe(true)
        expect(writes()).toEqual([{ url: 'https://graph/me/drive/items/folder/permissions/p1', method: 'PATCH', body: { roles: ['write'] } }])
    })

    it.each([['an owner', ['owner']], ['an editor', ['write']]])('leaves %s alone', async (_who, roles) => {
        permissions = { value: [person('p1', roles)] }
        expect(await restore()).toBe(true)
        expect(writes()).toEqual([])
    })

    it('grants write to someone with no access, without an email', async () => {
        permissions = { value: [] }
        expect(await restore()).toBe(true)
        expect(writes()[0].url).toBe('https://graph/me/drive/items/folder/invite')
        expect(writes()[0].body).toMatchObject({ roles: ['write'], sendInvitation: false })
    })
})

describe('on Google Drive', () => {
    const connector = GoogleDriveConnector.getInstance()
    const restore = () => connector.restoreFolderUserPermissionToWriter('conn', 'folder', 'Sam@Firm.test')
    const person = (role: string) => ({ id: 'p1', emailAddress: 'sam@firm.test', role })

    beforeEach(() => { vi.spyOn(connector, 'getAccessToken').mockResolvedValue('token') })

    it('raises a reader to writer', async () => {
        permissions = { permissions: [person('reader')] }
        expect(await restore()).toBe(true)
        expect(writes()).toHaveLength(1)
        expect(writes()[0].method).toBe('PATCH')
        expect(writes()[0].url).toContain('/files/folder/permissions/p1')
        expect(writes()[0].body).toEqual({ role: 'writer' })
    })

    it.each(['owner', 'organizer', 'writer'])('leaves a %s alone', async (role) => {
        permissions = { permissions: [person(role)] }
        expect(await restore()).toBe(true)
        expect(writes()).toEqual([])
    })

    it('grants write to someone with no access, without an email', async () => {
        permissions = { permissions: [] }
        expect(await restore()).toBe(true)
        expect(writes()[0].url).toContain('sendNotificationEmail=false')
        expect(writes()[0].body).toMatchObject({ role: 'writer', emailAddress: 'Sam@Firm.test' })
    })

    it('says so when Drive refuses', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })))
        expect(await restore()).toBe(false)
    })
})
