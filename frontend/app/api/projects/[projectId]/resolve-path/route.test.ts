// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { ancestors, parentOf } = vi.hoisted(() => ({
    ancestors: { value: [] as { id: string; name: string }[] },
    parentOf: new Map<string, string | null>(),
}))

vi.mock('@/lib/api/engagement-auth', () => ({ requireProjectView: async () => ({ user: { id: 'u1' }, ctx: { orgId: 'firm-1' } }) }))
vi.mock('@/lib/engagement-access', () => ({ requireEngagementMember: async () => ({ id: 'm1' }) }))
vi.mock('@/lib/services/search-service', () => ({ SearchService: { resolvePathToProjectRoot: async () => ancestors.value } }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: {
            findUnique: async () => ({
                slug: 'eng',
                client: { connector: { settings: { projectFolderSettings: { eng: { generalFolderId: 'ROOT', confidentialFolderId: 'CONF' } } } } },
            }),
        },
        engagementDocument: {
            findFirst: async ({ where }: { where: { externalId: string } }) =>
                parentOf.has(where.externalId) ? { parentId: parentOf.get(where.externalId) } : null,
        },
    },
}))

import { GET } from './route'

const resolve = async (fileId: string) => {
    const res = await GET(new NextRequest(`http://localhost/api/projects/e1/resolve-path?fileId=${fileId}`), { params: Promise.resolve({ projectId: 'e1' }) })
    return res.json() as Promise<{ path: { id: string; name: string }[]; projectRootFolderId: string | null }>
}

beforeEach(() => {
    ancestors.value = []
    parentOf.clear()
})

describe('GET resolve-path', () => {
    it('an item right in the root folder resolves to the root, not to nothing', async () => {
        // The root folder isn't a row in engagement_documents, so the item has no stored ancestors.
        parentOf.set('DELIVERABLE', 'ROOT')
        expect(await resolve('DELIVERABLE')).toEqual({ path: [{ id: 'ROOT', name: 'General' }], projectRootFolderId: 'ROOT' })
    })

    it('a deeper item gets the root put in front of its ancestors', async () => {
        ancestors.value = [{ id: 'SUB', name: 'Sub' }]
        parentOf.set('SUB', 'CONF')
        expect(await resolve('FILE')).toEqual({ path: [{ id: 'CONF', name: 'Confidential' }, { id: 'SUB', name: 'Sub' }], projectRootFolderId: 'CONF' })
    })

    it('an item whose parent is no root folder stays unresolved', async () => {
        parentOf.set('STRAY', 'ELSEWHERE')
        expect(await resolve('STRAY')).toEqual({ path: [], projectRootFolderId: null })
    })
})
