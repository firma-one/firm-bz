import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/components/projects/document-doc-comments-pane', () => ({ DocumentDocCommentsPane: () => <div>discussion thread</div> }))
vi.mock('@/components/files/document-versions-timeline', () => ({ DocumentVersionsTimeline: () => <div>versions</div> }))
vi.mock('@/components/files/document-activity-feed', () => ({ DocumentActivityFeed: () => <div>activity</div> }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ getSession: async () => ({ access_token: 't' }) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'u-ana' } }) }))
vi.mock('@/components/files/document-notes-section', () => ({ DocumentNotesSection: (p: { isLead: boolean }) => <div>notes section{p.isLead ? ' (lead)' : ''}</div> }))

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

    it('shows the Notes to the firm, as a lead when the viewer leads the engagement', async () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" editing={LEAD} />)
        await waitFor(() => expect(screen.getByText('notes section (lead)')).toBeTruthy())
    })

    it('never shows the Notes to an external user', async () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" isExternalUser />)
        await waitFor(() => expect(screen.getByText('Spreadsheet')).toBeTruthy())
        expect(screen.queryByText(/notes section/)).toBeNull()
    })

    it('reads To do for tracked work with no stage yet, as the Board does', () => {
        render(<AssetDetailsPane document={{ ...FILE, activityStatus: null }} projectId="p1" editing={{ ...LEAD, statusRole: null }} />)
        expect(screen.getByText('To do')).toBeTruthy()
    })

    it('reads a dash for a file outside a deliverable', () => {
        render(<AssetDetailsPane document={{ ...FILE, activityStatus: null }} projectId="p1" editing={{ ...LEAD, statusRole: null, tracked: false }} />)
        expect(screen.queryByText('To do')).toBeNull()
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

    it('puts Description and Notes in the Details tab', async () => {
        render(<AssetDetailsPane document={FILE} projectId="p1" editing={LEAD} />)
        expect(screen.getByText('Description')).toBeTruthy()
        await waitFor(() => expect(screen.getByText('notes section (lead)')).toBeTruthy())
    })
})
