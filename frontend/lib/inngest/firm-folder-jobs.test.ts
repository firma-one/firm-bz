import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// The jobs behind an engagement's status change. A job Inngest isn't told about never runs, and nothing
// fails: the event simply goes nowhere, so the registration is checked too.

const { setFirmFolderAccess, setMemberFileAccess } = vi.hoisted(() => ({
    setFirmFolderAccess: vi.fn(async () => ({ changed: 1, failed: 0 })),
    setMemberFileAccess: vi.fn(async () => ({ changed: 1, failed: 0 })),
}))

vi.mock('./client', () => ({
    inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }) },
    safeInngestSend: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/connectors/firm-folder-access', () => ({ setFirmFolderAccess }))
vi.mock('@/lib/connectors/member-file-access', () => ({ setMemberFileAccess }))
vi.mock('@/lib/connectors/registry', () => ({ getPermissionAdapter: vi.fn(), getMigrationAdapter: vi.fn(), getConnectorInstance: vi.fn() }))
vi.mock('@/lib/connectors/trash-undo', () => ({ TRASH_UNDO_WINDOW_SECONDS: 60, wasRestoredFromBin: vi.fn() }))
vi.mock('@/lib/services/search-service', () => ({ SearchService: {} }))

import { restoreFirmFoldersOnReopen, restoreMemberFilesOnReopen, restrictFirmFoldersOnCompletion, restrictMemberFilesOnCompletion } from './functions'

const step = { run: async (_id: string, fn: () => unknown) => fn() }
const job = (fn: unknown) => fn as { config: { triggers: { event: string }[] }; handler: (ctx: unknown) => Promise<unknown> }

describe('the jobs behind Completed and reopen', () => {
    it.each([
        ['restrictFirmFoldersOnCompletion', restrictFirmFoldersOnCompletion, 'engagement.completed', 'read_only', setFirmFolderAccess],
        ['restoreFirmFoldersOnReopen', restoreFirmFoldersOnReopen, 'engagement.reopened', 'restore', setFirmFolderAccess],
        ['restrictMemberFilesOnCompletion', restrictMemberFilesOnCompletion, 'engagement.completed', 'read_only', setMemberFileAccess],
        ['restoreMemberFilesOnReopen', restoreMemberFilesOnReopen, 'engagement.reopened', 'restore', setMemberFileAccess],
    ])('%s runs on %s', async (name, fn, event, change, access) => {
        expect(job(fn).config.triggers[0].event).toBe(event)
        await job(fn).handler({ event: { data: { projectId: 'p' } }, step })
        expect(access).toHaveBeenCalledWith('p', change)

        const served = readFileSync(resolve(__dirname, '../../app/api/inngest/route.ts'), 'utf8')
        expect(served.split(name).length - 1, `${name} isn't served to Inngest`).toBe(2)
    })
})
