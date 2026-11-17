// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db, connectorIdFor, adapterFor } = vi.hoisted(() => ({
    db: { engagement: null as null | Record<string, unknown> },
    connectorIdFor: vi.fn(async (): Promise<string | null> => 'conn-1'),
    adapterFor: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { engagement: { findUnique: async () => db.engagement } } }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: connectorIdFor }))
vi.mock('@/lib/connectors/registry', () => ({ getPermissionAdapter: adapterFor }))

import { engagementRootFolderIds, rootFolderName } from './engagement-root-folders'

const NONE = { generalFolderId: null, confidentialFolderId: null, stagingFolderId: null }

beforeEach(() => {
    db.engagement = { slug: 'firmabz-r11u', name: 'FirmaBz', connectorRootFolderId: 'ENG-ROOT', client: { slug: 'firmaone', name: 'FirmaOne' } }
    connectorIdFor.mockReset().mockResolvedValue('conn-1')
    adapterFor.mockReset()
})

describe('engagementRootFolderIds', () => {
    it("asks the connector's own adapter, as the Files page does: OneDrive's folders are found", async () => {
        // OneDrive keeps them under settings.organizations[firmId], where a direct read of
        // settings.projectFolderSettings never looked. The adapter knows its own layout.
        const getEngagementFolderIds = vi.fn(async () => ({ generalFolderId: 'OD-GENERAL', confidentialFolderId: 'OD-CONF', stagingFolderId: null }))
        adapterFor.mockResolvedValue({ getEngagementFolderIds })

        expect(await engagementRootFolderIds('e1')).toEqual({ generalFolderId: 'OD-GENERAL', confidentialFolderId: 'OD-CONF', stagingFolderId: null })
        expect(adapterFor).toHaveBeenCalledWith('conn-1')
        expect(getEngagementFolderIds).toHaveBeenCalledWith('conn-1', 'firmabz-r11u', {
            projectName: 'FirmaBz', clientSlug: 'firmaone', clientName: 'FirmaOne', projectFolderId: 'ENG-ROOT',
        })
    })

    it('no connector, no adapter or no engagement: no folders, without asking further', async () => {
        connectorIdFor.mockResolvedValueOnce(null)
        expect(await engagementRootFolderIds('e1')).toEqual(NONE)

        adapterFor.mockResolvedValueOnce(null)
        expect(await engagementRootFolderIds('e1')).toEqual(NONE)

        db.engagement = null
        expect(await engagementRootFolderIds('e1')).toEqual(NONE)
    })
})

describe('rootFolderName', () => {
    it('names each top folder for a breadcrumb', () => {
        const ids = { generalFolderId: 'G', confidentialFolderId: 'C', stagingFolderId: 'S' }
        expect([rootFolderName(ids, 'G'), rootFolderName(ids, 'C'), rootFolderName(ids, 'S')]).toEqual(['General', 'Confidential', 'Staging'])
    })
})
