import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OneDrive reads that answered [] when Graph refused them: a folder listing the search index scan walks
 * (P2-38), and the dashboard's duplicate and stale searches (P2-37). A refusal now says why; a folder
 * that's gone still lists as empty, as Google Drive's does.
 */

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/connectors/onedrive-connector', () => ({ OneDriveConnector: { getInstance: () => ({ getAccessToken: async () => 'token' }) } }))
vi.mock('./onedrive-adapter', () => ({ resolveOneDriveDriveBase: async () => 'https://graph/me/drive' }))

import { createOneDrivePermissionAdapter } from './onedrive-permission-adapter'
import { StorageFailure } from '@/lib/connectors/storage-failure'

let answer: { status: number; body: unknown } = { status: 200, body: {} }
beforeEach(() => {
    answer = { status: 200, body: {} }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(answer.body), { status: answer.status })))
})
afterEach(() => vi.unstubAllGlobals())

const adapter = createOneDrivePermissionAdapter()
const refused = { status: 503, body: { error: { code: 'serviceNotAvailable', message: 'Service unavailable' } } }

describe('listFiles', () => {
    it('lists a folder', async () => {
        answer = { status: 200, body: { value: [{ id: 'a', name: 'Plan.docx', file: { mimeType: 'x' } }, { id: 'b', name: 'Drafts', folder: {} }] } }
        const files = await adapter.listFiles('conn', 'folder')
        expect(files.map((f) => f.id)).toEqual(['a', 'b'])
    })

    it('lists a folder that is gone as empty', async () => {
        answer = { status: 404, body: { error: { code: 'itemNotFound', message: 'Item not found' } } }
        await expect(adapter.listFiles('conn', 'folder')).resolves.toEqual([])
    })

    it('throws the reason when Graph refuses the listing', async () => {
        answer = refused
        const err = await adapter.listFiles('conn', 'folder').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('busy')
    })
})

describe('duplicate and stale searches', () => {
    it('getDuplicateFiles throws the reason instead of answering "no duplicates"', async () => {
        answer = refused
        await expect(adapter.getDuplicateFiles('conn')).rejects.toBeInstanceOf(StorageFailure)
    })

    it('getStaleFiles throws the reason instead of answering "nothing stale"', async () => {
        answer = { status: 401, body: { error: { code: 'InvalidAuthenticationToken', message: 'expired' } } }
        const err = await adapter.getStaleFiles('conn').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('reconnect')
    })

    it('getDuplicateFiles still answers [] when nothing is duplicated', async () => {
        answer = { status: 200, body: { value: [{ id: 'a', name: 'A.pdf', size: 1, file: { hashes: { quickXorHash: 'h1' } } }] } }
        await expect(adapter.getDuplicateFiles('conn')).resolves.toEqual([])
    })
})

describe('searchFiles', () => {
    it('throws the reason when Graph refuses the search, as Google Drive does, instead of answering "no results"', async () => {
        answer = refused
        const err = await adapter.searchFiles('conn', 'budget').catch((e) => e)
        expect(err).toBeInstanceOf(StorageFailure)
        expect(err.reason).toBe('busy')
    })

    it('answers what Graph found', async () => {
        answer = { status: 200, body: { value: [{ id: 'a', name: 'Budget.xlsx', file: { mimeType: 'x' } }] } }
        const files = await adapter.searchFiles('conn', 'budget')
        expect(files.map((f: { id: string }) => f.id)).toEqual(['a'])
    })
})
