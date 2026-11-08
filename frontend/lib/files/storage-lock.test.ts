import { describe, it, expect, vi, beforeEach } from 'vitest'

// Locking a file in storage is all or nothing (AP-1), and unlocking says what it couldn't give back
// (AP-2), so nobody is told a file is locked while an editor can still edit it.

const { st, calls } = vi.hoisted(() => ({
    st: {
        type: 'GOOGLE_DRIVE' as string,
        perms: [] as { id: string; email: string | null; role: string }[],
        listFailure: null as Error | null,
        refuse: new Set<string>(),
        readOnly: true as boolean,
    },
    calls: { patched: [] as string[], readOnly: [] as boolean[] },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: { connector: { findUnique: async () => ({ type: st.type }) } } }))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async () => ({
        listFilePermissions: async () => {
            if (st.listFailure) throw st.listFailure
            return st.perms
        },
        patchFilePermissionRole: async (_c: string, _f: string, id: string, role: string) => {
            calls.patched.push(`${id}:${role}`)
            return !st.refuse.has(`${id}:${role}`)
        },
        setFileContentReadOnly: async (_c: string, _f: string, readOnly: boolean) => {
            calls.readOnly.push(readOnly)
            return st.type === 'ONEDRIVE' ? false : st.readOnly
        },
    }),
}))

import { lockFileInStorage, unlockFileInStorage } from './storage-lock'
import { StorageFailure, storageFailure } from '@/lib/connectors/storage-failure'

beforeEach(() => {
    st.type = 'GOOGLE_DRIVE'
    st.perms = [
        { id: 'owner', email: 'deepak@firm.com', role: 'owner' },
        { id: 'p-ana', email: 'ana@client.com', role: 'editor' },
        { id: 'p-ben', email: 'ben@client.com', role: 'commenter' },
        { id: 'p-cal', email: 'cal@client.com', role: 'viewer' },
    ]
    st.listFailure = null
    st.refuse = new Set()
    st.readOnly = true
    calls.patched = []
    calls.readOnly = []
})

describe('lockFileInStorage', () => {
    it('makes editors and commenters viewers and the content read-only, recording who', async () => {
        const downgraded = await lockFileInStorage('conn', 'file')
        expect(downgraded).toEqual([
            { permissionId: 'p-ana', previousRole: 'editor', email: 'ana@client.com' },
            { permissionId: 'p-ben', previousRole: 'commenter', email: 'ben@client.com' },
        ])
        expect(calls.readOnly).toEqual([true])
    })

    it('refuses when an editor can\'t be made a viewer, naming them, and puts back who was downgraded', async () => {
        st.refuse = new Set(['p-ben:viewer'])
        const failure = await lockFileInStorage('conn', 'file').catch((e) => e)
        expect(failure).toBeInstanceOf(StorageFailure)
        expect(failure.message).toBe("Couldn't lock this in Google Drive. ben@client.com can still edit it · Google Drive refused the change. Try again in a moment.")
        expect(calls.patched).toEqual(['p-ana:viewer', 'p-ben:viewer', 'p-ana:editor'])
        expect(calls.readOnly).toEqual([])
    })

    it("refuses when the permissions can't be read, with storage's reason", async () => {
        st.listFailure = storageFailure('reconnect', 'Google Drive')
        const failure = await lockFileInStorage('conn', 'file').catch((e) => e)
        expect(failure).toBeInstanceOf(StorageFailure)
        expect(failure.reason).toBe('reconnect')
        expect(failure.message).toBe("Couldn't lock this in Google Drive · its sharing couldn't be read. The connection to Google Drive needs renewing. Reconnect the storage, then try again.")
        expect(calls.patched).toEqual([])
    })

    it('refuses on Google when the content can\'t be made read-only, undoing the downgrades', async () => {
        st.readOnly = false
        const failure = await lockFileInStorage('conn', 'file').catch((e) => e)
        expect(failure.message).toBe("Couldn't lock this in Google Drive · it wouldn't make the file read-only. Google Drive refused the change. Try again in a moment.")
        expect(calls.patched).toEqual(['p-ana:viewer', 'p-ben:viewer', 'p-ana:editor', 'p-ben:commenter'])
    })

    it("doesn't ask OneDrive for read-only content, which it doesn't have", async () => {
        st.type = 'ONEDRIVE'
        const downgraded = await lockFileInStorage('conn', 'file')
        expect(downgraded).toHaveLength(2)
        expect(calls.readOnly).toEqual([])
    })
})

describe('unlockFileInStorage', () => {
    const recorded = [
        { permissionId: 'p-ana', previousRole: 'editor', email: 'ana@client.com' },
        { permissionId: 'p-ben', previousRole: 'writer', email: 'ben@client.com' },
    ]

    it('gives every role back and lifts read-only', async () => {
        const outcome = await unlockFileInStorage('conn', 'file', recorded)
        expect(outcome).toEqual({ notRestored: [], stillReadOnly: false, problem: null })
        expect(calls.patched).toEqual(['p-ana:editor', 'p-ben:editor'])
        expect(calls.readOnly).toEqual([false])
    })

    it("says who couldn't be given edit access back, and keeps them", async () => {
        st.refuse = new Set(['p-ben:editor'])
        const outcome = await unlockFileInStorage('conn', 'file', recorded)
        expect(outcome.notRestored).toEqual([recorded[1]])
        expect(outcome.problem).toBe("Couldn't restore edit access for ben@client.com in Google Drive · Google Drive refused the change. Try again in a moment.")
    })

    it('drops a permission removed in storage since, which has nothing to give back', async () => {
        st.refuse = new Set(['p-gone:editor'])
        const outcome = await unlockFileInStorage('conn', 'file', [{ permissionId: 'p-gone', previousRole: 'editor' }])
        expect(outcome).toEqual({ notRestored: [], stillReadOnly: false, problem: null })
    })

    it('says so when Google keeps it read-only', async () => {
        st.readOnly = false
        const outcome = await unlockFileInStorage('conn', 'file', recorded)
        expect(outcome.stillReadOnly).toBe(true)
        expect(outcome.problem).toBe('Google Drive kept this file read-only · Google Drive refused the change. Try again in a moment.')
    })

    it('counts people when an older lock record has no addresses', async () => {
        st.refuse = new Set(['p-ana:editor'])
        const outcome = await unlockFileInStorage('conn', 'file', [{ permissionId: 'p-ana', previousRole: 'editor' }])
        expect(outcome.problem).toBe("Couldn't restore edit access for 1 person in Google Drive · Google Drive refused the change. Try again in a moment.")
    })

    it('is fine on OneDrive, which has no read-only content to lift', async () => {
        st.type = 'ONEDRIVE'
        const outcome = await unlockFileInStorage('conn', 'file', recorded)
        expect(outcome.problem).toBeNull()
        expect(calls.readOnly).toEqual([])
    })
})
