import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react'

/**
 * Discussions › Threads | Memos | RAID (.claude/plans/brio-features-round-2.md §8): who gets the switch,
 * the sub-tab and memo kept in the URL, the memo pane, and Identify action items in it. fetch is stubbed:
 * nothing reaches the server, Brio, Google Drive or OneDrive.
 */

const h = vi.hoisted(() => ({
    addToast: vi.fn(),
    createManualReminder: vi.fn(),
    clearPane: vi.fn(),
}))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', email: 'me@firm.com' } }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: h.addToast }) }))
vi.mock('@/lib/actions/user-reminders', () => ({ createManualReminder: h.createManualReminder }))
vi.mock('@/components/files/use-due-date-save', () => ({ useDueDateSave: () => ({ save: vi.fn(), dialog: null }) }))
vi.mock('@/components/projects/document-doc-comments-pane', () => ({ DocumentDocCommentsPane: () => null }))
vi.mock('@/lib/right-pane-context', () => ({
    useRightPane: () => ({
        hasRightPane: true, content: null, setContent: vi.fn(), clearPane: h.clearPane, setHeaderActions: vi.fn(),
        setBeforeClose: vi.fn(), setTitle: vi.fn(), setHeaderIcon: vi.fn(), setHeaderSubtitle: vi.fn(),
    }),
}))
// As Next.js does: useSearchParams follows the page's URL, history.replaceState included.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }))

import { EngagementCommentsTab } from './engagement-comments-tab'
import { TooltipProvider } from '@/components/ui/tooltip'
import { hasInternalDiscussions, parseDiscussionsSubTab, discussionsHref, DiscussionsBarPortal } from './discussions-switch'
import { PERSONA_CAPABILITY_MAP } from '@/lib/permissions/persona-map'
import { memoReviewOf, type MemoListItem, type MemoReviewPayload } from '@/lib/memos/memo-shared'

const MEMO: MemoListItem = {
    id: '11111111-1111-4111-8111-111111111111',
    docId: 'RET-9',
    fileName: '2026-11-12-Call-with-Dana.md',
    date: '2026-11-12',
    title: 'Call with Dana',
    authorFirstName: 'Alex',
    source: 'transcript',
    durationMinutes: 38,
    appliedCount: 1,
    toReview: 0,
    reviewedAt: null,
    edited: null,
    changedSinceRead: false,
    createdAt: '2026-11-12T17:00:00.000Z',
}
const OLDER: MemoListItem = {
    ...MEMO, id: '22222222-2222-4222-8222-222222222222', fileName: '2026-10-29-Kickoff-with-the-Garcias.md', date: '2026-10-29',
    title: 'Kickoff with the Garcias', authorFirstName: 'Marcus', source: 'notes', durationMinutes: null, appliedCount: 0,
}
const TEXT = '# Call with Dana\n\nThursday, November 12, 2026 · Alex Jordan\n\nDana Whitfield: We will send the K-1s by end of next week.\n\nAlex: Great.'
const OLDER_TEXT = '# Kickoff with the Garcias\n\nThursday, October 29, 2026 · Marcus Lee\n\n- Agreed the scope'
const FOUND = {
    proposals: [
        { kind: 'reminder', id: 'reminder-1', title: 'Check the K-1s arrived', date: '2026-11-23', quote: 'We will send the K-1s by end of next week.' },
        { kind: 'reminder', id: 'reminder-2', title: 'Chase the 1099-B', date: '2026-11-16', quote: 'I still need the brokerage 1099-B' },
    ],
    skipped: [],
    dropped: 0,
    alreadyApplied: ['reminder-1'],
    engagement: { id: 'p1', name: '2025 Individual Return', firmId: 'f1', ctaUrl: null },
}

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let listing: { memos: MemoListItem[]; readOnly: boolean; storage: string | null }
let content: { status: number; body: unknown }
const NOTHING_WAITING: MemoReviewPayload = { review: null, alreadyApplied: [], appliedOn: {}, applied: [], engagement: { id: 'p1', name: '2025 Individual Return', firmId: 'f1', ctaUrl: null }, raid: [] }
let waiting: MemoReviewPayload = NOTHING_WAITING

function stubFetch() {
    calls = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null })
        const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
        if (url === '/api/projects/p1/memos' && method === 'GET') return json({ data: listing })
        if (url === `/api/projects/p1/memos/${MEMO.id}/content`) return json(content.body, content.status)
        if (url === `/api/projects/p1/memos/${OLDER.id}/content`) return json({ data: { text: OLDER_TEXT, webUrl: null } })
        if (url === '/api/projects/p1/ai-notes-proposals') return json({ data: FOUND })
        if (url.endsWith('/applied')) return json({ data: { appliedCount: 2 } })
        if (url.endsWith('/review') && method === 'GET') return json({ data: waiting })
        if (url.endsWith('/review') && method === 'DELETE') return json({ data: { dismissed: true } })
        if (url.startsWith('/api/projects/p1/raid/') && method === 'PATCH') return json({ data: {} })
        if (url.includes('/members')) return json({ members: [] })
        if (url.includes('filter=mentions')) return json({ mentions: [] })
        if (url.includes('/doc-comments')) return json({ documents: [{ projectDocumentId: 'd1', documentName: 'Market report', docId: 'QSR-9', kind: 'deliverable', count: 2, latest: null }] })
        return json({ error: 'unexpected' }, 500)
    }))
}

const BASE = '/d/np/f/northpoint/c/dana/e/return-2025'
const renderTab = (props: Partial<React.ComponentProps<typeof EngagementCommentsTab>> = {}) =>
    render(<TooltipProvider><EngagementCommentsTab projectId="p1" boardUrl={`${BASE}/board`} engagementBase={BASE} internalSubTabs {...props} /></TooltipProvider>)
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const memoCalls = () => calls.filter((c) => c.url.includes('/memos'))

beforeEach(() => {
    window.history.replaceState(null, '', `${BASE}/comments`)
    listing = { memos: [MEMO, OLDER], readOnly: false, storage: 'OneDrive' }
    content = { status: 200, body: { data: { text: TEXT, webUrl: 'https://contoso-my.sharepoint.com/memo.md' } } }
    waiting = NOTHING_WAITING
    stubFetch()
    h.addToast.mockReset()
    h.clearPane.mockReset()
    h.createManualReminder.mockReset().mockResolvedValue({ ok: true, data: undefined })
})
afterEach(() => vi.unstubAllGlobals())

describe('who gets the switch', () => {
    const caps = (role: string) => ({
        canEdit: !!PERSONA_CAPABILITY_MAP[role]['project:can_edit'],
        canViewInternal: !!PERSONA_CAPABILITY_MAP[role]['project:can_view_internal'],
    })

    it('a Lead and a Contributor · Full Access; never a Reviewer or a Contributor · Limited Access', () => {
        expect(hasInternalDiscussions(caps('eng_admin'))).toBe(true)
        expect(hasInternalDiscussions(caps('eng_member'))).toBe(true)
        expect(hasInternalDiscussions(caps('eng_viewer'))).toBe(false)
        expect(hasInternalDiscussions(caps('eng_ext_collaborator'))).toBe(false)
        // A Lead viewing the page as a client role sees what they would.
        expect(hasInternalDiscussions({ ...caps('eng_admin'), viewingAsRestrictedRole: true })).toBe(false)
    })

    it.each(['eng_viewer', 'eng_ext_collaborator'])('%s: today\'s page, with no switch, no counts and no memos in the DOM or asked for', async (role) => {
        window.history.replaceState(null, '', `${BASE}/comments?view=memos&memo=${MEMO.id}`)
        const { container } = renderTab({ internalSubTabs: hasInternalDiscussions(caps(role)), renderRaid: () => <p>RAID body</p>, raidCount: 7 })
        await settle()
        expect(screen.getByText('Market report')).toBeTruthy()
        expect(screen.queryByRole('tablist')).toBeNull()
        expect(container.innerHTML).not.toMatch(/Memos|RAID|Internal Memos|Call with Dana/)
        expect(memoCalls()).toEqual([])
    })
})

describe('the switch', () => {
    it('Threads first, with counts, and the lock on Memos; no RAID without a log', async () => {
        renderTab()
        await settle()
        const tabs = screen.getAllByRole('tab')
        expect(tabs.map((t) => t.textContent)).toEqual(['Threads1', 'Memos2'])
        expect(tabs[0].getAttribute('aria-selected')).toBe('true')
        expect(within(tabs[1]).getByRole('img', { name: 'Internal only · Hidden from Limited Access contributors and Reviewers' })).toBeTruthy()
        expect(screen.getByText('Market report')).toBeTruthy()
    })

    it('keeps the sub-tab and the memo in the URL, so a reload opens them again', async () => {
        const first = renderTab()
        await settle()
        fireEvent.click(screen.getByRole('tab', { name: /^Memos/ }))
        expect(window.location.search).toBe('?view=memos')
        fireEvent.click(await screen.findByTestId(`memo-row-${OLDER.id}`))
        expect(new URLSearchParams(window.location.search).get('memo')).toBe(OLDER.id)
        first.unmount()

        // The reload.
        renderTab()
        await settle()
        expect(screen.getByRole('tab', { name: /^Memos/ }).getAttribute('aria-selected')).toBe('true')
        expect(await screen.findByRole('heading', { name: 'Kickoff with the Garcias' })).toBeTruthy()

        fireEvent.click(screen.getByRole('tab', { name: /^Threads/ }))
        expect(window.location.search).toBe('')
    })

    it('links straight to a sub-tab, and reads only the views it knows', () => {
        expect(discussionsHref(BASE, 'raid')).toBe(`${BASE}/comments?view=raid`)
        expect(discussionsHref(BASE, 'memos', MEMO.id)).toBe(`${BASE}/comments?view=memos&memo=${MEMO.id}`)
        expect(discussionsHref(BASE, 'threads')).toBe(`${BASE}/comments`)
        expect(parseDiscussionsSubTab('raid', false)).toBe('threads')
        expect(parseDiscussionsSubTab('raid', true)).toBe('raid')
        expect(parseDiscussionsSubTab('nonsense', true)).toBe('threads')
    })

    it('RAID shows when a log is passed, with its count, its body and its own bar controls', async () => {
        window.history.replaceState(null, '', `${BASE}/comments?view=raid`)
        renderTab({
            raidCount: 7,
            renderRaid: () => (
                <>
                    <DiscussionsBarPortal><button type="button">Check now</button></DiscussionsBarPortal>
                    <p>RAID body</p>
                </>
            ),
        })
        await settle()
        expect(screen.getByRole('tab', { name: /^RAID7/ }).getAttribute('aria-selected')).toBe('true')
        expect(screen.getByText('RAID body')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Check now' })).toBeTruthy()

        // Another sub-tab takes the bar: RAID's controls leave with it.
        fireEvent.click(screen.getByRole('tab', { name: /^Memos/ }))
        expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull()
        expect(screen.getByRole('button', { name: /Add internal memo/ })).toBeTruthy()
    })

    it('arrow keys move between sub-tabs', async () => {
        renderTab()
        await settle()
        fireEvent.keyDown(screen.getByRole('tab', { name: /^Threads/ }), { key: 'ArrowRight' })
        expect(screen.getByRole('tab', { name: /^Memos/ }).getAttribute('aria-selected')).toBe('true')
    })
})

describe('Memos', () => {
    async function openMemos() {
        window.history.replaceState(null, '', `${BASE}/comments?view=memos`)
        renderTab()
        await settle()
    }

    it('lists the memos newest first, with the bar, the search and where they are kept', async () => {
        await openMemos()
        expect(screen.getByText('Internal only · Leads and Full Access contributors')).toBeTruthy()
        expect(screen.getByRole('button', { name: /Add internal memo/ })).toBeTruthy()
        const first = screen.getByTestId(`memo-row-${MEMO.id}`)
        expect(within(first).getByText('Alex · transcript, 38 min')).toBeTruthy()
        expect(within(first).getByText('1 action item applied')).toBeTruthy()
        expect(within(screen.getByTestId(`memo-row-${OLDER.id}`)).getByText('Marcus · notes')).toBeTruthy()
        expect(screen.getByText('Each memo is a Markdown file in “Internal Memos” in your OneDrive.')).toBeTruthy()

        fireEvent.change(screen.getByLabelText('Search memos by title or who wrote it'), { target: { value: 'marcus' } })
        expect(screen.queryByTestId(`memo-row-${MEMO.id}`)).toBeNull()
        expect(screen.getByTestId(`memo-row-${OLDER.id}`)).toBeTruthy()
    })

    it('opens the newest memo in the pane, read through the content route and drawn as Markdown', async () => {
        await openMemos()
        const pane = screen.getByRole('region', { name: 'Memo' })
        expect(await within(pane).findByRole('heading', { name: 'Call with Dana' })).toBeTruthy()
        expect(within(pane).getByText('Internal only')).toBeTruthy()
        expect(within(pane).getByText('2026-11-12-Call-with-Dana.md')).toBeTruthy()
        expect(within(pane).getByText('Thursday, November 12, 2026 · Alex Jordan')).toBeTruthy()
        // A transcript's speakers in bold.
        expect(within(pane).getByText('Dana Whitfield:').tagName).toBe('STRONG')
        const open = within(pane).getByRole('link', { name: 'Open in OneDrive' })
        expect(open.getAttribute('href')).toBe('https://contoso-my.sharepoint.com/memo.md')
        expect(open.getAttribute('target')).toBe('_blank')
        expect(calls.some((c) => c.url === `/api/projects/p1/memos/${MEMO.id}/content`)).toBe(true)
    })

    it('opens a memo storage gave no link for in Files', async () => {
        await openMemos()
        fireEvent.click(screen.getByTestId(`memo-row-${OLDER.id}`))
        const pane = screen.getByRole('region', { name: 'Memo' })
        expect(await within(pane).findByRole('heading', { name: 'Kickoff with the Garcias' })).toBeTruthy()
        expect(within(pane).getByRole('link', { name: 'Open in Files' }).getAttribute('href')).toBe(`${BASE}/files#doc-file:${OLDER.id}`)
    })

    it('says why a memo didn\'t load, and tries again', async () => {
        content = { status: 404, body: { error: 'This is no longer in OneDrive. It may have been moved or deleted there. Refresh the list.' } }
        await openMemos()
        const pane = screen.getByRole('region', { name: 'Memo' })
        expect(await within(pane).findByText("Couldn't load this memo")).toBeTruthy()
        expect(within(pane).getByText(/no longer in OneDrive/)).toBeTruthy()

        content = { status: 200, body: { data: { text: TEXT, webUrl: null } } }
        fireEvent.click(within(pane).getByRole('button', { name: 'Try again' }))
        expect(await within(pane).findByRole('heading', { name: 'Call with Dana' })).toBeTruthy()
    })

    it('says why the list didn\'t load, never "No memos yet"', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url === '/api/projects/p1/memos') return new Response(JSON.stringify({ error: 'Internal memos are for a Lead or a Contributor · Full Access only.' }), { status: 403 })
            return new Response(JSON.stringify({ documents: [], members: [], mentions: [] }), { status: 200 })
        }))
        await openMemos()
        expect(screen.getByText("Couldn't load the memos")).toBeTruthy()
        expect(screen.queryByText(/No memos yet/)).toBeNull()
    })

    it('one quiet line when there are none, with Add beside the switch', async () => {
        listing.memos = []
        await openMemos()
        expect(screen.getByText('No memos yet. Add one after your next call.')).toBeTruthy()
        expect(screen.getByRole('button', { name: /Add internal memo/ })).toBeTruthy()
        expect(screen.queryByLabelText('Search memos by title or who wrote it')).toBeNull()
    })

    it('Find actions shows Brio\'s proposals under the memo, applied ones marked, and notes an apply on the memo', async () => {
        await openMemos()
        const pane = screen.getByRole('region', { name: 'Memo' })
        await within(pane).findByRole('heading', { name: 'Call with Dana' })
        // The action items have their own column beside the memo.
        const actions = screen.getByRole('region', { name: 'Action items' })
        fireEvent.click(within(actions).getByRole('button', { name: 'Identify action items in Call with Dana' }))
        expect(await within(actions).findByText('Applied earlier from this memo')).toBeTruthy()
        expect(within(actions).getByText('Applied action items note this memo, so identifying them again shows them as done.')).toBeTruthy()
        expect(calls.find((c) => c.url.endsWith('/ai-notes-proposals'))?.body).toEqual(expect.objectContaining({ memoDocumentId: MEMO.id }))

        fireEvent.click(within(actions).getByRole('button', { name: 'Apply 1 selected' }))
        await waitFor(() => expect(within(screen.getByTestId(`memo-row-${MEMO.id}`)).getByText('2 action items applied')).toBeTruthy())
        expect(h.createManualReminder).toHaveBeenCalledWith(expect.objectContaining({
            action: 'Chase the 1099-B', note: 'From the memo “Call with Dana”: “I still need the brokerage 1099-B”',
        }))
        expect(calls.some((c) => c.url === `/api/projects/p1/memos/${MEMO.id}/applied` && c.method === 'POST')).toBe(true)
    })

    it('a memo added earlier shows its action items and RAID suggestions waiting, without a click (§13)', async () => {
        const stored = memoReviewOf({ proposals: [FOUND.proposals[0]] as never, skipped: [], dropped: 0 }, TEXT, 'auto')
        waiting = { ...NOTHING_WAITING, review: stored, raid: [{ id: 'raid-1', type: 'RISK', title: 'The K-1s may arrive late', priority: 'MEDIUM' }] }
        listing.memos = [{ ...MEMO, toReview: 2, reviewedAt: stored.at }, OLDER]
        await openMemos()
        expect(within(screen.getByTestId(`memo-row-${MEMO.id}`)).getByText('2 to review')).toBeTruthy()

        const actions = screen.getByRole('region', { name: 'Action items' })
        expect(await within(actions).findByText(/identified 1 action item/)).toBeTruthy()
        // Its quote, filled in from the memo the pane read: only its place was stored.
        expect(within(actions).getByText('“We will send the K-1s by end of next week.”')).toBeTruthy()
        expect(calls.some((c) => c.url.endsWith('/ai-notes-proposals'))).toBe(false)

        const raid = within(actions).getByRole('region', { name: 'RAID suggestions' })
        expect(within(raid).getByText('The K-1s may arrive late')).toBeTruthy()
        // Brio's priority, to keep or change before accepting; kept as it is, nothing more is sent.
        expect(within(raid).getByRole('combobox', { name: 'Priority of The K-1s may arrive late' }).textContent).toContain('Medium')
        fireEvent.click(within(raid).getByRole('button', { name: 'Accept' }))
        await waitFor(() => expect(calls.find((c) => c.url === '/api/projects/p1/raid/raid-1' && c.method === 'PATCH')?.body).toEqual({ action: 'accept' }))
        await waitFor(() => expect(within(actions).queryByRole('region', { name: 'RAID suggestions' })).toBeNull())

        fireEvent.click(within(actions).getByRole('button', { name: 'Dismiss all' }))
        await waitFor(() => expect(calls.some((c) => c.url === `/api/projects/p1/memos/${MEMO.id}/review` && c.method === 'DELETE')).toBe(true))
    })

    it('Edit opens the memo filled in, saves through the memo route, and the pane reads it afresh (§14.3)', async () => {
        const edited: MemoListItem = {
            ...MEMO, title: 'Call with Dana, pricing', fileName: '2026-11-12-Call-with-Dana,-pricing.md',
            edited: { at: '2026-11-14T09:00:00.000Z', byName: 'Sam Rivera' },
        }
        const editedText = TEXT.replace('# Call with Dana', '# Call with Dana, pricing')
        const base: typeof fetch = fetch
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            if (url === `/api/projects/p1/memos/${MEMO.id}` && init?.method === 'PATCH') {
                calls.push({ url, method: 'PATCH', body: JSON.parse(String(init.body)) })
                content = { status: 200, body: { data: { text: editedText, webUrl: null } } }
                return new Response(JSON.stringify({ data: { memo: edited, fileName: edited.fileName, notesChanged: false, identifying: false } }), { status: 200 })
            }
            return base(url, init)
        }))
        await openMemos()
        const pane = screen.getByRole('region', { name: 'Memo' })
        await within(pane).findByRole('heading', { name: 'Call with Dana' })
        fireEvent.click(within(pane).getByRole('button', { name: 'Edit' }))
        expect(await screen.findByText('A Markdown file in “Internal Memos” in your OneDrive. Saving changes the file there too.')).toBeTruthy()
        // The notes as the file has them, under its heading.
        expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Dana Whitfield: We will send the K-1s by end of next week.\n\nAlex: Great.')
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Call with Dana, pricing' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual(expect.objectContaining({ title: 'Call with Dana, pricing', body: null, identify: false })))
        await waitFor(() => expect(h.addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Memo saved', message: 'Renamed to 2026-11-12-Call-with-Dana,-pricing.md in Internal Memos.' })))
        const after = screen.getByRole('region', { name: 'Memo' })
        expect(await within(after).findByRole('heading', { name: 'Call with Dana, pricing' })).toBeTruthy()
        expect(within(after).getByText(/Edited Nov 14 by Sam Rivera/)).toBeTruthy()
        expect(within(screen.getByTestId(`memo-row-${MEMO.id}`)).getByText(/· edited$/)).toBeTruthy()
    })

    it('a memo whose notes changed since Brio read them says so, with the sparkle', async () => {
        listing.memos = [{ ...MEMO, changedSinceRead: true, edited: { at: '2026-11-14T09:00:00.000Z', byName: 'Sam Rivera' } }, OLDER]
        await openMemos()
        const actions = screen.getByRole('region', { name: 'Action items' })
        expect((await within(actions).findByTestId('memo-changed-since-read')).textContent).toMatch(/^Changed since Brio(AI)? read it\. The sparkle reads it again\.$/)
    })

    it('a memo changed in storage since Brio read it says so too, and a moved line is never shown wrong', async () => {
        const stored = memoReviewOf({ proposals: [FOUND.proposals[0]] as never, skipped: [], dropped: 0 }, TEXT, 'auto')
        waiting = { ...NOTHING_WAITING, review: stored }
        listing.memos = [{ ...MEMO, toReview: 1, reviewedAt: stored.at }, OLDER]
        content = { status: 200, body: { data: { text: TEXT.replace('We will send the K-1s by end of next week.', 'K-1s are already in.'), webUrl: null } } }
        await openMemos()
        const actions = screen.getByRole('region', { name: 'Action items' })
        expect(await within(actions).findByTestId('memo-changed-since-read')).toBeTruthy()
        expect(within(actions).getByText('“The memo has changed since, so this line isn’t shown.”')).toBeTruthy()
    })

    it('a completed engagement reads its memos, and adds and applies nothing', async () => {
        listing.readOnly = true
        await openMemos()
        const pane = screen.getByRole('region', { name: 'Memo' })
        expect(await within(pane).findByRole('heading', { name: 'Call with Dana' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Add internal memo/ })).toBeNull()
        expect(screen.getByText('Read only · completed')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Identify action items/ })).toBeNull()
        expect(screen.queryByRole('region', { name: 'Action items' })).toBeNull()
    })

    it('a memo added is saved, then opened', async () => {
        const saved = { ...MEMO, id: '33333333-3333-4333-8333-333333333333', title: 'Budget review', date: '2026-11-13', fileName: '2026-11-13-Budget-review.md' }
        const base: typeof fetch = fetch
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            if (url === '/api/projects/p1/memos' && init?.method === 'POST') {
                calls.push({ url, method: 'POST', body: JSON.parse(String(init.body)) })
                return new Response(JSON.stringify({ data: { memo: saved, fileName: saved.fileName } }), { status: 201 })
            }
            if (url === `/api/projects/p1/memos/${saved.id}/content`) return new Response(JSON.stringify({ data: { text: '# Budget review\n\n- Revised budget', webUrl: null } }), { status: 200 })
            return base(url, init)
        }))
        await openMemos()
        fireEvent.click(screen.getByRole('button', { name: /Add internal memo/ }))
        fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Budget review' } })
        fireEvent.change(screen.getByLabelText('Notes or transcript'), { target: { value: 'Revised budget' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save memo' }))
        await waitFor(() => expect(h.addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Memo saved', message: 'Saved as 2026-11-13-Budget-review.md in Internal Memos.' })))
        expect(new URLSearchParams(window.location.search).get('memo')).toBe(saved.id)
        expect(await within(screen.getByRole('region', { name: 'Memo' })).findByRole('heading', { name: 'Budget review' })).toBeTruthy()
    })
})

describe('leaving Threads', () => {
    it('closes a thread open in the right pane', async () => {
        renderTab()
        await settle()
        fireEvent.click(screen.getByText('Market report'))
        fireEvent.click(screen.getByRole('tab', { name: /^Memos/ }))
        expect(h.clearPane).toHaveBeenCalled()
        cleanup()
    })
})
