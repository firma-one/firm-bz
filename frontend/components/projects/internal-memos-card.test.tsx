import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * The Overview's Internal memos card: who sees it, what a row says, Find actions inline, an applied
 * action noted on the memo, and adding one (a .vtt read in the browser). fetch is stubbed: nothing is
 * sent anywhere.
 */

const h = vi.hoisted(() => ({
    addToast: vi.fn(),
    createManualReminder: vi.fn(),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: h.addToast }) }))
vi.mock('@/lib/actions/user-reminders', () => ({ createManualReminder: h.createManualReminder }))
vi.mock('@/components/files/use-due-date-save', () => ({ useDueDateSave: () => ({ save: vi.fn(), dialog: null }) }))

import { InternalMemosCard } from './internal-memos-card'
import type { MemoListItem } from '@/lib/memos/memo-shared'

const MEMO: MemoListItem = {
    id: '11111111-1111-4111-8111-111111111111',
    docId: 'RET-9',
    fileName: '2026-11-10-Weekly-check-in.md',
    date: '2026-11-10',
    title: 'Weekly check-in',
    authorFirstName: 'Alex',
    source: 'notes',
    durationMinutes: null,
    appliedCount: 0,
    toReview: 0,
    reviewedAt: null,
    edited: null,
    changedSinceRead: false,
    createdAt: '2026-11-10T17:00:00.000Z',
}
const TRANSCRIPT: MemoListItem = {
    ...MEMO, id: '22222222-2222-4222-8222-222222222222', date: '2026-11-03', title: 'Kickoff call', authorFirstName: 'Sam',
    source: 'transcript', durationMinutes: 38, appliedCount: 2,
}

const FOUND = {
    proposals: [
        { kind: 'reminder', id: 'reminder-1', title: 'Chase the 1099-B', date: '2026-11-16', quote: 'I need to chase the brokerage 1099-B, still missing' },
        { kind: 'reminder', id: 'reminder-2', title: 'Check the K-1s arrived', date: '2026-11-23', quote: 'They will send the K-1s next week' },
    ],
    skipped: [],
    dropped: 0,
    alreadyApplied: ['reminder-2'],
    engagement: { id: 'p1', name: '2025 Individual Return', firmId: 'f1', ctaUrl: '/d/np/f/northpoint/c/dana/e/return-2025' },
}

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let listing: { memos: MemoListItem[]; readOnly: boolean; storage: string | null }

function stubFetch() {
    calls = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        const body = init?.body ? JSON.parse(String(init.body)) : null
        calls.push({ url, method, body })
        const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
        if (url === '/api/projects/p1/memos' && method === 'GET') return json({ data: listing })
        if (url === '/api/projects/p1/memos' && method === 'POST') {
            return json({ data: { memo: { ...MEMO, id: 'new-memo', title: body.title, date: body.date, source: body.source, durationMinutes: body.durationMinutes }, fileName: `${body.date}-Kickoff.md` } }, 201)
        }
        if (url === '/api/projects/p1/ai-notes-proposals') return json({ data: FOUND })
        if (url.endsWith('/applied')) return json({ data: { appliedCount: 1 } })
        return json({ error: 'unexpected' }, 500)
    }))
}

const renderCard = (isInternalViewer = true) =>
    render(<InternalMemosCard projectId="p1" isInternalViewer={isInternalViewer} engagementBase="/d/np/f/northpoint/c/dana/e/return-2025" />)

beforeEach(() => {
    listing = { memos: [MEMO, TRANSCRIPT], readOnly: false, storage: 'Google Drive' }
    stubFetch()
    h.addToast.mockReset()
    h.createManualReminder.mockReset().mockResolvedValue({ ok: true, data: undefined })
})
afterEach(() => vi.unstubAllGlobals())

describe('who sees it', () => {
    it('renders nothing for a Reviewer or a Contributor · Limited Access, and asks for nothing', () => {
        const { container } = renderCard(false)
        expect(container.innerHTML).toBe('')
        expect(fetch).not.toHaveBeenCalled()
    })

    it('says what it is and who sees it, internal only', async () => {
        renderCard()
        expect(await screen.findByText('Weekly check-in')).toBeTruthy()
        expect(screen.getByRole('heading', { name: 'Internal memos' })).toBeTruthy()
        expect(screen.getByText('Internal only')).toBeTruthy()
        expect(screen.getByText(/one file each in “Internal Memos” in your Drive\. Only Leads and Full Access contributors see them\./)).toBeTruthy()
    })
})

describe('the rows', () => {
    it('newest first, with the day, who wrote it and what was applied', async () => {
        renderCard()
        const first = await screen.findByTestId(`memo-${MEMO.id}`)
        expect(within(first).getByRole('img', { name: 'November 10, 2026' })).toBeTruthy()
        expect(within(first).getByText('Alex · notes')).toBeTruthy()
        const second = screen.getByTestId(`memo-${TRANSCRIPT.id}`)
        expect(within(second).getByText('Sam · transcript, 38 min')).toBeTruthy()
        expect(within(second).getByText('2 action items applied')).toBeTruthy()
    })

    it('Open opens the file in Files', async () => {
        renderCard()
        const open = await screen.findByRole('link', { name: 'Open Weekly check-in' })
        expect(open.getAttribute('href')).toBe(`/d/np/f/northpoint/c/dana/e/return-2025/files#doc-file:${MEMO.id}`)
    })

    it('one quiet line when there are none', async () => {
        listing.memos = []
        renderCard()
        expect(await screen.findByText('No memos yet. Add one after your next call.')).toBeTruthy()
    })

    it('read only once the engagement is completed: no adding, no Find actions', async () => {
        listing.readOnly = true
        renderCard()
        await screen.findByText('Weekly check-in')
        expect(screen.queryByRole('button', { name: /Add internal memo/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Identify action items/ })).toBeNull()
        expect(screen.getByRole('link', { name: 'Open Weekly check-in' })).toBeTruthy()
    })
})

describe('Find actions', () => {
    it('asks for the memo by id and shows the proposals under its row, applied ones as done', async () => {
        renderCard()
        fireEvent.click(await screen.findByRole('button', { name: 'Identify action items in Weekly check-in' }))
        const row = screen.getByTestId(`memo-${MEMO.id}`)
        expect(await within(row).findByText('Applied action items note this memo, so identifying them again shows them as done.')).toBeTruthy()
        expect(calls.find((c) => c.url.endsWith('/ai-notes-proposals'))?.body).toEqual(expect.objectContaining({ memoDocumentId: MEMO.id }))
        expect(calls.find((c) => c.url.endsWith('/ai-notes-proposals'))?.body).not.toHaveProperty('notes')
        expect(within(row).getByText('Applied earlier from this memo')).toBeTruthy()
        expect(within(row).getByRole('button', { name: 'Apply 1 selected' })).toBeTruthy()
    })

    it('applies a reminder as a person would, then notes it on the memo', async () => {
        renderCard()
        fireEvent.click(await screen.findByRole('button', { name: 'Identify action items in Weekly check-in' }))
        const row = screen.getByTestId(`memo-${MEMO.id}`)
        fireEvent.click(await within(row).findByRole('button', { name: 'Apply 1 selected' }))
        await waitFor(() => expect(within(row).getByText('1 action item applied')).toBeTruthy())
        expect(h.createManualReminder).toHaveBeenCalledWith(expect.objectContaining({
            action: 'Chase the 1099-B', dateValue: '2026-11-16', entityValue: 'p1',
            note: 'From the memo “Weekly check-in”: “I need to chase the brokerage 1099-B, still missing”',
        }))
        expect(calls.find((c) => c.url === `/api/projects/p1/memos/${MEMO.id}/applied`)?.body).toEqual({
            kind: 'reminder', target: 'chase the 1099-b', date: '2026-11-16', quote: 'i need to chase the brokerage 1099-b, still missing', label: 'Reminder · Chase the 1099-B',
        })
    })
})

describe('Add internal memo', () => {
    it('reads an attached .vtt in the browser, and saves it as a transcript', async () => {
        renderCard()
        fireEvent.click(await screen.findByRole('button', { name: /Add internal memo/ }))
        expect(await screen.findByRole('heading', { name: 'Add internal memo' })).toBeTruthy()
        expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Call notes')
        expect(screen.getByText('Saved as a Markdown file in Internal Memos, internal only.')).toBeTruthy()

        const vtt = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\n<v Dana>Thanks for joining.</v>\n\n2\n00:00:05.000 --> 00:42:10.000\n<v Alex>Glad to.</v>\n'
        fireEvent.change(screen.getByLabelText('Attach a .txt, .md or .vtt file'), { target: { files: [new File([vtt], 'kickoff.vtt', { type: 'text/vtt' })] } })
        expect((await screen.findByTestId('memo-attachment')).textContent).toBe('kickoff.vtt · transcript, 42 min · 2 speakers')
        expect((screen.getByLabelText('Notes or transcript') as HTMLTextAreaElement).value).toBe('Dana: Thanks for joining.\n\nAlex: Glad to.')
        expect(screen.getByText("Timestamps and cue numbers are removed; each speaker's lines are joined.")).toBeTruthy()

        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Kickoff' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save memo' }))
        await waitFor(() => expect(h.addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Memo saved' })))
        expect(calls.find((c) => c.url === '/api/projects/p1/memos' && c.method === 'POST')?.body).toEqual(expect.objectContaining({
            title: 'Kickoff', body: 'Dana: Thanks for joining.\n\nAlex: Glad to.', source: 'transcript', durationMinutes: 42, speakers: 2,
        }))
        expect(await screen.findByText('Kickoff')).toBeTruthy()
    })

    it('removing the file puts back what the field held', async () => {
        renderCard()
        fireEvent.click(await screen.findByRole('button', { name: /Add internal memo/ }))
        const field = await screen.findByLabelText('Notes or transcript') as HTMLTextAreaElement
        fireEvent.change(field, { target: { value: 'my own words' } })
        fireEvent.change(screen.getByLabelText('Attach a .txt, .md or .vtt file'), { target: { files: [new File(['# Notes\nfrom a file'], 'notes.md')] } })
        expect((await screen.findByTestId('memo-attachment')).textContent).toBe('notes.md · notes')
        expect(field.value).toBe('# Notes\nfrom a file')
        fireEvent.click(screen.getByRole('button', { name: 'Remove notes.md' }))
        expect(field.value).toBe('my own words')
    })

    it('refuses a file of another kind, and a memo over 200,000 characters, in plain words', async () => {
        renderCard()
        fireEvent.click(await screen.findByRole('button', { name: /Add internal memo/ }))
        fireEvent.change(await screen.findByLabelText('Attach a .txt, .md or .vtt file'), { target: { files: [new File(['x'], 'deck.pdf')] } })
        expect(await screen.findByText('Attach a .txt, .md or .vtt file.')).toBeTruthy()
        fireEvent.change(screen.getByLabelText('Notes or transcript'), { target: { value: 'x'.repeat(200_001) } })
        expect(screen.getByText('This memo is 200,001 characters. Keep it under 200,000 to save it.')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Save memo' }).hasAttribute('disabled')).toBe(true)
    })
})
