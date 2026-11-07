import { describe, it, expect, vi } from 'vitest'

// A client's shared subtree holds nothing private, which is what every "may they reach this document"
// check goes by; and a document opened directly by its ID is refused them too.

const { rows } = vi.hoisted(() => ({
    rows: [
        { externalId: 'D', parentId: null, isFolder: true, settings: { share: { externalCollaborator: { enabled: true }, guest: { enabled: true } } } },
        { externalId: 'open', parentId: 'D', isFolder: false, settings: {} },
        { externalId: 'secret', parentId: 'D', isFolder: false, settings: { lock: { type: 'private' } } },
        // Shared and private at once (from before the rule): private wins.
        { externalId: 'both', parentId: 'D', isFolder: false, settings: { lock: { type: 'private' }, share: { guest: { enabled: true }, externalCollaborator: { enabled: true } } } },
        { externalId: 'locked-folder', parentId: 'D', isFolder: true, settings: { lock: { type: 'private' } } },
        { externalId: 'inside', parentId: 'locked-folder', isFolder: false, settings: {} },
    ],
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: { findMany: async () => rows },
        engagement: { findFirst: async () => ({ client: { firm: { connector: { id: 'conn' } } } }) },
    },
}))
vi.mock('@/lib/google-drive-connector', () => ({
    // Drive lists every descendant of the shared folder, private ones included.
    googleDriveConnector: { getFileMetadata: vi.fn(async () => null), listFiles: vi.fn(async () => []), listDescendantIds: vi.fn(async () => []) },
}))

import { isHiddenFromMember, visibleDocumentIdsFor } from './engagement-access'
import { getAccessibleFileCountForPersona, getSharedAndAncestorIdsForPersona } from './engagement-sharing-ids'

describe('a client\'s shared subtree', () => {
    it.each(['eng_ext_collaborator', 'eng_viewer'] as const)('leaves private documents out for %s, even one shared before the rule', async (persona) => {
        const { sharedIds, privateIds } = await getSharedAndAncestorIdsForPersona('p', persona, { skipDescendants: true })
        expect(sharedIds).toEqual(['D'])
        expect(Array.from(privateIds).sort()).toEqual(['both', 'inside', 'locked-folder', 'secret'])
    })

    it('counts only what they can reach', async () => {
        expect(await getAccessibleFileCountForPersona('p', 'eng_viewer')).toBe(1)
    })

    it("keeps the firm's view whole", async () => {
        const { sharedIds, privateIds } = await getSharedAndAncestorIdsForPersona('p', null, { skipDescendants: true })
        expect(sharedIds).toContain('both')
        expect(privateIds.size).toBe(0)
    })

    it('leaves no one out for an internal role', async () => {
        expect(await visibleDocumentIdsFor('p', 'eng_admin')).toBeNull()
    })
})

describe('isHiddenFromMember', () => {
    it.each(['eng_ext_collaborator', 'eng_viewer'] as const)('hides a private document, and what a private folder holds, from %s', async (role) => {
        expect(await isHiddenFromMember('p', role, 'secret')).toBe(true)
        expect(await isHiddenFromMember('p', role, 'inside')).toBe(true)
        expect(await isHiddenFromMember('p', role, 'open')).toBe(false)
    })

    it.each(['eng_admin', 'eng_member'] as const)('hides nothing from %s', async (role) => {
        expect(await isHiddenFromMember('p', role, 'secret')).toBe(false)
    })
})
