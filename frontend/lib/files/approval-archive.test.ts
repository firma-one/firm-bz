import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Approving in storage (.claude/plans/document-approval-record.md): lock, read the version, copy it
// into Archive, or refuse with the lock undone.

const { st, calls } = vi.hoisted(() => ({
    st: {
        type: 'GOOGLE_DRIVE' as string,
        settings: {} as Record<string, any>,
        copyId: 'copy-1',
        copyFailure: null as Error | null,
        versions: [] as any[],
        lockFailure: null as Error | null,
        readOnlyAnswer: true as boolean,
        restrictFailure: null as Error | null,
        undoProblem: null as string | null,
    },
    calls: {
        locked: [] as string[],
        unlocked: [] as string[],
        folders: [] as string[],
        copies: [] as any[],
        readOnly: [] as string[],
        settingsWritten: [] as any[],
        trashed: [] as string[],
    },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        connector: {
            findUnique: async () => ({ type: st.type, settings: st.settings }),
            update: async ({ data }: any) => { calls.settingsWritten.push(data.settings); st.settings = data.settings },
        },
    },
}))
vi.mock('./storage-lock', () => ({
    StorageNotSupportedError: class extends Error {},
    lockFileInStorage: async (_c: string, id: string) => {
        calls.locked.push(id)
        if (st.lockFailure) throw st.lockFailure
        return [{ permissionId: 'p1', previousRole: 'editor' }]
    },
    unlockFileInStorage: async (_c: string, id: string) => {
        calls.unlocked.push(id)
        return { notRestored: [], stillReadOnly: false, problem: st.undoProblem }
    },
}))
vi.mock('@/lib/connectors/registry', () => ({
    getStorageAdapter: async () => ({
        fileExists: async (_c: string, id: string) => id === 'archive-existing',
        getFileParent: async () => 'engagement-folder',
        findOrCreateFolder: async (_c: string, parent: string, name: string) => { calls.folders.push(`${parent}/${name}`); return `${name}-id` },
        restrictFolderToOwnerOnly: async () => { if (st.restrictFailure) throw st.restrictFailure },
    }),
    getPermissionAdapter: async () => ({
        setFileContentReadOnly: async (_c: string, id: string) => { calls.readOnly.push(id); return st.readOnlyAnswer },
        trashFile: async (_c: string, id: string) => { calls.trashed.push(id) },
    }),
    getContentAdapter: async () => ({ listVersions: async () => st.versions }),
}))
vi.mock('@/lib/connectors/adapters/onedrive-file-ops', () => ({
    copyOneDriveFile: async (_c: string, id: string, parent: string, name: string) => { calls.copies.push({ id, parent, name }); if (st.copyFailure) throw st.copyFailure; return { id: st.copyId } },
}))
vi.mock('@/lib/google-drive-connector', () => ({
    googleDriveConnector: {
        getAccessToken: async () => 'token',
        copyFile: async (_c: string, id: string, parent: string, name: string) => { calls.copies.push({ id, parent, name }); if (st.copyFailure) throw st.copyFailure; return { id: st.copyId } },
    },
}))

import { ApprovalStorageError, archiveApprovedVersion, undoApprovalInStorage } from './approval-archive'
import { StorageFailure, storageFailure } from '@/lib/connectors/storage-failure'

const input = (settings: unknown = {}) => ({
    connectorId: 'conn',
    engagement: { firmId: 'firm', slug: 'eq-seer' },
    document: { externalId: 'file-1', fileName: 'Plan.xlsx', settings },
    deliverableName: '01 Market Report',
    actorUserId: 'u-ana',
})

beforeEach(() => {
    st.type = 'GOOGLE_DRIVE'
    st.settings = { organizations: { firm: { projectFolderIds: { 'eq-seer': 'engagement-folder' }, projectFolderSettings: { 'eq-seer': { generalFolderId: 'general' } } } } }
    st.copyId = 'copy-1'
    st.copyFailure = null
    st.versions = []
    st.lockFailure = null
    st.readOnlyAnswer = true
    st.restrictFailure = null
    st.undoProblem = null
    for (const k of Object.keys(calls) as (keyof typeof calls)[]) calls[k].length = 0
    vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        json: async () => ({ headRevisionId: 'rev-9', modifiedTime: '2026-10-28T15:30:00Z', size: '204206', lastModifyingUser: { displayName: 'Ana Lead' } }),
    })))
})
afterEach(() => vi.unstubAllGlobals())

describe('archiveApprovedVersion', () => {
    it('locks the file, copies its current version into Archive, and makes the copy read-only', async () => {
        const { record, lock } = await archiveApprovedVersion(input())
        expect(calls.locked).toEqual(['file-1'])
        expect(calls.folders).toEqual(['engagement-folder/Archive', 'Archive-id/01 Market Report'])
        expect(calls.copies).toEqual([{ id: 'file-1', parent: '01 Market Report-id', name: 'Plan · approved 2026-10-28 15.30.xlsx' }])
        expect(calls.readOnly).toEqual(['copy-1'])
        expect(record).toMatchObject({
            version: { id: 'rev-9', savedAt: '2026-10-28T15:30:00Z', size: '204206', savedBy: 'Ana Lead' },
            archived: { fileId: 'copy-1', name: 'Plan · approved 2026-10-28 15.30.xlsx' },
            approvedBy: 'u-ana',
        })
        expect(lock).toMatchObject({ type: 'finalize', finalizedBy: 'u-ana', downgraded: [{ permissionId: 'p1', previousRole: 'editor' }] })
    })

    it("keeps the Archive folder in the engagement's folder settings, and reuses it next time", async () => {
        await archiveApprovedVersion(input())
        expect(st.settings.organizations.firm.projectFolderSettings['eq-seer']).toEqual({ generalFolderId: 'general', archiveFolderId: 'Archive-id' })
        expect(st.settings.organizations.firm.projectFolderIds).toEqual({ 'eq-seer': 'engagement-folder' })

        st.settings.organizations.firm.projectFolderSettings['eq-seer'].archiveFolderId = 'archive-existing'
        calls.folders.length = 0
        await archiveApprovedVersion(input())
        expect(calls.folders).toEqual(['archive-existing/01 Market Report'])
    })

    it("names a OneDrive copy with OneDrive's own version label", async () => {
        st.type = 'ONEDRIVE'
        st.versions = [
            { id: '1.0', label: '1.0', modifiedTime: '2026-10-01T10:00:00Z' },
            { id: '3.0', label: '3.0', modifiedTime: '2026-10-28T15:30:00Z', size: '300' },
        ]
        const { record } = await archiveApprovedVersion(input())
        expect(record.version).toMatchObject({ id: '3.0', label: '3.0' })
        expect(record.archived.name).toBe('Plan · approved Version 3.0.xlsx')
    })

    it('refuses with what to do, and undoes the lock, when the copy fails', async () => {
        st.copyFailure = new Error('socket hang up')
        const err = await archiveApprovedVersion(input()).catch((e) => e)
        expect(err).toBeInstanceOf(ApprovalStorageError)
        expect(err.message).toBe("Couldn't reach Google Drive to archive the approved version. Try again, or reconnect the storage.")
        expect(calls.unlocked).toEqual(['file-1'])
    })

    it('says what the storage said, where it said something, and still undoes the lock', async () => {
        st.copyFailure = storageFailure('storage_full', 'Google Drive')
        const err = await archiveApprovedVersion(input()).catch((e) => e)
        expect(err).toBeInstanceOf(ApprovalStorageError)
        expect(err.message).toBe("Couldn't archive the approved version. The Google Drive account connected to this client is out of storage space. Free some up, then try again.")
        expect(calls.unlocked).toEqual(['file-1'])
    })

    it('refuses when storage can\'t say which version is current', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })))
        await expect(archiveApprovedVersion(input())).rejects.toBeInstanceOf(ApprovalStorageError)
        expect(calls.copies).toEqual([])
        expect(calls.unlocked).toEqual(['file-1'])
    })

    it('leaves a document locked already as it is: no new lock, none undone', async () => {
        st.copyFailure = new Error('socket hang up')
        await archiveApprovedVersion(input({ lock: { type: 'finalize' } })).catch(() => {})
        expect(calls.locked).toEqual([])
        expect(calls.unlocked).toEqual([])
    })

    // AP-1: a lock storage refuses refuses the approval, with who can still edit.
    it('refuses with the lock refusal, making no copy', async () => {
        st.lockFailure = new StorageFailure('other', "Couldn't lock this in Google Drive. ana@client.com can still edit it · Google Drive refused the change. Try again in a moment.")
        const err = await archiveApprovedVersion(input()).catch((e) => e)
        expect(err).toBeInstanceOf(ApprovalStorageError)
        expect(err.message).toBe("Couldn't lock this in Google Drive. ana@client.com can still edit it · Google Drive refused the change. Try again in a moment. It wasn't approved.")
        expect(calls.copies).toEqual([])
    })

    it("says who couldn't be given edit access back when undoing the lock", async () => {
        st.copyFailure = new Error('socket hang up')
        st.undoProblem = "Couldn't restore edit access for ana@client.com in Google Drive · Google Drive refused the change. Try again in a moment."
        const err = await archiveApprovedVersion(input()).catch((e) => e)
        expect(err.message).toBe("Couldn't reach Google Drive to archive the approved version. Try again, or reconnect the storage. Couldn't restore edit access for ana@client.com in Google Drive · Google Drive refused the change. Try again in a moment.")
    })

    // P1-54: what keeps the copy from drifting is reported when storage refuses it.
    it('approves with a warning when Google won\'t make the archive copy read-only', async () => {
        st.readOnlyAnswer = false
        const { warnings } = await archiveApprovedVersion(input())
        expect(warnings).toEqual(["Approved, but the archive copy couldn't be made read-only in Google Drive. Anyone who can edit the Archive folder can change it."])
    })

    it("doesn't ask OneDrive for read-only content, which it doesn't have", async () => {
        st.type = 'ONEDRIVE'
        st.readOnlyAnswer = false
        const { warnings } = await archiveApprovedVersion(input())
        expect(calls.readOnly).toEqual([])
        expect(warnings).toEqual([])
    })

    it("warns when the Archive folder can't be made owner-only", async () => {
        st.restrictFailure = new Error('403')
        const { warnings } = await archiveApprovedVersion(input())
        expect(warnings).toEqual(["The Archive folder couldn't be made owner-only in Google Drive, so people with access to the engagement's folder can open the archive copy."])
    })
})

describe('undoApprovalInStorage', () => {
    const approval = {
        record: { id: 'ap', version: { id: 'v', savedAt: 'x' }, archived: { fileId: 'copy-1', name: 'n' }, approvedAt: 'x', approvedBy: 'u' },
        lock: { type: 'finalize' as const, downgraded: [{ permissionId: 'p1', previousRole: 'editor' }] },
        warnings: [],
    }

    it('lifts the lock and trashes the archive copy', async () => {
        expect(await undoApprovalInStorage('conn', 'file-1', approval)).toBe(true)
        expect(calls.unlocked).toEqual(['file-1'])
        expect(calls.trashed).toEqual(['copy-1'])
    })

    it('says when it could not all be undone', async () => {
        st.undoProblem = 'still a viewer'
        expect(await undoApprovalInStorage('conn', 'file-1', approval)).toBe(false)
    })
})
