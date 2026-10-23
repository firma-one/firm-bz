import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: { id: 'me', email: 'me@firm.com', user_metadata: {} } }),
}))
vi.mock('@/lib/right-pane-context', () => ({
    useRightPane: () => ({ clearPane: vi.fn() }),
}))

import { DocumentDocCommentsPane } from './document-doc-comments-pane'

const MEMBERS = [
    { userId: 'me', email: 'me@firm.com', name: 'Me Myself', role: 'eng_admin' },
    { userId: 'u1', email: 'ana@firm.com', name: 'Ana Lopez', role: 'eng_member' },
    { userId: 'brio', email: 'brio@firm.com', name: 'Brio', role: 'eng_member', isAgent: true },
]

let posted: { method: string; body: any }[] = []
/** Marks of the discussion as read (POST …/doc-comments/read), kept apart from what's posted. */
let reads: string[] = []
let existing: any[] = []
/** messageId → its reminder records, as the reminders endpoint returns them. */
let reminders: Record<string, { userId: string; reminderId: string; dateValue: string | null }[]> = {}

beforeEach(() => {
    posted = []
    reads = []
    existing = []
    reminders = {}
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
    // jsdom has no scrolling.
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        const body = init?.body ? JSON.parse(init.body as string) : null
        const json = (data: unknown) => ({ ok: true, json: async () => data }) as Response
        if (url.endsWith('/doc-comments/read')) {
            reads.push(url)
            return json({ ok: true })
        }
        if (method !== 'GET') posted.push({ method, body })
        if (url.includes('/members')) return json({ members: MEMBERS })
        if (url.includes('filter=mentions')) return json({ mentions: [] })
        if (url.includes('/reminders')) return json({ reminders: reminders[new URL(url, 'http://x').searchParams.get('messageId') ?? ''] ?? [] })
        if (method === 'POST') return json({ message: { id: 'm-new', createdAt: new Date().toISOString(), authorUserId: 'me', authorEmail: 'me@firm.com', content: body.content } })
        if (method === 'PATCH') return json({})
        return json({ messages: existing })
    }))
})
afterEach(() => vi.unstubAllGlobals())

const renderPane = () => render(<DocumentDocCommentsPane engagementId="e1" documentId="d1" documentName="Report" />)

/** Lets the mocked requests (members, comments) resolve and their state land. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

/** Types into the composer with the caret at the end, as a user would. */
function type(textarea: HTMLTextAreaElement, value: string) {
    // Through the change event only: setting .value first would update React's value tracker,
    // and the change would then look like no change.
    fireEvent.change(textarea, { target: { value, selectionStart: value.length, selectionEnd: value.length } })
}

describe('DocumentDocCommentsPane — reading', () => {
    it('marks the discussion read once it has loaded, so the Discussions page drops its dot', async () => {
        renderPane()
        await screen.findByLabelText('Comment')
        await settle()
        expect(reads).toEqual(['/api/projects/e1/documents/d1/doc-comments/read'])
    })
})

describe('DocumentDocCommentsPane — mentions', () => {
    it('opens a menu at "@" that narrows as you type, without you or Brio', async () => {
        renderPane()
        const box = await screen.findByLabelText('Comment') as HTMLTextAreaElement
        await settle()
        type(box, 'Hi @an')
        const menu = await screen.findByRole('listbox', { name: 'Mention someone' })
        expect(menu.textContent).toContain('Ana Lopez')
        expect(menu.textContent).toContain('Member')
        expect(menu.textContent).not.toContain('Me Myself')
        expect(menu.textContent).not.toContain('Brio')
    })

    it('inserts the name where you typed on Enter, and enables Remind', async () => {
        renderPane()
        const box = await screen.findByLabelText('Comment') as HTMLTextAreaElement
        await settle()
        expect((screen.getByRole('button', { name: 'Remind' }) as HTMLButtonElement).disabled).toBe(true)
        type(box, 'Hi @an')
        await screen.findByRole('listbox', { name: 'Mention someone' })
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(box.value).toBe('Hi @Ana Lopez ')
        expect(screen.queryByRole('listbox', { name: 'Mention someone' })).toBeNull()
        // The picked name gets a chip behind it in the composer.
        expect(Array.from(document.querySelectorAll('mark')).map((m) => m.textContent)).toEqual(['@Ana Lopez'])
        expect((screen.getByRole('button', { name: 'Remind' }) as HTMLButtonElement).disabled).toBe(false)
    })

    it('sends with ⌘↵ and notifies the people still mentioned', async () => {
        renderPane()
        const box = await screen.findByLabelText('Comment') as HTMLTextAreaElement
        await settle()
        type(box, 'Hi @an')
        await screen.findByRole('listbox', { name: 'Mention someone' })
        fireEvent.keyDown(box, { key: 'Enter' })
        type(box, 'Hi @Ana Lopez please review')
        fireEvent.keyDown(box, { key: 'Enter', metaKey: true })
        await waitFor(() => expect(posted.some((p) => p.method === 'PATCH')).toBe(true))
        expect(posted[0]).toEqual({ method: 'POST', body: { content: 'Hi @Ana Lopez please review' } })
        expect(posted[1]).toEqual({ method: 'PATCH', body: { messageId: 'm-new', recipientId: 'u1', dateValue: null } })
    })

    it('Enter alone is a new line when the menu is closed', async () => {
        renderPane()
        const box = await screen.findByLabelText('Comment') as HTMLTextAreaElement
        await settle()
        type(box, 'First line')
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(posted).toEqual([])
    })
})

describe('DocumentDocCommentsPane — thread', () => {
    it('shows the author by name, not email, and mentions as pills', async () => {
        existing = [{ id: 'c1', createdAt: new Date().toISOString(), authorUserId: 'u1', authorEmail: 'ana@firm.com', content: 'Thanks @Me Myself for this' }]
        renderPane()
        expect(await screen.findByText('Ana Lopez')).toBeTruthy()
        expect(screen.queryByText('ana@firm.com')).toBeNull()
        expect(screen.getByText('@Me Myself')).toBeTruthy()
    })

    it('keeps filters out of the way for a short thread', async () => {
        existing = [{ id: 'c1', createdAt: new Date().toISOString(), authorUserId: 'u1', authorEmail: 'ana@firm.com', content: 'One comment' }]
        renderPane()
        await screen.findByText('One comment')
        expect(screen.queryByRole('button', { name: 'Sort comments' })).toBeNull()
    })
})

describe('DocumentDocCommentsPane — mention chips', () => {
    it('chips only names picked from the menu (the people who will be notified)', async () => {
        renderPane()
        const box = await screen.findByLabelText('Comment') as HTMLTextAreaElement
        await settle()
        // Typed by hand, never picked: not a mention, no chip.
        type(box, 'Hi @Ana Lopez ')
        expect(document.querySelectorAll('mark').length).toBe(0)
    })
})

describe('DocumentDocCommentsPane — reminders', () => {
    const mine = (id: string) => ({ id, createdAt: new Date().toISOString(), authorUserId: 'me', authorEmail: 'me@firm.com', content: 'Hi @Ana Lopez please review' })

    it('a mention alone shows no reminder bell, and offers to set one', async () => {
        existing = [mine('c1')]
        // A mention is stored as a reminder with no date: Ana was notified at once.
        reminders = { c1: [{ userId: 'u1', reminderId: 'r1', dateValue: null }] }
        renderPane()
        await screen.findByText('please review', { exact: false })
        await settle()
        expect(screen.queryByRole('button', { name: 'Edit reminder' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Set reminder' })).toBeTruthy()
    })

    it('a dated reminder shows the bell', async () => {
        existing = [mine('c1')]
        reminders = { c1: [{ userId: 'u1', reminderId: 'r1', dateValue: '2099-01-05T09:00:00.000Z' }] }
        renderPane()
        expect(await screen.findByRole('button', { name: 'Edit reminder' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Set reminder' })).toBeNull()
    })

    it('someone else’s reminder is shown, not editable', async () => {
        existing = [{ ...mine('c1'), authorUserId: 'u1', authorEmail: 'ana@firm.com', content: 'Thanks @Me Myself' }]
        reminders = { c1: [{ userId: 'me', reminderId: 'r1', dateValue: '2099-01-05T09:00:00.000Z' }] }
        renderPane()
        await screen.findByText('Ana Lopez')
        await settle()
        expect(screen.queryByRole('button', { name: 'Edit reminder' })).toBeNull()
        expect(screen.getByLabelText(/^Reminder /)).toBeTruthy()
    })

    it('posting a mention without a date adds no bell', async () => {
        renderPane()
        const box = await screen.findByLabelText('Comment') as HTMLTextAreaElement
        await settle()
        type(box, 'Hi @an')
        await screen.findByRole('listbox', { name: 'Mention someone' })
        fireEvent.keyDown(box, { key: 'Enter' })
        type(box, 'Hi @Ana Lopez please review')
        fireEvent.keyDown(box, { key: 'Enter', metaKey: true })
        await waitFor(() => expect(posted.some((p) => p.method === 'PATCH')).toBe(true))
        await settle()
        expect(screen.queryByRole('button', { name: 'Edit reminder' })).toBeNull()
    })

    it('Save waits for a date, then reminds everyone the comment notified', async () => {
        existing = [mine('c1')]
        reminders = { c1: [{ userId: 'u1', reminderId: 'r1', dateValue: null }] }
        renderPane()
        fireEvent.click(await screen.findByRole('button', { name: 'Set reminder' }))
        const save = await screen.findByRole('button', { name: 'Save' }) as HTMLButtonElement
        expect(save.disabled).toBe(true)
        expect(screen.queryByRole('button', { name: 'Remove reminder' })).toBeNull()
    })
})

describe('DocumentDocCommentsPane — document tags', () => {
    const DOCS = [
        { documentId: 'doc-a', docId: 'QSR-12', fileName: 'Market sizing.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', breadcrumb: ['01 Market'] },
        { documentId: 'doc-b', docId: 'QSR-13', fileName: 'Competitor teardown.pdf', mimeType: 'application/pdf' },
        { documentId: 'doc-c', docId: null, fileName: 'No ID yet.docx' },
    ]
    const renderTagging = (onOpenDocument = vi.fn()) =>
        render(<DocumentDocCommentsPane engagementId="e1" documentId="d1" documentName="Deliverable" taggableDocuments={DOCS} onOpenDocument={onOpenDocument} />)

    it('opens the deliverable’s documents at "#", matching by ID or name, and inserts the ID', async () => {
        renderTagging()
        const box = await screen.findByLabelText('Comment') as HTMLTextAreaElement
        await settle()
        type(box, 'See #comp')
        const menu = await screen.findByRole('listbox', { name: 'Tag a document' })
        expect(menu.textContent).toContain('Competitor teardown.pdf')
        expect(menu.textContent).not.toContain('Market sizing')
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(box.value).toBe('See #QSR-13 ')
        type(box, 'See #QSR-13 and #qsr-1')
        expect((await screen.findByRole('listbox', { name: 'Tag a document' })).textContent).toContain('Market sizing.xlsx')
    })

    it('shows a tag in the thread as a chip with the document ID, which opens the document', async () => {
        existing = [{ id: 'm1', createdAt: new Date().toISOString(), authorUserId: 'u1', authorEmail: 'ana@firm.com', content: 'Numbers are in #QSR-12, and #QSR-99 is gone' }]
        const open = vi.fn()
        renderTagging(open)
        fireEvent.click(await screen.findByRole('button', { name: /QSR-12/ }))
        expect(open).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc-a', docId: 'QSR-12' }))
        expect(screen.getByText('#QSR-99')).toBeTruthy()
    })

    it('offers no # where no documents are given', async () => {
        renderPane()
        const box = await screen.findByLabelText('Comment') as HTMLTextAreaElement
        await settle()
        type(box, 'issue #4')
        expect(screen.queryByRole('listbox', { name: 'Tag a document' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Tag a document' })).toBeNull()
    })
})
