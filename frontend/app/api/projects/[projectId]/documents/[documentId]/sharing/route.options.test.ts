import { describe, it, expect, vi, beforeEach } from 'vitest'

// The deliverable pane's Delivery settings toggles (AC-11): each sends only the options, never the
// `guest` or `externalCollaborator` keys. A missing key means "unchanged", and the options sent are
// merged over the stored ones, so one toggle changes only its own option.

const DOC = '00000000-0000-4000-8000-0000000000d1'

const { st, calls } = vi.hoisted(() => ({
    st: { stored: null as Record<string, unknown> | null },
    calls: { saved: [] as any[], sent: [] as { name: string; data: any }[], trashed: [] as string[], restricted: [] as string[] },
}))

vi.mock('@/lib/engagement-access', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/engagement-access')>()),
    blockIfEngagementCompleted: async () => null,
}))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/ai/agent-email', () => ({ withoutAgentIds: async (ids: string[]) => ids }))
vi.mock('@/lib/sync-document-sharing', () => ({ syncDocumentSharingUsers: vi.fn(async () => {}) }))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: async () => ({ id: DOC, organizationId: 'f', externalId: 'ext-D' }) }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn(async (name: string, data: unknown) => { calls.sent.push({ name, data }); return true }) }))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f', clientId: 'c', projectId: 'p', orgId: 'f' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canManageProject: async () => true, canViewProject: async () => true, getProjectPersona: async () => 'eng_admin' }))
vi.mock('@/lib/files/deliverable-of', () => ({ deliverableOf: async () => null }))
vi.mock('@/lib/files/native-description', () => ({ writeNativeDescription: async () => true }))
vi.mock('@/lib/services/search-service', () => ({ SearchService: { refreshEmbedding: async () => {} } }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({
    resolveEngagementConnector: async () => ({ id: 'conn', status: 'ACTIVE' }),
    resolveEngagementConnectorId: async () => 'conn',
}))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async () => ({ trashFile: async (_c: string, id: string) => { calls.trashed.push(id) } }),
    getContentAdapter: async () => ({ setCopyRestricted: async (_c: string, id: string) => { calls.restricted.push(id) } }),
}))
vi.mock('@/lib/audit', () => {
    const chain: any = new Proxy({}, { get: (_t, k) => (k === 'fireAndForget' ? () => {} : () => chain) })
    return { audit: () => chain, AUDIT_EVENT: {}, AUDIT_SCOPE: {} }
})
vi.mock('@/lib/billing/subscription-gate', () => ({ assertFirmSubscriptionAccess: async () => {} }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ assertWithinDeliverableCap: async () => {}, assertWithinDocumentCap: async () => {} }))
vi.mock('@/lib/doc-id', () => ({ assignDocId: vi.fn() }))
vi.mock('@/lib/navigation/firm-paths', () => ({ engagementPath: () => '/' }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findUnique: async () => (st.stored ? { id: DOC, externalId: 'ext-D', fileName: 'Market report', connectorId: null, createdBy: 'me', mimeType: null, settings: st.stored } : null),
            update: async ({ data }: any) => {
                calls.saved.push(data.settings)
                st.stored = data.settings
                return { id: DOC, settings: data.settings }
            },
        },
        engagement: { findUnique: async () => ({ name: 'E', firmId: 'f', clientId: 'c' }) },
        engagementMember: { findMany: async () => [] },
        connector: { findUnique: async () => ({ id: 'conn', status: 'ACTIVE' }) },
    },
}))

import { PUT } from './route'

const put = (body: object) => PUT({ json: async () => body } as any, { params: Promise.resolve({ projectId: 'p', documentId: DOC }) })

/** A deliverable as promoted, with a PDF copy made by an earlier open. */
const deliverable = () => ({
    share: {
        createdAt: '2026-11-01T00:00:00Z',
        externalCollaborator: { enabled: true, options: { allowDownload: false } },
        guest: { enabled: true, options: { sharePdfOnly: true, allowDownload: false, addWatermark: false, publish: true, sharedPdfDriveId: 'pdf-1' } },
    },
    activity: { status: 'in_progress', updatedAt: 'x' },
    description: 'kept',
})

beforeEach(() => {
    st.stored = deliverable()
    calls.saved = []
    calls.sent = []
    calls.trashed = []
    calls.restricted = []
})

describe('a Delivery settings toggle', () => {
    it('changes only its own option, leaving both roles on', async () => {
        const res = await put({ ecOptions: { allowDownload: true }, guestOptions: { allowDownload: false, sharePdfOnly: true, addWatermark: false } })
        expect(res.status).toBe(200)
        const share = calls.saved.at(-1).share
        expect(share.externalCollaborator).toMatchObject({ enabled: true, options: { allowDownload: true } })
        expect(share.guest.enabled).toBe(true)
        expect(share.guest.options).toMatchObject({ sharePdfOnly: true, allowDownload: false, addWatermark: false, publish: true, sharedPdfDriveId: 'pdf-1' })
    })

    it("takes no one's access away, and keeps the PDF copy", async () => {
        await put({ guestOptions: { addWatermark: true } })
        expect(calls.sent.filter((s) => s.name === 'sharing.settings.updated')).toEqual([])
        expect(calls.trashed).toEqual([])
    })

    it('merges the options sent over the stored ones', async () => {
        await put({ guestOptions: { addWatermark: true } })
        expect(calls.saved.at(-1).share.guest.options).toMatchObject({ sharePdfOnly: true, allowDownload: false, addWatermark: true, publish: true, sharedPdfDriveId: 'pdf-1' })
    })

    it("doesn't switch on a role that was off", async () => {
        st.stored = { share: { createdAt: 'x', externalCollaborator: { enabled: false }, guest: { enabled: true, options: { sharePdfOnly: true } } } }
        await put({ ecOptions: { allowDownload: true } })
        const share = calls.saved.at(-1).share
        expect(share.externalCollaborator.enabled).toBe(false)
        expect(share.guest.enabled).toBe(true)
    })

    it('never takes a PDF copy id from the browser', async () => {
        await put({ guestOptions: { sharedPdfDriveId: 'someone-elses-file' } })
        expect(calls.saved.at(-1).share.guest.options.sharedPdfDriveId).toBe('pdf-1')
    })
})

describe('the share settings, sent in full', () => {
    it('still turns a role off when asked, and takes its access back', async () => {
        await put({ externalCollaborator: true, guest: false })
        const share = calls.saved.at(-1).share
        expect(share.guest.enabled).toBe(false)
        expect(share.externalCollaborator.enabled).toBe(true)
        expect(calls.sent).toEqual([expect.objectContaining({ name: 'sharing.settings.updated', data: expect.objectContaining({ disabledPersonas: ['guest'] }) })])
        // The PDF copy has no use once Reviewers are off.
        expect(calls.trashed).toEqual(['pdf-1'])
    })
})
