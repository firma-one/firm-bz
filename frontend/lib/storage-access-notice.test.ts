import { describe, it, expect, vi, beforeEach } from 'vitest'

// When a background job can't do its part with storage, the engagement's Leads get an Inbox notice: what,
// who and why, once per Lead, and not again for the same fact the same day.

const { st, created } = vi.hoisted(() => ({
    st: {
        leads: ['lead-1', 'brio'] as string[],
        admins: ['admin-1'] as string[],
        agents: new Set(['brio']),
        connectorType: 'GOOGLE_DRIVE',
        docs: [] as any[],
    },
    created: vi.fn(async (_rows: any[]) => {}),
}))

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/notify-event', () => ({ createEventNotifications: created }))
vi.mock('@/lib/ai/agent-email', () => ({ withoutAgentIds: async (ids: string[]) => ids.filter((id) => !st.agents.has(id)) }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => 'conn' }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: {
            findUnique: async () => ({
                firmId: 'f1', clientId: 'c1', slug: 'audit',
                client: { slug: 'acme', firm: { slug: 'firm', group: { slug: 'grp' } } },
            }),
        },
        engagementMember: { findMany: async () => st.leads.map((userId) => ({ userId })) },
        firmMember: { findMany: async () => st.admins.map((userId) => ({ userId })) },
        connector: { findUnique: async () => ({ type: st.connectorType }) },
        engagementDocument: { findMany: async () => st.docs },
        $queryRaw: async () => [{ id: 'ana', email: 'ana@client.test' }],
    },
}))

import { accessLeftAfterDelete, accessStillStanding, notifyLeadsOfStorageAccess, STORAGE_ACCESS_NOTICE_TYPE, type StorageAccessProblem } from './storage-access-notice'

const problem = (over: Partial<StorageAccessProblem> = {}): StorageAccessProblem => ({
    kind: 'revoke', userId: 'ana', itemName: 'Budget.xlsx', itemType: 'file', documentId: 'doc-1',
    reason: 'The connection to Google Drive needs renewing. Reconnect the storage, then try again.', key: 'perm-1', ...over,
})

beforeEach(() => {
    created.mockClear()
    st.leads = ['lead-1', 'brio']
    st.admins = ['admin-1']
    st.connectorType = 'GOOGLE_DRIVE'
    st.docs = [{ id: 'doc-1', isFolder: false, settings: {} }]
})

describe('the notice to the Leads', () => {
    it('tells each Lead, people only, what still stands, for whom and why', async () => {
        expect(await notifyLeadsOfStorageAccess('e1', [problem()])).toBe(1)
        const [rows] = created.mock.calls[0]
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            firmId: 'f1',
            clientId: 'c1',
            engagementId: 'e1',
            documentId: 'doc-1',
            userId: 'lead-1',
            type: STORAGE_ACCESS_NOTICE_TYPE,
            title: 'Google Drive still lets ana@client.test open Budget.xlsx',
            body: "Couldn't take back their access · The connection to Google Drive needs renewing. Reconnect the storage, then try again.",
            // The file itself, in Files.
            ctaUrl: expect.stringMatching(/\/c\/acme\/e\/audit\/.*doc-1/),
        })
    })

    it('is created once: the same fact gives the same key, which the database keeps unique', async () => {
        await notifyLeadsOfStorageAccess('e1', [problem()])
        await notifyLeadsOfStorageAccess('e1', [problem()])
        const first = created.mock.calls[0][0][0].dedupeKey
        const second = created.mock.calls[1][0][0].dedupeKey
        expect(first).toBeTruthy()
        expect(second).toBe(first)
        await notifyLeadsOfStorageAccess('e1', [problem({ key: 'perm-2' })])
        expect(created.mock.calls[2][0][0].dedupeKey).not.toBe(first)
    })

    it("groups one person's files into one notice, naming them", async () => {
        await notifyLeadsOfStorageAccess('e1', [problem(), problem({ itemName: 'Q3.pdf', key: 'perm-2', documentId: 'doc-2' })])
        const [rows] = created.mock.calls[0]
        expect(rows).toHaveLength(1)
        expect(rows[0].title).toBe('Google Drive still lets ana@client.test open 2 files')
        expect(rows[0].body).toContain('Budget.xlsx, Q3.pdf')
        expect(rows[0].documentId).toBeNull()
    })

    it.each([
        ['grant', 'General', 'folder', "Google Drive didn't share General with ana@client.test"],
        ['folder_revoke', 'Confidential', 'folder', 'Google Drive still gives ana@client.test access to Confidential'],
        ['read_only', 'General', 'folder', 'Google Drive still lets ana@client.test edit General'],
        ['restore', 'General', 'folder', "Google Drive didn't give ana@client.test edit access back to General"],
    ] as const)('words a %s problem for what it is', async (kind, itemName, itemType, title) => {
        await notifyLeadsOfStorageAccess('e1', [problem({ kind, itemName, itemType, documentId: null })])
        expect(created.mock.calls[0][0][0].title).toBe(title)
    })

    it('says OneDrive on OneDrive', async () => {
        st.connectorType = 'ONEDRIVE'
        await notifyLeadsOfStorageAccess('e1', [problem()])
        expect(created.mock.calls[0][0][0].title).toMatch(/^OneDrive still lets/)
    })

    it("tells the firm's admins when the engagement has no Lead", async () => {
        st.leads = ['brio']
        await notifyLeadsOfStorageAccess('e1', [problem()])
        expect(created.mock.calls[0][0].map((r: any) => r.userId)).toEqual(['admin-1'])
    })

    it('writes nothing for nothing', async () => {
        expect(await notifyLeadsOfStorageAccess('e1', [])).toBe(0)
        expect(created).not.toHaveBeenCalled()
    })

    it('never throws', async () => {
        created.mockRejectedValueOnce(new Error('db down'))
        await expect(notifyLeadsOfStorageAccess('e1', [problem()])).resolves.toBe(0)
    })
})

describe("the words for what a server action couldn't take back", () => {
    it('names the folders and files still shared, and why', () => {
        expect(accessStillStanding({
            done: 'Removed in firma', provider: 'Google Drive', folders: ['General', 'Confidential'], files: ['Budget.xlsx'], reason: 'Google Drive is busy right now. Try again in a minute.',
        })).toBe('Removed in firma, but Google Drive still gives them access to General and Confidential and Budget.xlsx · Google Drive is busy right now. Try again in a minute.')
    })

    it('is nothing when nothing still stands', () => {
        expect(accessStillStanding({ done: 'Removed', provider: 'OneDrive' })).toBeNull()
    })

    it('says who still has access after a delete', () => {
        expect(accessLeftAfterDelete({
            done: 'Engagement deleted',
            provider: 'Google Drive',
            left: { files: ['Budget.xlsx', 'Q3.pdf'], folderAccess: ['ana@client.test'], foldersUnchecked: false, reason: 'Google Drive refused the change: No' },
        })).toBe('Engagement deleted. Google Drive still gives ana@client.test access to its folders and shares 2 of its files · Google Drive refused the change: No. Open Google Drive to remove that access.')
        expect(accessLeftAfterDelete({ done: 'Engagement deleted', provider: 'Google Drive', left: { files: [], folderAccess: [], foldersUnchecked: false } })).toBeNull()
    })
})
