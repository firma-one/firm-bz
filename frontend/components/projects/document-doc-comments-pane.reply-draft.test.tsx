import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// Brio's reply draft in a discussion's composer (.claude/plans/brio-features-round-2.md, §3.3): offered
// to the firm on a discussion awaiting its reply, written into the box, sent only with Reply.

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: { id: 'me', email: 'me@firm.com', user_metadata: {} } }),
}))
vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => ({ clearPane: vi.fn(), canClose: () => true }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

import { DocumentDocCommentsPane, countDraftPlaceholders, withDraft } from './document-doc-comments-pane'

const DRAFT = "Thanks, Dana. We'll look at Brightline and come back by [date].\n\nOn 4.2: [confirm whether the pricing is current]."

/** A draft stream the test writes to, line by line (lib/ai/stream-draft.ts). Like fetch's, it errors once the request is aborted. */
function controllableStream() {
    const queue: string[] = []
    let wake: (() => void) | null = null
    let closed = false
    let signal: AbortSignal | undefined
    const encoder = new TextEncoder()
    return {
        listen(s: AbortSignal | undefined) {
            signal = s
            s?.addEventListener('abort', () => wake?.())
        },
        push(event: unknown) {
            queue.push(JSON.stringify(event) + '\n')
            wake?.()
        },
        close() {
            closed = true
            wake?.()
        },
        response: {
            ok: true,
            status: 200,
            body: {
                getReader: () => ({
                    read: async (): Promise<{ value?: Uint8Array; done: boolean }> => {
                        while (queue.length === 0 && !closed && !signal?.aborted) await new Promise<void>((r) => { wake = r })
                        if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
                        const next = queue.shift()
                        return next ? { value: encoder.encode(next), done: false } : { done: true }
                    },
                }),
            },
        } as unknown as Response,
    }
}

let myRole = 'eng_admin'
let existing: any[] = []
let posted: any[] = []
let draftRequests: { url: string; body: unknown }[] = []
let draftReply: (signal?: AbortSignal) => Response

const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response

/** A whole draft, delivered at once. */
const wholeDraft = (text: string) => () => {
    const s = controllableStream()
    s.push({ type: 'meta' })
    s.push({ type: 'delta', text })
    s.push({ type: 'done', text })
    s.close()
    return s.response
}

beforeEach(() => {
    myRole = 'eng_admin'
    posted = []
    draftRequests = []
    draftReply = wholeDraft(DRAFT)
    existing = [
        { id: 'm1', createdAt: '2026-11-06T10:00:00Z', authorUserId: 'priya', authorEmail: 'priya@firm.com', content: 'The report is ready for your review.', reactions: {} },
        { id: 'm2', createdAt: '2026-11-07T10:00:00Z', authorUserId: 'priya', authorEmail: 'priya@firm.com', content: "Pricing in 4.2 is last year's.", reactions: {}, isInternal: true },
        { id: 'm3', createdAt: '2026-11-09T10:00:00Z', authorUserId: 'dana', authorEmail: 'dana@client.com', content: 'Could you add Brightline? Is 4.2 current?', reactions: {} },
    ]
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        const body = init?.body ? JSON.parse(init.body as string) : null
        if (url.endsWith('/ai-reply-draft')) {
            draftRequests.push({ url, body })
            return draftReply(init?.signal ?? undefined)
        }
        if (url.includes('/members')) {
            return json({ members: [
                { userId: 'me', email: 'me@firm.com', name: 'Me Myself', role: myRole },
                { userId: 'priya', email: 'priya@firm.com', name: 'Priya Shah', role: 'eng_member' },
                { userId: 'dana', email: 'dana@client.com', name: 'Dana Whitfield', role: 'eng_viewer' },
            ] })
        }
        if (url.endsWith('/read') || url.includes('filter=mentions') || url.includes('/reminders')) return json({ mentions: [], reminders: [] })
        if (method === 'POST') {
            posted.push(body)
            return json({ message: { id: 'm-new', createdAt: new Date().toISOString(), authorUserId: 'me', content: body.content, isInternal: !!body.internal } })
        }
        return json({ messages: existing })
    }))
})
afterEach(() => vi.unstubAllGlobals())

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const renderPane = (props: Partial<React.ComponentProps<typeof DocumentDocCommentsPane>> = {}) =>
    render(<DocumentDocCommentsPane engagementId="e1" documentId="deliv-1" documentName="Market report" {...props} />)
const box = () => screen.getByLabelText('Comment') as HTMLTextAreaElement

describe('who is offered a draft, and where', () => {
    it.each(['eng_admin', 'eng_member'])('offers %s a draft on a discussion awaiting the firm', async (role) => {
        myRole = role
        renderPane()
        await settle()
        expect(screen.getByRole('button', { name: /Draft reply/ })).toBeTruthy()
    })

    it.each(['eng_viewer', 'eng_ext_collaborator'])('never offers %s one', async (role) => {
        myRole = role
        existing = existing.filter((m) => !m.isInternal)
        renderPane()
        await settle()
        expect(screen.queryByRole('button', { name: /Draft reply/ })).toBeNull()
    })

    it('offers none once the firm has replied, an internal note not counting as one', async () => {
        existing.push({ id: 'm4', createdAt: '2026-11-10T10:00:00Z', authorUserId: 'priya', authorEmail: 'priya@firm.com', content: 'Between us', reactions: {}, isInternal: true })
        const view = renderPane()
        await settle()
        expect(screen.getByRole('button', { name: /Draft reply/ })).toBeTruthy()
        view.unmount()

        existing.push({ id: 'm5', createdAt: '2026-11-11T10:00:00Z', authorUserId: 'priya', authorEmail: 'priya@firm.com', content: 'Adding it.', reactions: {} })
        renderPane()
        await settle()
        expect(screen.queryByRole('button', { name: /Draft reply/ })).toBeNull()
    })

    it('offers none on a resolved discussion', async () => {
        renderPane({ resolved: true })
        await settle()
        expect(screen.queryByRole('button', { name: /Draft reply/ })).toBeNull()
    })
})

describe('a draft in the box', () => {
    it('asks the route with nothing of the thread, fills the box, and says so', async () => {
        renderPane()
        await settle()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Draft reply/ })) })
        await settle()
        expect(draftRequests).toEqual([{ url: '/api/projects/e1/documents/deliv-1/ai-reply-draft', body: {} }])
        expect(box().value).toBe(DRAFT)
        expect(screen.getByText(/drafted this from the thread\. Internal notes are never used\. Nothing is sent until you press Reply\./)).toBeTruthy()
        expect(screen.getByText('2 placeholders to fill')).toBeTruthy()
        expect(posted).toEqual([])
    })

    it('sends only once the placeholders are filled, and only with Reply', async () => {
        renderPane()
        await settle()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Draft reply/ })) })
        await settle()
        const reply = screen.getByRole('button', { name: 'Reply' }) as HTMLButtonElement
        expect(reply.disabled).toBe(true)

        const filled = "Thanks, Dana. We'll look at Brightline and come back by Friday.\n\nOn 4.2: it's current."
        fireEvent.change(box(), { target: { value: filled } })
        expect(screen.queryByText(/placeholders? to fill/)).toBeNull()
        expect(reply.disabled).toBe(false)
        await act(async () => { fireEvent.click(reply) })
        await settle()
        expect(posted).toEqual([{ content: filled }])
        // Sent: the box is empty and the draft gone.
        expect(box().value).toBe('')
        expect(screen.queryByText(/drafted this from the thread/)).toBeNull()
    })

    it('keeps what was already written, above the draft, and Discard draft brings it back', async () => {
        renderPane()
        await settle()
        fireEvent.change(box(), { target: { value: 'My own opening.' } })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Draft reply/ })) })
        await settle()
        expect(box().value).toBe(`My own opening.\n\n${DRAFT}`)
        fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
        expect(box().value).toBe('My own opening.')
        expect(screen.queryByText(/drafted this from the thread/)).toBeNull()
        expect(posted).toEqual([])
    })

    it('writes a fresh draft on Rewrite', async () => {
        renderPane()
        await settle()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Draft reply/ })) })
        await settle()
        draftReply = wholeDraft('Thanks, Dana. [answer on Brightline]')
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Rewrite' })) })
        await settle()
        expect(draftRequests).toHaveLength(2)
        expect(box().value).toBe('Thanks, Dana. [answer on Brightline]')
        expect(screen.getByText('1 placeholder to fill')).toBeTruthy()
    })

    it('streams into the box, and is theirs from the first keystroke', async () => {
        const stream = controllableStream()
        draftReply = (signal) => {
            stream.listen(signal)
            return stream.response
        }
        renderPane()
        await settle()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Draft reply/ })) })
        await act(async () => { stream.push({ type: 'meta' }); stream.push({ type: 'delta', text: 'Thanks, Dana. ' }) })
        await settle()
        expect(box().value).toBe('Thanks, Dana. ')
        expect(screen.getByRole('button', { name: /Stop/ })).toBeTruthy()

        fireEvent.change(box(), { target: { value: 'Thanks, Dana. Mine now.' } })
        await act(async () => { stream.push({ type: 'delta', text: 'More from Brio.' }) })
        await settle()
        expect(box().value).toBe('Thanks, Dana. Mine now.')
        expect(screen.queryByRole('button', { name: /Stop/ })).toBeNull()
    })

    it('says why when Brio couldn’t write one, and sends nothing', async () => {
        draftReply = () => json({ error: 'Your group has used its 500 AI credits this month.' }, 429)
        renderPane()
        await settle()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Draft reply/ })) })
        await settle()
        expect(screen.getByRole('alert').textContent).toBe('Your group has used its 500 AI credits this month.')
        expect(box().value).toBe('')
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
        expect(posted).toEqual([])
    })
})

describe('the thread', () => {
    it('names a client-side author’s role, and sets an internal note apart', async () => {
        renderPane()
        await settle()
        expect(screen.getByText(/· Reviewer/)).toBeTruthy()
        expect(screen.getAllByText('Internal')).toHaveLength(1)
    })
})

describe('draft helpers', () => {
    it('counts the [placeholders] left to fill', () => {
        expect(countDraftPlaceholders('By [date]. [confirm the price]. Done.')).toBe(2)
        expect(countDraftPlaceholders('Nothing to fill.')).toBe(0)
    })

    it('puts a draft after what the box held, and after an untouched starting tag', () => {
        expect(withDraft('', 'Draft')).toBe('Draft')
        expect(withDraft('  ', 'Draft')).toBe('Draft')
        expect(withDraft('Mine. ', 'Draft')).toBe('Mine.\n\nDraft')
        expect(withDraft('#QSR-16 ', 'Draft', '#QSR-16 ')).toBe('#QSR-16 Draft')
    })
})
