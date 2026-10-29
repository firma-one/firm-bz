import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/components/files/document-discussion-tab', () => ({ DocumentDiscussionTab: () => <div>discussion thread</div> }))
vi.mock('@/components/files/document-versions-timeline', () => ({ DocumentVersionsTimeline: () => <div>versions</div> }))
vi.mock('@/components/files/document-activity-feed', () => ({ DocumentActivityFeed: () => <div>activity</div> }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ getSession: async () => ({ access_token: 't' }) }))

import { AssetDetailsPane, assetDetailsTabs, isAssetDetailsPaneContent, openAssetDetailsPane, type AssetDetailsEditing } from './asset-details-pane'

const RECORD = '7b2b0f3e-1111-4222-8333-944455556666'
const FILE = {
    id: 'ext1', projectDocumentId: RECORD, name: 'Plan.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', documentType: 'FILE',
    activityStatus: 'in_review', createdTime: '2026-09-20T10:00:00Z', modifiedTime: '2026-09-24T10:00:00Z',
    creator: { displayName: 'Deepak Firmaone' }, lastModifyingUser: { displayName: 'Sam Rivera' },
}

const MEMBERS = [
    { userId: 'u-ana', name: 'Ana Lead', email: 'ana@firm.com', avatarUrl: null, role: 'eng_admin' },
    { userId: 'u-cli', name: 'Client Carl', email: 'carl@client.com', avatarUrl: null, role: 'eng_viewer' },
]

const fetchMock = vi.fn()
beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
        if (url.endsWith('/sharing')) return new Response(JSON.stringify({ sharing: { settings: { assigneeUserId: 'u-ana', description: 'Sizing model for the Q2 plan' } } }))
        if (url.endsWith('/members')) return new Response(JSON.stringify({ members: MEMBERS }))
        return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
})

const LEAD: AssetDetailsEditing = { statusRole: 'eng_admin', tracked: true, canEditDue: true, canManage: true }

describe('assetDetailsTabs', () => {
    it('gives the firm all four tabs on a file', () => {
        expect(assetDetailsTabs({ isExternalUser: false, isLink: false, hasProject: true })).toEqual(['details', 'versions', 'activity', 'discussions'])
    })

    it('gives an external user Details and Discussions only', () => {
        expect(assetDetailsTabs({ isExternalUser: true, isLink: false, hasProject: true })).toEqual(['details', 'discussions'])
    })

    it('leaves Versions out for a link', () => {
        expect(assetDetailsTabs({ isExternalUser: false, isLink: true, hasProject: true })).toEqual(['details', 'activity', 'discussions'])
    })

    it('has only Details without the engagement', () => {
        expect(assetDetailsTabs({ isExternalUser: false, isLink: false, hasProject: false })).toEqual(['details'])
    })
})

describe('AssetDetailsPane — fields first, then the tabs', () => {
    it('lists the decision record, newest first, reopened ones too', async () => {
        fetchMock.mockImplementation(async (url: string) => {
            if (url.endsWith('/sharing')) return new Response(JSON.stringify({ sharing: { settings: { approvals: [
                { id: 'a1', version: { id: '1.0', label: '1.0', savedAt: 'x' }, archived: { fileId: 'c1', name: 'n' }, approvedAt: '2026-09-28T10:00:00Z', approvedBy: 'u-ana', unlockedAt: '2026-10-02T10:00:00Z', unlockedBy: 'u-ana' },
                { id: 'a2', version: { id: '3.0', label: '3.0', savedAt: 'x' }, archived: { fileId: 'c2', name: 'n' }, approvedAt: '2026-10-28T10:00:00Z', approvedBy: 'u-ana' },
            ] } } }))
            if (url.endsWith('/members')) return new Response(JSON.stringify({ members: MEMBERS }))
            return new Response('{}', { status: 404 })
        })
        render(<AssetDetailsPane document={FILE} projectId="p1" editing={LEAD} />)
        await waitFor(() => expect(screen.getByText('Approvals')).toBeTruthy())
        const versions = screen.getAllByText(/^Version \d/).map((e) => e.textContent)
        expect(versions[0]).toMatch(/^Version 3\.0/)
        expect(versions[1]).toMatch(/^Version 1\.0/)
        expect(screen.getByText(/Approved Oct 28, 2026 by Ana Lead/)).toBeTruthy()
        expect(screen.getByText(/reopened Oct 02, 2026 by Ana Lead/)).toBeTruthy()
    })

    // A file's settings can carry share.createdAt (any settings save writes it); the listing used to
    // read that as a deliverable, and the pane then left the file's Status read-only, Blocked out.
    it("lets a file's Status be set and offers Blocked, even flagged as a deliverable", () => {
        render(<AssetDetailsPane document={{ ...FILE, isDeliverable: true }} projectId="p1" editing={{ ...LEAD, canBlock: true }} />)
        expect(screen.getByRole('button', { name: /In review/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Blocked' })).toBeTruthy()
    })

    it('warns when the work is underway with no due date', () => {
        render(<AssetDetailsPane document={{ ...FILE, dueDate: null }} projectId="p1" editing={LEAD} />)
        expect(screen.getByLabelText('In review with no due date')).toBeTruthy()
    })

    it("doesn't warn once there's a due date", () => {
        render(<AssetDetailsPane document={{ ...FILE, dueDate: '2026-11-02' }} projectId="p1" editing={LEAD} />)
        expect(screen.queryByLabelText('In review with no due date')).toBeNull()
    })

    it('names the tabs, with Discussions as the engagement page calls them', () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" editing={LEAD} />)
        expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Details', 'Versions', 'Activity', 'Discussions'])
        expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true')
    })

    it('shows who created and last modified the file, and when', () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" editing={LEAD} />)
        expect(screen.getByText('Deepak Firmaone')).toBeTruthy()
        expect(screen.getByText('Sam Rivera')).toBeTruthy()
        expect(screen.getByText('Sep 20, 2026')).toBeTruthy()
        expect(screen.getByText('Sep 24, 2026')).toBeTruthy()
    })

    it('loads the assignee and description from the document, and lets a lead edit the description', async () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" editing={LEAD} />)
        await waitFor(() => expect(screen.getByText('Ana Lead')).toBeTruthy())
        const box = screen.getByPlaceholderText('What is this file for?') as HTMLTextAreaElement
        expect(box.value).toBe('Sizing model for the Q2 plan')
        expect(fetchMock).toHaveBeenCalledWith(`/api/projects/p1/documents/${RECORD}/sharing`, expect.anything())
    })

    it('says Saving… then Saved as the description saves on its own', async () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" editing={LEAD} />)
        const box = await screen.findByPlaceholderText('What is this file for?') as HTMLTextAreaElement
        await waitFor(() => expect(box.value).toBe('Sizing model for the Q2 plan'))
        fireEvent.change(box, { target: { value: 'Sizing model, v2' } })
        await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy(), { timeout: 3000 })
        const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')!
        expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ description: 'Sizing model, v2' })
    })

    it('reads only for someone who may not edit', async () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" />)
        await waitFor(() => expect(screen.getByText('Sizing model for the Q2 plan')).toBeTruthy())
        expect(screen.queryByPlaceholderText('What is this file for?')).toBeNull()
        // The stage reads as a pill, not a picker.
        expect(screen.getByText('In review')).toBeTruthy()
    })

    it('lists the type with the other metadata, with the size beside it whichever way the storage sends it', () => {
        const { unmount } = render(<AssetDetailsPane document={{ ...FILE, size: 199_393 }} projectId="p1" />)
        expect(screen.getByText('Type')).toBeTruthy()
        expect(screen.getByText('Spreadsheet')).toBeTruthy()
        expect(screen.getByText('194.72 KB')).toBeTruthy()
        unmount()
        // OneDrive lists the size as a string.
        render(<AssetDetailsPane document={{ ...FILE, size: '199393' }} projectId="p1" />)
        expect(screen.getByText('194.72 KB')).toBeTruthy()
    })

    it('falls back to Details when the tab asked for is not one this viewer gets', () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" isExternalUser initialTab="versions" />)
        expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Details', 'Discussions'])
        expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true')
    })

    it('reads Not started for a tracked document with no stage yet, as the Files row does', () => {
        render(<AssetDetailsPane document={{ ...FILE, activityStatus: null }} projectId="p1" editing={{ ...LEAD, statusRole: null }} />)
        expect(screen.getByText('Not started')).toBeTruthy()
    })

    it('reads a dash for a file outside a deliverable', () => {
        render(<AssetDetailsPane document={{ ...FILE, activityStatus: null }} projectId="p1" editing={{ ...LEAD, statusRole: null, tracked: false }} />)
        expect(screen.queryByText('Not started')).toBeNull()
    })

    it('opens on Discussions when asked', () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" initialTab="discussions" />)
        expect(screen.getByText('discussion thread')).toBeTruthy()
    })
})

describe('openAssetDetailsPane', () => {
    const pane = () => ({
        setTitle: vi.fn(), setHeaderIcon: vi.fn(), setHeaderSubtitle: vi.fn(), setHeaderActions: vi.fn(),
        setContent: vi.fn(), setExpanded: vi.fn(),
    })

    it("names the file as the Board's pane does: doc ID as the title, name beneath", () => {
        const p = pane()
        openAssetDetailsPane(p as never, { document: { ...FILE, docId: 'QSR-16' }, projectId: 'p1' })
        expect(p.setTitle).toHaveBeenCalledWith('QSR-16')
        expect(p.setHeaderSubtitle).toHaveBeenCalledWith('Plan.xlsx')
        expect(isAssetDetailsPaneContent(p.setContent.mock.calls[0][0])).toBe(true)
    })

    it('titles a file with no doc ID yet by its name alone', () => {
        const p = pane()
        openAssetDetailsPane(p as never, { document: FILE, projectId: 'p1' })
        expect(p.setTitle).toHaveBeenCalledWith('Plan.xlsx')
        expect(p.setHeaderSubtitle).toHaveBeenCalledWith('')
    })

    it('tells the Details pane apart from other pane content', () => {
        expect(isAssetDetailsPaneContent(<div />)).toBe(false)
        expect(isAssetDetailsPaneContent(null)).toBe(false)
    })
})

describe('AssetDetailsPane — layout', () => {
    it('keeps the shared fields above the tabs, whichever tab is open', () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" editing={LEAD} initialTab="discussions" />)
        // Discussions is open, and the fields are still there above it.
        expect(screen.getByText('discussion thread')).toBeTruthy()
        expect(screen.getByText('Status')).toBeTruthy()
        expect(screen.getByText('Modified')).toBeTruthy()
        const status = screen.getByText('Status')
        const tablist = screen.getByRole('tablist')
        expect(status.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('puts the Description in the Details tab, with no separate notes: those are internal notes in the thread', () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" editing={LEAD} />)
        expect(screen.getByText('Description')).toBeTruthy()
        expect(screen.queryByText(/Only the firm's team sees these/)).toBeNull()
    })
})
